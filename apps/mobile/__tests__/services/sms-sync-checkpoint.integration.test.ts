import type {
  ParsedSmsTransaction,
  SmsFingerprintInput,
  SmsMessage,
} from "@monyvi/logic";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";
import type { SmsParserOrchestratorResult } from "@/services/sms-parser-orchestrator";
import {
  scanAndParseSms,
  type SmsScanProgress,
} from "@/services/sms-sync-service";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: jest.fn((callback: () => void) => {
      callback();
      return { cancel: jest.fn() };
    }),
  },
  Platform: { OS: "android" },
}));

const mockRandomUuid = jest.fn(() => "scan-session-id");
const mockReadSmsInbox = jest.fn<
  Promise<readonly SmsMessage[]>,
  [
    {
      readonly maxCount?: number;
      readonly minDate?: number;
      readonly maxDate?: number;
      readonly indexFrom?: number;
      readonly sortOrder?: "date DESC, _id DESC";
    }?,
  ]
>();
const mockLoadSmsScanSafeguardState = jest.fn();
interface MockCheckpointState {
  readonly fingerprint: string;
  readonly outcome: string;
}

interface MockFinalizeCheckpointInput {
  readonly states: readonly MockCheckpointState[];
}

interface MockOversizedOutcomeInput {
  readonly userId: string;
  readonly smsFingerprint: string;
  readonly originalReceivedAtMs: number;
  readonly nowMs: number;
  readonly lookbackDays: number;
}

const mockFinalizeSmsScanCheckpoint = jest.fn<
  Promise<unknown>,
  [MockFinalizeCheckpointInput]
>();
const mockRecordOversizedSmsOutcome = jest.fn<
  Promise<void>,
  [MockOversizedOutcomeInput]
>();
const mockComputeSmsFingerprint = jest.fn<
  Promise<string>,
  [SmsFingerprintInput]
>();
const mockParseSmsWithOrchestrator = jest.fn<
  Promise<Partial<SmsParserOrchestratorResult>>,
  unknown[]
>();
const mockInitializeSmsParserScanSession = jest.fn<Promise<void>, unknown[]>();
const mockGetTrustedPrefilterDisposition = jest.fn<string, [unknown]>();
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();
const mockGetHandledSmsReviewFingerprints = jest.fn<
  Promise<ReadonlySet<string>>,
  []
>();
const mockMergeSmsReviewDrafts = jest.fn<
  Promise<{ readonly insertedCount: number; readonly existingCount: number }>,
  [unknown]
>();

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUuid(),
}));

jest.mock("@/services/sms-reader-service", () => ({
  readSmsInbox: (options?: {
    readonly maxCount?: number;
    readonly minDate?: number;
    readonly maxDate?: number;
    readonly indexFrom?: number;
    readonly sortOrder?: "date DESC, _id DESC";
  }): Promise<readonly SmsMessage[]> => mockReadSmsInbox(options),
}));

jest.mock("@/services/sms-scan-checkpoint-coordinator", () => ({
  loadSmsScanSafeguardState: (...args: readonly unknown[]): unknown =>
    mockLoadSmsScanSafeguardState(...args),
  finalizeSmsScanCheckpoint: (input: MockFinalizeCheckpointInput): unknown =>
    mockFinalizeSmsScanCheckpoint(input),
}));

jest.mock("@/services/sms-oversized-outcome-service", () => ({
  recordOversizedSmsOutcome: (input: MockOversizedOutcomeInput): unknown =>
    mockRecordOversizedSmsOutcome(input),
}));

jest.mock("@monyvi/logic", () => {
  const transactionKeys = jest.requireActual<
    typeof import("../../../../packages/logic/src/parsers/parsed-sms-transaction-key")
  >("../../../../packages/logic/src/parsers/parsed-sms-transaction-key");
  const boundaries = jest.requireActual<
    typeof import("../../../../packages/logic/src/sms-safeguards/sms-scan-boundary")
  >("../../../../packages/logic/src/sms-safeguards/sms-scan-boundary");
  const draftCodec = jest.requireActual<
    typeof import("../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec")
  >("../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec");
  return {
    ...transactionKeys,
    ...draftCodec,
    DEFAULT_SMS_SCAN_POLICY: {
      version: 1,
      processingPolicyVersion: 1,
      lookbackDays: 30,
      checkpointOverlapMs: 5 * 60 * 1000,
    },
    calculateEffectiveScanBoundary: boundaries.calculateEffectiveScanBoundary,
    isKnownFinancialSender: () => true,
    isLikelyCorruptedSmsText: () => false,
    isExcludedBeforeSmsParsing: () => false,
    computeSmsFingerprint: (input: SmsFingerprintInput): Promise<string> =>
      mockComputeSmsFingerprint(input),
  };
});

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    unsafeSqlQuery: jest.fn(),
    where: jest.fn(),
    and: jest.fn(),
    or: jest.fn(),
    notEq: jest.fn(),
  },
}));

