import type {
  AiParseResult,
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";

const mockParseSmsWithAi = jest.fn<Promise<AiParseResult>, unknown[]>();
const mockEnrichTrustedSmsCategories = jest.fn();
const mockGetAiProcessingConsentStatus = jest.fn();

jest.mock("@/services/ai-sms-parser-service", () => ({
  parseSmsWithAi: (...args: unknown[]) => mockParseSmsWithAi(...args),
  createAiConsentRequiredError: (): Error => {
    const error = new Error("AI processing consent required");
    error.name = "AiConsentRequiredError";
    return error;
  },
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): unknown =>
    mockGetAiProcessingConsentStatus(),
  revokeAiProcessingConsent: jest.fn(),
}));

jest.mock("@/services/ai-sms-category-enrichment-service", () => ({
  MIN_ACCEPTED_CATEGORY_CONFIDENCE: 0.5,
  MIN_AUTO_SELECT_CATEGORY_CONFIDENCE: 0.8,
  TRUSTED_ENRICHED_PURCHASE_CONFIDENCE: 0.98,
  enrichTrustedSmsCategories: (...args: readonly unknown[]): unknown =>
    mockEnrichTrustedSmsCategories(...args),
}));

import { parseSmsWithOrchestrator } from "@/services/sms-parser-orchestrator";
import { getTransactionReviewMeta } from "@/services/transaction-review-selection";

