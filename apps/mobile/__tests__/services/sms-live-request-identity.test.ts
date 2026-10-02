import type { ParseSmsContext, SmsCandidate } from "@/services/ai-sms-parser-service";
import type { SmsParserOrchestratorResult } from "@/services/sms-parser-orchestrator";

const mockComputeSmsFingerprint = jest.fn<Promise<string>, [unknown]>();
const mockParseSmsWithOrchestrator = jest.fn<
  Promise<SmsParserOrchestratorResult>,
  [
    readonly SmsCandidate[],
    ParseSmsContext,
    unknown?,
    unknown?,
    Readonly<Record<string, unknown>>?,
  ]
>();
const mockGetRequiredCurrentUserId = jest.fn<Promise<string>, []>();
const mockGetAiProcessingConsentStatus = jest.fn<
  Promise<{ isConsented: boolean; userId: string }>,
  []
>();
const mockGetCurrentUserDataScope = jest.fn();
const mockHasExistingSmsFingerprint = jest.fn<
  Promise<boolean>,
  [string, string?]
>();
const mockGetTerminalSmsFingerprints = jest.fn<
  Promise<ReadonlySet<string>>,
  [readonly string[], string?]
>();

jest.mock("@monyvi/logic", () => ({
  computeSmsFingerprint: (input: unknown): Promise<string> =>
    mockComputeSmsFingerprint(input),
  isLikelyFinancialSms: (): boolean => true,
  isLikelyCorruptedSmsText: (): boolean => false,
  isExcludedBeforeSmsParsing: (): boolean => false,
  SUPPORTED_CURRENCIES: [{ code: "EGP" }],
}));

jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn(() => ({})) },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: { where: jest.fn(), notEq: jest.fn() },
}));

jest.mock("@/services/sms-live-detection-handler", () => ({
  reconcileLiveDetectionPreference: (): Promise<boolean> =>
    Promise.resolve(true),
  setLiveDetectionEnabled: (): Promise<void> => Promise.resolve(),
  setAutoConfirm: (): Promise<void> => Promise.resolve(),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{
    isConsented: boolean;
    userId: string;
  }> => mockGetAiProcessingConsentStatus(),
  revokeAiProcessingConsent: (): Promise<void> => Promise.resolve(),
}));

jest.mock("@/services/sms-dedup-service", () => ({
  hasExistingSmsFingerprint: (
    fingerprint: string,
    expectedUserId?: string
  ): Promise<boolean> =>
    mockHasExistingSmsFingerprint(fingerprint, expectedUserId),
}));

jest.mock("@/services/sms-processing-outcome-service", () => ({
  getTerminalSmsFingerprints: (
    fingerprints: readonly string[],
    expectedUserId?: string
  ): Promise<ReadonlySet<string>> =>
    mockGetTerminalSmsFingerprints(fingerprints, expectedUserId),
}));

jest.mock("@/services/ai-sms-parser-service", () => ({
  isAiConsentRequiredError: (): boolean => false,
}));

