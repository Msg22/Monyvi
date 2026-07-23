import type { CategoryTreeSource } from "@monyvi/logic";
import {
  initializeSmsAiScanSession,
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
const mockRefreshSession = jest.fn();
const mockSignOut = jest.fn();
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
  clearPersistedAuthSession: jest.fn(),
  supabase: {
    auth: {
      refreshSession: (...args: readonly unknown[]): unknown =>
        mockRefreshSession(...args),
      signOut: (...args: readonly unknown[]): unknown => mockSignOut(...args),
    },
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
    mockSignOut.mockResolvedValue({ error: null });
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
      {
        scanSessionId: "scan-session",
        scanKind: "history",
        scanStartedAtMs: Date.parse("2026-07-20T12:00:00.000Z"),
      }
    );

    const body = mockInvoke.mock.calls[0]?.[1].body as Record<string, unknown>;
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-sms");
    expect(typeof body.requestKey).toBe("string");
    expect(body.scanSessionId).toBe("scan-session");
    expect(body.scanKind).toBe("history");
    expect(body.scanStartedAt).toBe("2026-07-20T12:00:00.000Z");
    expect(body.messages).toEqual([
      expect.objectContaining({
        id: "nbe_debit_purchase",
        smsFingerprint: "fingerprint-nbe_debit_purchase",
      }),
    ]);
  });

  it("initializes the scan session before any candidate work", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [],
        completionStatus: "complete",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      },
      error: null,
    });

    await initializeSmsAiScanSession(
      context,
      {
        scanSessionId: "scan-session",
        scanKind: "incremental",
        scanStartedAtMs: Date.parse("2026-07-20T12:00:00.000Z"),
      },
      undefined,
      "user-a"
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "parse-sms",
      expect.objectContaining({
        body: expect.objectContaining({
          scanSessionId: "scan-session",
          messages: [],
        }) as Record<string, unknown>,
      })
    );
  });

  it("revalidates user scope before retrying an authenticated 401", async () => {
    enableSafeguardQa("negative-three-strikes-v1");
    mockInvoke
      .mockResolvedValueOnce({
        data: null,
        error: Object.assign(new Error("unauthenticated"), {
          context: new Response(null, { status: 401 }),
        }),
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [],
          completionStatus: "complete",
          negativeFingerprints: [],
          terminalFingerprints: [],
          unresolvedFingerprints: [],
        },
        error: null,
      });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-token" } },
      error: null,
    });

    await initializeSmsAiScanSession(
      context,
      {
        scanSessionId: "scan-session",
        scanKind: "history",
        scanStartedAtMs: Date.parse("2026-07-20T12:00:00.000Z"),
      },
      undefined,
      "user-a"
    );

    expect(mockAssertExpectedCurrentUser).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      "sms-safeguard-qa",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer refreshed-token",
          "x-sms-safeguard-qa-run-id": "unit-test-run",
        },
      })
    );
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
      const scanStartedAtValues = mockInvoke.mock.calls.map(
        ([, options]) => (options.body as Record<string, unknown>).scanStartedAt
      );
      expect(new Set(scanStartedAtValues).size).toBe(1);
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
            availableAt: "2026-07-21T12:00:00.000000+02:00",
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        ),
      },
    });

    const result = await parseSmsWithAi([blockedCandidate], context);

    expect(result.availability).toEqual({
      reason: "rolling_limit",
      availableAt: "2026-07-21T12:00:00.000000+02:00",
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
          JSON.stringify({
            reason: "input_token_limit",
            availableAt: null,
            sizeScope: "candidate",
          }),
          { status: 413, headers: { "content-type": "application/json" } }
        ),
      },
    });

    const result = await parseSmsWithAi([oversizedCandidate], context);

    expect(result.oversizedCandidates).toEqual([oversizedCandidate]);
    expect(result.unresolvedCandidates).toEqual([]);
    expect(result.isRetryable).toBe(false);
  });

  it("keeps shared request-size failures unresolved instead of marking the SMS oversized", async () => {
    const candidateWithValidSize = candidate("nbe_debit_purchase");
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            reason: "input_token_limit",
            availableAt: null,
            sizeScope: "shared_request",
          }),
          { status: 413, headers: { "content-type": "application/json" } }
        ),
      },
    });

    const result = await parseSmsWithAi([candidateWithValidSize], context);

    expect(result.oversizedCandidates).toEqual([]);
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        candidate: candidateWithValidSize,
        isRetryable: false,
      }),
    ]);
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
            JSON.stringify({
              reason: "input_token_limit",
              availableAt: null,
              sizeScope: "batch",
            }),
            { status: 413, headers: { "content-type": "application/json" } }
          ),
        },
      };
      mockInvoke
        .mockResolvedValueOnce(sizeRefusal)
        .mockResolvedValueOnce({ data: { transactions: [] }, error: null })
        .mockResolvedValueOnce({
          data: null,
          error: {
            context: new Response(
              JSON.stringify({
                reason: "input_token_limit",
                availableAt: null,
                sizeScope: "candidate",
              }),
              {
                status: 413,
                headers: { "content-type": "application/json" },
              }
            ),
          },
        });

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

  it("creates a fresh filtered retry request when a terminal outcome wins before provider start", async () => {
    const terminalCandidate = candidate("nbe_debit_purchase");
    const retryableCandidate = candidate("cib_credit_payment");
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [],
        completionStatus: "truncated",
        negativeFingerprints: [],
        terminalFingerprints: [terminalCandidate.smsFingerprint],
        unresolvedFingerprints: [retryableCandidate.smsFingerprint],
        retryRequestMode: "fresh",
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [terminalCandidate, retryableCandidate],
      context,
      undefined,
      undefined,
      "user-a",
      {
        scanSessionId: "scan-session",
        scanKind: "incremental",
        scanStartedAtMs: 123,
      },
      "original-request-key"
    );

    expect(result.unresolvedCandidates).toHaveLength(1);
    const [unresolvedCandidate] = result.unresolvedCandidates ?? [];
    expect(unresolvedCandidate?.candidate).toBe(retryableCandidate);
    expect(unresolvedCandidate?.retryRequest?.candidates).toEqual([
      retryableCandidate,
    ]);
    expect(unresolvedCandidate?.retryRequest?.requestKey).not.toBe(
      "original-request-key"
    );
  });
});
