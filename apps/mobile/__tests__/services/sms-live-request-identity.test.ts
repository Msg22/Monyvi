import type {
  ParseSmsContext,
  SmsAiRetryRequest,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";
import type { SmsParserOrchestratorOptions } from "@/services/sms-parser-result-contract";
import type { SmsParserOrchestratorResult } from "@/services/sms-parser-orchestrator";
import type { LiveSmsEvent } from "@/services/sms-live-processor";

const mockComputeSmsFingerprint = jest.fn<Promise<string>, [unknown]>();
const mockParseSmsWithOrchestrator = jest.fn<
  Promise<SmsParserOrchestratorResult>,
  [
    readonly SmsCandidate[],
    ParseSmsContext,
    unknown?,
    unknown?,
    SmsParserOrchestratorOptions?,
  ]
>();
const mockGetRequiredCurrentUserId = jest.fn<Promise<string>, []>();
const mockGetAiProcessingConsentStatus = jest.fn<
  Promise<{ isConsented: boolean; userId: string }>,
  []
>();
interface MockUserScope {
  readonly userId: string;
  readonly queryAccessibleCategories: () => {
    readonly fetch: () => Promise<readonly never[]>;
  };
}

interface LiveRequestIdentitySnapshot {
  readonly candidateId: string | undefined;
  readonly options: SmsParserOrchestratorOptions | undefined;
}

const mockGetCurrentUserDataScope = jest.fn<Promise<MockUserScope>, []>();
const mockHasExistingSmsFingerprint = jest.fn<
  Promise<boolean>,
  [string, string?]
>();
const mockGetTerminalSmsFingerprints = jest.fn<
  Promise<ReadonlySet<string>>,
  [readonly string[], string?]
>();

const retryRequestKeys = new Map<string, string>();
const mockLoadLiveSmsRetryRequestKey = jest.fn(
  async (input: {
    readonly expectedUserId: string;
    readonly smsFingerprint: string;
  }): Promise<string | null> =>
    retryRequestKeys.get(`${input.expectedUserId}:${input.smsFingerprint}`) ??
    null
);
const mockSaveLiveSmsRetryRequestKey = jest.fn(
  async (input: {
    readonly expectedUserId: string;
    readonly smsFingerprint: string;
    readonly requestKey: string;
  }): Promise<void> => {
    retryRequestKeys.set(
      `${input.expectedUserId}:${input.smsFingerprint}`,
      input.requestKey
    );
  }
);
const mockClearLiveSmsRetryRequestKey = jest.fn(
  async (input: {
    readonly expectedUserId: string;
    readonly smsFingerprint: string;
  }): Promise<void> => {
    retryRequestKeys.delete(
      `${input.expectedUserId}:${input.smsFingerprint}`
    );
  }
);
const mockClearLiveSmsRetryRequestsForUser = jest.fn(
  async (input: { readonly expectedUserId: string }): Promise<void> => {
    for (const key of [...retryRequestKeys.keys()]) {
      if (key.startsWith(`${input.expectedUserId}:`)) {
        retryRequestKeys.delete(key);
      }
    }
  }
);

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
      SmsParserOrchestratorOptions?,
    ]
  ): Promise<SmsParserOrchestratorResult> =>
    mockParseSmsWithOrchestrator(...args),
  toSmsParserDiagnosticsLogContext: (): Readonly<Record<string, unknown>> => ({}),
  getTrustedPrefilterDisposition: (): string => "not_trusted_candidate",
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): Promise<MockUserScope> =>
    mockGetCurrentUserDataScope(),
  getRequiredCurrentUserId: (): Promise<string> =>
    mockGetRequiredCurrentUserId(),
}));