function mockWithParserDiagnostics(
  result: Partial<SmsParserOrchestratorResult>
): SmsParserOrchestratorResult {
  const transactions = result.transactions ?? [];
  const unresolvedCandidates = result.unresolvedCandidates ?? [];
  return {
    ...result,
    transactions,
    unresolvedCandidates,
    safeguardSummary: result.safeguardSummary ?? {
      admittedAiCount: 0,
      deferredAiCount: 0,
      oversizedCount: result.oversizedCandidates?.length ?? 0,
      unresolvedCount: unresolvedCandidates.length,
      completionStatus:
        unresolvedCandidates.length > 0 ? "partial" : "complete",
    },
    diagnostics: result.diagnostics ?? {
      mode: "ai-primary",
      attemptedAi: true,
      attemptedLocal: false,
      candidateCount: 0,
      resultCount: transactions.length,
      matchedPatternIds: [],
      runtimeScopeCounts: {},
    },
  };
}

jest.mock("@/services/sms-parser-orchestrator", () => ({
  initializeSmsParserScanSession: (...args: unknown[]): Promise<void> =>
    mockInitializeSmsParserScanSession(...args),
  parseSmsWithOrchestrator: async (
    ...args: unknown[]
  ): Promise<SmsParserOrchestratorResult> =>
    mockWithParserDiagnostics(await mockParseSmsWithOrchestrator(...args)),
  toSmsParserDiagnosticsLogContext: (
    diagnostics: SmsParserOrchestratorResult["diagnostics"]
  ): Readonly<Record<string, unknown>> => ({ ...diagnostics }),
  getTrustedPrefilterDisposition: (candidate: unknown): string =>
    mockGetTrustedPrefilterDisposition(candidate),
}));

jest.mock("@/services/sms-review-draft-repository", () => ({
  getHandledSmsReviewFingerprints: (): Promise<ReadonlySet<string>> =>
    mockGetHandledSmsReviewFingerprints(),
  mergeSmsReviewDrafts: (
    input: unknown
  ): Promise<{
    readonly insertedCount: number;
    readonly existingCount: number;
  }> => mockMergeSmsReviewDrafts(input),
}));

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => ({
      query: jest.fn(() => ({
        unsafeFetchRaw: jest.fn(() => Promise.resolve([])),
        fetch: jest.fn(() => Promise.resolve([])),
      })),
    })),
  },
  Transaction: {},
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      userId: "user-a",
      queryOwned: (
        collection: { readonly query: (...conditions: unknown[]) => unknown },
        ...conditions: unknown[]
      ): unknown => collection.query(...conditions),
    })
  ),
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(expectedUserId),
}));

function createSmsMessage(overrides: Partial<SmsMessage> = {}): SmsMessage {
  return {
    id: "sms-1",
    address: "NBE",
    body: "Purchase of EGP 100 at TestShop",
    date: Date.parse("2026-07-20T11:00:00.000Z"),
    read: true,
    ...overrides,
  };
}

function createParsedTransaction(
  overrides: Partial<ParsedSmsTransaction> = {}
): ParsedSmsTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "TestShop",
    date: new Date("2026-07-20T11:00:00.000Z"),
    smsFingerprint: "",
    senderDisplayName: "NBE",
    categoryId: "cat-other",
    categoryDisplayName: "Other",
    rawSmsBody: "Purchase of EGP 100 at TestShop",
    confidence: 0.85,
    source: "SMS",
    originLabel: "NBE",
    ...overrides,
  };
}

const context: ParseSmsContext = {
  categories: [],
  supportedCurrencies: ["EGP"],
};

function options(overrides: Record<string, unknown> = {}): {
  readonly aiContext: ParseSmsContext;
  readonly scanKind: "initial" | "incremental" | "history";
  readonly [key: string]: unknown;
} {
  return { aiContext: context, scanKind: "initial", ...overrides };
}

