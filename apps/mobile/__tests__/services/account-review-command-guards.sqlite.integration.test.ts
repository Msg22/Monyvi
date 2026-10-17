/**
 * #395 T029 guard-only real-SQLite tests split from the 20-case command suite.
 * First import installs the same real adapter/auth fixtures as the passing
 * namespace lifecycle suite. Never mock the command SUT, reducer, or codec.
 */
import {
  database,
  adapter,
  draftItems,
  ownedQueues,
  OWNER,
  FOREIGN,
  setCurrentUser,
  installSmsReviewSqliteHooks,
} from "./sms-review-namespace-test-harness";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  accountReviewCommandSchema,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import type { FinancialActionGroup, SmsReviewDraftItem } from "@monyvi/db";
import { physicalSaveLedgerSnapshot } from "./account-review-save-sqlite-test-helpers";
import {
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraftV2,
} from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  confirmedCommand,
  selectCommand,
  makeIndependentT029GroupSession,
} from "./account-review-t029-test-builders";
import {
  discardAllSmsReviewDrafts,
  mergeSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";
import { executeSmsAccountReviewCommand } from "@/services/account-review-command-service";
import { rehydrateOwnedSmsReviewGraph } from "@/services/account-review-command-snapshots";
import { freezeSelectedAccountReview } from "@/services/account-review-save-preparation";
import { inspectSmsForSave } from "@/services/account-review-save-sms";
import { getCurrentUserDataScope } from "@/services/user-data-access";

const { __modelClasses: modelClasses } = jest.requireMock<{
  readonly __modelClasses: Array<typeof Model>;
}>("@monyvi/db");

interface SeededQueue {
  readonly queueId: string;
  readonly session: ReturnType<typeof makeT025ReviewSession>;
  readonly originals: readonly ParsedSmsTransaction[];
  readonly records: readonly SmsReviewDraftItem[];
}

async function seedLinkedV2Queue(
  logicalRowIds: readonly string[]
): Promise<SeededQueue> {
  const originals = [makeT025SmsOriginal(0), makeT025SmsOriginal(1)];
  const merged = await mergeSmsReviewDrafts({
    expectedUserId: OWNER,
    transactions: originals,
    parsedAt: new Date("2026-10-14T12:00:00.000Z"),
  });
  expect(merged.insertedCount).toBe(2);
  const queue = (await ownedQueues())[0];
  if (!queue) throw new Error("Real SQLite review queue was not created");
  const arranged = [...(await draftItems())].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const sortedOriginals = [...originals].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  if (
    arranged.length !== logicalRowIds.length ||
    sortedOriginals.length !== logicalRowIds.length
  )
    throw new Error("Invalid canonical SMS source-to-draft fixture pairing");
  const session = makeT025ReviewSession(
    queue.id,
    sortedOriginals,
    logicalRowIds
  );
  await database.write(async (): Promise<void> => {
    await database.batch(
      ...arranged.map((draft, index) => {
        const original = sortedOriginals.find(
          (item) => item.smsFingerprint === draft.smsFingerprint
        );
        const rowId = logicalRowIds[index];
        if (!original || !rowId)
          throw new Error(
            "Unmatched real SQLite SMS fingerprint or logical row"
          );
        const payload = encodeSmsReviewDraftV2({
          transaction: original,
          review: makeT025StoredReview(session, rowId),
        });
        return draft.prepareUpdate((record) => {
          record.payloadVersion = payload.version;
          record.payloadJson = payload.json;
          record.selectionOverride = false;
        });
      })
    );
  });
  return {
    queueId: queue.id,
    session,
    originals: sortedOriginals,
    records: arranged,
  };
}

async function ownedDrafts(): Promise<SmsReviewDraftItem[]> {
  return draftItems();
}

async function rawDraftPostimages(source: Database = database): Promise<
  ReadonlyArray<{
    readonly id: string;
    readonly fingerprint: string;
    readonly json: string;
    readonly version: number;
    readonly selected: boolean | null;
  }>
> {
  const drafts = await source
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
  return drafts
    .map((draft) => ({
      id: draft.id,
      fingerprint: draft.smsFingerprint,
      json: draft.payloadJson,
      version: draft.payloadVersion,
      selected: draft.selectionOverride,
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

async function openFreshSqliteDatabase(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses,
  });
}

function decodeOwnedV2(
  item: SmsReviewDraftItem,
  queueId: string
): ReturnType<typeof decodeSmsReviewDraftPayload> {
  return decodeSmsReviewDraftPayload({
    version: item.payloadVersion,
    json: item.payloadJson,
    expectedFingerprint: item.smsFingerprint,
    expectedOwnerId: item.userId,
    expectedSessionId: queueId,
    selectionOverride: item.selectionOverride,
  });
}

/** The runtime loader reads the current namespace; never return a cached result. */
async function readCurrentStoredSession(
  ownerId: string,
  queueId: string
): Promise<ReturnType<typeof makeT025ReviewSession>> {
  const records = await database
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(
      Q.where("user_id", ownerId),
      Q.where("queue_id", queueId),
      Q.sortBy("position", Q.asc)
    )
    .fetch();
  return rehydrateOwnedSmsReviewGraph(records, ownerId, queueId).session;
}

function execute(
  queueId: string,
  command: ReturnType<typeof confirmedCommand>
): ReturnType<typeof executeSmsAccountReviewCommand> {
  return executeSmsAccountReviewCommand({
    queueId,
    command,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: null,
  });
}

installSmsReviewSqliteHooks();

describe("#395 T029 command guards — real SQLite and fresh caches", () => {
  it("correlates logical row UUIDs with different physical draft IDs by owned fingerprints", async () => {
    const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
    expect(seeded.records.map((draft) => draft.id)).not.toEqual([
      T025_IDS.rowOne,
      T025_IDS.rowTwo,
    ]);
    const outcome = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    expect(outcome.effect).toBe("persist_sms");
    expect(outcome.affectedRowIds).toEqual([T025_IDS.rowOne, T025_IDS.rowTwo]);
    const records = await ownedDrafts();
    expect(records).toHaveLength(2);
    for (const record of records) {
      const canonicalRow = seeded.session.rows.find(
        (row) => row.sourceFingerprint === record.smsFingerprint
      );
      if (!canonicalRow) throw new Error("Missing canonical fingerprint peer");
      const restored = decodeOwnedV2(record, seeded.queueId);
      expect(restored.review?.row.rowId).toBe(canonicalRow.rowId);
      expect(restored.review?.row.rowId).not.toBe(record.id);
      expect(restored.review?.row.sourceFingerprint).toBe(
        record.smsFingerprint
      );
      expect(restored.review?.row.assignment).toMatchObject({
        state: "suggested",
        confirmation: "confirmed",
      });
      expect(restored.review?.sessionId).toBe(record.queueId);
      expect(restored.review?.ownerId).toBe(record.userId);
    }
  });

  it("replicates global revisions while preserving unrelated row revisions and row-specific groups", async () => {
    const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
    const first = seeded.session.rows[0];
    const second = seeded.session.rows[1];
    const group = seeded.session.groups[0];
    if (!first || !second || !group)
      throw new Error("Missing canonical separate-group source fixture");
    const canonical = makeIndependentT029GroupSession(seeded.session);
    const otherGroup = canonical.groups.find(
      (candidate) => candidate.groupId === T025_IDS.alternateQueue
    );
    if (!otherGroup) throw new Error("Missing independent source group");
    await database.write(async () => {
      await database.batch(
        ...seeded.records.map((record) => {
          const original = seeded.originals.find(
            (item) => item.smsFingerprint === record.smsFingerprint
          );
          const row = canonical.rows.find(
            (item) => item.sourceFingerprint === record.smsFingerprint
          );
          if (!original || !row)
            throw new Error("Missing separately grouped real SQLite peer");
          const encoded = encodeSmsReviewDraftV2({
            transaction: original,
            review: makeT025StoredReview(canonical, row.rowId),
          });
          return record.prepareUpdate((draft) => {
            draft.payloadVersion = encoded.version;
            draft.payloadJson = encoded.json;
            draft.selectionOverride = false;
          });
        })
      );
    });
    const confirmed = await execute(
      seeded.queueId,
      confirmedCommand(canonical)
    );
    expect(confirmed.effect).toBe("persist_sms");
    const selected = await execute(
      seeded.queueId,
      selectCommand(confirmed.state, first.rowId)
    );
    expect(selected.effect).toBe("persist_sms");
    const fresh = await openFreshSqliteDatabase();
    const records = await rawDraftPostimages(fresh);
    expect(records).toHaveLength(2);
    for (const record of records) {
      const decoded = decodeSmsReviewDraftPayload({
        version: record.version,
        json: record.json,
        expectedFingerprint: record.fingerprint,
        expectedOwnerId: canonical.ownerId,
        expectedSessionId: seeded.queueId,
        selectionOverride: record.selected,
      });
      expect(decoded.review?.reviewRevision).toBe(selected.state.revision);
      expect(decoded.review?.operationGeneration).toBe(
        selected.state.operationGeneration
      );
      expect(decoded.review?.groups).toHaveLength(1);
      if (decoded.review?.row.rowId === second.rowId) {
        expect(decoded.review.groups[0]?.groupId).toBe(otherGroup.groupId);
        expect(decoded.review.groups[0]?.status).toBe("pending");
        expect(decoded.review.row.revision).toBe(second.revision);
        expect(decoded.review.row.selected).toBe(false);
        expect(record.selected).toBe(false);
      } else {
        expect(decoded.review?.row.rowId).toBe(first.rowId);
        expect(decoded.review?.groups[0]?.groupId).toBe(group.groupId);
        expect(decoded.review?.groups[0]?.status).toBe("confirmed");
        expect(decoded.review?.row.selected).toBe(true);
        expect(record.selected).toBe(true);
      }
    }
  });

  it("runs actual retention with the real empty root collection and preserves it across a fresh adapter", async () => {
    const { FinancialActionGroup } = jest.requireActual<
      typeof import("../../../../packages/db/src/models/FinancialActionGroup")
    >("../../../../packages/db/src/models/FinancialActionGroup");
    expect(modelClasses).toContain(FinancialActionGroup);
    const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
    await expect(
      database.get("financial_action_groups").query().fetch()
    ).resolves.toHaveLength(0);
    await expect(
      discardAllSmsReviewDrafts(
        OWNER,
        seeded.queueId,
        seeded.records.map((row) => row.id)
      )
    ).resolves.toBe(2);
    const fresh = await openFreshSqliteDatabase();
    await expect(
      fresh.get("financial_action_groups").query().fetch()
    ).resolves.toHaveLength(0);
    await expect(
      fresh.get("sms_review_queues").query().fetch()
    ).resolves.toHaveLength(0);
    expect(await rawDraftPostimages(fresh)).toEqual([]);
  });

  it("keeps a frozen runtime retry intact when its owner changes before lazy Save admission", async () => {
    const runtime = await import("@/services/account-review-runtime-save");
    const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
    const confirmed = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    const first = confirmed.state.rows[0];
    if (!first) throw new Error("missing_real_confirmed_row");
    const selected = await execute(
      seeded.queueId,
      selectCommand(confirmed.state, first.rowId)
    );
    expect(selected.effect).toBe("persist_sms");
    const initial = runtime.captureAccountReviewRuntimeSave(
      selected.state,
      null
    );
    const frozen = await initial.prepared;
    const retry = runtime.captureAccountReviewRuntimeSave(frozen.session, null);
    expect(retry.immediate).not.toBeNull();
    const intentBefore = JSON.stringify(retry.immediate?.intent);
    const before = await rawDraftPostimages(await openFreshSqliteDatabase());
    const loadCurrent = jest.fn(() => Promise.resolve(selected.state));
    const pending = runtime.saveCapturedAccountReview(retry, loadCurrent);
    const refused = expect(pending).rejects.toThrow(
      "account_review_runtime_actor_changed"
    );
    setCurrentUser(FOREIGN);
    try {
      await refused;
    } finally {
      setCurrentUser(OWNER);
    }
    expect(loadCurrent).not.toHaveBeenCalled();
    expect(JSON.stringify(retry.immediate?.intent)).toBe(intentBefore);
    expect(runtime.captureAccountReviewRuntimeSave(frozen.session, retry)).toBe(
      retry
    );
    const fresh = await openFreshSqliteDatabase();
    expect(await rawDraftPostimages(fresh)).toEqual(before);
    for (const table of [
      "financial_action_groups",
      "account_financial_effects",
      "transactions",
      "transfers",
    ]) {
      await expect(fresh.get(table).query().fetch()).resolves.toHaveLength(0);
    }
  });

  it("crosses both real deferred Save imports and commits the original frozen action once", async () => {
    const runtime = await import("@/services/account-review-runtime-save");
    const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
    const confirmed = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    const first = confirmed.state.rows[0];
    if (!first) throw new Error("missing_real_confirmed_row");
    const selected = await execute(
      seeded.queueId,
      selectCommand(confirmed.state, first.rowId)
    );
    expect(selected.effect).toBe("persist_sms");
    const current = await readCurrentStoredSession(OWNER, seeded.queueId);
    expect(current).toEqual(selected.state);
    const stored = await rawDraftPostimages(await openFreshSqliteDatabase());
    expect(stored).toHaveLength(current.rows.length);
    for (const row of current.rows) {
      if (row.source !== "SMS") throw new Error("unexpected_runtime_source");
      const matches = stored.filter(
        (draft) => draft.fingerprint === row.sourceFingerprint
      );
      expect(matches).toHaveLength(1);
      const draft = matches[0];
      if (!draft) throw new Error("persisted_runtime_draft_missing");
      const decoded = decodeSmsReviewDraftPayload({
        version: draft.version,
        json: draft.json,
        expectedFingerprint: row.sourceFingerprint,
        expectedOwnerId: OWNER,
        expectedSessionId: seeded.queueId,
        selectionOverride: draft.selected,
      });
      expect(decoded.review).toMatchObject({
        ownerId: OWNER,
        sessionId: seeded.queueId,
        reviewRevision: current.revision,
        operationGeneration: current.operationGeneration,
        row: {
          rowId: row.rowId,
          revision: row.revision,
          selected: row.selected,
        },
      });
      expect(draft.selected).toBe(row.selected);
      expect(decoded.transaction).toEqual(row.transaction);
      // Preserve the valid legacy category flag. The two strict production
      // schemas order it differently; deleting it would hide the Save defect.
      expect(decoded.transaction.categoryConfirmed).toBe(true);
      expect(row.transaction.categoryConfirmed).toBe(true);
      expect(JSON.stringify(decoded.transaction)).not.toBe(
        JSON.stringify(row.transaction)
      );
    }
    const capture = runtime.captureAccountReviewRuntimeSave(current, null);
    const frozen = await capture.prepared;
    const frozenBytes = JSON.stringify(frozen);
    const loadCurrent = jest.fn(readCurrentStoredSession);
    const save = runtime.saveCapturedAccountReview(capture, loadCurrent);
    expect(loadCurrent).not.toHaveBeenCalled();
    await expect(save).resolves.toEqual({ kind: "committed" });
    expect(loadCurrent).toHaveBeenCalledWith(OWNER, seeded.queueId);
    expect(JSON.stringify(frozen)).toBe(frozenBytes);
    expect(
      runtime.captureAccountReviewRuntimeSave(selected.state, capture)
    ).toBe(capture);

    const fresh = await openFreshSqliteDatabase();
    const roots = await fresh
      .get<FinancialActionGroup>("financial_action_groups")
      .query(
        Q.where("user_id", OWNER),
        Q.where("action_id", frozen.intent.actionId)
      )
      .fetch();
    expect(roots).toHaveLength(1);
    const root = roots[0];
    if (!root) throw new Error("actual_runtime_root_missing");
    expect(root.state).toBe("local_complete");
    expect(root.localRecoverySnapshotJson).toEqual(expect.any(String));
    expect(root.payloadJson).toContain(frozen.intent.actionId);
    const committed = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      runtime.saveCapturedAccountReview(capture, loadCurrent)
    ).resolves.toEqual({ kind: "replay" });
    expect(
      await physicalSaveLedgerSnapshot(await openFreshSqliteDatabase())
    ).toEqual(committed);
    expect(JSON.stringify(frozen)).toBe(frozenBytes);
  });

  it("retains current-session CAS after the real deferred modules load", async () => {
    const runtime = await import("@/services/account-review-runtime-save");
    const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
    const confirmed = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    const first = confirmed.state.rows[0];
    if (!first) throw new Error("missing_real_confirmed_row");
    const selected = await execute(
      seeded.queueId,
      selectCommand(confirmed.state, first.rowId)
    );
    const capture = runtime.captureAccountReviewRuntimeSave(
      selected.state,
      null
    );
    const frozen = await capture.prepared;
    const frozenBytes = JSON.stringify(frozen);
    const selectedRow = selected.state.rows.find(
      (row) => row.rowId === first.rowId
    );
    if (!selectedRow) throw new Error("selected_row_missing");
    const changed = await execute(
      seeded.queueId,
      accountReviewCommandSchema.parse({
        kind: "set_row_selected",
        ownerId: OWNER,
        sessionId: seeded.queueId,
        expectedReviewRevision: selected.state.revision,
        expectedOperationGeneration: selected.state.operationGeneration,
        rowId: selectedRow.rowId,
        expectedRowRevision: selectedRow.revision,
        selected: false,
      })
    );
    expect(changed.effect).toBe("persist_sms");
    const before = await physicalSaveLedgerSnapshot(
      await openFreshSqliteDatabase()
    );
    const loadCurrent = jest.fn(() => Promise.resolve(changed.state));
    await expect(
      runtime.saveCapturedAccountReview(capture, loadCurrent)
    ).rejects.toThrow("account_review_runtime_session_cas_changed");
    expect(loadCurrent).toHaveBeenCalledWith(OWNER, seeded.queueId);
    expect(
      await physicalSaveLedgerSnapshot(await openFreshSqliteDatabase())
    ).toEqual(before);
    expect(JSON.stringify(frozen)).toBe(frozenBytes);
  });
});

type RuntimeSaveApi = typeof import("@/services/account-review-runtime-save");
type RuntimeSourceCapture = ReturnType<
  RuntimeSaveApi["captureAccountReviewRuntimeSave"]
>;
interface RuntimeSourceGuardFixture {
  readonly runtime: RuntimeSaveApi;
  readonly seeded: Awaited<ReturnType<typeof seedLinkedV2Queue>>;
  readonly capture: RuntimeSourceCapture;
  readonly input: Awaited<RuntimeSourceCapture["prepared"]>;
  readonly frozen: ReturnType<typeof freezeSelectedAccountReview>;
}

async function captureRuntimeSourceGuard(): Promise<RuntimeSourceGuardFixture> {
  const runtime = await import("@/services/account-review-runtime-save");
  const seeded = await seedLinkedV2Queue([T025_IDS.rowOne, T025_IDS.rowTwo]);
  const confirmed = await execute(
    seeded.queueId,
    confirmedCommand(seeded.session)
  );
  const first = confirmed.state.rows[0];
  if (!first) throw new Error("missing_real_confirmed_row");
  const selected = await execute(
    seeded.queueId,
    selectCommand(confirmed.state, first.rowId)
  );
  expect(selected.effect).toBe("persist_sms");
  const current = await readCurrentStoredSession(OWNER, seeded.queueId);
  expect(current).toEqual(selected.state);
  const capture = runtime.captureAccountReviewRuntimeSave(current, null);
  const input = await capture.prepared;
  return {
    runtime,
    seeded,
    capture,
    input,
    frozen: freezeSelectedAccountReview(input),
  };
}

describe("#395 complete SMS transaction comparison at the physical Save boundary", () => {
  it("accepts complete reordered values without rewriting V2 source bytes", async () => {
    const { runtime, seeded, capture, input, frozen } =
      await captureRuntimeSourceGuard();
    const originalInput = JSON.stringify(input);
    const rows = frozen.session.rows.map((row) => {
      if (row.source !== "SMS") throw new Error("unexpected_runtime_source");
      expect(row.transaction.categoryConfirmed).toBe(true);
      // Reinsert every original field, moving only key order, not its value.
      const { categoryConfirmed, rawSmsBody, ...rest } = row.transaction;
      return {
        ...row,
        transaction: { categoryConfirmed, rawSmsBody, ...rest },
      };
    });
    const reordered = {
      ...frozen,
      session: { ...frozen.session, rows },
      selectedRows: rows.filter((row) => row.selected),
    };
    expect(reordered).toEqual(frozen);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(frozen));
    const before = await physicalSaveLedgerSnapshot(
      await openFreshSqliteDatabase()
    );
    const inspected = await database.write(async () => {
      const scope = await getCurrentUserDataScope();
      return inspectSmsForSave(database, scope, reordered);
    });
    expect(inspected.selected).toHaveLength(1);
    expect(inspected.unsaved).toHaveLength(1);
    expect(inspected.alreadySaved).toHaveLength(0);
    expect(
      await physicalSaveLedgerSnapshot(await openFreshSqliteDatabase())
    ).toEqual(before);
    expect(JSON.stringify(input)).toBe(originalInput);
    const loadCurrent = jest.fn(readCurrentStoredSession);
    await expect(
      runtime.saveCapturedAccountReview(capture, loadCurrent)
    ).resolves.toEqual({ kind: "committed" });
    expect(loadCurrent).toHaveBeenCalledWith(OWNER, seeded.queueId);
    const committed = await physicalSaveLedgerSnapshot(
      await openFreshSqliteDatabase()
    );
    await expect(
      runtime.saveCapturedAccountReview(capture, loadCurrent)
    ).resolves.toEqual({ kind: "replay" });
    expect(
      await physicalSaveLedgerSnapshot(await openFreshSqliteDatabase())
    ).toEqual(committed);
    expect(JSON.stringify(input)).toBe(originalInput);
  });

  it.each(["amount", "date", "categoryConfirmed", "rawSmsBody"] as const)(
    "rejects a persisted %s change even with identical source identity, revision and selection",
    async (field) => {
      const { runtime, seeded, capture, input, frozen } =
        await captureRuntimeSourceGuard();
      const inputBefore = JSON.stringify(input);
      const original = frozen.selectedRows[0];
      if (!original || original.source !== "SMS")
        throw new Error("selected_sms_missing");
      const draft = seeded.records.find(
        (record) => record.smsFingerprint === original.sourceFingerprint
      );
      if (!draft) throw new Error("selected_physical_draft_missing");
      const originalJson = draft.payloadJson;
      const decoded = decodeOwnedV2(draft, seeded.queueId);
      const review = decoded.review;
      if (!review || review.row.source !== "SMS")
        throw new Error("selected_v2_missing");
      expect(decoded.transaction.categoryConfirmed).toBe(true);
      // Start from the already-validated V2 review-row transaction; the
      // canonical codec builder below retains its full mutable Zod shape.
      const transaction = {
        ...review.row.transaction,
        ...(field === "amount"
          ? { amount: decoded.transaction.amount + 1 }
          : {}),
        ...(field === "date"
          ? { date: new Date("2026-10-13T12:00:00.000Z") }
          : {}),
        ...(field === "categoryConfirmed" ? { categoryConfirmed: false } : {}),
        ...(field === "rawSmsBody"
          ? { rawSmsBody: decoded.transaction.rawSmsBody + " amended" }
          : {}),
      };
      const encoded = encodeSmsReviewDraftV2({
        transaction,
        review: {
          ...review,
          row: {
            ...review.row,
            transaction,
            amountDecimal: String(transaction.amount),
          },
        },
      });
      await database.write(async () => {
        await draft.update((record) => {
          record.payloadJson = encoded.json;
        });
      });
      const changed = decodeOwnedV2(draft, seeded.queueId);
      expect(changed.review?.row.rowId).toBe(original.rowId);
      expect(changed.review?.row.revision).toBe(original.revision);
      expect(changed.review?.row.selected).toBe(true);
      expect(changed.transaction.smsFingerprint).toBe(
        original.sourceFingerprint
      );
      expect(changed.transaction[field]).not.toEqual(
        decoded.transaction[field]
      );
      const before = await physicalSaveLedgerSnapshot(
        await openFreshSqliteDatabase()
      );
      await expect(
        database.write(async () => {
          const scope = await getCurrentUserDataScope();
          return inspectSmsForSave(database, scope, frozen);
        })
      ).rejects.toThrow("account_review_sms_stored_source_changed");
      // The real runtime also refuses the changed current namespace rather
      // than accepting stale loader authority or replacing the frozen intent.
      await expect(
        runtime.saveCapturedAccountReview(capture, readCurrentStoredSession)
      ).rejects.toThrow("account_review_runtime_session_cas_changed");
      expect(
        await physicalSaveLedgerSnapshot(await openFreshSqliteDatabase())
      ).toEqual(before);
      expect(JSON.stringify(input)).toBe(inputBefore);
      // Restore only the deliberate corruption, then retry the SAME capture.
      await database.write(async () => {
        await draft.update((record) => {
          record.payloadJson = originalJson;
        });
      });
      await expect(
        runtime.saveCapturedAccountReview(capture, readCurrentStoredSession)
      ).resolves.toEqual({ kind: "committed" });
      const committed = await physicalSaveLedgerSnapshot(
        await openFreshSqliteDatabase()
      );
      await expect(
        runtime.saveCapturedAccountReview(capture, readCurrentStoredSession)
      ).resolves.toEqual({ kind: "replay" });
      expect(
        await physicalSaveLedgerSnapshot(await openFreshSqliteDatabase())
      ).toEqual(committed);
      expect(JSON.stringify(input)).toBe(inputBefore);
    }
  );
});
