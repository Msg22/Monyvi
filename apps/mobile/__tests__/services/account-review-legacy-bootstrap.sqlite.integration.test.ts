/**
 * #395 T030 TESTS FIRST — authenticated all-V1 recovery with real SQLite.
 * The new private bootstrap SUT is intentionally absent at creation Red.
 * Import the actual namespace harness FIRST; never stub writer/codec/auth.
 */
import {
  database, adapter, draftItems, ownedQueues, OWNER, FOREIGN,
  setCurrentUser, emitSignOut, installSmsReviewSqliteHooks,
} from "./sms-review-namespace-test-harness";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type { SmsReviewDraftItem } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { accountReviewCommandSchema } from
  "../../../../packages/logic/src/account-review/review-schemas";
import {
  encodeSmsReviewDraft, encodeSmsReviewDraftV2,
  decodeSmsReviewDraftPayload,
} from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  makeT025SmsOriginal, makeT025ReviewSession,
  makeT025StoredReview, T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import { makeOwnedContext } from
  "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  loadOrBootstrapOwnedSmsReviewSession,
} from "@/services/account-review-legacy-bootstrap-service";
import { executeSmsAccountReviewCommand } from
  "@/services/account-review-command-service";
import {
  mergeSmsReviewDrafts, updateSmsReviewDraftItem,
  updateSmsReviewDraftSelection, deleteExpiredSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";

installSmsReviewSqliteHooks();

interface LegacyQueue {
  readonly queueId: string;
  readonly originals: readonly ParsedSmsTransaction[];
  readonly rows: readonly SmsReviewDraftItem[];
}

async function seedLegacyQueue(
  originals: readonly ParsedSmsTransaction[] = [
    makeT025SmsOriginal(0), makeT025SmsOriginal(1),
  ]
): Promise<LegacyQueue> {
  const result = await mergeSmsReviewDrafts({
    expectedUserId: OWNER, transactions: originals,
    parsedAt: new Date("2026-10-14T12:00:00.000Z"),
  });
  expect(result.insertedCount).toBe(originals.length);
  const queues = await ownedQueues();
  if (queues.length !== 1 || !queues[0])
    throw new Error("Expected one real owned V1 queue");
  const rows = [...(await draftItems())].sort((a, b) =>
    a.position - b.position || a.id.localeCompare(b.id)
  );
  if (rows.length !== originals.length ||
      rows.some((row) => row.payloadVersion !== 1))
    throw new Error("Legacy test input must be physically all V1");
  return { queueId: queues[0].id, originals, rows };
}

function bootstrapInput(queueId: string, signal?: AbortSignal): {
  readonly expectedOwnerId: string;
  readonly queueId: string;
  readonly signal?: AbortSignal;
} {
  return { expectedOwnerId: OWNER, queueId, signal };
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
  "sms_review_queues", "sms_review_draft_items",
  "dismissed_sms_fingerprints", "transactions", "transfers",
  "accounts", "bank_details", "account_sms_senders",
  "profiles", "categories",
] as const;

async function physicalSnapshot(
  source: Database
): Promise<readonly PhysicalTableSnapshot[]> {
  return Promise.all(TABLES.map(async (table): Promise<PhysicalTableSnapshot> => {
    const rows = await source.get<Model>(table).query().fetch();
    return {
      table, rows: rows.map((model) => JSON.stringify(
        Object.entries(model._raw).sort(([a], [b]) => a.localeCompare(b))
      )).sort(),
    };
  }));
}

function cacheSnapshot(models: readonly Model[]): readonly string[] {
  return models.map((model) => JSON.stringify(model._raw));
}

function writerBarrier(): {
  readonly entered: Promise<void>;
  readonly notifyEntered: () => void;
  readonly release: () => void;
  readonly hold: Promise<void>;
} {
  let signalEntered: () => void = () => {
    throw new Error("Uninitialized SQLite entry barrier");
  };
  let signalRelease: () => void = () => {
    throw new Error("Uninitialized SQLite release barrier");
  };
  const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
  const hold = new Promise<void>((resolve) => { signalRelease = resolve; });
  return {
    entered, hold,
    notifyEntered: () => signalEntered(),
    release: () => signalRelease(),
  };
}

async function setLegacyChoice(
  draft: SmsReviewDraftItem, selected: boolean
): Promise<ParsedSmsTransaction> {
  const original = makeT025SmsOriginal(0);
  const legacy: ParsedSmsTransaction = {
    ...original,
    accountId: "00000000-0000-4000-8000-000000000102",
    categoryConfirmed: true,
    pendingAccount: {
      tempId: "legacy-owned-qnb",
      name: "QNB", currency: "EGP", type: "BANK",
      institutionId: null, providerDisplayName: "QNB",
      senderDisplayName: "QNB", cardLast4: "0007",
    },
  };
  if (draft.smsFingerprint !== legacy.smsFingerprint)
    throw new Error("Legacy chosen-account source mismatch");
  const payload = encodeSmsReviewDraft(legacy);
  await database.write(() => database.batch(draft.prepareUpdate((row) => {
    row.payloadVersion = payload.version;
    row.payloadJson = payload.json;
    row.selectionOverride = selected;
  })));
  return legacy;
}

async function restoredRow(queueId: string, record: SmsReviewDraftItem):
  Promise<ReturnType<typeof decodeSmsReviewDraftPayload>> {
  const fresh = await openFreshSqliteDatabase();
  const actual = await fresh.get<SmsReviewDraftItem>(
    "sms_review_draft_items"
  ).find(record.id);
  return decodeSmsReviewDraftPayload({
    version: actual.payloadVersion, json: actual.payloadJson,
    expectedFingerprint: actual.smsFingerprint,
    expectedOwnerId: actual.userId, expectedSessionId: queueId,
    selectionOverride: actual.selectionOverride,
  });
}

describe("#395 T030 genuine legacy bootstrap, real owned SQLite", () => {
  it("installs exactly one deterministic anchor, preserving all unrelated V1 bytes", async () => {
    const seeded = await seedLegacyQueue();
    const anchor = seeded.rows[0];
    const untouched = seeded.rows[1];
    if (!anchor || !untouched) throw new Error("Missing real ordered V1 drafts");
    const legacy = await setLegacyChoice(anchor, true);
    const untouchedBefore = {
      id: untouched.id, json: untouched.payloadJson,
      selected: untouched.selectionOverride, position: untouched.position,
      parsedAt: untouched.parsedAt.getTime(),
    };
    const session = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    const rows = await draftItems();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.payloadVersion === 2))
      .toHaveLength(1);
    expect(rows.find((row) => row.payloadVersion === 2)?.id).toBe(anchor.id);
    const stillV1 = rows.find((row) => row.id === untouched.id);
    if (!stillV1) throw new Error("Unrelated legacy draft disappeared");
    expect({
      id: stillV1.id, json: stillV1.payloadJson,
      selected: stillV1.selectionOverride, position: stillV1.position,
      parsedAt: stillV1.parsedAt.getTime(),
    }).toEqual(untouchedBefore);
    const decoded = await restoredRow(seeded.queueId, anchor);
    if (!decoded.review) throw new Error("Committed V2 anchor unreadable");
    expect(decoded.review.row.rowId).toBe(anchor.id);
    expect(decoded.review.row.sourceRef).toBe("legacy-local:" + anchor.id);
    expect(decoded.review.row.sourceFingerprint).toBe(anchor.smsFingerprint);
    expect(decoded.review.row.accountEvidence).toMatchObject({
      state: "uncertain", evidenceSpans: [], candidateAccountIds: [],
    });
    expect(decoded.review.row.currency).toMatchObject({
      state: "unconfirmed", reason: "legacy_unknown",
    });
    expect(decoded.review.row.assignment.state).toBe("unresolved");
    expect(decoded.review.row.selected).toBe(true);
    expect(decoded.review.groups).toEqual([]);
    expect(decoded.transaction.accountId).toBe(legacy.accountId);
    expect(decoded.transaction.pendingAccount).toEqual(legacy.pendingAccount);
    expect(decoded.transaction.categoryId).toBe(legacy.categoryId);
    expect(decoded.transaction.categoryConfirmed).toBe(true);
    expect(decoded.transaction.date).toEqual(legacy.date);
    expect(session.rows.map((row) => row.sourceFingerprint).sort()).toEqual(
      seeded.originals.map((row) => row.smsFingerprint).sort()
    );
    expect(session.ownerId).toBe(OWNER);
    expect(session.sessionId).toBe(seeded.queueId);
    expect(session.revision).toBe(decoded.review.reviewRevision);
    expect(session.operationGeneration).toBe(decoded.review.operationGeneration);
    expect((await ownedQueues()).map((row) => row.id))
      .toEqual([seeded.queueId]);
  });

  it("a fresh SQLite adapter resolves the durable header and reopening is byte-idempotent", async () => {
    const seeded = await seedLegacyQueue();
    const first = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    const physical = await physicalSnapshot(await openFreshSqliteDatabase());
    const freshItems = await (await openFreshSqliteDatabase())
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("queue_id", seeded.queueId)).fetch();
    expect(freshItems.filter((row) => row.payloadVersion === 2))
      .toHaveLength(1);
    const freshAnchor = freshItems.find((row) => row.payloadVersion === 2);
    if (!freshAnchor) throw new Error("Fresh cache lost durable anchor");
    const checked = await restoredRow(seeded.queueId, freshAnchor);
    expect(checked.review?.reviewRevision).toBe(first.revision);
    expect(checked.review?.operationGeneration)
      .toBe(first.operationGeneration);
    const reopened = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    expect(reopened).toEqual(first);
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(physical);
  });

  it("refuses a pre-bootstrap zero-generation preview command after commit", async () => {
    const seeded = await seedLegacyQueue();
    const anchor = seeded.rows[0];
    if (!anchor) throw new Error("Missing pre-bootstrap physical source");
    await setLegacyChoice(anchor, true);
    const guessed = accountReviewCommandSchema.parse({
      kind: "set_row_selected", ownerId: OWNER, sessionId: seeded.queueId,
      expectedReviewRevision: "0", expectedOperationGeneration: "0",
      rowId: anchor.id, expectedRowRevision: "0", selected: false,
    });
    const committed = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    expect(committed.revision).not.toBe(guessed.expectedReviewRevision);
    expect(committed.operationGeneration)
      .not.toBe(guessed.expectedOperationGeneration);
    const before = await physicalSnapshot(await openFreshSqliteDatabase());
    const rejected = await executeSmsAccountReviewCommand({
      queueId: seeded.queueId, command: guessed,
      accountSnapshots: makeOwnedContext(), nextUndoToken: null,
    });
    expect(rejected.effect).toBe("none");
    expect(rejected.reasonCodes).toContain("review_revision_stale");
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(before);
  });

  it("loads a fully canonical V2 queue without changing its bytes or revisions", async () => {
    const seeded = await seedLegacyQueue([makeT025SmsOriginal(0)]);
    const source = seeded.originals[0];
    const record = seeded.rows[0];
    if (!record || !source) throw new Error("Missing original V2 fixture source");
    const canonical = makeT025ReviewSession(
      seeded.queueId, [source], [record.id]
    );
    const encoded = encodeSmsReviewDraftV2({
      transaction: source, review: makeT025StoredReview(canonical, record.id),
    });
    await database.write(() => database.batch(record.prepareUpdate((row) => {
      row.payloadVersion = encoded.version;
      row.payloadJson = encoded.json;
      row.selectionOverride = false;
    })));
    const before = await physicalSnapshot(await openFreshSqliteDatabase());
    const loaded = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    expect(loaded).toEqual(canonical);
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(before);
  });

  it("two concurrent bootstrap opens create one identical durable anchor", async () => {
    const seeded = await seedLegacyQueue();
    const [left, right] = await Promise.all([
      loadOrBootstrapOwnedSmsReviewSession(bootstrapInput(seeded.queueId)),
      loadOrBootstrapOwnedSmsReviewSession(bootstrapInput(seeded.queueId)),
    ]);
    expect(left).toEqual(right);
    const items = await draftItems();
    expect(items).toHaveLength(2);
    expect(items.filter((row) => row.payloadVersion === 2)).toHaveLength(1);
    expect((await ownedQueues()).map((row) => row.id))
      .toEqual([seeded.queueId]);
  });

  it("refuses a changed actor and sign-out without exposing foreign drafts", async () => {
    const seeded = await seedLegacyQueue();
    const before = await physicalSnapshot(await openFreshSqliteDatabase());
    try {
      setCurrentUser(FOREIGN);
      await expect(loadOrBootstrapOwnedSmsReviewSession(
        bootstrapInput(seeded.queueId)
      )).rejects.toThrow();
      emitSignOut();
      await expect(loadOrBootstrapOwnedSmsReviewSession(
        bootstrapInput(seeded.queueId)
      )).rejects.toThrow();
    } finally {
      setCurrentUser(OWNER);
    }
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(before);
  });

  it("aborts before entry and while queued without producing an anchor", async () => {
    const seeded = await seedLegacyQueue();
    const physical = await physicalSnapshot(await openFreshSqliteDatabase());
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId, alreadyAborted.signal)
    )).rejects.toThrow();
    const entry = writerBarrier();
    const held = database.write(async (): Promise<void> => {
      entry.notifyEntered();
      await entry.hold;
    });
    await entry.entered;
    const controller = new AbortController();
    const pending = loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId, controller.signal)
    );
    controller.abort();
    entry.release();
    try {
      await expect(pending).rejects.toThrow();
    } finally {
      entry.release();
      await held;
    }
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(physical);
  });

  it("missing or expired owned queue never recreates drafts", async () => {
    const empty = await physicalSnapshot(await openFreshSqliteDatabase());
    await expect(loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(T025_IDS.alternateQueue)
    )).rejects.toThrow();
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(empty);
    const seeded = await seedLegacyQueue();
    expect(await deleteExpiredSmsReviewDrafts(
      OWNER, new Date("2026-12-01T00:00:00.000Z")
    )).toBe(2);
    const afterExpiry = await physicalSnapshot(await openFreshSqliteDatabase());
    await expect(loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    )).rejects.toThrow();
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(afterExpiry);
    expect(await draftItems()).toHaveLength(0);
  });

  it("malformed V1 refuses non-destructively with the stable codec error", async () => {
    const seeded = await seedLegacyQueue();
    const corrupted = seeded.rows[0];
    if (!corrupted) throw new Error("Missing V1 corruption target");
    await database.write(() => database.batch(
      corrupted.prepareUpdate((row) => {
        row.payloadVersion = 1;
        row.payloadJson = "{corrupted-legacy-original";
        row.selectionOverride = true;
      })
    ));
    const before = await physicalSnapshot(await openFreshSqliteDatabase());
    await expect(loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    )).rejects.toMatchObject({
      name: "SmsReviewDraftCodecError", code: "malformed_payload",
    });
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(before);
    expect((await ownedQueues()).map((q) => q.id)).toEqual([seeded.queueId]);
  });

  it("precommit adapter failure restores raw bytes and cached models; same-source retry commits once", async () => {
    const seeded = await seedLegacyQueue();
    const models: Model[] = [
      ...await ownedQueues(), ...await draftItems(),
    ];
    const cachedBefore = cacheSnapshot(models);
    const before = await physicalSnapshot(await openFreshSqliteDatabase());
    const spy = jest.spyOn(adapter, "batch");
    spy.mockRejectedValueOnce(new Error("legacy_bootstrap_injected_adapter_failure"));
    try {
      await expect(loadOrBootstrapOwnedSmsReviewSession(
        bootstrapInput(seeded.queueId)
      )).rejects.toThrow("legacy_bootstrap_injected_adapter_failure");
    } finally {
      spy.mockRestore();
    }
    expect(cacheSnapshot(models)).toEqual(cachedBefore);
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(before);
    const recovered = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    expect(recovered.sessionId).toBe(seeded.queueId);
    expect((await draftItems()).filter((draft) => draft.payloadVersion === 2))
      .toHaveLength(1);
    const committed = await physicalSnapshot(await openFreshSqliteDatabase());
    await loadOrBootstrapOwnedSmsReviewSession(bootstrapInput(seeded.queueId));
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(committed);
  });


  it("an actor switch while the SQLite writer is queued cannot bootstrap the old owner", async () => {
    const seeded = await seedLegacyQueue();
    const cache = [...await ownedQueues(), ...await draftItems()];
    const cachedBefore = cacheSnapshot(cache);
    const before = await physicalSnapshot(await openFreshSqliteDatabase());
    const gate = writerBarrier();
    const blocker = database.write(async (): Promise<void> => {
      gate.notifyEntered();
      await gate.hold;
    });
    await gate.entered;
    const pending = loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    setCurrentUser(FOREIGN);
    gate.release();
    try {
      await expect(pending).rejects.toThrow();
    } finally {
      setCurrentUser(OWNER);
      gate.release();
      await blocker;
    }
    expect(cacheSnapshot(cache)).toEqual(cachedBefore);
    expect(await physicalSnapshot(await openFreshSqliteDatabase()))
      .toEqual(before);
  });

  it("expiry queued before bootstrap removes its own rows once and prevents resurrection", async () => {
    const seeded = await seedLegacyQueue();
    const gate = writerBarrier();
    const blocker = database.write(async (): Promise<void> => {
      gate.notifyEntered();
      await gate.hold;
    });
    await gate.entered;
    const expiry = deleteExpiredSmsReviewDrafts(
      OWNER, new Date("2026-12-01T00:00:00.000Z")
    );
    const pending = loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    gate.release();
    try {
      expect(await expiry).toBe(2);
      await expect(pending).rejects.toThrow();
    } finally {
      gate.release();
      await blocker;
    }
    expect(await draftItems()).toHaveLength(0);
    expect(await ownedQueues()).toHaveLength(0);
    await expect(loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    )).rejects.toThrow();
  });

  it("a real queued legacy selection wins without overwritten user choice", async () => {
    const seeded = await seedLegacyQueue();
    const target = seeded.rows[0];
    if (!target) throw new Error("Missing legacy selection target");
    const entered = writerBarrier();
    const blocker = database.write(async (): Promise<void> => {
      entered.notifyEntered();
      await entered.hold;
    });
    await entered.entered;
    const selecting = updateSmsReviewDraftSelection(target.id, OWNER, true);
    const bootstrapping = loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    entered.release();
    try {
      await selecting;
      await bootstrapping.catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error);
      });
    } finally {
      entered.release();
      await blocker;
    }
    const recovered = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    const row = recovered.rows.find((r) =>
      r.sourceFingerprint === target.smsFingerprint
    );
    expect(row?.selected).toBe(true);
    expect((await draftItems()).find((r) => r.id === target.id)
      ?.selectionOverride).toBe(true);
  });


  it("a queued legacy finance/account edit wins against stale bootstrap capture", async () => {
    const seeded = await seedLegacyQueue();
    const target = seeded.rows[0];
    if (!target) throw new Error("Missing legacy edit target");
    const original = makeT025SmsOriginal(0);
    const userEdit: ParsedSmsTransaction = {
      ...original,
      amount: 73, accountId: "00000000-0000-4000-8000-000000000102",
      categoryConfirmed: true,
    };
    const entered = writerBarrier();
    const blocker = database.write(async (): Promise<void> => {
      entered.notifyEntered();
      await entered.hold;
    });
    await entered.entered;
    const editing = updateSmsReviewDraftItem(target.id, OWNER, userEdit);
    const pending = loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    entered.release();
    try {
      await editing;
      await pending.catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error);
      });
    } finally {
      entered.release();
      await blocker;
    }
    const recovered = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    const row = recovered.rows.find((item) =>
      item.sourceFingerprint === target.smsFingerprint
    );
    if (!row || row.source !== "SMS")
      throw new Error("Missing recovered SMS-only edited source");
    expect(row.transaction.amount).toBe(73);
    expect(row.transaction.accountId).toBe(userEdit.accountId);
    expect(row.transaction.categoryConfirmed).toBe(true);
    const physical = (await draftItems()).find((item) => item.id === target.id);
    if (!physical) throw new Error("User-edited original draft disappeared");
    const decoded = await restoredRow(seeded.queueId, physical);
    expect(decoded.transaction.amount).toBe(userEdit.amount);
    expect(decoded.transaction.accountId).toBe(userEdit.accountId);
  });

  it("a queued progress membership change cannot disappear during bootstrap", async () => {
    const seeded = await seedLegacyQueue([makeT025SmsOriginal(0)]);
    const entered = writerBarrier();
    const blocker = database.write(async (): Promise<void> => {
      entered.notifyEntered();
      await entered.hold;
    });
    await entered.entered;
    const inserting = mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [makeT025SmsOriginal(1)],
    });
    const bootstrapping = loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    entered.release();
    try {
      expect((await inserting).insertedCount).toBe(1);
      await bootstrapping.catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error);
      });
    } finally {
      entered.release();
      await blocker;
    }
    const reopened = await loadOrBootstrapOwnedSmsReviewSession(
      bootstrapInput(seeded.queueId)
    );
    expect(new Set(reopened.rows.map((r) => r.sourceFingerprint))).toEqual(
      new Set([T025_IDS.fingerprintOne, T025_IDS.fingerprintTwo])
    );
    expect((await draftItems())).toHaveLength(2);
    expect((await ownedQueues()).map((q) => q.id)).toEqual([seeded.queueId]);
  });
});
