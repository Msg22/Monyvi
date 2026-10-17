/**
 * #395 T1 tests-first — cancellation must reach an admitted *real* SMS SQLite
 * writer, even when the facade has already rejected its outward promise.
 * Authentication and the native SQLite constructor are test-controlled. The
 * canonical reducer, codec, owned command service, hook, and SQLite batch are
 * never stubbed. Root runs this Red; it is intentionally NOT RUN here.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useAccountReview } from "@/hooks/useAccountReview";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type { SmsReviewDraftItem, SmsReviewQueue } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  accountReviewCommandSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/schemas";
import {
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraftV2,
} from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import { seedCapturedSmsReviewContext } from "../services/sms-review-real-sqlite-fixture";
import { mergeSmsReviewDrafts } from "@/services/sms-review-draft-repository";

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

jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
}));

interface SeededQueue {
  readonly queueId: string;
  readonly session: AccountReviewSession;
  readonly originals: readonly ParsedSmsTransaction[];
  readonly records: readonly SmsReviewDraftItem[];
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

async function seedLinkedV2Queue(
  logicalRowIds?: readonly string[]
): Promise<SeededQueue> {
  const originals = [makeT025SmsOriginal(0), makeT025SmsOriginal(1)];
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
  const session = makeT025ReviewSession(queue.id, sortedOriginals, rowIds);
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

/** Reopen the same SQLite data through independent Watermelon record caches. */
async function openFreshSqliteDatabase(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses,
  });
}

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

interface PhysicalSnapshot {
  readonly queues: readonly string[];
  readonly drafts: readonly string[];
}

function rawPhysicalModel(model: Model): string {
  return JSON.stringify(
    Object.entries(model._raw).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  );
}

async function readPhysicalSnapshot(
  source: Database
): Promise<PhysicalSnapshot> {
  const queues = await source
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
  const drafts = await source
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
  const stable = (models: readonly Model[]): string[] =>
    models.map(rawPhysicalModel).sort();
  return { queues: stable(queues), drafts: stable(drafts) };
}

function setFilterCommand(
  session: AccountReviewSession,
  filter: AccountReviewSession["filter"]
): ReturnType<typeof accountReviewCommandSchema.parse> {
  return accountReviewCommandSchema.parse({
    kind: "set_filter",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    filter,
  });
}

describe("#395 T1 cancelled admitted SMS writer — actual SQLite", () => {
  it("T1-R01: cancel after queue admission but before writer entry does not mutate queue or cached/fresh draft state", async () => {
    const seeded = await seedLinkedV2Queue();
    const controller = new AbortController();
    const hook = renderHook(() =>
      useAccountReview({
        mode: "SMS",
        ownerId: T025_IDS.owner,
        sessionId: seeded.queueId,
        queueId: seeded.queueId,
        signal: controller.signal,
      })
    );
    await waitFor(() => expect(hook.result.current.readModel).not.toBeNull());
    expect(hook.result.current.error).toBeNull();
    const loaded = hook.result.current.session;
    if (!loaded)
      throw new Error("T1 facade never loaded actual owned V2 queue");
    expect(loaded.filter).toBe("all");
    const original = await readPhysicalSnapshot(database);
    const entered = writerBarrier();
    const release = writerBarrier();
    const unrelatedWriter = database.write(async (): Promise<void> => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    const command = setFilterCommand(loaded, "needs_review");
    // The real command service queues database.write immediately, before
    // cancellation. Attach settlement before abort to avoid unhandled rejection.
    let outcome: Promise<"accepted" | "rejected">;
    act(() => {
      outcome = hook.result.current.dispatch(command).then(
        () => "accepted" as const,
        () => "rejected" as const
      );
      controller.abort();
    });
    const afterActualWriter = database.write(async (): Promise<void> => {});
    try {
      await expect(outcome!).resolves.toBe("rejected");
    } finally {
      release.release();
      await unrelatedWriter;
      // Drain the SQLite write queue, NOT just the facade's rejected promise.
      await afterActualWriter;
    }
    expect(hook.result.current.session).toBeNull();
    expect(await readPhysicalSnapshot(database)).toEqual(original);
    const fresh = await openFreshSqliteDatabase();
    expect(await readPhysicalSnapshot(fresh)).toEqual(original);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      seeded.queueId,
    ]);
  });

  it("T1-P01: same-owner admitted filter succeeds and durably updates the *real* queued V2 review", async () => {
    const seeded = await seedLinkedV2Queue();
    const controller = new AbortController();
    const hook = renderHook(() =>
      useAccountReview({
        mode: "SMS",
        ownerId: T025_IDS.owner,
        sessionId: seeded.queueId,
        queueId: seeded.queueId,
        signal: controller.signal,
      })
    );
    await waitFor(() => expect(hook.result.current.readModel).not.toBeNull());
    const loaded = hook.result.current.session;
    if (!loaded) throw new Error("T1 owned V2 session unavailable");
    const original = await readPhysicalSnapshot(database);
    const acceptedPromise = hook.result.current.dispatch(
      setFilterCommand(loaded, "needs_review")
    );
    await act(async () => {
      await acceptedPromise;
    });
    const accepted = await acceptedPromise;
    expect(accepted.reasonCodes).toEqual([]);
    expect(accepted.effect).toBe("persist_sms");
    await waitFor(() =>
      expect(hook.result.current.session?.filter).toBe("needs_review")
    );
    const committed = await readPhysicalSnapshot(database);
    expect(committed).not.toEqual(original);
    const fresh = await openFreshSqliteDatabase();
    expect(await readPhysicalSnapshot(fresh)).toEqual(committed);
    const restored = await ownedDrafts();
    expect(
      restored.every(
        (draft) =>
          decodeOwnedV2(draft, seeded.queueId).review?.filter === "needs_review"
      )
    ).toBe(true);
  });

  it("T1-P02: abort after the real SQLite batch completed never rolls that durable filter back", async () => {
    const seeded = await seedLinkedV2Queue();
    const controller = new AbortController();
    const hook = renderHook(() =>
      useAccountReview({
        mode: "SMS",
        ownerId: T025_IDS.owner,
        sessionId: seeded.queueId,
        queueId: seeded.queueId,
        signal: controller.signal,
      })
    );
    await waitFor(() => expect(hook.result.current.readModel).not.toBeNull());
    const loaded = hook.result.current.session;
    if (!loaded) throw new Error("T1 owned V2 session unavailable");
    await act(async () => {
      const committed = await hook.result.current.dispatch(
        setFilterCommand(loaded, "selected")
      );
      expect(committed.reasonCodes).toEqual([]);
      expect(committed.effect).toBe("persist_sms");
    });
    const committed = await readPhysicalSnapshot(database);
    act(() => controller.abort());
    await database.write(async (): Promise<void> => {});
    expect(await readPhysicalSnapshot(database)).toEqual(committed);
    const fresh = await openFreshSqliteDatabase();
    expect(await readPhysicalSnapshot(fresh)).toEqual(committed);
    expect(hook.result.current.session).toBeNull();
  });
});