jest.mock("@/services/sms-live-retry-request-store", () => ({
  loadLiveSmsRetryRequestKey: (input: {
    readonly expectedUserId: string;
    readonly smsFingerprint: string;
  }): Promise<string | null> => mockLoadLiveSmsRetryRequestKey(input),
  saveLiveSmsRetryRequestKey: (input: {
    readonly expectedUserId: string;
    readonly smsFingerprint: string;
    readonly requestKey: string;
  }): Promise<void> => mockSaveLiveSmsRetryRequestKey(input),
  clearLiveSmsRetryRequestKey: (input: {
    readonly expectedUserId: string;
    readonly smsFingerprint: string;
  }): Promise<void> => mockClearLiveSmsRetryRequestKey(input),
  clearLiveSmsRetryRequestsForUser: (input: {
    readonly expectedUserId: string;
  }): Promise<void> => mockClearLiveSmsRetryRequestsForUser(input),
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

function retryCandidate(): SmsCandidate {
  return {
    message: {
      id: "live-hash-live",
      address: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      date: 1778414400000,
      read: false,
    },
    smsFingerprint: "hash-live",
  };
}

function retryResult(requestKey: string): SmsParserOrchestratorResult {
  const candidate = retryCandidate();
  const retryRequest: SmsAiRetryRequest = {
    requestKey,
    requestContext: {
      scanSessionId: null,
      scanKind: "live",
      scanStartedAtMs: 1778414400000,
    },
    candidates: [candidate],
  };
  return {
    ...result(true),
    unresolvedCandidates: [
      {
        candidate,
        reason: "chunk_failed",
        isRetryable: true,
        retryRequest,
      },
    ],
  };
}

function liveEvent(
  deliveryMode: LiveSmsEvent["deliveryMode"],
  timestamp = 1778414400000
): LiveSmsEvent {
  return {
    sender: "QNB",
    body: "Purchase EGP 850 at Hyper Market using card ending 1234",
    timestamp,
    deliveryMode,
  };
}

function identityAt(callIndex: number): LiveRequestIdentitySnapshot {
  const call = mockParseSmsWithOrchestrator.mock.calls[callIndex];
  return {
    candidateId: call?.[0][0]?.message.id,
    options: call?.[4],
  };
}

describe("live SMS request identity", () => {
  beforeEach(() => {
    retryRequestKeys.clear();
    jest.clearAllMocks();
    mockGetRequiredCurrentUserId.mockResolvedValue("user-a");
    mockGetAiProcessingConsentStatus.mockResolvedValue({
      isConsented: true,
      userId: "user-a",
    });
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-a",
      queryAccessibleCategories: (): {
        readonly fetch: () => Promise<readonly never[]>;
      } => ({
        fetch: (): Promise<readonly never[]> => Promise.resolve([]),
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

  it("persists the initial request key before provider dispatch", async () => {
    await processLiveSmsEvent(liveEvent("headless"));

    expect(mockSaveLiveSmsRetryRequestKey).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUserId: "user-a",
        smsFingerprint: "hash-live",
        requestKey: "live:hash-live",
      })
    );
    expect(
      mockSaveLiveSmsRetryRequestKey.mock.invocationCallOrder[0]
    ).toBeLessThan(mockParseSmsWithOrchestrator.mock.invocationCallOrder[0]);
  });

  it("keeps the persisted key after an ambiguous retryable failure", async () => {
    mockParseSmsWithOrchestrator.mockResolvedValueOnce(retryResult("live:hash-live"));

    const first = await processLiveSmsEvent(liveEvent("headless"));
    expect(first.status).toBe("ai_failed");
    expect(retryRequestKeys.get("user-a:hash-live")).toBe("live:hash-live");

    mockParseSmsWithOrchestrator.mockResolvedValueOnce(result(false));
    await processLiveSmsEvent(liveEvent("headless"));
    expect(identityAt(1).options?.requestKey).toBe("live:hash-live");
  });

  it("rotates only to a canonical fresh retry request key", async () => {
    mockParseSmsWithOrchestrator.mockResolvedValueOnce(
      retryResult("fresh-live-request-key")
    );

    const first = await processLiveSmsEvent(liveEvent("headless"));
    expect(first.status).toBe("ai_failed");
    expect(retryRequestKeys.get("user-a:hash-live")).toBe(
      "fresh-live-request-key"
    );

    mockParseSmsWithOrchestrator.mockResolvedValueOnce(result(false));
    await processLiveSmsEvent(liveEvent("headless"));
    expect(identityAt(1).options?.requestKey).toBe("fresh-live-request-key");
  });

  it("uses a durable key loaded by a new runtime-style invocation", async () => {
    retryRequestKeys.set("user-a:hash-live", "persisted-after-restart");

    await processLiveSmsEvent(liveEvent("headless"));

    expect(identityAt(0).options?.requestKey).toBe("persisted-after-restart");
  });

  it("fails closed before provider dispatch when retry identity persistence fails", async () => {
    mockSaveLiveSmsRetryRequestKey.mockRejectedValueOnce(
      new Error("storage unavailable")
    );

    const output = await processLiveSmsEvent(liveEvent("headless"));

    expect(output.status).toBe("ai_failed");
    expect(output.isRetryable).toBe(true);
    expect(mockParseSmsWithOrchestrator).not.toHaveBeenCalled();
  });

  it("clears retry identity for terminal, nonretryable, and consent outcomes", async () => {
    retryRequestKeys.set("user-a:hash-live", "persisted-terminal");
    mockGetTerminalSmsFingerprints.mockResolvedValueOnce(new Set(["hash-live"]));
    await processLiveSmsEvent(liveEvent("headless"));
    expect(mockClearLiveSmsRetryRequestKey).toHaveBeenCalledWith({
      expectedUserId: "user-a",
      smsFingerprint: "hash-live",
    });

    retryRequestKeys.set("user-a:hash-live", "persisted-nonretryable");
    mockGetTerminalSmsFingerprints.mockResolvedValueOnce(new Set());
    mockParseSmsWithOrchestrator.mockResolvedValueOnce({
      ...result(true),
      isRetryable: false,
    });
    await processLiveSmsEvent(liveEvent("headless"));
    expect(retryRequestKeys.has("user-a:hash-live")).toBe(false);

    retryRequestKeys.set("user-a:hash-live", "persisted-consent");
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      isConsented: false,
      userId: "user-a",
    });
    await processLiveSmsEvent(liveEvent("headless"));
    expect(mockClearLiveSmsRetryRequestsForUser).toHaveBeenCalledWith({
      expectedUserId: "user-a",
    });
  });

  it("does not rotate an old owner's retry key after account switch", async () => {
    retryRequestKeys.set("user-a:hash-live", "user-a-key");
    mockGetRequiredCurrentUserId
      .mockResolvedValueOnce("user-a")
      .mockResolvedValueOnce("user-a")
      .mockResolvedValueOnce("user-a")
      .mockResolvedValueOnce("user-b");
    mockParseSmsWithOrchestrator.mockResolvedValueOnce(
      retryResult("fresh-for-user-a")
    );

    const output = await processLiveSmsEvent(liveEvent("headless"));

    expect(output.status).toBe("stale_user");
    expect(retryRequestKeys.get("user-a:hash-live")).toBe("user-a-key");
  });

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
