/**
 * #395 T030/T054 TESTS FIRST — touched-only V1 migration and genuine
 * final-parser receipts on a mixed durable queue. Real SQLite, no fake SUT.
 */
import {
  database, adapter, draftItems, ownedQueues, mockEdge, OWNER,
  installSmsReviewSqliteHooks,
} from "./sms-review-namespace-test-harness";
import { type Database, type Model } from "@nozbe/watermelondb";
import type { SmsReviewDraftItem, SmsReviewQueue } from "@monyvi/db";
import {
  accountReviewCommandSchema, type AccountReviewCommand,
  type AccountReviewSession, type ParsedSmsTransaction,
} from "@monyvi/logic";
import {
  encodeSmsReviewDraftV2, decodeSmsReviewDraftPayload,
} from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import { reduceAccountReviewCommand } from
  "../../../../packages/logic/src/account-review/reducer";
import {
  makeOwnedContext, makeSmsInput,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025SmsOriginal, makeT025ReviewSession, makeT025StoredReview,
  makeT025ConfirmedSession, T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  admittedContext, originalCandidate, smsRequestContext,
} from "./sms-review-complete-session-fixtures";
import { parseSmsWithAi } from "@/services/ai-sms-parser-service";
import { mergeSmsReviewDrafts, updateSmsReviewDraftSelection } from
  "@/services/sms-review-draft-repository";
import { executeSmsAccountReviewCommand } from
  "@/services/account-review-command-service";
import { loadOrBootstrapOwnedSmsReviewSession } from
  "@/services/account-review-legacy-bootstrap-service";

installSmsReviewSqliteHooks();

interface LegacyPair {
  readonly queueId: string;
  readonly records: readonly SmsReviewDraftItem[];
  readonly originals: readonly ParsedSmsTransaction[];
}
async function seedLegacyPair(): Promise<LegacyPair> {
  const originals = [makeT025SmsOriginal(0), makeT025SmsOriginal(1)];
  const result = await mergeSmsReviewDrafts({
    expectedUserId: OWNER, transactions: originals,
    parsedAt: new Date("2026-10-14T12:00:00.000Z"),
  });
  expect(result.insertedCount).toBe(2);
  const queue = (await ownedQueues())[0];
  if (!queue) throw new Error("Missing real owned legacy queue");
  const records = [...(await draftItems())].sort((a, b) =>
    a.position - b.position || a.id.localeCompare(b.id)
  );
  if (records.length !== 2 ||
      records.some((item) => item.payloadVersion !== 1))
    throw new Error("Test fixture requires an all-V1 source");
  return { queueId: queue.id, records, originals };
}

async function openFreshSqliteDatabase(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const { __modelClasses: modelClasses } = jest.requireMock<{
    readonly __modelClasses: Array<typeof Model>;
  }>("@monyvi/db");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(), modelClasses,
  });
}

interface PhysicalTableSnapshot {
  readonly table: string;
  readonly rows: readonly string[];
}
const TABLES = [
  "sms_review_queues", "sms_review_draft_items", "dismissed_sms_fingerprints",
  "transactions", "transfers", "accounts", "bank_details",
  "account_sms_senders", "profiles", "categories",
] as const;

async function physicalSnapshot(): Promise<readonly PhysicalTableSnapshot[]> {
  const fresh = await openFreshSqliteDatabase();
  return Promise.all(TABLES.map(async (table): Promise<PhysicalTableSnapshot> => ({
    table,
    rows: (await fresh.get<Model>(table).query().fetch())
      .map((model) => JSON.stringify(
        Object.entries(model._raw).sort(([a], [b]) => a.localeCompare(b))
      )).sort(),
  })));
}

function decodeOwnedV2(
  item: SmsReviewDraftItem, queueId: string
): ReturnType<typeof decodeSmsReviewDraftPayload> {
  return decodeSmsReviewDraftPayload({
    version: item.payloadVersion, json: item.payloadJson,
    expectedFingerprint: item.smsFingerprint,
    expectedOwnerId: item.userId, expectedSessionId: queueId,
    selectionOverride: item.selectionOverride,
  });
}

/** Genuine opted-in parser result, with only a fixture edge response. */
async function publishedOriginal(
  fingerprint: string
): Promise<Awaited<ReturnType<typeof parseSmsWithAi>>> {
  const source = makeSmsInput();
  mockEdge.mockResolvedValueOnce({ data: source.providerResponse, error: null });
  const candidate = { ...originalCandidate(), smsFingerprint: fingerprint };
  const result = await parseSmsWithAi(
    [candidate], admittedContext(), undefined, undefined, OWNER,
    smsRequestContext(), "legacy-mixed-final-" + fingerprint
  );
  if (!result.reviewSession || result.transactions.length !== 1)
    throw new Error("Missing real complete trusted published SMS session");
  expect(result.reviewSession.rows).toHaveLength(1);
  expect(result.transactions[0]?.smsFingerprint).toBe(fingerprint);
  expect(result.reviewSession.sessionId).toBe((await ownedQueues())[0]?.id);
  return result;
}

