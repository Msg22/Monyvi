/** #395: real SQLite command writer, owned queue, V2 codec and CAS regressions.
 * Only native constructor/auth are mocked; commands use actual SQLite. */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type {
  Account,
  SmsReviewDraftItem,
  SmsReviewQueue,
  Transaction,
  Transfer,
} from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  accountReviewCommandSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/schemas";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  encodeSmsReviewDraftV2,
  smsReviewDraftPayloadV2Schema,
} from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  seedCapturedSmsReviewContext,
  makeT025AtmSmsOriginal,
  withT025CashDestination,
  prepareT025CashDraftInWriter,
  assertT025CashDraftColdReload,
  decodeT025OwnedV2 as decodeOwnedV2,
  readT025PhysicalSmsDrafts,
  openFreshT025SqliteDatabase,
} from "./sms-review-real-sqlite-fixture";
import {
  confirmedCommand,
  selectCommand,
} from "./account-review-t029-test-builders";
import {
  deleteExpiredSmsReviewDrafts,
  discardAllSmsReviewDrafts,
  mergeSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";
import {
  executeSmsAccountReviewCommand,
  initializeSmsAccountReviewReadySelection,
} from "@/services/account-review-command-service";

interface SqliteModules {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

let mockCurrentUserId: string = T025_IDS.owner;
let nextGeneratedId = 25100;
type CoordinatedAuthCallback = Parameters<
  (typeof import("@/services/supabase"))["subscribeToCoordinatedAuthStateChange"]
>[0];
const mockCoordinatedAuthListeners = new Set<CoordinatedAuthCallback>();

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.mock("@monyvi/db", (): unknown => {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const modelClasses = [
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/SmsReviewQueue")
    >("../../../../packages/db/src/models/SmsReviewQueue").SmsReviewQueue,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/SmsReviewDraftItem")
    >("../../../../packages/db/src/models/SmsReviewDraftItem")
      .SmsReviewDraftItem,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/DismissedSmsFingerprint")
    >("../../../../packages/db/src/models/DismissedSmsFingerprint")
      .DismissedSmsFingerprint,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Transaction")
    >("../../../../packages/db/src/models/Transaction").Transaction,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Transfer")
    >("../../../../packages/db/src/models/Transfer").Transfer,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Account")
    >("../../../../packages/db/src/models/Account").Account,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/BankDetails")
    >("../../../../packages/db/src/models/BankDetails").BankDetails,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/AccountSmsSender")
    >("../../../../packages/db/src/models/AccountSmsSender").AccountSmsSender,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Profile")
    >("../../../../packages/db/src/models/Profile").Profile,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Category")
    >("../../../../packages/db/src/models/Category").Category,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/FinancialActionGroup")
    >("../../../../packages/db/src/models/FinancialActionGroup")
      .FinancialActionGroup,
  ];
  const adapter = new Adapter({ schema });
  return {
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
    SmsReviewQueue: modelClasses[0],
    SmsReviewDraftItem: modelClasses[1],
    DismissedSmsFingerprint: modelClasses[2],
    Transaction: modelClasses[3],
    Transfer: modelClasses[4],
    Account: modelClasses[5],
    BankDetails: modelClasses[6],
    AccountSmsSender: modelClasses[7],
    Profile: modelClasses[8],
    Category: modelClasses[9],
    FinancialActionGroup: modelClasses[10],
  };
});

// Authentication is test-controlled but scoped queries use the real collections.
jest.mock("@/services/user-data-access", () => {
  const { Q: scopedQ } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getRequiredCurrentUserId: (): Promise<string> =>
      Promise.resolve(mockCurrentUserId),
    getCurrentUserDataScope: () => {
      const owner = mockCurrentUserId;
      return Promise.resolve({
        userId: owner,
        queryOwned: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...conditions: unknown[]
        ): unknown =>
          collection.query(scopedQ.where("user_id", owner), ...conditions),
        queryAccessibleCategories: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...conditions: unknown[]
        ): unknown =>
          collection.query(
            scopedQ.or(
              scopedQ.where("user_id", owner),
              scopedQ.where("user_id", null)
            ),
            ...conditions
          ),
        queryChildrenOfOwnedParents: (
          collection: { query: (...clauses: unknown[]) => unknown },
          parents: ReadonlyArray<{ id: string; userId: string }>,
          foreignKey: string,
          ...conditions: unknown[]
        ): unknown => {
          if (parents.some((p) => p.userId !== owner)) {
            throw new Error("auth_scope_changed");
          }
          return collection.query(
            scopedQ.where(foreignKey, scopedQ.oneOf(parents.map((p) => p.id))),
            ...conditions
          );
        },
        assertOwned: <T extends { readonly userId: string }>(record: T): T => {
          if (record.userId !== owner) throw new Error("auth_scope_changed");
          return record;
        },
      });
    },
    assertExpectedCurrentUser: (expected: string): Promise<void> =>
      expected === mockCurrentUserId
        ? Promise.resolve()
        : Promise.reject(new Error("auth_scope_changed")),
    queryOwned: (
      collection: { query: (...clauses: unknown[]) => unknown },
      userId: string,
      ...conditions: unknown[]
    ): unknown =>
      collection.query(scopedQ.where("user_id", userId), ...conditions),
  };
});

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentUserId),
  subscribeToCoordinatedAuthStateChange: (
    callback: CoordinatedAuthCallback
  ) => {
    mockCoordinatedAuthListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: (): void => {
            mockCoordinatedAuthListeners.delete(callback);
          },
        },
      },
    };
  },
}));

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<SqliteModules>("@monyvi/db");