jest.mock("@/services/sms-parser-orchestrator", () => ({
  parseSmsWithOrchestrator: (
    ...args: [
      readonly SmsCandidate[],
      ParseSmsContext,
      unknown?,
      unknown?,
      Readonly<Record<string, unknown>>?,
    ]
  ): Promise<SmsParserOrchestratorResult> =>
    mockParseSmsWithOrchestrator(...args),
  toSmsParserDiagnosticsLogContext: (): Readonly<Record<string, unknown>> => ({}),
  getTrustedPrefilterDisposition: (): string => "not_trusted_candidate",
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: () => mockGetCurrentUserDataScope(),
  getRequiredCurrentUserId: (): Promise<string> =>
    mockGetRequiredCurrentUserId(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { processLiveSmsEvent } from "@/services/sms-live-processor";

function result(hasError = false): SmsParserOrchestratorResult {
  return {
    transactions: [],
    hasError,
    isRetryable: hasError ? true : undefined,
    unresolvedCandidates: [],
    safeguardSummary: {
      admittedAiCount: 1,
      deferredAiCount: 0,
      oversizedCount: 0,
      unresolvedCount: hasError ? 1 : 0,
      completionStatus: hasError ? "partial" : "complete",
    },
    diagnostics: {
      mode: "ai-primary",
      attemptedAi: true,
      attemptedLocal: false,
      candidateCount: 1,
      resultCount: 0,
      matchedPatternIds: [],
      runtimeScopeCounts: {},
    },
  };
}

function liveEvent(deliveryMode: "foreground" | "headless", timestamp = 1778414400000) {
  return {
    sender: "QNB",
    body: "Purchase EGP 850 at Hyper Market using card ending 1234",
    timestamp,
    deliveryMode,
  } as const;
}

function identityAt(callIndex: number) {
  const call = mockParseSmsWithOrchestrator.mock.calls[callIndex];
  return {
    candidateId: call?.[0][0]?.message.id,
    options: call?.[4],
  };
}

describe("live SMS request identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequiredCurrentUserId.mockResolvedValue("user-a");
    mockGetAiProcessingConsentStatus.mockResolvedValue({
      isConsented: true,
      userId: "user-a",
    });
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-a",
      queryAccessibleCategories: () => ({
        fetch: jest.fn(() => Promise.resolve([])),
      }),
    });
    mockHasExistingSmsFingerprint.mockResolvedValue(false);
    mockGetTerminalSmsFingerprints.mockResolvedValue(new Set());
    mockComputeSmsFingerprint.mockResolvedValue("hash-live");
    mockParseSmsWithOrchestrator.mockResolvedValue(result(false));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps identity stable across a retry delivered headless twice", async () => {
    mockParseSmsWithOrchestrator
      .mockResolvedValueOnce(result(true))
      .mockResolvedValueOnce(result(false));
    const nowSpy = jest.spyOn(Date, "now");
    try {
      nowSpy.mockReturnValue(1778414405000);
      await processLiveSmsEvent(liveEvent("headless"));
      nowSpy.mockReturnValue(1778414490000);
      await processLiveSmsEvent(liveEvent("headless"));
    } finally {
      nowSpy.mockRestore();
    }

    expect(identityAt(0)).toEqual({
      candidateId: "live-hash-live",
      options: expect.objectContaining({
        requestKey: "live:hash-live",
        requestContext: {
          scanSessionId: null,
          scanKind: "live",
          scanStartedAtMs: 1778414400000,
        },
      }),
    });
    expect(identityAt(1)).toEqual(identityAt(0));
  });

  it("keeps identity stable when retry delivery switches foreground to headless", async () => {
    mockParseSmsWithOrchestrator
      .mockResolvedValueOnce(result(true))
      .mockResolvedValueOnce(result(false));
    const nowSpy = jest.spyOn(Date, "now");
    try {
      nowSpy.mockReturnValue(1778414405000);
      await processLiveSmsEvent(liveEvent("foreground"));
      nowSpy.mockReturnValue(1778414490000);
      await processLiveSmsEvent(liveEvent("headless"));
    } finally {
      nowSpy.mockRestore();
    }

    expect(identityAt(0)).toEqual({
      candidateId: "live-hash-live",
      options: expect.objectContaining({
        requestKey: "live:hash-live",
        requestContext: {
          scanSessionId: null,
          scanKind: "live",
          scanStartedAtMs: 1778414400000,
        },
      }),
    });
    expect(identityAt(1)).toEqual(identityAt(0));
  });

  it("uses distinct identities for distinct fingerprints", async () => {
    mockComputeSmsFingerprint
      .mockResolvedValueOnce("hash-live-a")
      .mockResolvedValueOnce("hash-live-b");

    await processLiveSmsEvent(liveEvent("headless", 1778414400000));
    await processLiveSmsEvent(liveEvent("headless", 1778414460000));

    expect(identityAt(0)).toEqual({
      candidateId: "live-hash-live-a",
      options: expect.objectContaining({
        requestKey: "live:hash-live-a",
        requestContext: expect.objectContaining({
          scanStartedAtMs: 1778414400000,
        }),
      }),
    });
    expect(identityAt(1)).toEqual({
      candidateId: "live-hash-live-b",
      options: expect.objectContaining({
        requestKey: "live:hash-live-b",
        requestContext: expect.objectContaining({
          scanStartedAtMs: 1778414460000,
        }),
      }),
    });
  });
});