const RECEIVED_AT_MS = new Date(2026, 3, 8, 14, 30).getTime();
const context: ParseSmsContext = {
  categories: [
    {
      id: "cat-other",
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
    {
      id: "cat-shopping",
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidate(overrides: Partial<SmsCandidate> = {}): SmsCandidate {
  return {
    message: {
      id: "sms-1",
      address: "NBE",
      body: "Purchase EGP 250 at CARREFOUR",
      date: RECEIVED_AT_MS,
      read: false,
    },
    smsFingerprint: "fingerprint-1",
    ...overrides,
  };
}

function trustedPurchaseCandidate(): SmsCandidate {
  return candidate({
    message: {
      id: "sms-trusted",
      address: "QNB EGYPT",
      body: "Your Debit Card **2132 had a Successful transaction of EGP 490.00 @GEIDEAE*BASHAYER LIBAYE,your available bal.EGP10853.15 for lost/stolen card call 19700",
      date: RECEIVED_AT_MS,
      read: false,
    },
    smsFingerprint: "fingerprint-trusted",
  });
}

describe("SMS parser orchestrator safeguards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...process.env, NODE_ENV: "test" };
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID;
    mockGetAiProcessingConsentStatus.mockResolvedValue({
      isConsented: true,
      userId: "user-1",
    });
    mockEnrichTrustedSmsCategories.mockResolvedValue({
      outcomesByCandidateId: new Map(),
      attemptedMerchantCount: 0,
      acceptedCandidateCount: 0,
      rejectedResultCount: 0,
      hasError: false,
    });
  });

  it("publishes trusted local matches before remote parsing settles", async () => {
    let resolveCategory: ((value: unknown) => void) | undefined;
    let resolveAi: ((value: AiParseResult) => void) | undefined;
    mockEnrichTrustedSmsCategories.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCategory = resolve;
        })
    );
    mockParseSmsWithAi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAi = resolve;
        })
    );
    const onProgress = jest.fn();

    const parsePromise = parseSmsWithOrchestrator(
      [trustedPurchaseCandidate(), candidate()],
      context,
      onProgress
    );
    for (let index = 0; index < 8; index += 1) await Promise.resolve();

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        chunksCompleted: 0,
        completedTransactions: [
          expect.objectContaining({ smsFingerprint: "fingerprint-trusted" }),
        ],
        transactionsSoFar: 1,
      })
    );

    resolveCategory?.({
      outcomesByCandidateId: new Map(),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 0,
      rejectedResultCount: 0,
      missingResultCount: 1,
      hasError: false,
    });
    resolveAi?.({ transactions: [], hasError: false });
    await parsePromise;
  });

  it("applies a reviewable category below the auto-selection confidence threshold", async () => {
    mockEnrichTrustedSmsCategories.mockResolvedValueOnce({
      outcomesByCandidateId: new Map([
        ["sms-trusted", { categorySystemName: "shopping", confidence: 0.79 }],
      ]),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 1,
      rejectedResultCount: 0,
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator(
      [trustedPurchaseCandidate()],
      context
    );

    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        categoryId: "cat-shopping",
        categoryDisplayName: "Shopping",
        confidence: 0.98,
        reviewStatus: "needs_review",
        reviewReasons: ["category_needed"],
      })
    );
    expect(
      getTransactionReviewMeta(result.transactions[0], {
        accountId: "account-1",
        matchReason: "card_last4",
      })
    ).toEqual({
      isAutoSelectable: false,
      reasons: ["category_needed"],
    });
  });

  it("suppresses a terminal fingerprint from full AI fallback", async () => {
    const unresolved = candidate();

    const result = await parseSmsWithOrchestrator(
      [unresolved],
      context,
      undefined,
      undefined,
      { terminalFingerprints: new Set([unresolved.smsFingerprint]) }
    );

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([]);
    expect(result.terminalFingerprints).toEqual([unresolved.smsFingerprint]);
    expect(result.unresolvedCandidates).toEqual([]);
  });

  it("preserves terminal fingerprints returned by an AI-only parser result", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "edge";
    const unresolved = candidate();
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: false,
      terminalFingerprints: ["terminal-from-response"],
    });

    const result = await parseSmsWithOrchestrator(
      [unresolved],
      context,
      undefined,
      undefined,
      { terminalFingerprints: new Set(["terminal-from-request"]) }
    );

    expect(result.terminalFingerprints).toEqual(
      expect.arrayContaining([
        "terminal-from-request",
        "terminal-from-response",
      ])
    );
  });

  it("preserves a stable retry request key in AI-primary mode", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "edge";
    const unresolved = candidate();
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: false,
    });

    await parseSmsWithOrchestrator(
      [unresolved],
      context,
      undefined,
      undefined,
      {
        expectedUserId: "user-1",
        requestContext: {
          scanSessionId: "scan-session",
          scanKind: "incremental",
          scanStartedAtMs: 123,
        },
        requestKey: "stable-retry-key",
      }
    );

    expect(mockParseSmsWithAi).toHaveBeenCalledWith(
      [unresolved],
      context,
      undefined,
      undefined,
      "user-1",
      {
        scanSessionId: "scan-session",
        scanKind: "incremental",
        scanStartedAtMs: 123,
      },
      "stable-retry-key"
    );
  });

  it("allows an exact trusted local match to recover a terminal fingerprint", async () => {
    const trusted = trustedPurchaseCandidate();

    const result = await parseSmsWithOrchestrator(
      [trusted],
      context,
      undefined,
      undefined,
      { terminalFingerprints: new Set([trusted.smsFingerprint]) }
    );

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: trusted.smsFingerprint }),
    ]);
    expect(result).not.toHaveProperty("durableLocalFingerprints");
    expect(result.terminalFingerprints).toEqual([trusted.smsFingerprint]);
  });

  it("preserves local matches before admitting only the newest 200 AI candidates", async () => {
    const trustedBase = trustedPurchaseCandidate();
    const trusted = {
      ...trustedBase,
      message: { ...trustedBase.message, date: RECEIVED_AT_MS - 10_000 },
    };
    const unresolvedCandidates = Array.from({ length: 201 }, (_, index) =>
      candidate({
        message: {
          ...candidate().message,
          id: `sms-unresolved-${index}`,
          date: RECEIVED_AT_MS + index,
        },
        smsFingerprint: `fingerprint-unresolved-${index}`,
      })
    );
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator(
      [trusted, ...unresolvedCandidates],
      context
    );

    const admitted = mockParseSmsWithAi.mock.calls[0]?.[0] as SmsCandidate[];
    expect(admitted).toHaveLength(200);
    expect(admitted[0]?.smsFingerprint).toBe("fingerprint-unresolved-200");
    expect(admitted.at(-1)?.smsFingerprint).toBe("fingerprint-unresolved-1");
    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: trusted.smsFingerprint }),
    ]);
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        candidate: unresolvedCandidates[0],
        reason: "capacity_limited",
        isRetryable: false,
      }),
    ]);
    expect(result.availability).toEqual({
      reason: "scan_limit",
      availableAt: null,
    });
    expect(result.safeguardSummary).toEqual({
      admittedAiCount: 200,
      deferredAiCount: 1,
      oversizedCount: 0,
      unresolvedCount: 0,
      completionStatus: "partial",
      availability: { reason: "scan_limit", availableAt: null },
    });
  });

  it("counts provider capacity refusals once as deferred work", async () => {
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: true,
      isRetryable: false,
      unresolvedCandidates: [
        {
          candidate: candidate(),
          reason: "capacity_limited",
          isRetryable: false,
        },
      ],
      availability: { reason: "rolling_limit", availableAt: null },
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.safeguardSummary).toMatchObject({
      deferredAiCount: 1,
      unresolvedCount: 0,
      completionStatus: "partial",
    });
  });

  it("keeps category enrichment independent when the full-parser handshake fails", async () => {
    const trusted = trustedPurchaseCandidate();
    const unresolved = candidate();
    const ensureRemoteScanSession = jest
      .fn<Promise<void>, []>()
      .mockRejectedValue(new Error("scan session unavailable"));

    const result = await parseSmsWithOrchestrator(
      [trusted, unresolved],
      context,
      undefined,
      undefined,
      { ensureRemoteScanSession }
    );

    expect(ensureRemoteScanSession).toHaveBeenCalledTimes(1);
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(mockEnrichTrustedSmsCategories).toHaveBeenCalledTimes(1);
    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: trusted.smsFingerprint }),
    ]);
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        candidate: unresolved,
        reason: "ai_failed",
        isRetryable: true,
      }),
    ]);
  });

  it("uses a selected QA profile's reduced admission limit in the app orchestrator", async () => {
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA = "true";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER = "simulated";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX = "fixture";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = "partial-quota-v1";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID = "orchestrator-run-1";
    const unresolvedCandidates = Array.from({ length: 5 }, (_, index) =>
      candidate({
        message: {
          ...candidate().message,
          id: `qa-sms-${index}`,
          date: RECEIVED_AT_MS + index,
        },
        smsFingerprint: `qa-fingerprint-${index}`,
      })
    );
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator(
      unresolvedCandidates,
      context
    );

    const admitted = mockParseSmsWithAi.mock.calls[0]?.[0] as SmsCandidate[];
    expect(admitted.map(({ smsFingerprint }) => smsFingerprint)).toEqual([
      "qa-fingerprint-4",
      "qa-fingerprint-3",
      "qa-fingerprint-2",
    ]);
    expect(result.safeguardSummary).toMatchObject({
      admittedAiCount: 3,
      deferredAiCount: 2,
      completionStatus: "partial",
    });
  });
});
