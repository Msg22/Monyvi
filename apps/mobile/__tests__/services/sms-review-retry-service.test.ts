import type { ParsedSmsTransaction } from "@monyvi/logic";
import type {
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";
import type { HybridSmsUnresolvedCandidate } from "@/services/sms-parser-orchestrator";

const mockParseSmsWithOrchestrator = jest.fn();
jest.mock("@/services/sms-parser-orchestrator", () => ({
  parseSmsWithOrchestrator: (...args: readonly unknown[]): unknown =>
    mockParseSmsWithOrchestrator(...args),
}));

const mockRecordOversizedSmsOutcome = jest.fn();
jest.mock("@/services/sms-oversized-outcome-service", () => ({
  recordOversizedSmsOutcome: (...args: readonly unknown[]): unknown =>
    mockRecordOversizedSmsOutcome(...args),
}));

const mockAssertExpectedCurrentUser = jest.fn();
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (...args: readonly unknown[]): unknown =>
    mockAssertExpectedCurrentUser(...args),
}));

import { retrySmsReviewCandidates } from "@/services/sms-review-retry-service";

const context: ParseSmsContext = {
  categories: [],
  supportedCurrencies: ["EGP"],
};

const EXPECTED_USER_ID = "user-a";

function candidate(id: string): SmsCandidate {
  return {
    message: {
      id,
      address: "NBE",
      body: `message-${id}`,
      date: 1,
      read: false,
    },
    smsFingerprint: `fp-${id}`,
  };
}

function unresolved(
  id: string,
  isRetryable = true
): HybridSmsUnresolvedCandidate {
  return { candidate: candidate(id), reason: "ai_failed", isRetryable };
}

function transaction(id: string): ParsedSmsTransaction {
  return {
    amount: 10,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: id,
    date: new Date(1),
    categoryId: "other",
    categoryDisplayName: "Other",
    confidence: 0.5,
    originLabel: "NBE",
    source: "SMS",
    smsFingerprint: `fp-${id}`,
    senderDisplayName: "NBE",
    rawSmsBody: "raw",
  };
}

describe("sms review retry service", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("retries only retryable unresolved candidates and atomically merges by fingerprint", async () => {
    const existing = transaction("existing");
    const retried = transaction("retryable");
    const nonRetryable = unresolved("permanent", false);
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      transactions: [retried, retried],
      unresolvedCandidates: [],
    });

    const result = await retrySmsReviewCandidates({
      transactions: [existing],
      unresolvedCandidates: [unresolved("retryable"), nonRetryable],
      parseContext: context,
      expectedUserId: EXPECTED_USER_ID,
    });

    expect(mockParseSmsWithOrchestrator).toHaveBeenCalledWith(
      [candidate("retryable")],
      context,
      undefined,
      undefined,
      { expectedUserId: EXPECTED_USER_ID }
    );
    expect(result.transactions).toEqual([existing, retried]);
    expect(result.unresolvedCandidates).toEqual([nonRetryable]);
    expect(result.hasRetryError).toBe(false);
  });

  it("keeps at most one retry transaction for each SMS fingerprint", async () => {
    const purchase = transaction("retryable");
    const fee: ParsedSmsTransaction = {
      ...purchase,
      amount: 2,
      counterparty: "Transfer fee",
      categoryId: "fees",
      categoryDisplayName: "Fees",
    };
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      transactions: [purchase, fee],
      unresolvedCandidates: [],
    });

    const result = await retrySmsReviewCandidates({
      transactions: [],
      unresolvedCandidates: [unresolved("retryable")],
      parseContext: context,
      expectedUserId: EXPECTED_USER_ID,
    });

    expect(result.transactions).toEqual([purchase]);
  });

  it("reuses the original stable request identity for an uncertain provider retry", async () => {
    const retried = transaction("retryable");
    const originalCandidate = candidate("retryable");
    const retryRequest = {
      requestKey: "original-request-key",
      requestContext: {
        scanSessionId: "scan-session-id",
        scanKind: "incremental" as const,
        scanStartedAtMs: 123,
      },
      candidates: [originalCandidate],
    };
    const pending: HybridSmsUnresolvedCandidate = {
      candidate: originalCandidate,
      reason: "chunk_failed",
      isRetryable: true,
      retryRequest,
    };
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      transactions: [retried],
      unresolvedCandidates: [],
    });

    await retrySmsReviewCandidates({
      transactions: [],
      unresolvedCandidates: [pending],
      parseContext: context,
      expectedUserId: EXPECTED_USER_ID,
    });

    expect(mockParseSmsWithOrchestrator).toHaveBeenCalledWith(
      [originalCandidate],
      context,
      undefined,
      undefined,
      {
        requestContext: retryRequest.requestContext,
        requestKey: retryRequest.requestKey,
        expectedUserId: EXPECTED_USER_ID,
      }
    );
  });

  it("persists oversized outcomes returned by a review retry", async () => {
    const oversizedCandidate = candidate("oversized");
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      transactions: [],
      unresolvedCandidates: [],
      oversizedCandidates: [oversizedCandidate],
    });
    jest.spyOn(Date, "now").mockReturnValue(1_000);

    const result = await retrySmsReviewCandidates({
      transactions: [],
      unresolvedCandidates: [unresolved("oversized")],
      parseContext: context,
      expectedUserId: EXPECTED_USER_ID,
    });

    expect(mockRecordOversizedSmsOutcome).toHaveBeenCalledWith({
      userId: EXPECTED_USER_ID,
      smsFingerprint: "fp-oversized",
      originalReceivedAtMs: 1,
      nowMs: 1_000,
      lookbackDays: 30,
    });
    expect(result.unresolvedCandidates).toEqual([]);
  });

  it("leaves the session unchanged when retry is cancelled", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    mockParseSmsWithOrchestrator.mockRejectedValueOnce(abort);
    const existing = transaction("existing");
    const pending = unresolved("retryable");

    await expect(
      retrySmsReviewCandidates({
        transactions: [existing],
        unresolvedCandidates: [pending],
        parseContext: context,
        expectedUserId: EXPECTED_USER_ID,
      })
    ).rejects.toBe(abort);
  });

  it("preserves successful retry results when another candidate fails permanently", async () => {
    const existing = transaction("existing");
    const retried = transaction("retried");
    const pending = unresolved("retryable");
    const permanent = unresolved("retryable", false);
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      transactions: [retried],
      hasError: true,
      isRetryable: false,
      unresolvedCandidates: [permanent],
    });

    await expect(
      retrySmsReviewCandidates({
        transactions: [existing],
        unresolvedCandidates: [pending],
        parseContext: context,
        expectedUserId: EXPECTED_USER_ID,
      })
    ).resolves.toEqual({
      transactions: [existing, retried],
      unresolvedCandidates: [permanent],
      hasRetryError: false,
    });
  });

  it("surfaces retryable failures while preserving successful retry results", async () => {
    const existing = transaction("existing");
    const retried = transaction("retried");
    const stillRetryable = unresolved("retryable");
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      transactions: [retried],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: [stillRetryable],
    });

    await expect(
      retrySmsReviewCandidates({
        transactions: [existing],
        unresolvedCandidates: [unresolved("retryable")],
        parseContext: context,
        expectedUserId: EXPECTED_USER_ID,
      })
    ).resolves.toEqual({
      transactions: [existing, retried],
      unresolvedCandidates: [stillRetryable],
      hasRetryError: true,
    });
  });
});