function editedCommand(
  session: AccountReviewSession, rowId: string
): AccountReviewCommand {
  const row = session.rows.find((item) => item.rowId === rowId);
  if (!row) throw new Error("Missing target canonical review row");
  return accountReviewCommandSchema.parse({
    kind: "set_row_selected", selected: false,
    ownerId: session.ownerId, sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    rowId, expectedRowRevision: row.revision,
  });
}

function removedGroupState(
  confirmed: AccountReviewSession
): AccountReviewSession {
  const group = confirmed.groups[0];
  if (!group) throw new Error("Confirmed source group missing");
  const result = reduceAccountReviewCommand({
    state: confirmed,
    command: accountReviewCommandSchema.parse({
      kind: "remove_group", ownerId: OWNER,
      sessionId: confirmed.sessionId,
      expectedReviewRevision: confirmed.revision,
      expectedOperationGeneration: confirmed.operationGeneration,
      groupId: group.groupId, expectedGroupRevision: group.revision,
    }),
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: T025_IDS.undoToken, undo: null,
  });
  expect(result.effect).toBe("persist_sms");
  expect(result.reasonCodes).toEqual([]);
  return result.state;
}

async function seedMixedGroup(
  status: "confirmed" | "removed"
): Promise<{
  readonly queueId: string;
  readonly persisted: AccountReviewSession;
  readonly first: SmsReviewDraftItem;
  readonly untouched: SmsReviewDraftItem;
}> {
  const seeded = await seedLegacyPair();
  const first = seeded.records[0];
  const untouched = seeded.records[1];
  const original = seeded.originals[0];
  if (!first || !untouched || !original)
    throw new Error("Missing owned V2/V1 source");
  const initial = makeT025ReviewSession(seeded.queueId, [original], [first.id]);
  const confirmed = makeT025ConfirmedSession(initial, [first.id]);
  const state = status === "removed"
    ? removedGroupState(confirmed)
    : confirmed;
  const payload = encodeSmsReviewDraftV2({
    transaction: original,
    review: makeT025StoredReview(state, first.id),
  });
  await database.write(() => database.batch(first.prepareUpdate((record) => {
    record.payloadVersion = payload.version;
    record.payloadJson = payload.json;
    record.selectionOverride = status === "confirmed";
  })));
  return { queueId: seeded.queueId, persisted: state, first, untouched };
}

