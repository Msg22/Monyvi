const mockInvoke = jest.fn();
const mockLoggerWarn = jest.fn<
  void,
  [message: string, context?: Readonly<Record<string, unknown>>]
>();
const mockLoggerInfo = jest.fn<
  void,
  [message: string, context?: Readonly<Record<string, unknown>>]
>();
const mockLoggerError = jest.fn<
  void,
  [
    message: string,
    error?: unknown,
    context?: Readonly<Record<string, unknown>>,
  ]
>();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: readonly unknown[]): unknown => mockInvoke(...args),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (
      message: string,
      error?: unknown,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerError(message, error, context),
    warn: (
      message: string,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerWarn(message, context),
    info: (
      message: string,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerInfo(message, context),
    debug: jest.fn(),
  },
}));

import { MAX_TRANSACTION_AMOUNT, type CategoryTreeSource } from "@monyvi/logic";
import {
  isAiConsentRequiredError,
  parseSmsWithAi,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";
import { getFixtureById } from "@/services/dev/sms-fixtures";

const originalEnv = process.env;

function category(
  systemName: string,
  displayName: string,
  id = `cat-${systemName}`
): CategoryTreeSource {
  const value: CategoryTreeSource = {
    id,
    systemName,
    displayName,
    level: 1,
    parentId: undefined,
    type: systemName === "salary" ? "INCOME" : "EXPENSE",
  };
  return value;
}

const context = {
  categories: [
    category("other", "Other"),
    category("shopping", "Shopping"),
    category("salary", "Salary"),
    category("bank_fees", "Bank Fees"),
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidate(fixtureId: string): SmsCandidate {
  const fixture = getFixtureById(fixtureId);
  if (!fixture) throw new Error(`Missing fixture ${fixtureId}`);

  return {
    message: {
      id: fixture.id,
      address: fixture.sender,
      body: fixture.body,
      date: fixture.timestamp ?? 1775658180000,
      read: false,
    },
    smsFingerprint: `fingerprint-${fixture.id}`,
  };
}

describe("ai-sms-parser-service parser strategy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses the Edge Function parser by default", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: 25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(mockInvoke).toHaveBeenCalledWith("parse-sms", expect.any(Object));
    expect(result.transactions[0]?.smsFingerprint).toBe("edge-fingerprint");
  });

  it("accepts currencies supported by the app beyond EGP and USD", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "nbe_debit_purchase",
            amount: 25,
            currency: "SAR",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi([candidate("nbe_debit_purchase")], {
      ...context,
      supportedCurrencies: ["EGP", "USD", "SAR"],
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({ currency: "SAR" }),
    ]);
    expect(result.hasError).toBe(false);
  });

  it("keeps malformed non-finite results unresolved", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: Number.POSITIVE_INFINITY,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate.smsFingerprint).toBe(
      "edge-fingerprint"
    );
    expect(unresolvedCandidates[0]?.reason).toBe("response_invalid");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
  });

  it("keeps malformed non-positive results unresolved", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: -25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
          {
            messageId: "sms-1",
            amount: 0,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate.smsFingerprint).toBe(
      "edge-fingerprint"
    );
    expect(unresolvedCandidates[0]?.reason).toBe("response_invalid");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
  });

  it("keeps over-limit AI results unresolved", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: MAX_TRANSACTION_AMOUNT + 1,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate.smsFingerprint).toBe(
      "edge-fingerprint"
    );
    expect(unresolvedCandidates[0]?.reason).toBe("response_invalid");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
  });

  it("keeps the current candidate unresolved for a malformed foreign message identity", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-from-another-chunk",
            amount: Number.NaN,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-current-chunk",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "current-chunk-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate.smsFingerprint).toBe(
      "current-chunk-fingerprint"
    );
    expect(unresolvedCandidates[0]?.reason).toBe("response_invalid");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
  });

  it("uses the fixture parser only when E2E fixture mode is explicit", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    const result = await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context
    );

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.transactions[0]?.counterparty).toBe("CARREFOUR CAIRO");
  });

  it("wraps fixture parser failures in the normal parse error result", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    const result = await parseSmsWithAi([candidate("nbe_debit_purchase")], {
      categories: [],
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: [
        expect.objectContaining({
          reason: "unexpected_failure",
          isRetryable: true,
        }),
      ],
    });
  });

  it("fails closed when fixture mode is requested outside E2E mode", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    mockInvoke.mockResolvedValueOnce({
      data: { transactions: [] },
      error: null,
    });

    await parseSmsWithAi([candidate("nbe_debit_purchase")], context);

    expect(mockInvoke).toHaveBeenCalled();
  });

  it("does not call the Edge Function when parsing is aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      parseSmsWithAi(
        [candidate("nbe_debit_purchase")],
        context,
        undefined,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("passes the abort signal into the Edge Function request", async () => {
    const abortController = new AbortController();
    mockInvoke.mockResolvedValueOnce({
      data: { transactions: [] },
      error: null,
    });

    await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context,
      undefined,
      abortController.signal
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "parse-sms",
      expect.objectContaining({ signal: abortController.signal })
    );
  });

  it("cancels an inter-chunk delay without waiting for its timer", async () => {
    jest.useFakeTimers();
    try {
      const candidates: SmsCandidate[] = Array.from(
        { length: 51 },
        (_, index) => ({
          message: {
            id: `sms-delay-${index}`,
            address: "NBE",
            body: `Purchase message ${index}`,
            date: 1775658180000 + index,
            read: false,
          },
          smsFingerprint: `delay-fingerprint-${index}`,
        })
      );
      const abortController = new AbortController();
      mockInvoke.mockResolvedValue({
        data: { transactions: [] },
        error: null,
      });
      const parsePromise = parseSmsWithAi(
        candidates,
        context,
        undefined,
        abortController.signal
      );
      for (
        let attempt = 0;
        attempt < 10 && jest.getTimerCount() === 0;
        attempt++
      ) {
        await Promise.resolve();
      }
      expect(jest.getTimerCount()).toBe(1);

      let outcome = "pending";
      void parsePromise.then(
        () => {
          outcome = "resolved";
        },
        (error: unknown) => {
          outcome = error instanceof Error ? error.name : "unknown";
        }
      );
      abortController.abort();
      await Promise.resolve();
      await Promise.resolve();

      expect(outcome).toBe("AbortError");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("returns a distinct consent-required error when the Edge Function requires AI consent", async () => {
    const error = Object.assign(new Error("FunctionsHttpError"), {
      context: new Response("AI processing consent required", { status: 403 }),
    });
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error,
    });

    try {
      await parseSmsWithAi([candidate("nbe_debit_purchase")], context);
      throw new Error("Expected consent-required error");
    } catch (error: unknown) {
      expect(isAiConsentRequiredError(error)).toBe(true);
    }
  });

  it("preserves successful chunks and correlates only failed chunk candidates", async () => {
    jest.useFakeTimers();
    const candidates: SmsCandidate[] = Array.from(
      { length: 60 },
      (_, index) => ({
        message: {
          id: `sms-${index}`,
          address: "NBE",
          body: `Purchase message ${index}`,
          date: 1775658180000 + index,
          read: false,
        },
        smsFingerprint: `fingerprint-${index}`,
      })
    );
    mockInvoke
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              messageId: "sms-0",
              amount: 25,
              currency: "EGP",
              type: "EXPENSE",
              counterparty: "Shop",
              date: "2026-04-08T12:00:00.000Z",
              categorySystemName: "shopping",
              confidenceScore: 0.9,
              isTrusted: true,
            },
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: Object.assign(new Error("FunctionsHttpError"), {
          context: new Response("temporary", { status: 500 }),
        }),
      });

    const parsePromise = parseSmsWithAi(candidates, context);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(2000);
    const result = await parsePromise;

    expect(result.transactions).toHaveLength(1);
    expect(result.unresolvedCandidates).toEqual(
      candidates.slice(50).map((failedCandidate) => ({
        candidate: failedCandidate,
        reason: "chunk_failed",
        isRetryable: true,
      }))
    );
    const loggedError = mockLoggerError.mock.calls.find(
      ([message]) => message === "[ai-sms-parser] parse-sms chunk failed"
    )?.[1] as { readonly context?: unknown } | undefined;
    expect(loggedError?.context).toBeUndefined();
    jest.useRealTimers();
  });

  it("preserves earlier chunk results when a later AI entry has an unsupported enum", async () => {
    jest.useFakeTimers();
    try {
      const candidates: SmsCandidate[] = Array.from(
        { length: 51 },
        (_, index) => ({
          message: {
            id: `sms-enum-${index}`,
            address: "NBE",
            body: `Purchase message ${index}`,
            date: 1775658180000 + index,
            read: false,
          },
          smsFingerprint: `enum-fingerprint-${index}`,
        })
      );
      mockInvoke
        .mockResolvedValueOnce({
          data: {
            transactions: [
              {
                messageId: "sms-enum-0",
                amount: 25,
                currency: "EGP",
                type: "EXPENSE",
                counterparty: "Shop",
                date: "2026-04-08T12:00:00.000Z",
                categorySystemName: "shopping",
                confidenceScore: 0.9,
                isTrusted: true,
              },
            ],
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            transactions: [
              {
                messageId: "sms-enum-50",
                amount: 40,
                currency: "BTC",
                type: "PURCHASE",
                counterparty: "Shop",
                date: "2026-04-08T12:00:00.000Z",
                categorySystemName: "shopping",
                confidenceScore: 0.9,
                isTrusted: true,
              },
            ],
          },
          error: null,
        });

      const parsePromise = parseSmsWithAi(candidates, context);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(2000);
      const result = await parsePromise;

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]?.smsFingerprint).toBe("enum-fingerprint-0");
      expect(result.unresolvedCandidates).toEqual([
        {
          candidate: candidates[50],
          reason: "response_invalid",
          isRetryable: true,
        },
      ]);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("preserves usable rows instead of retry-splitting a partially malformed chunk", async () => {
    const candidates: SmsCandidate[] = Array.from(
      { length: 11 },
      (_, index) => ({
        message: {
          id: `sms-partial-${index}`,
          address: "NBE",
          body: `Purchase message ${index}`,
          date: 1775658180000 + index,
          read: false,
        },
        smsFingerprint: `partial-fingerprint-${index}`,
      })
    );
    const validTransactions = candidates.slice(0, 10).map((value, index) => ({
      messageId: value.message.id,
      amount: 25 + index,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: `Shop ${index}`,
      date: "2026-04-08T12:00:00.000Z",
      categorySystemName: "shopping",
      confidenceScore: 0.9,
      isTrusted: true,
    }));
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          ...validTransactions,
          {
            messageId: "sms-partial-10",
            currency: "EGP",
            type: "EXPENSE",
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(candidates, context);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result.transactions).toHaveLength(10);
    expect(result.unresolvedCandidates).toEqual([
      {
        candidate: candidates[10],
        reason: "response_invalid",
        isRetryable: true,
      },
    ]);
  });

  it("preserves earlier chunks when a later Edge Function invocation throws", async () => {
    jest.useFakeTimers();
    try {
      const candidates: SmsCandidate[] = Array.from(
        { length: 51 },
        (_, index) => ({
          message: {
            id: `sms-thrown-${index}`,
            address: "NBE",
            body: `Purchase message ${index}`,
            date: 1775658180000 + index,
            read: false,
          },
          smsFingerprint: `thrown-fingerprint-${index}`,
        })
      );
      mockInvoke
        .mockResolvedValueOnce({
          data: {
            transactions: [
              {
                messageId: "sms-thrown-0",
                amount: 25,
                currency: "EGP",
                type: "EXPENSE",
                counterparty: "Shop",
                date: "2026-04-08T12:00:00.000Z",
                categorySystemName: "shopping",
                confidenceScore: 0.9,
                isTrusted: true,
              },
            ],
          },
          error: null,
        })
        .mockRejectedValueOnce(new Error("network failure"));

      const parsePromise = parseSmsWithAi(candidates, context);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(2000);
      const result = await parsePromise;

      expect(result.transactions).toEqual([
        expect.objectContaining({ smsFingerprint: "thrown-fingerprint-0" }),
      ]);
      expect(result.unresolvedCandidates).toEqual([
        {
          candidate: candidates[50],
          reason: "unexpected_failure",
          isRetryable: true,
        },
      ]);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("does not forward payload-bearing unexpected errors to the logger", async () => {
    const privateBody = "PRIVATE SMS BODY EGP 999";
    mockInvoke.mockRejectedValueOnce(new Error(privateBody));

    await parseSmsWithAi([candidate("nbe_debit_purchase")], context);

    const logged = JSON.stringify(mockLoggerError.mock.calls);
    expect(logged).not.toContain(privateBody);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "[ai-sms-parser] Unexpected error during parseSmsWithAi",
      expect.objectContaining({ message: "SMS AI parser unexpected failure" }),
      expect.objectContaining({ errorName: "Error", candidateCount: 1 })
    );
  });

  it("logs only safe reason codes for malformed and untrusted AI results", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        data: { privateResponseKey: "secret" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              messageId: "private-missing-message-id",
              amount: 25,
              currency: "EGP",
              type: "EXPENSE",
              counterparty: "Private Merchant",
              date: "2026-04-08T12:00:00.000Z",
              categorySystemName: "shopping",
              confidenceScore: 0.9,
              isTrusted: true,
            },
            {
              messageId: "sms-1",
              amount: 25,
              currency: "USD",
              type: "EXPENSE",
              counterparty: "Private Merchant",
              date: "2026-04-08T12:00:00.000Z",
              categorySystemName: "shopping",
              confidenceScore: 0.9,
              isTrusted: false,
            },
          ],
        },
        error: null,
      });

    await parseSmsWithAi([candidate("nbe_debit_purchase")], context);
    await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Private SMS body",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "private-fingerprint",
        },
      ],
      context
    );

    const logs = JSON.stringify([
      ...mockLoggerWarn.mock.calls,
      ...mockLoggerInfo.mock.calls,
    ]);
    expect(logs).toContain("transactions_array_missing");
    expect(logs).toContain("candidate_identity_unknown");
    expect(logs).toContain("ai_result_untrusted");
    expect(logs).not.toContain("privateResponseKey");
    expect(logs).not.toContain("private-missing-message-id");
    expect(logs).not.toContain("Private Merchant");
    expect(logs).not.toContain("USD");
  });
});
