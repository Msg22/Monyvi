interface MockFunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}

interface MockFunctionOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

const mockInvoke = jest.fn<
  Promise<MockFunctionResponse>,
  [name: string, options: MockFunctionOptions]
>();
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();
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
let mockGeneratedId = 0;

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => `generated-id-${++mockGeneratedId}`,
}));

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (
        name: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => mockInvoke(name, options),
    },
  },
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(expectedUserId),
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
  type SmsAiRetryRequest,
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

const APPROVED_PRODUCTION_SMS_CHUNK_SIZE = 15;

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

function expectRetryRequest(
  retryRequest: SmsAiRetryRequest | undefined,
  expectedCandidates: readonly SmsCandidate[]
): void {
  expect(retryRequest).toBeDefined();
  if (retryRequest === undefined) {
    throw new Error("Expected retry request");
  }
  expect(typeof retryRequest.requestKey).toBe("string");
  expect(retryRequest.requestKey.length).toBeGreaterThan(0);
  expect(retryRequest.candidates).toEqual(expectedCandidates);
  expect(retryRequest.requestContext.scanKind).toBe("incremental");
}

describe("ai-sms-parser-service parser strategy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID;
  });

  it("rejects a stale expected user before invoking the Edge Function", async () => {
    mockAssertExpectedCurrentUser.mockRejectedValueOnce(
      new Error("AUTH_SCOPE_CHANGED")
    );

    await expect(
      parseSmsWithAi(
        [candidate("nbe_debit_purchase")],
        context,
        undefined,
        undefined,
        "user-a"
      )
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");

    expect(mockAssertExpectedCurrentUser).toHaveBeenCalledWith("user-a");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  afterEach(() => {
    process.env = originalEnv;
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

  it("ignores an extra foreign AI row when every input candidate resolved", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "nbe_debit_purchase",
            amount: 25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
          {
            messageId: "hallucinated-message-id",
            amount: 99,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Unknown",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.5,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.counterparty).toBe("Shop");
    expect(result.hasError).toBe(false);
    expect(result.unresolvedCandidates).toEqual([]);
  });

  it("ignores a malformed extra AI row when every input candidate resolved", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "nbe_debit_purchase",
            amount: 25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
          { amount: "not-a-number" },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.hasError).toBe(false);
    expect(result.unresolvedCandidates).toEqual([]);
  });

  it("keeps an SMS retryable when one of its correlated AI rows is malformed", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "nbe_debit_purchase",
            amount: 25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
          {
            messageId: "nbe_debit_purchase",
            amount: "not-a-number",
            currency: "EGP",
            type: "EXPENSE",
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.hasError).toBe(true);
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        reason: "response_invalid",
        isRetryable: true,
      }),
    ]);
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
      process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA = "true";
      process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER = "simulated";
      process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX = "fixture";
      process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = "cutoff-boundary-v1";
      process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID = "delay-cancel";

      const candidates: SmsCandidate[] = Array.from(
        { length: 3 },
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
      let reportFirstProgress: (() => void) | undefined;
      let releaseFirstProgress: (() => void) | undefined;
      const firstProgressReported = new Promise<void>((resolve) => {
        reportFirstProgress = resolve;
      });
      const firstProgressRelease = new Promise<void>((resolve) => {
        releaseFirstProgress = resolve;
      });
      const onProgress = jest.fn((): Promise<void> | undefined => {
        if (onProgress.mock.calls.length !== 1) return undefined;
        reportFirstProgress?.();
        return firstProgressRelease;
      });
      mockInvoke.mockResolvedValue({
        data: { transactions: [] },
        error: null,
      });

      const parsePromise = parseSmsWithAi(
        candidates,
        context,
        onProgress,
        abortController.signal
      );
      await firstProgressReported;

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke.mock.calls[0]?.[0]).toBe("sms-safeguard-qa");

      releaseFirstProgress?.();
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(1);

      abortController.abort();

      await expect(parsePromise).rejects.toMatchObject({
        name: "AbortError",
        message: "SMS parse aborted",
      });
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
    const candidates: SmsCandidate[] = Array.from(
      { length: APPROVED_PRODUCTION_SMS_CHUNK_SIZE + 1 },
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
    const failedCandidates = candidates.slice(
      APPROVED_PRODUCTION_SMS_CHUNK_SIZE
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

    const result = await parseSmsWithAi(candidates, context);

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.transactions).toHaveLength(1);
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate).toEqual(failedCandidates[0]);
    expect(unresolvedCandidates[0]?.reason).toBe("chunk_failed");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
    expectRetryRequest(
      unresolvedCandidates[0]?.retryRequest,
      failedCandidates
    );
    const loggedError = mockLoggerError.mock.calls.find(
      ([message]) => message === "[ai-sms-parser] parse-sms chunk failed"
    )?.[1] as { readonly context?: unknown } | undefined;
    expect(loggedError?.context).toBeUndefined();
  });

  it("preserves earlier chunk results when a later AI entry has an unsupported enum", async () => {
    const candidates: SmsCandidate[] = Array.from(
      { length: APPROVED_PRODUCTION_SMS_CHUNK_SIZE + 1 },
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
    const failedCandidate = candidates[APPROVED_PRODUCTION_SMS_CHUNK_SIZE];
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
              messageId: `sms-enum-${APPROVED_PRODUCTION_SMS_CHUNK_SIZE}`,
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

    const result = await parseSmsWithAi(candidates, context);

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.smsFingerprint).toBe("enum-fingerprint-0");
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate).toEqual(failedCandidate);
    expect(unresolvedCandidates[0]?.reason).toBe("response_invalid");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
    expectRetryRequest(
      unresolvedCandidates[0]?.retryRequest,
      [failedCandidate]
    );
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
      expect.objectContaining({
        candidate: candidates[10],
        reason: "response_invalid",
        isRetryable: true,
      }),
    ]);
  });

  it("preserves earlier chunks when a later Edge Function invocation throws", async () => {
    const candidates: SmsCandidate[] = Array.from(
      { length: APPROVED_PRODUCTION_SMS_CHUNK_SIZE + 1 },
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
    const failedCandidate = candidates[APPROVED_PRODUCTION_SMS_CHUNK_SIZE];
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

    const result = await parseSmsWithAi(candidates, context);

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: "thrown-fingerprint-0" }),
    ]);
    const unresolvedCandidates = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidates).toHaveLength(1);
    expect(unresolvedCandidates[0]?.candidate).toEqual(failedCandidate);
    expect(unresolvedCandidates[0]?.reason).toBe("unexpected_failure");
    expect(unresolvedCandidates[0]?.isRetryable).toBe(true);
    expectRetryRequest(
      unresolvedCandidates[0]?.retryRequest,
      [failedCandidate]
    );
  });

});