interface SeededQueue {
  readonly queueId: string;
  readonly session: AccountReviewSession;
  readonly originals: readonly ParsedSmsTransaction[];
  readonly records: readonly SmsReviewDraftItem[];
}

interface DraftPostimage {
  readonly id: string;
  readonly fingerprint: string;
  readonly json: string;
  readonly version: number;
  readonly selected: boolean | null;
}

async function ownedQueues(): Promise<SmsReviewQueue[]> {
  return database
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
}

async function ownedDrafts(): Promise<SmsReviewDraftItem[]> {
  return database
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
}

const rawDraftPostimages = (
  source: Database = database
): Promise<readonly DraftPostimage[]> =>
  readT025PhysicalSmsDrafts(source, T025_IDS.owner);

async function seedLinkedV2Queue(
  logicalRowIds?: readonly string[],
  firstIsAtm = false
): Promise<SeededQueue> {
  const originals = [
    firstIsAtm ? makeT025AtmSmsOriginal() : makeT025SmsOriginal(0),
    makeT025SmsOriginal(1),
  ];
  const merged = await mergeSmsReviewDrafts({
    transactions: originals,
    expectedUserId: T025_IDS.owner,
    parsedAt: new Date("2026-10-14T12:00:00.000Z"),
  });
  expect(merged.insertedCount).toBe(2);
  const queues = await ownedQueues();
  expect(queues).toHaveLength(1);
  const queue = queues[0];
  if (!queue) throw new Error("Real SQLite queue not created");
  const records = await ownedDrafts();
  expect(records).toHaveLength(2);
  const arranged = [...records].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const sortedOriginals = [...originals].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const rowIds = logicalRowIds ?? arranged.map((draft) => draft.id);
  const normalized = makeT025ReviewSession(queue.id, sortedOriginals, rowIds);
  const session = firstIsAtm ? withT025CashDestination(normalized) : normalized;
  await database.write(async () => {
    await database.batch(
      ...arranged.map((draft, index) => {
        const original = sortedOriginals.find(
          (item) => item.smsFingerprint === draft.smsFingerprint
        );
        const rowId = rowIds[index];
        if (!original || !rowId)
          throw new Error("Unmatched actual SQLite SMS fingerprint or row ID");
        const encoded = encodeSmsReviewDraftV2({
          transaction: original,
          review: makeT025StoredReview(session, rowId),
        });
        return draft.prepareUpdate((record) => {
          record.payloadVersion = encoded.version;
          record.payloadJson = encoded.json;
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

function execute(
  queueId: string,
  command: ReturnType<typeof confirmedCommand>,
  nextUndoToken: string | null = null
): ReturnType<typeof executeSmsAccountReviewCommand> {
  return executeSmsAccountReviewCommand({
    queueId,
    command,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken,
  });
}

/** Reopen the same physical SQLite through independently cached models. */
const openFreshSqliteDatabase = (): Promise<Database> =>
  openFreshT025SqliteDatabase(adapter, modelClasses);

interface WriterBarrier {
  readonly promise: Promise<void>;
  readonly release: () => void;
}

function writerBarrier(): WriterBarrier {
  let release: () => void = () => {
    throw new Error("T025 test barrier was not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

beforeAll(async () => {
  setGenerator(
    () =>
      "00000000-0000-4000-8000-" + String(nextGeneratedId++).padStart(12, "0")
  );
  await adapter.initializingPromise;
});

beforeEach(async () => {
  mockCurrentUserId = T025_IDS.owner;
  nextGeneratedId = 25100;
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  await seedCapturedSmsReviewContext(database, T025_IDS.owner);
});

afterEach(() => {
  mockCurrentUserId = T025_IDS.owner;
  for (const callback of [...mockCoordinatedAuthListeners]) {
    callback("SIGNED_OUT", null);
  }
  expect(mockCoordinatedAuthListeners.size).toBe(0);
  jest.restoreAllMocks();
});

describe("#395 T025 command service with real SQLite and no writer stub", () => {
  it("CR-DOM1 pending suggestions never auto-confirm at an owned SQLite bootstrap", async () => {
    const seeded = await seedLinkedV2Queue();
    const before = await rawDraftPostimages();
    const initial = await initializeSmsAccountReviewReadySelection({
      ownerId: T025_IDS.owner,
      queueId: seeded.queueId,
      expectedSession: seeded.session,
    });
    expect(initial.groups[0]?.status).toBe("pending");
    expect(initial.rows.every((row) => !row.selected)).toBe(true);
    expect(await rawDraftPostimages()).toEqual(before);
  });

  it("confirms a shared group across every linked record in one durable snapshot", async () => {
    const seeded = await seedLinkedV2Queue();
    const before = await rawDraftPostimages();
    const result = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    expect(result.effect).toBe("persist_sms");
    expect(result.reasonCodes).toEqual([]);
    expect(result.affectedRowIds).toHaveLength(2);
    expect(result.state.rows.every((row) => !row.selected)).toBe(true);
    const records = await ownedDrafts();
    expect(records).toHaveLength(2);
    for (const item of records) {
      const restored = decodeOwnedV2(item, seeded.queueId);
      expect(restored.review?.groups[0]?.status).toBe("confirmed");
      expect(restored.review?.row.assignment).toMatchObject({
        state: "suggested",
        confirmation: "confirmed",
      });
      expect(restored.review?.row.selected).toBe(false);
      expect(restored.review?.reviewRevision).toBe(result.state.revision);
    }
    expect(
      await database
        .get<Account>("accounts")
        .query(Q.where("user_id", T025_IDS.owner))
        .fetchCount()
    ).toBe(2);
    expect(
      await database
        .get<Transaction>("transactions")
        .query(Q.where("user_id", T025_IDS.owner))
        .fetchCount()
    ).toBe(0);
    expect(
      await database
        .get<Transfer>("transfers")
        .query(Q.where("user_id", T025_IDS.owner))
        .fetchCount()
    ).toBe(0);
    expect(before.every((item) => item.version === 2)).toBe(true);
  });

  it("selects one clicked row only after confirmation without changing its sibling", async () => {
    const seeded = await seedLinkedV2Queue();
    const confirmed = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    const clicked = confirmed.state.rows[0];
    if (!clicked) throw new Error("Missing clicked row");
    const selected = await execute(
      seeded.queueId,
      selectCommand(confirmed.state, clicked.rowId)
    );
    expect(selected.reasonCodes).toEqual([]);
    expect(
      selected.state.rows.filter((row) => row.selected).map((row) => row.rowId)
    ).toEqual([clicked.rowId]);
    const records = await ownedDrafts();
    for (const item of records) {
      const persisted = decodeOwnedV2(item, seeded.queueId);
      expect(persisted.review?.row.selected).toBe(item.id === clicked.rowId);
      expect(item.selectionOverride).toBe(item.id === clicked.rowId);
    }
  });

  it("rejects a duplicate stale confirmation without rewriting selected or financial fields", async () => {
    const seeded = await seedLinkedV2Queue();
    const command = confirmedCommand(seeded.session);
    const first = await execute(seeded.queueId, command);
    expect(first.effect).toBe("persist_sms");
    const beforeRetry = await rawDraftPostimages();
    const retry = await execute(seeded.queueId, command);
    expect(retry.effect).toBe("none");
    expect(retry.reasonCodes).toContain("review_revision_stale");
    expect(await rawDraftPostimages()).toEqual(beforeRetry);
  });

  it("serializes concurrent same-revision commands, with at most one commit", async () => {
    const seeded = await seedLinkedV2Queue();
    const command = confirmedCommand(seeded.session);
    const [a, b] = await Promise.all([
      execute(seeded.queueId, command),
      execute(seeded.queueId, command),
    ]);
    expect(
      [a, b].filter((outcome) => outcome.effect === "persist_sms")
    ).toHaveLength(1);
    expect([a, b].filter((outcome) => outcome.effect === "none")).toHaveLength(
      1
    );
    const drafts = await ownedDrafts();
    expect(drafts).toHaveLength(2);
    expect(
      drafts.map(
        (draft) =>
          decodeOwnedV2(draft, seeded.queueId).review?.groups[0]?.status
      )
    ).toEqual(["confirmed", "confirmed"]);
  });

  it("rejects owner logout and leaves the previously owned SQLite drafts byte-identical", async () => {
    const seeded = await seedLinkedV2Queue();
    const oldBytes = await rawDraftPostimages();
    mockCurrentUserId = T025_IDS.foreignOwner;
    await expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    mockCurrentUserId = T025_IDS.owner;
    expect(await rawDraftPostimages()).toEqual(oldBytes);
  });

  it("refuses a different current queue ID without renaming or deleting existing drafts", async () => {
    const seeded = await seedLinkedV2Queue();
    const prior = await rawDraftPostimages();
    await expect(
      execute(T025_IDS.alternateQueue, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    expect(await rawDraftPostimages()).toEqual(prior);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      seeded.queueId,
    ]);
  });

  it("rejects a stale fingerprint on one linked row rather than partially confirming", async () => {
    const seeded = await seedLinkedV2Queue();
    const rows = await ownedDrafts();
    const victim = rows[0];
    if (!victim) throw new Error("Missing actual SQLite linked draft");
    await database.write(() =>
      database.batch(
        victim.prepareUpdate((record) => {
          record.smsFingerprint = "t025-stale-unmatched-fingerprint";
        })
      )
    );
    const before = await rawDraftPostimages();
    await expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    expect(await rawDraftPostimages()).toEqual(before);
  });

  it("rejects disagreeing linked group revisions, never last-write-wins one snapshot", async () => {
    const seeded = await seedLinkedV2Queue();
    const drafts = await ownedDrafts();
    const victim = drafts[1];
    if (!victim) throw new Error("Missing second linked row");
    const original = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(victim.payloadJson) as unknown
    );
    const group = original.review.groups[0];
    if (!group) throw new Error("Missing sealed group identity");
    const conflicting = JSON.stringify({
      ...original,
      review: {
        ...original.review,
        row: {
          ...original.review.row,
          assignment: {
            ...original.review.row.assignment,
            groupRevision: "7",
          },
        },
        groups: [{ ...group, revision: "7" }],
      },
    });
    await database.write(() =>
      database.batch(
        victim.prepareUpdate((record) => {
          record.payloadJson = conflicting;
        })
      )
    );
    const before = await rawDraftPostimages();
    await expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    expect(await rawDraftPostimages()).toEqual(before);
  });

  it("preserves unreadable V1 payload bytes, selection override and queue on failed migration", async () => {
    const seeded = await seedLinkedV2Queue();
    const draft = (await ownedDrafts())[0];
    if (!draft) throw new Error("Missing first SMS draft");
    await database.write(() =>
      database.batch(
        draft.prepareUpdate((row) => {
          row.payloadVersion = 1;
          row.payloadJson = "{corrupt-v1-json";
          row.selectionOverride = true;
        })
      )
    );
    const before = await rawDraftPostimages();
    await expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    expect(await rawDraftPostimages()).toEqual(before);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      seeded.queueId,
    ]);
  });

  it("removal tombstones every linked row but persists no transient Undo token", async () => {
    const seeded = await seedLinkedV2Queue();
    const group = seeded.session.groups[0];
    if (!group) throw new Error("No pending T025 group");
    const command = accountReviewCommandSchema.parse({
      kind: "remove_group",
      ownerId: seeded.session.ownerId,
      sessionId: seeded.session.sessionId,
      expectedReviewRevision: seeded.session.revision,
      expectedOperationGeneration: seeded.session.operationGeneration,
      groupId: group.groupId,
      expectedGroupRevision: group.revision,
    });
    const removed = await execute(seeded.queueId, command, T025_IDS.undoToken);
    expect(removed.reasonCodes).toEqual([]);
    expect(removed.undoToken).toBe(T025_IDS.undoToken);
    for (const record of await ownedDrafts()) {
      const persisted = decodeOwnedV2(record, seeded.queueId);
      expect(persisted.review?.removedEvidenceKeys).toContain(
        group.evidenceKey
      );
      expect(persisted.review?.row.assignment.state).toBe("unresolved");
      expect(persisted.review?.row.selected).toBe(false);
      expect(record.payloadJson).not.toContain(T025_IDS.undoToken);
      expect(record.payloadJson).not.toContain("previousState");
    }
  });
  it("an adapter failure after preparing the linked write rolls back every cached and persisted row; retry succeeds once", async () => {
    const seeded = await seedLinkedV2Queue();
    const preimage = await rawDraftPostimages();
    const adapterBatch = jest.spyOn(database.adapter, "batch");
    adapterBatch.mockImplementationOnce(
      (): Promise<void> =>
        Promise.reject(new Error("t025_sqlite_injected_precommit_failure"))
    );
    try {
      await expect(
        execute(seeded.queueId, confirmedCommand(seeded.session))
      ).rejects.toThrow("t025_sqlite_injected_precommit_failure");
      expect(adapterBatch).toHaveBeenCalledTimes(1);
    } finally {
      adapterBatch.mockRestore();
    }
    expect(await rawDraftPostimages()).toEqual(preimage);
    const fresh = await openFreshSqliteDatabase();
    expect(await rawDraftPostimages(fresh)).toEqual(preimage);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      seeded.queueId,
    ]);
    expect(
      await database.get<Transaction>("transactions").query().fetchCount()
    ).toBe(0);
    const retry = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    expect(retry.reasonCodes).toEqual([]);
    expect(retry.effect).toBe("persist_sms");
    expect(
      (await ownedDrafts()).map(
        (item) => decodeOwnedV2(item, seeded.queueId).review?.groups[0]?.status
      )
    ).toEqual(["confirmed", "confirmed"]);
  });

  it("rejects an actor change while a serialized writer is queued without touching either owner", async () => {
    const seeded = await seedLinkedV2Queue();
    const original = await rawDraftPostimages();
    const entered = writerBarrier();
    const resume = writerBarrier();
    const holder = database.write(async (): Promise<void> => {
      entered.release();
      await resume.promise;
    });
    await entered.promise;
    const pending = execute(seeded.queueId, confirmedCommand(seeded.session));
    const rejection = expect(pending).rejects.toThrow();
    try {
      await Promise.resolve();
      mockCurrentUserId = T025_IDS.foreignOwner;
      resume.release();
      await holder;
      await rejection;
    } finally {
      resume.release();
      mockCurrentUserId = T025_IDS.owner;
    }
    expect(await rawDraftPostimages()).toEqual(original);
    expect(
      await database
        .get<SmsReviewDraftItem>("sms_review_draft_items")
        .query(Q.where("user_id", T025_IDS.foreignOwner))
        .fetchCount()
    ).toBe(0);
    expect((await ownedQueues()).map((item) => item.id)).toEqual([
      seeded.queueId,
    ]);
  });

  it("rejects a queued group command after the actual expiry writer deletes its source rows", async () => {
    const seeded = await seedLinkedV2Queue();
    const entered = writerBarrier();
    const resume = writerBarrier();
    const holder = database.write(async (): Promise<void> => {
      entered.release();
      await resume.promise;
    });
    await entered.promise;
    const expiry = deleteExpiredSmsReviewDrafts(
      T025_IDS.owner,
      new Date("2026-12-01T00:00:00.000Z")
    );
    const stale = expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    resume.release();
    try {
      expect(await expiry).toBe(2);
      await stale;
    } finally {
      resume.release();
      await holder;
    }
    expect(await ownedDrafts()).toHaveLength(0);
    expect(await ownedQueues()).toHaveLength(0);
    expect(
      await database.get<Transaction>("transactions").query().fetchCount()
    ).toBe(0);
  });

  it("cannot resurrect the old queue after a queued last-row deletion wins the writer", async () => {
    const seeded = await seedLinkedV2Queue();
    const entered = writerBarrier();
    const resume = writerBarrier();
    const holder = database.write(async (): Promise<void> => {
      entered.release();
      await resume.promise;
    });
    await entered.promise;
    const discard = discardAllSmsReviewDrafts(
      T025_IDS.owner,
      seeded.queueId,
      seeded.records.map((row) => row.id)
    );
    const stale = expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    resume.release();
    try {
      expect(await discard).toBe(2);
      await stale;
    } finally {
      resume.release();
      await holder;
    }
    expect(await ownedDrafts()).toHaveLength(0);
    expect(await ownedQueues()).toHaveLength(0);
    expect(
      await database.get<Transaction>("transactions").query().fetchCount()
    ).toBe(0);
  });

  it("a real owned ATM source and row-only Cash draft survive SQLite cold reload without creating an account", async () => {
    const seeded = await seedLinkedV2Queue(undefined, true);
    const { confirmed, prepared, row, draftGroupId } =
      await prepareT025CashDraftInWriter({
        database,
        session: seeded.session,
        execute: (command) => execute(seeded.queueId, command),
      });
    expect(confirmed.reasonCodes).toEqual([]);
    expect(prepared.reasonCodes).toEqual([]);
    expect(prepared.effect).toBe("persist_sms");
    await assertT025CashDraftColdReload({
      prepared,
      row,
      draftGroupId,
      queueId: seeded.queueId,
      ownerId: T025_IDS.owner,
      fresh: openFreshSqliteDatabase,
      execute: (command) => execute(seeded.queueId, command),
    });
  });

  it("rehydrates identical confirmed group revisions and authoritative clicked selection from a fresh SQLite adapter", async () => {
    const seeded = await seedLinkedV2Queue();
    const confirmed = await execute(
      seeded.queueId,
      confirmedCommand(seeded.session)
    );
    const clicked = confirmed.state.rows[0];
    if (!clicked) throw new Error("Missing confirmed T025 row");
    const selected = await execute(
      seeded.queueId,
      selectCommand(confirmed.state, clicked.rowId)
    );
    expect(selected.effect).toBe("persist_sms");
    const fresh = await openFreshSqliteDatabase();
    const records = await fresh
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("user_id", T025_IDS.owner))
      .fetch();
    expect(records).toHaveLength(2);
    const loaded = records.map((record) =>
      decodeOwnedV2(record, seeded.queueId)
    );
    expect(
      loaded.every((item) => item.review?.groups[0]?.status === "confirmed")
    ).toBe(true);
    expect(
      new Set(loaded.map((item) => item.review?.groups[0]?.revision)).size
    ).toBe(1);
    expect(
      loaded
        .filter((item) => item.review?.row.selected)
        .map((item) => item.review?.row.rowId)
    ).toEqual([clicked.rowId]);
    expect(
      records.find((row) => row.id === clicked.rowId)?.selectionOverride
    ).toBe(true);
  });

  it("rehydrates durable removal tombstones but never persists the transient Undo token", async () => {
    const seeded = await seedLinkedV2Queue();
    const group = seeded.session.groups[0];
    if (!group) throw new Error("Missing original grouped account");
    const command = accountReviewCommandSchema.parse({
      kind: "remove_group",
      ownerId: seeded.session.ownerId,
      sessionId: seeded.session.sessionId,
      expectedReviewRevision: seeded.session.revision,
      expectedOperationGeneration: seeded.session.operationGeneration,
      groupId: group.groupId,
      expectedGroupRevision: group.revision,
    });
    const removed = await execute(seeded.queueId, command, T025_IDS.undoToken);
    expect(removed.undoToken).toBe(T025_IDS.undoToken);
    const fresh = await openFreshSqliteDatabase();
    const items = await fresh
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("user_id", T025_IDS.owner))
      .fetch();
    expect(items).toHaveLength(2);
    for (const item of items) {
      const decoded = decodeOwnedV2(item, seeded.queueId);
      expect(decoded.review?.removedEvidenceKeys).toContain(group.evidenceKey);
      expect(decoded.review?.groups[0]?.status).toBe("removed");
      expect(decoded.review?.row.assignment.state).toBe("unresolved");
      expect(decoded.review?.row.selected).toBe(false);
      expect(item.payloadJson).not.toContain(T025_IDS.undoToken);
      expect(item.payloadJson).not.toContain("previousState");
    }
  });

  it("refuses an independently stale operation generation even when review/group revisions match", async () => {
    const seeded = await seedLinkedV2Queue();
    const before = await rawDraftPostimages();
    const command = accountReviewCommandSchema.parse({
      ...confirmedCommand(seeded.session),
      expectedOperationGeneration: "9",
    });
    const outcome = await execute(seeded.queueId, command);
    expect(outcome.effect).toBe("none");
    expect(outcome.reasonCodes).toContain("review_revision_stale");
    expect(outcome.affectedRowIds).toEqual([]);
    expect(await rawDraftPostimages()).toEqual(before);
  });

  it("refuses a linked source draft moved to another queue instead of writing a partial group", async () => {
    const seeded = await seedLinkedV2Queue();
    const other = seeded.records[1];
    if (!other) throw new Error("Missing second grouped draft");
    await database.write(() =>
      database.batch(
        other.prepareUpdate((record) => {
          record.queueId = T025_IDS.alternateQueue;
        })
      )
    );
    const before = await rawDraftPostimages();
    const membership = (await ownedDrafts()).map((row) => ({
      id: row.id,
      owner: row.userId,
      queue: row.queueId,
    }));
    await expect(
      execute(seeded.queueId, confirmedCommand(seeded.session))
    ).rejects.toThrow();
    expect(await rawDraftPostimages()).toEqual(before);
    expect(
      (await ownedDrafts()).map((row) => ({
        id: row.id,
        owner: row.userId,
        queue: row.queueId,
      }))
    ).toEqual(membership);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      seeded.queueId,
    ]);
  });
});
