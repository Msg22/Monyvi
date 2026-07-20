import type { CategoryTreeSource } from "@monyvi/logic";
import {
  parseSmsWithAi,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";
import { getFixtureById } from "@/services/dev/sms-fixtures";

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
let mockGeneratedId = 0;
const originalEnv = process.env;

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => `safeguard-request-${++mockGeneratedId}`,
}));

jest.mock("@/config/e2e-test-config", () => ({
  shouldBlockUnsafeSmsParserConfiguration: () => false,
  shouldUseFixtureSmsParser: () => false,
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
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

function category(systemName: string, displayName: string): CategoryTreeSource {
  return {
    id: `cat-${systemName}`,
    systemName,
    displayName,
    level: 1,
    parentId: undefined,
    type: systemName === "salary" ? "INCOME" : "EXPENSE",
  };
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

describe("AI SMS client safeguards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeneratedId = 0;
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function enableSafeguardQa(profileId: string): void {
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA = "true";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER = "simulated";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX = "fixture";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = profileId;
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID = "unit-test-run";
  }

  it("sends stable scan identity and fingerprint metadata with every chunk", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { transactions: [] },
      error: null,
    });

    await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context,
      undefined,
      undefined,
      "user-a",
      { scanSessionId: "scan-session", scanKind: "history" }
    );

    const body = mockInvoke.mock.calls[0]?.[1].body as Record<string, unknown>;
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-sms");
    expect(typeof body.requestKey).toBe("string");
    expect(body.scanSessionId).toBe("scan-session");
    expect(body.scanKind).toBe("history");
    expect(body.messages).toEqual([
      expect.objectContaining({
        id: "nbe_debit_purchase",
        smsFingerprint: "fingerprint-nbe_debit_purchase",
      }),
    ]);
  });

  it("routes safeguard QA through the production client pipeline and local-only Edge transport", async () => {
    enableSafeguardQa("partial-quota-v1");
    const input = candidate("nbe_debit_purchase");
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: input.message.id,
            amount: 100,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Test merchant",
            date: "2026-07-20T10:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi([input], context);

    expect(result.transactions).toHaveLength(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      "sms-safeguard-qa",
      expect.objectContaining({
        headers: { "x-sms-safeguard-qa-run-id": "unit-test-run" },
        body: expect.objectContaining({
          qaProfileId: "partial-quota-v1",
          qaRunId: "unit-test-run",
        }) as Record<string, unknown>,
      })
    );
  });

  it("uses the selected QA policy request size without bypassing normal chunking", async () => {
    jest.useFakeTimers();
    try {
      enableSafeguardQa("partial-quota-v1");
      const inputs = [
        candidate("nbe_debit_purchase"),
        candidate("cib_credit_payment"),
        candidate("qnb_atm_withdrawal"),
      ];
      mockInvoke.mockResolvedValue({
        data: { transactions: [] },
        error: null,
      });

      const resultPromise = parseSmsWithAi(inputs, context);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(2_000);
      await resultPromise;

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      const chunkSizes = mockInvoke.mock.calls.map(([, options]) => {
        const body = options.body as {
          readonly messages: readonly unknown[];
        };
        return body.messages.length;
      });
      expect(chunkSizes).toEqual([2, 1]);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("returns only server-acknowledged durable negative and terminal outcomes", async () => {
    const candidates = [
      candidate("nbe_debit_purchase"),
      candidate("cib_credit_payment"),
    ];
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [],
        completionStatus: "complete",
        negativeFingerprints: [candidates[0].smsFingerprint],
        terminalFingerprints: [candidates[1].smsFingerprint],
        unresolvedFingerprints: [],
      },
      error: null,
    });

    const result = await parseSmsWithAi(candidates, context);

    expect(result.durableNegativeFingerprints).toEqual([
      candidates[0].smsFingerprint,
    ]);
    expect(result.terminalFingerprints).toEqual([candidates[1].smsFingerprint]);
    expect(result.unresolvedCandidates).toEqual([]);
  });

  it("preserves typed capacity guidance from an explicit server refusal", async () => {
    const blockedCandidate = candidate("nbe_debit_purchase");
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            reason: "rolling_limit",
            availableAt: "2026-07-21T10:00:00.000Z",
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        ),
      },
    });

    const result = await parseSmsWithAi([blockedCandidate], context);

    expect(result.availability).toEqual({
      reason: "rolling_limit",
      availableAt: "2026-07-21T10:00:00.000Z",
    });
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        candidate: blockedCandidate,
        reason: "capacity_limited",
        isRetryable: false,
      }),
    ]);
  });

  it("classifies an explicit single-candidate size refusal as oversized", async () => {
    const oversizedCandidate = candidate("nbe_debit_purchase");
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ reason: "input_token_limit", availableAt: null }),
          { status: 413, headers: { "content-type": "application/json" } }
        ),
      },
    });

    const result = await parseSmsWithAi([oversizedCandidate], context);

    expect(result.oversizedCandidates).toEqual([oversizedCandidate]);
    expect(result.unresolvedCandidates).toEqual([]);
    expect(result.isRetryable).toBe(false);
  });

  it("bisects only an explicit pre-provider size refusal", async () => {
    jest.useFakeTimers();
    try {
      const acceptedCandidate = candidate("nbe_debit_purchase");
      const oversizedCandidate = candidate("cib_credit_payment");
      const sizeRefusal: MockFunctionResponse = {
        data: null,
        error: {
          context: new Response(
            JSON.stringify({ reason: "input_token_limit", availableAt: null }),
            { status: 413, headers: { "content-type": "application/json" } }
          ),
        },
      };
      mockInvoke
        .mockResolvedValueOnce(sizeRefusal)
        .mockResolvedValueOnce({ data: { transactions: [] }, error: null })
        .mockResolvedValueOnce(sizeRefusal);

      const resultPromise = parseSmsWithAi(
        [acceptedCandidate, oversizedCandidate],
        context
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(2000);
      const result = await resultPromise;

      expect(mockInvoke).toHaveBeenCalledTimes(3);
      expect(result.oversizedCandidates).toEqual([oversizedCandidate]);
      expect(result.unresolvedCandidates).toEqual([]);
      expect(result.isRetryable).toBe(false);
      const requestKeys = mockInvoke.mock.calls.map(([, options]) => {
        const body = options.body as { readonly requestKey: string };
        return body.requestKey;
      });
      expect(new Set(requestKeys)).toHaveProperty("size", 3);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