describe("SMS sync checkpoint integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSmsInbox.mockResolvedValue([]);
    mockComputeSmsFingerprint.mockImplementation((input) =>
      Promise.resolve(`hash-${input.sender}-${input.receivedAtMs}`)
    );
    mockParseSmsWithOrchestrator.mockResolvedValue({ transactions: [] });
    mockInitializeSmsParserScanSession.mockResolvedValue(undefined);
    mockGetTrustedPrefilterDisposition.mockReturnValue("not_trusted_candidate");
    mockLoadSmsScanSafeguardState.mockImplementation(
      (input: { readonly savedFingerprints?: ReadonlySet<string> }) =>
        Promise.resolve({
          checkpoint: null,
          durableKnownFingerprints: new Set(input.savedFingerprints ?? []),
          terminalFingerprints: new Set(),
        })
    );
    mockFinalizeSmsScanCheckpoint.mockResolvedValue(null);
    mockRecordOversizedSmsOutcome.mockResolvedValue(undefined);
    mockRandomUuid.mockReturnValue("scan-session-id");
    mockAssertExpectedCurrentUser.mockReset();
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    mockGetHandledSmsReviewFingerprints.mockResolvedValue(new Set());
    mockMergeSmsReviewDrafts.mockResolvedValue({
      insertedCount: 0,
      existingCount: 0,
    });
  });

  it("uses one fixed scan clock for the inclusive rolling 30-day boundary", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T00:30:00+03:00");
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);

    await scanAndParseSms(options({ maxCount: 100 }));

    expect(mockReadSmsInbox).toHaveBeenCalledWith({
      maxCount: 100,
      minDate: scanStartedAtMs - 30 * 24 * 60 * 60 * 1000,
      maxDate: scanStartedAtMs,
      indexFrom: 0,
      sortOrder: "date DESC, _id DESC",
    });
  });

  it("binds the fixed server scan session before reading the inbox", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);

    await scanAndParseSms(options());

    expect(mockInitializeSmsParserScanSession).toHaveBeenCalledWith(
      context,
      {
        scanSessionId: "scan-session-id",
        scanKind: "initial",
        scanStartedAtMs,
      },
      undefined,
      "user-a"
    );
    expect(
      mockInitializeSmsParserScanSession.mock.invocationCallOrder[0]
    ).toBeLessThan(mockReadSmsInbox.mock.invocationCallOrder[0]);
  });

  it("pages through the complete bounded inbox window before checkpointing", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);
    const newest = createSmsMessage({ id: "newest", date: scanStartedAtMs });
    const middle = createSmsMessage({
      id: "middle",
      date: scanStartedAtMs - 1,
    });
    const oldest = createSmsMessage({
      id: "oldest",
      date: scanStartedAtMs - 2,
    });
    mockReadSmsInbox.mockImplementation((readerOptions) => {
      const offset = readerOptions?.indexFrom ?? 0;
      return Promise.resolve(
        [newest, middle, oldest].slice(offset, offset + 2)
      );
    });
    mockComputeSmsFingerprint.mockImplementation((input) =>
      Promise.resolve(`fp-${input.receivedAtMs}`)
    );

    await scanAndParseSms(options({ maxCount: 2 }));

    expect(mockReadSmsInbox).toHaveBeenCalledTimes(2);
    expect(mockReadSmsInbox).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ indexFrom: 2, maxCount: 2 })
    );
    const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
    expect(finalizeInput?.states).toHaveLength(3);
  });

  it("excludes rows before the exact cutoff before progress or parsing", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    const cutoff = scanStartedAtMs - 30 * 24 * 60 * 60 * 1000;
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);
    mockReadSmsInbox.mockResolvedValue([
      createSmsMessage({ id: "before", date: cutoff - 1 }),
      createSmsMessage({ id: "at", date: cutoff }),
      createSmsMessage({ id: "after", date: cutoff + 1 }),
    ]);
    const onProgress = jest.fn<void, [SmsScanProgress]>();

    const result = await scanAndParseSms(options(), onProgress);

    expect(result.totalScanned).toBe(2);
    expect(mockComputeSmsFingerprint).toHaveBeenCalledTimes(2);
    expect(
      onProgress.mock.calls.every(([progress]) => progress.totalMessages === 2)
    ).toBe(true);
  });

  it("excludes rows received after the immutable scan-start boundary", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);
    mockReadSmsInbox.mockResolvedValue([
      createSmsMessage({ id: "at", date: scanStartedAtMs }),
      createSmsMessage({ id: "future", date: scanStartedAtMs + 1 }),
    ]);

    const result = await scanAndParseSms(options());

    expect(result.totalScanned).toBe(1);
    expect(mockComputeSmsFingerprint).toHaveBeenCalledTimes(1);
  });

  it("uses the five-minute checkpoint overlap for an incremental scan", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    const checkpointBoundary = scanStartedAtMs - 86_400_000;
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);
    mockLoadSmsScanSafeguardState.mockResolvedValue({
      checkpoint: {
        boundaryReceivedAtMs: checkpointBoundary,
        boundaryFingerprint: "checkpoint",
      },
      durableKnownFingerprints: new Set(),
      terminalFingerprints: new Set(),
    });

    await scanAndParseSms(options({ scanKind: "incremental" }));

    expect(mockReadSmsInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        minDate: checkpointBoundary - 5 * 60 * 1000,
      })
    );
  });

  it("persists a review draft before advancing through its durable outcome", async () => {
    const first = createSmsMessage({ id: "first" });
    const second = createSmsMessage({ id: "second", date: first.date + 1 });
    mockReadSmsInbox.mockResolvedValue([first, second]);
    mockComputeSmsFingerprint
      .mockResolvedValueOnce("fp-first")
      .mockResolvedValueOnce("fp-second");
    mockLoadSmsScanSafeguardState
      .mockResolvedValueOnce({
        checkpoint: null,
        durableKnownFingerprints: new Set(),
        terminalFingerprints: new Set(),
      })
      .mockResolvedValueOnce({
        checkpoint: null,
        durableKnownFingerprints: new Set(["fp-second"]),
        terminalFingerprints: new Set(),
      });
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [createParsedTransaction({ smsFingerprint: "fp-first" })],
    });

    await scanAndParseSms(options());

    expect(mockMergeSmsReviewDrafts).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUserId: "user-a",
        transactions: [expect.objectContaining({ smsFingerprint: "fp-first" })],
      })
    );
    expect(mockMergeSmsReviewDrafts.mock.invocationCallOrder[0]).toBeLessThan(
      mockFinalizeSmsScanCheckpoint.mock.invocationCallOrder[0]
    );

    const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
    expect(finalizeInput?.states.map(({ outcome }) => outcome)).toEqual(
      expect.arrayContaining(["draft_suggestion", "future_durable"])
    );
  });

  it("returns typed safeguard guidance when every AI candidate is capacity-deferred", async () => {
    const message = createSmsMessage();
    const candidate = { message, smsFingerprint: "fp-capacity" };
    mockReadSmsInbox.mockResolvedValue([message]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-capacity");
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [],
      hasError: true,
      isRetryable: false,
      unresolvedCandidates: [
        {
          candidate,
          reason: "capacity_limited",
          isRetryable: false,
        },
      ],
      safeguardSummary: {
        admittedAiCount: 0,
        deferredAiCount: 1,
        oversizedCount: 0,
        unresolvedCount: 0,
        completionStatus: "partial",
        availability: {
          reason: "rolling_limit",
          availableAt: "2026-07-21T10:00:00.000Z",
        },
      },
    });

    const result = await scanAndParseSms(options());

    expect(result.transactions).toEqual([]);
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({ reason: "capacity_limited" }),
    ]);
    expect(result.safeguardSummary).toEqual(
      expect.objectContaining({
        deferredAiCount: 1,
        completionStatus: "partial",
      })
    );
    const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
    expect(finalizeInput?.states[0]?.outcome).toBe("unresolved");
  });

  it("passes scan identity and terminal fingerprints to the parser", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);
    mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-terminal");
    mockLoadSmsScanSafeguardState
      .mockResolvedValueOnce({
        checkpoint: null,
        durableKnownFingerprints: new Set(),
        terminalFingerprints: new Set(),
      })
      .mockResolvedValueOnce({
        checkpoint: null,
        durableKnownFingerprints: new Set(["fp-terminal"]),
        terminalFingerprints: new Set(["fp-terminal"]),
      });
    mockGetTrustedPrefilterDisposition.mockReturnValue("route_to_parser");

    await scanAndParseSms(options({ scanKind: "history" }));

    expect(mockParseSmsWithOrchestrator).toHaveBeenCalledWith(
      expect.any(Array),
      context,
      expect.any(Function),
      undefined,
      {
        expectedUserId: "user-a",
        terminalFingerprints: new Set(["fp-terminal"]),
        requestContext: {
          scanSessionId: "scan-session-id",
          scanKind: "history",
          scanStartedAtMs,
        },
      }
    );
  });

  it.each([
    ["server-confirmed negative", "fp-negative"],
    ["server-discovered terminal", "fp-remote-terminal"],
  ])(
    "treats %s as a durable checkpoint outcome",
    async (_label, fingerprint) => {
      mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
      mockComputeSmsFingerprint.mockResolvedValue(fingerprint);
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [],
        durableNegativeFingerprints:
          fingerprint === "fp-negative" ? [fingerprint] : [],
        terminalFingerprints:
          fingerprint === "fp-remote-terminal" ? [fingerprint] : [],
      });

      await scanAndParseSms(options());

      const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
      expect(finalizeInput?.states).toEqual([
        expect.objectContaining({ fingerprint, outcome: "ai_negative" }),
      ]);
    }
  );

  it("checkpoints an exact trusted local rejection as locally excluded", async () => {
    mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-local-rejection");
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [],
      durableLocalRejectionFingerprints: ["fp-local-rejection"],
    });

    await scanAndParseSms(options());

    const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
    expect(finalizeInput?.states).toEqual([
      expect.objectContaining({
        fingerprint: "fp-local-rejection",
        outcome: "local_excluded",
      }),
    ]);
  });

  it("persists and checkpoints an oversized candidate without raw content", async () => {
    const scanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(scanStartedAtMs);
    const message = createSmsMessage();
    mockReadSmsInbox.mockResolvedValue([message]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-oversized");
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [],
      oversizedCandidates: [{ message, smsFingerprint: "fp-oversized" }],
    });

    await scanAndParseSms(options());

    expect(mockRecordOversizedSmsOutcome).toHaveBeenCalledWith({
      userId: "user-a",
      smsFingerprint: "fp-oversized",
      originalReceivedAtMs: message.date,
      nowMs: scanStartedAtMs,
      lookbackDays: 30,
    });
    const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
    expect(finalizeInput?.states[0]?.outcome).toBe("candidate_too_large");
  });

  it("aborts before local finalization when the authenticated user changes", async () => {
    const message = createSmsMessage();
    mockReadSmsInbox.mockResolvedValue([message]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-stale-user");
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [
        createParsedTransaction({ smsFingerprint: "fp-stale-user" }),
      ],
    });
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("AUTH_SCOPE_CHANGED"));

    await expect(scanAndParseSms(options())).rejects.toThrow(
      "AUTH_SCOPE_CHANGED"
    );

    expect(mockRecordOversizedSmsOutcome).not.toHaveBeenCalled();
    expect(mockFinalizeSmsScanCheckpoint).not.toHaveBeenCalled();
  });

  it("does not publish results when the authenticated user changes during checkpoint persistence", async () => {
    const message = createSmsMessage();
    mockReadSmsInbox.mockResolvedValue([message]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-stale-after-checkpoint");
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [
        createParsedTransaction({
          smsFingerprint: "fp-stale-after-checkpoint",
        }),
      ],
    });
    mockFinalizeSmsScanCheckpoint.mockImplementationOnce(() => {
      mockAssertExpectedCurrentUser.mockRejectedValue(
        new Error("AUTH_SCOPE_CHANGED")
      );
      return Promise.resolve(null);
    });

    await expect(scanAndParseSms(options())).rejects.toThrow(
      "AUTH_SCOPE_CHANGED"
    );

    expect(mockFinalizeSmsScanCheckpoint).toHaveBeenCalledTimes(1);
  });

  it("keeps unsaved trusted local recovery non-durable for a terminal fingerprint", async () => {
    mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
    mockComputeSmsFingerprint.mockResolvedValue("fp-terminal");
    mockLoadSmsScanSafeguardState
      .mockResolvedValueOnce({
        checkpoint: null,
        durableKnownFingerprints: new Set(),
        terminalFingerprints: new Set(),
      })
      .mockResolvedValueOnce({
        checkpoint: null,
        durableKnownFingerprints: new Set(["fp-terminal"]),
        terminalFingerprints: new Set(["fp-terminal"]),
      });
    mockGetTrustedPrefilterDisposition.mockReturnValue("route_to_parser");
    mockParseSmsWithOrchestrator.mockResolvedValue({
      transactions: [
        createParsedTransaction({ smsFingerprint: "fp-terminal" }),
      ],
      durableNegativeFingerprints: ["fp-terminal"],
      terminalFingerprints: ["fp-terminal"],
    });

    await scanAndParseSms(options());

    const finalizeInput = mockFinalizeSmsScanCheckpoint.mock.calls[0]?.[0];
    expect(finalizeInput?.states[0]?.outcome).toBe("draft_suggestion");
  });
});
