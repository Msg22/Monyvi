import {
  mockEdge,
  OWNER,
  ownedQueues,
  database,
  installSmsReviewSqliteHooks,
} from "./sms-review-namespace-test-harness";
import { makeSmsInput } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import { makeSmsV1Response } from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import { parseSmsWithAi } from "@/services/ai-sms-parser-service";
import {
  originalCandidate,
  admittedContext,
  smsRequestContext,
} from "./sms-review-complete-session-fixtures";

import {
  getSmsReviewDraftQueueSnapshot,
  mergeSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";

installSmsReviewSqliteHooks();

function rollingLimitRefusal(availableAt: string): Error {
  const refusal = new Error("FunctionsHttpError");
  Object.defineProperty(refusal, "context", {
    value: new Response(
      JSON.stringify({ reason: "rolling_limit", availableAt }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    ),
  });
  return refusal;
}

describe("#395 original direct AI SMS parser — same provider and complete session", () => {
  it("preserves original strict-v1 financial fields and unknown review proof", async () => {
    const source = makeSmsInput();
    const row = source.financialRows[0];
    if (!row) throw new Error("Missing source financial row");
    mockEdge.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: row.messageId,
            amount: row.amount,
            currency: "EGP",
            type: row.type,
            counterparty: row.counterparty,
            date: row.date,
            categorySystemName: row.categorySystemName,
            isAtmWithdrawal: false,
            confidenceScore: row.confidenceScore,
            isTrusted: true,
          },
        ],
        completionStatus: "complete",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()],
      admittedContext(),
      undefined,
      undefined,
      OWNER,
      smsRequestContext(),
      "stable-original-request"
    );
    expect(mockEdge).toHaveBeenCalledTimes(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewChunks).toHaveLength(1);
    expect(result.reviewChunks?.[0]?.financialRows[0]?.date).toBe(row.date);
    expect(result.reviewChunks?.[0]?.providerResponse).toBeNull();
    expect(result.reviewSession?.rows[0]?.currency).toMatchObject({
      state: "unconfirmed",
      reason: "legacy_unknown",
    });
    expect(result.reviewSession?.sessionId).not.toBe(
      smsRequestContext().scanSessionId
    );
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
        transactions: [
          {
            ...row,
            currency: null,
            suggestionRef: null,
            currencyEvidence: {
              state: "unknown",
              statedCode: null,
              candidateCodes: [],
              evidenceSpans: [],
            },
          },
        ],
      },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()],
      admittedContext(),
      undefined,
      undefined,
      OWNER,
      smsRequestContext(),
      "stable-original-request"
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
    const result = await parseSmsWithAi([originalCandidate()], {
      categories: ctx.categories,
      supportedCurrencies: ctx.supportedCurrencies,
    });
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewChunks).toBeUndefined();
    expect(result.reviewSession).toBeUndefined();
    expect(await ownedQueues()).toHaveLength(0);
    expect(mockEdge).toHaveBeenCalledTimes(1);
  });

  it("a zero-positive successful response allocates no provisional queue", async () => {
    mockEdge.mockResolvedValueOnce({
      data: {
        transactions: [],
        completionStatus: "complete",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()],
      admittedContext(),
      undefined,
      undefined,
      OWNER,
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
    const refusal: unknown = rollingLimitRefusal(availableAt);
    if (!(refusal instanceof Error)) {
      throw new Error("Expected the real HTTP-refusal Error fixture");
    }
    mockEdge.mockResolvedValueOnce({ data: null, error: refusal });
    const result = await parseSmsWithAi(
      [candidate],
      admittedContext(),
      undefined,
      undefined,
      OWNER,
      smsRequestContext(),
      "refused-original-request"
    );
    expect(mockEdge).toHaveBeenCalledTimes(1);
    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(false);
    expect(result.availability).toEqual({
      reason: "rolling_limit",
      availableAt,
    });
    expect(result.unresolvedCandidates).toHaveLength(1);
    expect(result.unresolvedCandidates?.[0]).toMatchObject({
      candidate: { smsFingerprint: candidate.smsFingerprint },
      reason: "capacity_limited",
      isRetryable: false,
    });
    expect(result.durableNegativeFingerprints ?? []).toEqual([]);
    expect(result.terminalFingerprints ?? []).toEqual([]);
    expect(result.reviewChunks ?? []).toEqual([]);
    expect(result.reviewSession).toBeUndefined();
    expect(await ownedQueues()).toHaveLength(0);
  });
});

describe("#395 direct parser — cancellation after return", () => {
  it("keeps the returned namespace pinned until cancellation and rejects zombie merge", async () => {
    const controller = new AbortController();
    const original = makeSmsV1Response();
    mockEdge.mockResolvedValueOnce({
      data: {
        ...original,
        transactions: original.transactions.map((row) => ({
          ...row,
          isTrusted: true,
        })),
      },
      error: null,
    });
    const result = await parseSmsWithAi(
      [originalCandidate()],
      admittedContext(),
      undefined,
      controller.signal,
      OWNER,
      smsRequestContext()
    );
    expect(result.reviewSession?.rows).toHaveLength(1);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect(await ownedQueues()).toHaveLength(1);
    controller.abort();
    await database.write(async (): Promise<void> => {});
    expect(await ownedQueues()).toHaveLength(0);
    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: OWNER,
        transactions: result.transactions,
      })
    ).rejects.toThrow();
    expect(await ownedQueues()).toHaveLength(0);
    expect(mockEdge).toHaveBeenCalledTimes(1);
  });
});
