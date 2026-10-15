/**
 * #395 owned SMS namespace T014-M/T028 boundary, TESTS-FIRST creation Red.
 * Real WatermelonDB + SQLite + actual draft repository. Only the current-user
 * auth boundary is mocked; never mock the queue service, repository or writer.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
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
  };
});

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): Promise<{
    readonly userId: string;
    readonly queryOwned: (collection: {
      query: (...clauses: readonly unknown[]) => unknown;
    }, ...conditions: readonly unknown[]) => unknown;
  }> => Promise.resolve({
    userId: mockCurrentUserId,
    queryOwned: (collection, ...conditions) =>
      collection.query(Q.where("user_id", mockCurrentUserId), ...conditions),
  }),
  assertExpectedCurrentUser: (expected: string): Promise<void> =>
    expected === mockCurrentUserId ? Promise.resolve() :
      Promise.reject(new Error("auth_scope_changed")),
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
    expect(review.rows[0]?.transaction.smsFingerprint)
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
    const keyed = (review: typeof first) =>
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
    expect(review.rows[0]?.transaction.smsFingerprint)
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

  it("a zero-positive response or refusal allocates no provisional queue", async () => {
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
