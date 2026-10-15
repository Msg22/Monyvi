/**
 * #395 owned SMS namespace T014-M/T028 boundary, TESTS-FIRST creation Red.
 * Real WatermelonDB + SQLite + actual draft repository. Only the current-user
 * auth boundary is mocked; never mock the queue service, repository or writer.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import { seedCapturedSmsReviewContext } from "./sms-review-real-sqlite-fixture";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import { canonicalUuid } from "../../../../packages/logic/src/account-review/schema-primitives";
import type { SmsReviewQueue, SmsReviewDraftItem } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  acquireOwnedSmsReviewQueueNamespace,
  assertOwnedSmsReviewQueueNamespaceCurrent,
  releaseOwnedSmsReviewQueueNamespace,
} from "@/services/sms-review-namespace-lease-service";
import {
  getSmsReviewDraftQueueSnapshot,
  mergeSmsReviewDrafts,
  discardAllSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";

interface RealSqliteDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}


type EdgeReply = { readonly data: unknown; readonly error: null };
const mockEdge = jest.fn<Promise<EdgeReply>, [string, unknown, unknown?]>();
let mockParserRoute: "ai" | "hybrid" | "local" = "ai";

jest.mock("@/services/authenticated-edge-function-service", () => ({
  invokeAuthenticatedEdgeFunction: (
    name: string, options: unknown, retryOptions?: unknown
  ): Promise<EdgeReply> => mockEdge(name, options, retryOptions),
  isEdgeFunctionAuthenticationError: (): boolean => false,
}));

jest.mock("@/config/e2e-test-config", () => ({
  shouldBlockUnsafeSmsParserConfiguration: (): boolean => false,
  shouldUseFixtureSmsParser: (): boolean => false,
  shouldUseHybridSmsParser: (): boolean => mockParserRoute === "hybrid",
  shouldUseLocalSmsParser: (): boolean => mockParserRoute === "local",
}));

jest.mock("@/config/sms-safeguard-qa-config", () => ({
  getSmsSafeguardQaConfig: () => ({
    enabled: false, profileId: null, runId: null,
  }),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{
    readonly userId: string; readonly isConsented: true;
  }> => Promise.resolve({ userId: mockCurrentUserId, isConsented: true }),
  revokeAiProcessingConsent: (): Promise<void> => Promise.resolve(),
}));

const OWNER = "00000000-0000-4000-8000-000000000101";
const FOREIGN = "00000000-0000-4000-8000-000000000201";
let mockCurrentUserId: string = OWNER;
let nextId = 1;

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase } =
    jest.requireActual<typeof import("@nozbe/watermelondb")>(
      "@nozbe/watermelondb"
    );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const modelClasses = [
    jest.requireActual<typeof import("../../../../packages/db/src/models/SmsReviewQueue")>(
      "../../../../packages/db/src/models/SmsReviewQueue"
    ).SmsReviewQueue,
    jest.requireActual<typeof import("../../../../packages/db/src/models/SmsReviewDraftItem")>(
      "../../../../packages/db/src/models/SmsReviewDraftItem"
    ).SmsReviewDraftItem,
    jest.requireActual<typeof import("../../../../packages/db/src/models/DismissedSmsFingerprint")>(
      "../../../../packages/db/src/models/DismissedSmsFingerprint"
    ).DismissedSmsFingerprint,
    jest.requireActual<typeof import("../../../../packages/db/src/models/Transaction")>(
      "../../../../packages/db/src/models/Transaction"
    ).Transaction,
    jest.requireActual<typeof import("../../../../packages/db/src/models/Transfer")>(
      "../../../../packages/db/src/models/Transfer"
    ).Transfer,
    jest.requireActual<typeof import("../../../../packages/db/src/models/Account")>(
      "../../../../packages/db/src/models/Account"
    ).Account,
    jest.requireActual<typeof import("../../../../packages/db/src/models/BankDetails")>(
      "../../../../packages/db/src/models/BankDetails"
    ).BankDetails,
    jest.requireActual<typeof import("../../../../packages/db/src/models/AccountSmsSender")>(
      "../../../../packages/db/src/models/AccountSmsSender"
    ).AccountSmsSender,
    jest.requireActual<typeof import("../../../../packages/db/src/models/Profile")>(
      "../../../../packages/db/src/models/Profile"
    ).Profile,
    jest.requireActual<typeof import("../../../../packages/db/src/models/Category")>(
      "../../../../packages/db/src/models/Category"
    ).Category,
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

jest.mock("@/services/user-data-access", () => {
  const { Q: scopedQ } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getCurrentUserDataScope: () => {
      const ownerId = mockCurrentUserId;
      return Promise.resolve({
        userId: ownerId,
        queryOwned: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...conditions: unknown[]
        ): unknown =>
          collection.query(scopedQ.where("user_id", ownerId), ...conditions),
        queryAccessibleCategories: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...conditions: unknown[]
        ): unknown => collection.query(
          scopedQ.or(scopedQ.where("user_id", ownerId),
            scopedQ.where("user_id", null)),
          ...conditions
        ),
        queryChildrenOfOwnedParents: (
          collection: { query: (...clauses: unknown[]) => unknown },
          parents: readonly { id: string; userId: string }[],
          foreignKey: string,
          ...conditions: unknown[]
        ): unknown => {
          if (parents.some((parent) => parent.userId !== ownerId)) {
            throw new Error("auth_scope_changed");
          }
          return collection.query(
            scopedQ.where(foreignKey, scopedQ.oneOf(parents.map((p) => p.id))),
            ...conditions
          );
        },
        assertOwned: <T extends { readonly userId: string }>(record: T): T => {
          if (record.userId !== ownerId) throw new Error("auth_scope_changed");
          return record;
        },
      });
    },
    queryOwned: (
      collection: { query: (...clauses: unknown[]) => unknown },
      ownerId: string,
      ...conditions: unknown[]
    ): unknown => collection.query(scopedQ.where("user_id", ownerId), ...conditions),
    queryChildrenOfOwnedParents: (
      collection: { query: (...clauses: unknown[]) => unknown },
      parents: readonly { id: string; userId: string }[],
      ownerId: string,
      foreignKey: string,
      ...conditions: unknown[]
    ): unknown => {
      if (parents.some((parent) => parent.userId !== ownerId)) {
        throw new Error("auth_scope_changed");
      }
      return collection.query(
        scopedQ.where(foreignKey, scopedQ.oneOf(parents.map((parent) => parent.id))),
        ...conditions
      );
    },
    assertExpectedCurrentUser: (expected: string): Promise<void> =>
      expected === mockCurrentUserId ? Promise.resolve() :
        Promise.reject(new Error("auth_scope_changed")),
  };
});

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentUserId),
}));
const { database, __adapter: adapter } =
  jest.requireMock<RealSqliteDatabaseModule>("@monyvi/db");
type Lease = Awaited<ReturnType<typeof acquireOwnedSmsReviewQueueNamespace>>;
const liveTokens = new Map<string, Lease>();

function track(lease: Lease): Lease {
  liveTokens.set(lease.leaseToken, lease);
  return lease;
}

async function acquire(expectedUserId: string = OWNER): Promise<Lease> {
  return track(await acquireOwnedSmsReviewQueueNamespace({ expectedUserId }));
}

async function release(
  lease: Lease,
  disposition: Parameters<typeof releaseOwnedSmsReviewQueueNamespace>[0]["disposition"],
): Promise<void> {
  await releaseOwnedSmsReviewQueueNamespace({ lease, disposition });
  if (disposition !== "published") liveTokens.delete(lease.leaseToken);
}

async function ownedQueues(owner: string = OWNER): Promise<SmsReviewQueue[]> {
  return database.get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", owner)).fetch();
}

async function draftItems(owner: string = OWNER): Promise<SmsReviewDraftItem[]> {
  return database.get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", owner)).fetch();
}

async function seedQueue(owner: string = OWNER): Promise<SmsReviewQueue> {
  return database.write(() => database.get<SmsReviewQueue>("sms_review_queues")
    .create((row): void => { row.userId = owner; row.updatedAt = new Date(); }));
}

function acceptedFinance(): ParsedSmsTransaction {
  return {
    source: "SMS", smsFingerprint: "synthetic-accepted-fingerprint",
    senderDisplayName: "QNB", rawSmsBody: "QNB debit 50 EGP at Shop",
    amount: 50, currency: "EGP", type: "EXPENSE",
    date: new Date("2026-10-14T12:00:00.000Z"),
    categoryId: "00000000-0000-4000-8000-000000000108",
    categoryDisplayName: "Shopping", confidence: 0.95,
    originLabel: "QNB", counterparty: "Shop",
  };
}

describe("#395 owned queue UUID lease — real SQLite concurrency and lifetime", () => {
  beforeAll(async () => {
    setGenerator(() => {
      const suffix = String(nextId++).padStart(12, "0");
      return "00000000-0000-4000-8000-" + suffix;
    });
    await adapter.initializingPromise;
  });

  beforeEach(async () => {
    mockCurrentUserId = OWNER;
    nextId = 1;
    mockParserRoute = "ai";
    mockEdge.mockReset();
    await database.write(async (): Promise<void> => {
      await database.unsafeResetDatabase();
    });
    await seedCapturedSmsReviewContext(database, OWNER);
  });

  afterEach(async () => {
    mockCurrentUserId = OWNER;
    for (const lease of [...liveTokens.values()]) {
      await release(lease, "cancelled");
    }
    expect(liveTokens.size).toBe(0);
  });

  it("serializes two same-owner acquires to one real queue UUID, not two models", async () => {
    const [a, b] = await Promise.all([acquire(), acquire()]);
    expect(a.queueId).toBe(b.queueId);
    expect(a.sessionId).toBe(a.queueId);
    expect(b.sessionId).toBe(b.queueId);
    expect(a.leaseToken).not.toBe(b.leaseToken);
    expect(canonicalUuid.safeParse(a.sessionId).success).toBe(true);
    expect(await ownedQueues()).toHaveLength(1);
    await release(a, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(b, "no_accepted_rows");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("reuses an existing owned nonempty queue instead of renaming edited row IDs", async () => {
    const accepted = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [acceptedFinance()],
    });
    expect(accepted.insertedCount).toBe(1);
    const existing = (await ownedQueues())[0];
    if (!existing) throw new Error("Failed to persist existing owned queue");
    const lease = await acquire();
    expect(lease.sessionId).toBe(existing.id);
    expect(lease.queueId).toBe(existing.id);
    await release(lease, "cancelled");
    expect((await ownedQueues()).map((row) => row.id)).toEqual([existing.id]);
  });

  it("does not physically prune a published empty queue on a UI snapshot read", async () => {
    const first = await acquire();
    await release(first, "published");
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect((await ownedQueues()).map((row) => row.id)).toEqual([first.queueId]);
    const second = await acquire();
    expect(second.sessionId).toBe(first.sessionId);
    await release(second, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(first, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("publication keeps just one owner/queue pin while operation tokens retire", async () => {
    const first = await acquire();
    const second = await acquire();
    await release(first, "published");
    await release(second, "published");
    const next = await acquire();
    expect(next.sessionId).toBe(first.queueId);
    await release(next, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(first, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(second, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("retires published operation tokens while retaining just one queue pin", async () => {
    const completed: Lease[] = [];
    for (let index = 0; index < 24; index += 1) {
      const lease = await acquire();
      completed.push(lease);
      await release(lease, "published");
      await expect(assertOwnedSmsReviewQueueNamespaceCurrent({ lease }))
        .rejects.toThrow();
      expect((await ownedQueues()).map((queue) => queue.id))
        .toEqual([completed[0]?.queueId]);
    }
    const stillActive = await acquire();
    expect(stillActive.sessionId).toBe(completed[0]?.queueId);
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: stillActive });
    await release(stillActive, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    for (const lease of completed) {
      await release(lease, "cancelled");
    }
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("existing queue merge commits under the published UUID and retires its pin", async () => {
    const lease = await acquire();
    await release(lease, "published");
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [acceptedFinance()],
    });
    expect(merged.insertedCount).toBe(1);
    expect(await draftItems()).toHaveLength(1);
    expect((await draftItems())[0]?.queueId).toBe(lease.sessionId);
    await release(lease, "committed");
    expect((await ownedQueues()).map((row) => row.id)).toEqual([lease.queueId]);
  });

  it("commit of a published queue cannot erase a concurrently pinned review", async () => {
    const first = await acquire();
    const second = await acquire();
    await release(first, "published");
    await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [acceptedFinance()],
    });
    await release(first, "committed");
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: second });
    expect(await ownedQueues()).toHaveLength(1);
    await release(second, "cancelled");
  });

  it("aborted work creates no phantom queue and uses no caller transport UUID", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(acquireOwnedSmsReviewQueueNamespace({
      expectedUserId: OWNER, signal: controller.signal,
    })).rejects.toThrow();
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("rejects logout/current-owner change without transferring a held queue", async () => {
    const lease = await acquire();
    mockCurrentUserId = FOREIGN;
    await expect(assertOwnedSmsReviewQueueNamespaceCurrent({
      lease,
    })).rejects.toThrow();
    await expect(acquireOwnedSmsReviewQueueNamespace({
      expectedUserId: OWNER,
    })).rejects.toThrow();
    expect((await ownedQueues(OWNER))[0]?.id).toBe(lease.sessionId);
    mockCurrentUserId = OWNER;
    await release(lease, "cancelled");
  });

  it("rejects a foreign or duplicate owned queue without mutating it", async () => {
    const foreign = await seedQueue(FOREIGN);
    const a = await seedQueue();
    const b = await seedQueue();
    await expect(acquireOwnedSmsReviewQueueNamespace({
      expectedUserId: OWNER,
    })).rejects.toThrow();
    expect((await ownedQueues()).map((row) => row.id)).toEqual([a.id, b.id]);
    expect((await ownedQueues(FOREIGN))[0]?.id).toBe(foreign.id);
  });

  it("replacement invalidates stale owner/queue/epoch even when owner stays same", async () => {
    const lease = await acquire();
    const current = (await ownedQueues())[0];
    if (!current) throw new Error("Missing allocated queue");
    await database.write(async (): Promise<void> => {
      await current.destroyPermanently();
    });
    const replacement = await seedQueue();
    expect(replacement.id).not.toBe(lease.queueId);
    await expect(assertOwnedSmsReviewQueueNamespaceCurrent({ lease }))
      .rejects.toThrow();
    await release(lease, "cancelled");
    expect((await ownedQueues()).map((row) => row.id)).toEqual([replacement.id]);
  });

  it("a cancelled published operation reaps only its own empty queue", async () => {
    const lease = await acquire();
    await release(lease, "published");
    await release(lease, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
    await expect(assertOwnedSmsReviewQueueNamespaceCurrent({ lease }))
      .rejects.toThrow();
  });

  it("a committed last-row discard invalidates the old namespace, not Undo IDs", async () => {
    const lease = await acquire();
    await release(lease, "published");
    await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [acceptedFinance()],
    });
    const rows = await draftItems();
    expect(rows).toHaveLength(1);
    await discardAllSmsReviewDrafts(OWNER, lease.queueId, [rows[0].id]);
    await expect(assertOwnedSmsReviewQueueNamespaceCurrent({ lease }))
      .rejects.toThrow();
    expect(await draftItems()).toHaveLength(0);
    await release(lease, "cancelled");
  });
});