describe("#395 T030 touched-only SMS legacy transitions", () => {
  it("one selected anchor deselects atomically without rewriting unrelated V1 bytes or row revision", async () => {
    const seeded = await seedLegacyPair();
    const anchor = seeded.records[0];
    const sibling = seeded.records[1];
    if (!anchor || !sibling) throw new Error("Missing two real legacy rows");
    await updateSmsReviewDraftSelection(anchor.id, OWNER, true);
    const before = await loadOrBootstrapOwnedSmsReviewSession({
      expectedOwnerId: OWNER, queueId: seeded.queueId,
    });
    const previousSibling = before.rows.find((row) =>
      row.sourceFingerprint === sibling.smsFingerprint
    );
    const clicked = before.rows.find((row) =>
      row.sourceFingerprint === anchor.smsFingerprint
    );
    if (!previousSibling || !clicked)
      throw new Error("Missing pre-command mixed review rows");
    expect(clicked.selected).toBe(true);
    const unchanged = {
      id: sibling.id, json: sibling.payloadJson,
      version: sibling.payloadVersion, selected: sibling.selectionOverride,
      position: sibling.position, parsedAt: sibling.parsedAt.getTime(),
    };
    const outcome = await executeSmsAccountReviewCommand({
      queueId: seeded.queueId,
      command: editedCommand(before, clicked.rowId),
      accountSnapshots: makeOwnedContext(), nextUndoToken: null,
    });
    expect(outcome.effect).toBe("persist_sms");
    expect(outcome.affectedRowIds).toEqual([clicked.rowId]);
    expect(outcome.state.rows.find((r) => r.rowId === clicked.rowId)?.selected)
      .toBe(false);
    const after = (await draftItems()).find((item) => item.id === sibling.id);
    if (!after) throw new Error("Unrelated legacy sibling vanished");
    expect({
      id: after.id, json: after.payloadJson,
      version: after.payloadVersion, selected: after.selectionOverride,
      position: after.position, parsedAt: after.parsedAt.getTime(),
    }).toEqual(unchanged);
    expect(after.payloadVersion).toBe(1);
    const reopened = await loadOrBootstrapOwnedSmsReviewSession({
      expectedOwnerId: OWNER, queueId: seeded.queueId,
    });
    expect(reopened.revision).toBe(outcome.state.revision);
    expect(reopened.operationGeneration).toBe(outcome.state.operationGeneration);
    expect(reopened.rows.find((r) => r.rowId === previousSibling.rowId)?.revision)
      .toBe(previousSibling.revision);
    expect((await draftItems()).filter((r) => r.payloadVersion === 2))
      .toHaveLength(1);
  });

  it("a genuine final provider row joins a bootstrapped mixed queue unchecked without losing legacy choices", async () => {
    const seeded = await seedLegacyPair();
    const originalAnchor = seeded.records[0];
    const oldV1 = seeded.records[1];
    if (!originalAnchor || !oldV1)
      throw new Error("Missing mixed bootstrap input");
    await updateSmsReviewDraftSelection(originalAnchor.id, OWNER, true);
    const current = await loadOrBootstrapOwnedSmsReviewSession({
      expectedOwnerId: OWNER, queueId: seeded.queueId,
    });
    const untouched = oldV1.payloadJson;
    const trustedFingerprint = "t030-new-real-provider-fingerprint";
    expect(seeded.originals.every((item) =>
      item.smsFingerprint !== trustedFingerprint)).toBe(true);
    const parsed = await publishedOriginal(trustedFingerprint);
    if (!parsed.reviewSession) throw new Error("Missing trusted final session");
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: parsed.transactions,
      reviewSession: parsed.reviewSession,
    });
    expect(merged.insertedCount).toBe(1);
    const records = await draftItems();
    expect(records).toHaveLength(3);
    expect(records.find((item) => item.id === oldV1.id)?.payloadJson)
      .toBe(untouched);
    expect(records.find((item) => item.id === oldV1.id)?.payloadVersion).toBe(1);
    expect(records.find((item) => item.id === originalAnchor.id)
      ?.selectionOverride).toBe(true);
    const fresh = await loadOrBootstrapOwnedSmsReviewSession({
      expectedOwnerId: OWNER, queueId: seeded.queueId,
    });
    const newRow = fresh.rows.find((row) =>
      row.sourceFingerprint === trustedFingerprint
    );
    expect(newRow?.selected).toBe(false);
    expect(newRow?.rowId).toBe(parsed.reviewSession.rows[0]?.rowId);
    expect(newRow?.assignment.state).not.toBe("existing");
    expect(newRow?.assignment.state === "suggested" &&
      newRow.assignment.confirmation === "confirmed").toBe(false);
    expect(fresh.rows.find((r) =>
      r.sourceFingerprint === originalAnchor.smsFingerprint
    )?.selected).toBe(true);
    expect(fresh.rows.find((r) =>
      r.sourceFingerprint === oldV1.smsFingerprint
    )?.revision).toBe(current.rows.find((r) =>
      r.sourceFingerprint === oldV1.smsFingerprint
    )?.revision);
  });

  it("genuine late result never overwrites a confirmed V2 group or its clicked selection", async () => {
    const seeded = await seedMixedGroup("confirmed");
    const original = decodeOwnedV2(seeded.first, seeded.queueId);
    expect(original.review?.groups[0]?.status).toBe("confirmed");
    expect(original.review?.row.selected).toBe(true);
    const priorGroup = original.review?.groups[0];
    const priorRevision = original.review?.row.revision;
    const untouchedBytes = seeded.untouched.payloadJson;
    const incoming = await publishedOriginal("t030-late-independent-payment");
    if (!incoming.reviewSession) throw new Error("Missing real new review");
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: incoming.transactions,
      reviewSession: incoming.reviewSession,
    });
    expect(merged.insertedCount).toBe(1);
    const rows = await draftItems();
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === seeded.untouched.id)?.payloadJson)
      .toBe(untouchedBytes);
    const previous = rows.find((row) => row.id === seeded.first.id);
    if (!previous) throw new Error("Committed old decision disappeared");
    const restored = decodeOwnedV2(previous, seeded.queueId);
    expect(restored.review?.groups[0]).toEqual(priorGroup);
    expect(restored.review?.row.revision).toBe(priorRevision);
    expect(restored.review?.row.selected).toBe(true);
    expect(previous.selectionOverride).toBe(true);
    const added = rows.find((row) =>
      row.smsFingerprint === incoming.transactions[0]?.smsFingerprint
    );
    if (!added) throw new Error("No trusted late row committed");
    expect(decodeOwnedV2(added, seeded.queueId).review?.row.selected)
      .toBe(false);
  });

  it("a late final group cannot resurrect durable removed evidence or persist Undo", async () => {
    const seeded = await seedMixedGroup("removed");
    const prior = decodeOwnedV2(seeded.first, seeded.queueId);
    const removedEvidence = seeded.persisted.removedEvidenceKeys;
    expect(prior.review?.groups[0]?.status).toBe("removed");
    expect(removedEvidence).toHaveLength(1);
    const incoming = await publishedOriginal("t030-after-removed-qnb");
    if (!incoming.reviewSession) throw new Error("Missing real trusted final");
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: incoming.transactions,
      reviewSession: incoming.reviewSession,
    });
    expect(merged.insertedCount).toBe(1);
    const original = (await draftItems()).find((item) =>
      item.id === seeded.first.id
    );
    if (!original) throw new Error("Removed tombstone was deleted");
    const persisted = decodeOwnedV2(original, seeded.queueId);
    expect(persisted.review?.removedEvidenceKeys).toEqual(removedEvidence);
    expect(persisted.review?.groups[0]?.status).toBe("removed");
    expect(persisted.review?.row.selected).toBe(false);
    expect(original.payloadJson).not.toContain(T025_IDS.undoToken);
    expect(original.payloadJson).not.toContain("previousState");
    const added = (await draftItems()).find((item) =>
      item.smsFingerprint === incoming.transactions[0]?.smsFingerprint
    );
    expect(added).toBeDefined();
    if (!added) throw new Error("Late row missing after removed group");
    expect(decodeOwnedV2(added, seeded.queueId).review?.row.selected)
      .toBe(false);
    expect((await draftItems()).find((r) =>
      r.id === seeded.untouched.id
    )?.payloadVersion).toBe(1);
  });

  it("a genuine colliding fingerprint with incompatible group identity fails without any SQLite/cache change", async () => {
    const seeded = await seedMixedGroup("confirmed");
    const original = decodeOwnedV2(seeded.first, seeded.queueId);
    expect(original.review?.groups[0]?.status).toBe("confirmed");
    const incoming = await publishedOriginal(seeded.first.smsFingerprint);
    if (!incoming.reviewSession) throw new Error("Missing genuine conflict");
    const previousGroup = original.review?.groups[0];
    const nextGroup = incoming.reviewSession.groups[0];
    if (!previousGroup || !nextGroup) throw new Error("Missing evidenced groups");
    expect(nextGroup.groupId).not.toBe(previousGroup.groupId);
    expect(incoming.transactions[0]?.smsFingerprint)
      .toBe(seeded.first.smsFingerprint);
    expect(incoming.transactions[0]?.amount)
      .toBe(seeded.persisted.rows[0]?.transaction.amount);
    expect(incoming.transactions[0]?.currency)
      .toBe(seeded.persisted.rows[0]?.transaction.currency);
    const cached = [...await ownedQueues(), ...await draftItems()];
    const cacheBefore = cached.map((item) => JSON.stringify(item._raw));
    const before = await physicalSnapshot();
    await expect(mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: incoming.transactions,
      reviewSession: incoming.reviewSession,
    })).rejects.toThrow();
    expect(await physicalSnapshot()).toEqual(before);
    expect(cached.map((item) => JSON.stringify(item._raw)))
      .toEqual(cacheBefore);
    expect((await draftItems()).find((item) =>
      item.id === seeded.untouched.id
    )?.payloadVersion).toBe(1);
  });

  it("a malformed untouched V1 draft blocks a genuine late final result without partial publication", async () => {
    const seeded = await seedLegacyPair();
    const current = await loadOrBootstrapOwnedSmsReviewSession({
      expectedOwnerId: OWNER, queueId: seeded.queueId,
    });
    expect(current.rows).toHaveLength(2);
    const untouched = (await draftItems()).find((item) =>
      item.payloadVersion === 1
    );
    if (!untouched) throw new Error("Missing untouched legacy draft");
    await database.write(() => database.batch(
      untouched.prepareUpdate((item) => {
        item.payloadJson = "{unreadable-legacy-row";
      })
    ));
    const incoming = await publishedOriginal("t030-unreadable-existing-source");
    if (!incoming.reviewSession) throw new Error("Missing trusted parser");
    const before = await physicalSnapshot();
    await expect(mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: incoming.transactions,
      reviewSession: incoming.reviewSession,
    })).rejects.toMatchObject({
      name: "SmsReviewDraftCodecError", code: "malformed_payload",
    });
    expect(await physicalSnapshot()).toEqual(before);
    expect((await ownedQueues()).map((q: SmsReviewQueue) => q.id))
      .toEqual([seeded.queueId]);
    expect((await draftItems()).some((r) =>
      r.payloadJson === "{unreadable-legacy-row"
    )).toBe(true);
  });
});
