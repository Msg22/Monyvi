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
  MIN_TRUSTED_CATEGORY_CONFIDENCE: 0.9,
  TRUSTED_ENRICHED_PURCHASE_CONFIDENCE: 0.98,
  enrichTrustedSmsCategories: (...args: readonly unknown[]): unknown =>
    mockEnrichTrustedSmsCategories(...args),
}));

import { parseSmsWithOrchestrator } from "@/services/sms-parser-orchestrator";

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
