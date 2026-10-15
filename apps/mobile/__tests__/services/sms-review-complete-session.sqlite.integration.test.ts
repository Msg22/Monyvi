/**
 * #395 owned SMS namespace T014-M/T028 boundary, TESTS-FIRST creation Red.
 * Real WatermelonDB + SQLite + actual draft repository. Only the current-user
 * auth boundary is mocked; never mock the queue service, repository or writer.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import { seedCapturedSmsReviewContext } from "./sms-review-real-sqlite-fixture";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import type { AccountReviewSession } from "../../../../packages/logic/src/account-review/review-schemas";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type { SmsReviewQueue, SmsReviewDraftItem } from "@monyvi/db";
import type { CategoryTreeSource } from "@monyvi/logic";
import { accountReviewSessionSchema } from "../../../../packages/logic/src/account-review/review-schemas";
import {
  makeSmsInput, makeTwoSmsInput, NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import type { SmsReviewChunk } from "@/services/ai-sms-parser-review";
import type { ParseSmsContext, SmsCandidate } from "@/services/ai-sms-parser-service";
import { parseSmsWithAi } from "@/services/ai-sms-parser-service";
import { parseSmsWithOrchestrator } from "@/services/sms-parser-orchestrator";
import { mergeSmsReviewDrafts, updateSmsReviewDraftItem, updateSmsReviewDraftSelection } from "@/services/sms-review-draft-repository";
import { getFixtureById } from "@/services/dev/sms-fixtures";
import { makeSmsV1Response } from
  "../../../../packages/logic/src/account-review/__tests__/fixtures";
import { createCompleteSmsAccountReviewSession } from
  "@/services/account-review-source-adapter-service";
import {
  acquireOwnedSmsReviewQueueNamespace,
  releaseOwnedSmsReviewQueueNamespace,
} from "@/services/sms-review-namespace-lease-service";

interface RealSqliteDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}


type EdgeReply = { readonly data: unknown; readonly error: Error | null };
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

function chunksFromOriginal(): readonly SmsReviewChunk[] {
  const original = makeSmsInput();
  return [{
    requestKey: original.requestKey,
    financialRows: original.financialRows,
    mappedTransactions: original.mappedTransactions,
    submittedMessages: original.submittedMessages,
    providerResponse: original.providerResponse,
  }];
}

function separateOriginalChunks(): readonly SmsReviewChunk[] {
  const original = makeTwoSmsInput();
  return original.financialRows.map((row, index) => {
    const mapped = original.mappedTransactions[index];
    const message = original.submittedMessages[index];
    if (!mapped || !message) throw new Error("Missing original SMS peer");
    const localAlias = "tx-1"; // same model alias in *different* chunks
    const suggestion = original.providerResponse.suggestedAccounts[0];
    if (!suggestion) throw new Error("Missing source suggestion");
    return {
      requestKey: "submitted-chunk-" + index,
      financialRows: [{ ...row, transactionRef: localAlias }],
      mappedTransactions: [mapped],
      submittedMessages: [message],
      providerResponse: {
        ...original.providerResponse,
        transactions: [{ ...row, transactionRef: localAlias }],
        suggestedAccounts: [{
          ...suggestion,
          transactionRefs: [localAlias],
        }],
      },
    };
  });
}

async function complete(
  acceptedReviewChunks: readonly SmsReviewChunk[],
  lease: Lease,
): Promise<Awaited<ReturnType<typeof createCompleteSmsAccountReviewSession>>> {
  return createCompleteSmsAccountReviewSession({
    reviewAccountSnapshots: makeSmsInput().reviewAccountSnapshots,
    acceptedReviewChunks,
    sourceRevision: "0",
    namespaceLease: lease,
  });
}

function admittedContext(): ParseSmsContext {
  return {
    categories: [{
      id: NORMALIZATION_IDS.shoppingCategory,
      systemName: "shopping",
      displayName: "Shopping", level: 1, type: "EXPENSE", isSystem: true,
    } satisfies CategoryTreeSource],
    supportedCurrencies: ["EGP", "USD"],
    reviewAccountSnapshots: makeSmsInput().reviewAccountSnapshots,
  };
}

function smsCandidate(id: string, fingerprint: string, body: string): SmsCandidate {
  return {
    message: {
      id, address: "QNB", body, read: false,
      date: Date.parse("2026-10-14T12:00:00.000Z"),
    },
    smsFingerprint: fingerprint,
  };
}

function originalCandidate(): SmsCandidate {
  const original = makeSmsInput().submittedMessages[0];
  if (!original) throw new Error("Missing original admitted message");
  return smsCandidate(original.id, original.smsFingerprint, original.body);
}

function smsRequestContext() {
  return {
    scanKind: "incremental" as const,
    scanSessionId: "opaque-scan-not-a-uuid",
    scanStartedAtMs: Date.parse("2026-10-14T12:00:00.000Z"),
  };
}

describe("#395 full initial SMS assembler — actual normalizer and SQLite lease", () => {
  it("matches the owned queue UUID and preserves accepted original finance", async () => {
    const lease = await acquire();
    const review = accountReviewSessionSchema.parse(await complete(chunksFromOriginal(), lease));
    expect(review.sessionId).toBe(lease.queueId);
    expect(review.source).toBe("SMS");
    expect(review.ownerId).toBe(OWNER);
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]?.amountDecimal).toBe("50");
    expect(review.rows[0]?.transaction.categoryId)
      .toBe(NORMALIZATION_IDS.shoppingCategory);
    const sourceRow = review.rows[0];
    if (!sourceRow || sourceRow.source !== "SMS") {
      throw new Error("Review must carry an original SMS row");
    }
    expect(sourceRow.transaction.smsFingerprint)
      .toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(review.saveIntent).toBeNull();
    expect(review.rows[0]?.selected).toBe(false);
    await release(lease, "published");
  });

  it("uses one namespace for independent chunks, even with repeated model aliases", async () => {
    const lease = await acquire();
    const chunks = separateOriginalChunks();
    const review = accountReviewSessionSchema.parse(await complete(chunks, lease));
    expect(review.sessionId).toBe(lease.sessionId);
    expect(review.rows).toHaveLength(2);
    expect(new Set(review.rows.map((row) => row.rowId)).size).toBe(2);
    expect(new Set(review.rows.map((row) => row.sourceFingerprint)).size).toBe(2);
    expect(review.rows.every((row) => row.selected === false)).toBe(true);
    expect(review.groups.every((group) => group.status === "pending")).toBe(true);
    await release(lease, "cancelled");
  });

  it("chunk arrival reorder does not change source row identity or edited UUID", async () => {
    const lease = await acquire();
    const chunks = separateOriginalChunks();
    const first = await complete(chunks, lease);
    const second = await complete([...chunks].reverse(), lease);
    const keyed = (review: AccountReviewSession): ReadonlyMap<string, string> =>
      new Map(review.rows.map((row) => [row.sourceFingerprint, row.rowId]));
    expect(keyed(first)).toEqual(keyed(second));
    expect(first.sessionId).toBe(lease.sessionId);
    expect(second.sessionId).toBe(lease.sessionId);
    await release(lease, "cancelled");
  });

  it("the same accepted fingerprint is represented once, not by arrival order", async () => {
    const lease = await acquire();
    const chunk = chunksFromOriginal()[0];
    if (!chunk) throw new Error("Missing source chunk");
    const review = await complete([chunk, chunk], lease);
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]?.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    await release(lease, "cancelled");
  });

  it("conflicting attempts for one fingerprint fail closed without overwriting edits", async () => {
    const lease = await acquire();
    const first = chunksFromOriginal()[0];
    if (!first) throw new Error("Missing source chunk");
    const financial = first.financialRows[0];
    const mapped = first.mappedTransactions[0];
    if (!financial || !mapped) throw new Error("Missing financial source");
    const conflict: SmsReviewChunk = {
      ...first, requestKey: "different-provider-retry",
      financialRows: [{ ...financial, amount: financial.amount + 7 }],
      mappedTransactions: [{ ...mapped, amount: mapped.amount + 7 }],
    };
    await expect(complete([first, conflict], lease)).rejects.toThrow();
    expect(await draftItems()).toHaveLength(0);
    await release(lease, "cancelled");
  });

  it("true opted-in legacy v1 original keeps unknown currency provenance", async () => {
    const lease = await acquire();
    const chunk = chunksFromOriginal()[0];
    if (!chunk) throw new Error("Missing source chunk");
    const review = await complete([{
      ...chunk, providerResponse: null,
    }], lease);
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]?.currency).toMatchObject({
      state: "unconfirmed", reason: "legacy_unknown",
    });
    expect(review.rows[0]?.transaction.categoryId)
      .toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(review.rows[0]?.toAssignment).toBeNull();
    await release(lease, "cancelled");
  });

  it("legacy/local source IDs never adopt model transport request aliases", async () => {
    const lease = await acquire();
    const chunk = chunksFromOriginal()[0];
    if (!chunk) throw new Error("Missing source chunk");
    const review = await complete([{
      ...chunk, requestKey: "provider-retry-key-not-session",
      providerResponse: null,
    }], lease);
    expect(review.sessionId).toBe(lease.sessionId);
    expect(review.sessionId).not.toBe("provider-retry-key-not-session");
    const sourceRow = review.rows[0];
    if (!sourceRow || sourceRow.source !== "SMS") {
      throw new Error("Review must carry an original SMS row");
    }
    expect(sourceRow.transaction.smsFingerprint)
      .toBe(NORMALIZATION_IDS.smsFingerprint);
    await release(lease, "cancelled");
  });

  it("the current owner is revalidated before final session publication", async () => {
    const lease = await acquire();
    mockCurrentUserId = FOREIGN;
    await expect(complete(chunksFromOriginal(), lease)).rejects.toThrow();
    mockCurrentUserId = OWNER;
    await release(lease, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });
});

describe("#395 original direct AI SMS parser — same provider and complete session", () => {
  it("preserves original strict-v1 financial fields and unknown review proof", async () => {
    const source = makeSmsInput();
    const row = source.financialRows[0];
    if (!row) throw new Error("Missing source financial row");
    mockEdge.mockResolvedValueOnce({
      data: {
        transactions: [{
          messageId: row.messageId, amount: row.amount, currency: "EGP",
          type: row.type, counterparty: row.counterparty, date: row.date,
          categorySystemName: row.categorySystemName, isAtmWithdrawal: false,
          confidenceScore: row.confidenceScore, isTrusted: true,
        }],
        completionStatus: "complete",
        negativeFingerprints: [], terminalFingerprints: [], unresolvedFingerprints: [],
      },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()], admittedContext(), undefined, undefined, OWNER,
      smsRequestContext(), "stable-original-request"
    );
    expect(mockEdge).toHaveBeenCalledTimes(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewChunks).toHaveLength(1);
    expect(result.reviewChunks?.[0]?.financialRows[0]?.date).toBe(row.date);
    expect(result.reviewChunks?.[0]?.providerResponse).toBeNull();
    expect(result.reviewSession?.rows[0]?.currency).toMatchObject({
      state: "unconfirmed", reason: "legacy_unknown",
    });
    expect(result.reviewSession?.sessionId).not.toBe(smsRequestContext().scanSessionId);
    expect(result.durableNegativeFingerprints ?? []).toEqual([]);
  });

  it("a canonical v2 null financial currency keeps review unconfirmed, not default", async () => {
    const source = makeSmsInput();
    const row = source.providerResponse.transactions[0];
    if (!row) throw new Error("Missing v2 SMS row");
    mockEdge.mockResolvedValueOnce({
      data: {
        ...source.providerResponse,
        suggestedAccounts: [],
        transactions: [{
          ...row, currency: null, suggestionRef: null,
          currencyEvidence: {
            state: "unknown", statedCode: null, candidateCodes: [], evidenceSpans: [],
          },
        }],
      },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()], admittedContext(), undefined, undefined, OWNER,
      smsRequestContext(), "stable-original-request"
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewChunks?.[0]?.financialRows[0]?.currency).toBeNull();
    expect(result.reviewSession?.rows[0]?.currency.state).toBe("unconfirmed");
    expect(result.reviewSession?.rows[0]?.assignment.state).toBe("unresolved");
    expect(result.transactions[0]?.currency).toBe("EGP"); // display only
    expect(mockEdge).toHaveBeenCalledTimes(1);
  });

  it("non-opted-in original strict v1 sends one call and no review namespace", async () => {
    const source = makeSmsV1Response();
    const row = source.transactions[0];
    if (!row) throw new Error("Missing strict-v1 row");
    mockEdge.mockResolvedValueOnce({
      data: { transactions: [{ ...row, isTrusted: true }] },
      error: null,
    });
    const ctx = admittedContext();
    const result = await parseSmsWithAi(
      [originalCandidate()],
      { categories: ctx.categories, supportedCurrencies: ctx.supportedCurrencies },
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewChunks).toBeUndefined();
    expect(result.reviewSession).toBeUndefined();
    expect(await ownedQueues()).toHaveLength(0);
    expect(mockEdge).toHaveBeenCalledTimes(1);
  });

  it("a zero-positive successful response allocates no provisional queue", async () => {
    mockEdge.mockResolvedValueOnce({
      data: { transactions: [], completionStatus: "complete",
        negativeFingerprints: [], terminalFingerprints: [],
        unresolvedFingerprints: [] },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()], admittedContext(), undefined, undefined, OWNER,
      smsRequestContext()
    );
    expect(result.reviewSession).toBeUndefined();
    expect(result.reviewChunks ?? []).toHaveLength(0);
    expect(await ownedQueues()).toHaveLength(0);
    expect(mockEdge).toHaveBeenCalledTimes(1);
  });

  it("a real rolling-limit HTTP refusal stays nonretryable without a phantom queue", async () => {
    const candidate = originalCandidate();
    const availableAt = "2026-10-16T00:00:00.000Z";
    const refusal = Object.assign(new Error("FunctionsHttpError"), {
      context: new Response(
        JSON.stringify({ reason: "rolling_limit", availableAt }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      ),
    });
    mockEdge.mockResolvedValueOnce({ data: null, error: refusal });
    const result = await parseSmsWithAi(
      [candidate], admittedContext(), undefined, undefined, OWNER,
      smsRequestContext(), "refused-original-request"
    );
    expect(mockEdge).toHaveBeenCalledTimes(1);
    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(false);
    expect(result.availability).toEqual({ reason: "rolling_limit", availableAt });
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        candidate: expect.objectContaining({
          smsFingerprint: candidate.smsFingerprint,
        }),
        reason: "capacity_limited",
        isRetryable: false,
      }),
    ]);
    expect(result.durableNegativeFingerprints ?? []).toEqual([]);
    expect(result.terminalFingerprints ?? []).toEqual([]);
    expect(result.reviewChunks ?? []).toEqual([]);
    expect(result.reviewSession).toBeUndefined();
    expect(await ownedQueues()).toHaveLength(0);
  });
});


function catalogCandidate(fixtureId: string): SmsCandidate {
  const source = getFixtureById(fixtureId);
  if (!source || source.timestamp === undefined) {
    throw new Error("Missing timestamped trusted SMS fixture " + fixtureId);
  }
  return {
    message: {
      id: source.id, address: source.sender, body: source.body,
      date: source.timestamp, read: false,
    },
    smsFingerprint: "fingerprint-" + source.id,
  };
}

async function seedEditedTrustedSmsDraft(
  candidate: SmsCandidate
): Promise<{ readonly queueId: string; readonly draftId: string; readonly payloadJson: string }> {
  const source = makeSmsInput().mappedTransactions[0];
  if (!source) throw new Error("Missing original SMS financial fixture");
  const transaction: ParsedSmsTransaction = {
    ...source,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    rawSmsBody: candidate.message.body,
  };
  const merged = await mergeSmsReviewDrafts({
    expectedUserId: OWNER, transactions: [transaction],
  });
  expect(merged.insertedCount).toBe(1);
  const draft = (await draftItems())[0];
  const queue = (await ownedQueues())[0];
  if (!draft || !queue) throw new Error("Missing persisted SMS review");
  await updateSmsReviewDraftItem(draft.id, OWNER, {
    ...transaction, amount: 73, counterparty: "User edited merchant",
  });
  await updateSmsReviewDraftSelection(draft.id, OWNER, true);
  const edited = (await draftItems())[0];
  if (!edited) throw new Error("Edited draft disappeared");
  return { queueId: queue.id, draftId: edited.id, payloadJson: edited.payloadJson };
}

function stubAcceptedHybridAiRow(candidate: SmsCandidate): void {
  mockEdge.mockImplementation((name: string): Promise<EdgeReply> => Promise.resolve({
    data: name === "parse-sms" ? {
      transactions: [{
        messageId: candidate.message.id, amount: 55.55, currency: "EGP",
        type: "EXPENSE", counterparty: "AI Shop", date: "2026-10-14",
        categorySystemName: "shopping", confidenceScore: 0.95, isTrusted: true,
      }],
      completionStatus: "complete",
      negativeFingerprints: [], terminalFingerprints: [],
      unresolvedFingerprints: [],
    } : { outcomes: [], completionStatus: "complete" },
    error: null,
  }));
}

describe("#395 outer orchestrator — real hybrid/local parser and final namespace", () => {
  it("hybrid publishes one final deduped session for trusted plus admitted AI SMS", async () => {
    mockParserRoute = "hybrid";
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const ai = catalogCandidate("hybrid_ai_purchase");
    mockEdge.mockImplementation((name: string): Promise<EdgeReply> => {
      const data = name === "parse-sms" ? {
        transactions: [{
          messageId: ai.message.id, amount: 55.55,
          currency: "EGP", type: "EXPENSE",
          counterparty: "AI Shop", date: "2026-10-14",
          categorySystemName: "shopping", confidenceScore: 0.95, isTrusted: true,
        }],
        completionStatus: "complete",
        negativeFingerprints: [], terminalFingerprints: [], unresolvedFingerprints: [],
      } : { outcomes: [], completionStatus: "complete" };
      return Promise.resolve({ data, error: null });
    });
    const emitted: number[] = [];
    const result = await parseSmsWithOrchestrator(
      [trusted, ai], admittedContext(),
      (progress) => { emitted.push(progress.completedTransactions.length); },
      undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    expect(result.transactions.map((row) => row.smsFingerprint))
      .toEqual(expect.arrayContaining([trusted.smsFingerprint, ai.smsFingerprint]));
    expect(new Set(result.transactions.map((row) => row.smsFingerprint)).size)
      .toBe(result.transactions.length);
    expect(result.reviewSession?.sessionId).toBe((await ownedQueues())[0]?.id);
    expect(result.reviewSession?.rows).toHaveLength(result.transactions.length);
    expect(result.reviewSession?.rows.every((row) => !row.selected)).toBe(true);
    expect(emitted.length).toBeGreaterThan(0);
    expect(mockEdge.mock.calls.filter(([name]) => name === "parse-sms"))
      .toHaveLength(1);
  });

  it("local-only original financial results create a session without any AI call", async () => {
    mockParserRoute = "local";
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const result = await parseSmsWithOrchestrator(
      [trusted], admittedContext(), undefined, undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    expect(mockEdge).not.toHaveBeenCalled();
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewSession?.rows).toHaveLength(1);
    expect(result.reviewSession?.sessionId).toBe((await ownedQueues())[0]?.id);
    expect(result.reviewSession?.rows[0]?.sourceFingerprint)
      .toBe(trusted.smsFingerprint);
    expect(result.reviewSession?.rows[0]?.toAssignment).toBeNull();
  });

  it("preserves a selected edited SQLite draft without AI-only interim publication", async () => {
    mockParserRoute = "hybrid";
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const ai = catalogCandidate("hybrid_ai_purchase");
    const edited = await seedEditedTrustedSmsDraft(trusted);
    stubAcceptedHybridAiRow(ai);
    const interimSessionFlags: boolean[] = [];
    const result = await parseSmsWithOrchestrator(
      [trusted, ai], admittedContext(),
      (progress) => {
        interimSessionFlags.push(
          Object.prototype.hasOwnProperty.call(progress, "reviewSession")
        );
      },
      undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    const saved = await draftItems();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(edited.draftId);
    expect(saved[0]?.payloadJson).toBe(edited.payloadJson);
    expect(saved[0]?.selectionOverride).toBe(true);
    expect((await ownedQueues()).map((queue) => queue.id))
      .toEqual([edited.queueId]);
    expect(result.reviewSession?.sessionId).toBe(edited.queueId);
    expect(interimSessionFlags.length).toBeGreaterThan(0);
    expect(interimSessionFlags).not.toContain(true);
    expect(mockEdge.mock.calls.filter(([name]) => name === "parse-sms"))
      .toHaveLength(1);
  });

  it("hybrid prior trusted result cannot be overwritten by a duplicate AI fingerprint", async () => {
    mockParserRoute = "hybrid";
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const unrelated = catalogCandidate("hybrid_ai_purchase");
    const collision: SmsCandidate = {
      ...unrelated, smsFingerprint: trusted.smsFingerprint,
    };
    mockEdge.mockResolvedValue({
      data: {
        transactions: [{
          messageId: collision.message.id, amount: 999,
          currency: "EGP", type: "EXPENSE", counterparty: "Fabricated",
          categorySystemName: "shopping", date: "2026-10-14",
          confidenceScore: 0.9, isTrusted: true,
        }],
        completionStatus: "complete", negativeFingerprints: [],
        terminalFingerprints: [], unresolvedFingerprints: [],
      },
      error: null,
    });
    const result = await parseSmsWithOrchestrator(
      [trusted, collision], admittedContext(), undefined, undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    expect(new Set(result.transactions.map((row) => row.smsFingerprint)).size)
      .toBe(result.transactions.length);
    expect(result.transactions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 999 })])
    );
    expect(result.reviewSession?.rows.length).toBe(result.transactions.length);
  });
});
