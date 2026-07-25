/**
 * sms-sync-service.test.ts — T020
 *
 * Tests the `scanAndParseSms` and `cleanupStaleScanState` functions from
 * sms-sync-service.ts.
 *
 * Mock Strategy:
 *   - `sms-reader-service` is mocked to return controlled SMS messages
 *   - `@monyvi/logic` is partially mocked (isKnownFinancialSender + computeSmsFingerprint)
 *   - `sms-parser-orchestrator` is mocked to return controlled parse results
 *   - `@react-native-async-storage/async-storage` is mocked for scan guard
 *   - `InteractionManager` is mocked via react-native
 *   - `@monyvi/db` is mocked to provide loadExistingSmsFingerprints support
 */
/* eslint-disable max-lines -- SMS sync pipeline regressions share one service-level mock harness. */

import type {
  ParsedSmsTransaction,
  SmsFingerprintInput,
  SmsMessage,
} from "@monyvi/logic";
import type {
  AiParseResult,
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";
import type { SmsParserOrchestratorResult } from "@/services/sms-parser-orchestrator";

// ---------------------------------------------------------------------------
// Mock: AsyncStorage (inline factory to avoid hoisting issues)
// ---------------------------------------------------------------------------

jest.mock("@react-native-async-storage/async-storage", () => {
  const setItem = jest.fn((): Promise<void> => Promise.resolve());
  const getItem = jest.fn((): Promise<string | null> => Promise.resolve(null));
  const removeItem = jest.fn((): Promise<void> => Promise.resolve());
  return {
    __esModule: true,
    default: { setItem, getItem, removeItem },
    __mocks: { setItem, getItem, removeItem },
  };
});

/** Shape of the mocked AsyncStorage module for typed access. */
interface AsyncStorageMockModule {
  __esModule: boolean;
  default: {
    setItem: jest.Mock;
    getItem: jest.Mock;
    removeItem: jest.Mock;
  };
  __mocks: {
    setItem: jest.Mock;
    getItem: jest.Mock;
    removeItem: jest.Mock;
  };
}

/** Typed access to the AsyncStorage mock fns for assertions. */
function getAsyncStorageMocks(): {
  setItem: jest.Mock;
  getItem: jest.Mock;
  removeItem: jest.Mock;
} {
  return jest.requireMock<AsyncStorageMockModule>(
    "@react-native-async-storage/async-storage"
  ).__mocks;
}

// ---------------------------------------------------------------------------
// Mock: react-native (InteractionManager + Platform)
// ---------------------------------------------------------------------------

jest.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: jest.fn((cb: () => void) => {
      cb();
      return { cancel: jest.fn() };
    }),
  },
  Platform: { OS: "android" },
}));

const mockRandomUuid = jest.fn(() => "scan-session-id");

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUuid(),
}));

// ---------------------------------------------------------------------------
// Mock: sms-reader-service
// ---------------------------------------------------------------------------

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
>(() => Promise.resolve([]));
const mockLoadSmsScanSafeguardState = jest.fn();
const mockFinalizeSmsScanCheckpoint = jest.fn();
const mockRecordOversizedSmsOutcome = jest.fn();

jest.mock("@/services/sms-reader-service", () => ({
  readSmsInbox: (...args: unknown[]) =>
    mockReadSmsInbox(
      ...(args as [
        {
          readonly maxCount?: number;
          readonly minDate?: number;
          readonly maxDate?: number;
          readonly indexFrom?: number;
          readonly sortOrder?: "date DESC, _id DESC";
        }?,
      ])
    ),
}));

jest.mock("@/services/sms-scan-checkpoint-coordinator", () => ({
  loadSmsScanSafeguardState: (...args: readonly unknown[]): unknown =>
    mockLoadSmsScanSafeguardState(...args),
  finalizeSmsScanCheckpoint: (...args: readonly unknown[]): unknown =>
    mockFinalizeSmsScanCheckpoint(...args),
}));

jest.mock("@/services/sms-oversized-outcome-service", () => ({
  recordOversizedSmsOutcome: (...args: readonly unknown[]): unknown =>
    mockRecordOversizedSmsOutcome(...args),
}));

// ---------------------------------------------------------------------------
// Mock: @monyvi/logic (isKnownFinancialSender + computeSmsFingerprint)
// ---------------------------------------------------------------------------

const mockIsKnownFinancialSender = jest.fn<boolean, [string]>(() => true);
const mockIsLikelyCorruptedSmsText = jest.fn<boolean, [string]>(() => false);
const mockIsExcludedBeforeSmsParsing = jest.fn<boolean, [string]>(() => false);
const mockComputeSmsFingerprint = jest.fn<
  Promise<string>,
  [SmsFingerprintInput]
>((input: SmsFingerprintInput) =>
  Promise.resolve(
    `hash-${input.sender}-${input.receivedAtMs}-${input.body.slice(0, 10)}`
  )
);

jest.mock("@monyvi/logic", () => {
  const transactionKeyModule = jest.requireActual<
    typeof import("../../../../packages/logic/src/parsers/parsed-sms-transaction-key")
  >("../../../../packages/logic/src/parsers/parsed-sms-transaction-key");

  return {
    ...transactionKeyModule,
    DEFAULT_SMS_SCAN_POLICY: {
      version: 1,
      processingPolicyVersion: 1,
      lookbackDays: 30,
      checkpointOverlapMs: 5 * 60 * 1000,
    },
    calculateEffectiveScanBoundary: jest.requireActual<
      typeof import("../../../../packages/logic/src/sms-safeguards/sms-scan-boundary")
    >("../../../../packages/logic/src/sms-safeguards/sms-scan-boundary")
      .calculateEffectiveScanBoundary,
    isKnownFinancialSender: (...args: unknown[]) =>
      mockIsKnownFinancialSender(...(args as [string])),
    isLikelyCorruptedSmsText: (body: string): boolean =>
      mockIsLikelyCorruptedSmsText(body),
    isExcludedBeforeSmsParsing: (body: string): boolean =>
      mockIsExcludedBeforeSmsParsing(body),
    computeSmsFingerprint: (...args: unknown[]) =>
      mockComputeSmsFingerprint(...(args as [SmsFingerprintInput])),
  };
});

// ---------------------------------------------------------------------------
// Mock: @nozbe/watermelondb
// ---------------------------------------------------------------------------

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    unsafeSqlQuery: jest.fn(),
    where: jest.fn(),
    and: jest.fn(),
    or: jest.fn(),
    notEq: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: sms-parser-orchestrator (parseSmsWithOrchestrator)
// ---------------------------------------------------------------------------

type MockParserResult = AiParseResult | SmsParserOrchestratorResult;

const mockParseSmsWithOrchestrator = jest.fn<
  Promise<MockParserResult>,
  unknown[]
>(() => Promise.resolve({ transactions: [] }));
const mockInitializeSmsParserScanSession = jest.fn<
  Promise<(() => Promise<void>) | undefined>,
  unknown[]
>(() => Promise.resolve(undefined));
const mockGetTrustedPrefilterDisposition = jest.fn<string, [unknown]>(
  () => "not_trusted_candidate"
);

function mockWithParserDiagnostics(
  result: MockParserResult
): SmsParserOrchestratorResult {
  const resultWithDiagnostics = result as SmsParserOrchestratorResult;
  return {
    ...result,
    transactions: result.transactions,
    unresolvedCandidates: resultWithDiagnostics.unresolvedCandidates ?? [],
    safeguardSummary: resultWithDiagnostics.safeguardSummary ?? {
      admittedAiCount: 0,
      deferredAiCount: 0,
      oversizedCount: 0,
      unresolvedCount: resultWithDiagnostics.unresolvedCandidates?.length ?? 0,
      completionStatus:
        (resultWithDiagnostics.unresolvedCandidates?.length ?? 0) > 0
          ? "partial"
          : "complete",
    },
    diagnostics: resultWithDiagnostics.diagnostics ?? {
      mode: "ai-primary",
      attemptedAi: true,
      attemptedLocal: false,
      candidateCount: 0,
      resultCount: result.transactions.length,
      matchedPatternIds: [],
      runtimeScopeCounts: {},
    },
  };
}

jest.mock("@/services/sms-parser-orchestrator", () => ({
  initializeSmsParserScanSession: (
    ...args: unknown[]
  ): Promise<(() => Promise<void>) | undefined> =>
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

// ---------------------------------------------------------------------------
// Mock: @monyvi/db (database)
// ---------------------------------------------------------------------------

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn().mockReturnValue({
      query: jest.fn().mockReturnValue({
        unsafeFetchRaw: jest.fn().mockResolvedValue([]),
        fetch: jest.fn().mockResolvedValue([]),
      }),
    }),
  },
  Transaction: {},
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      userId: "user-a",
      queryOwned: (
        collection: {
          query: (...conditions: readonly unknown[]) => {
            unsafeFetchRaw: jest.Mock<Promise<readonly unknown[]>, []>;
            fetch: jest.Mock<Promise<readonly unknown[]>, []>;
          };
        },
        ...conditions: unknown[]
      ): {
        unsafeFetchRaw: jest.Mock<Promise<readonly unknown[]>, []>;
        fetch: jest.Mock<Promise<readonly unknown[]>, []>;
      } => collection.query(...conditions),
    })
  ),
  assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import {
  scanAndParseSms,
  cleanupStaleScanState,
  type SmsScanProgress,
} from "@/services/sms-sync-service";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createSmsMessage(overrides: Partial<SmsMessage> = {}): SmsMessage {
  return {
    id: `sms-${Date.now()}-${Math.random()}`,
    address: "NBE",
    body: "Purchase of EGP 100.00 at TestShop on card ending 1234",
    date: Date.now(),
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
    date: new Date(),
    smsFingerprint: "",
    senderDisplayName: "NBE",
    categoryId: "cat-bank-fees-id",
    categoryDisplayName: "bank_fees",
    rawSmsBody: "Purchase of EGP 100.00 at TestShop",
    confidence: 0.85,
    source: "SMS",
    originLabel: "NBE",
    ...overrides,
  };
}

/** Stub ParseSmsContext for tests — minimal valid context */
const stubAiContext: ParseSmsContext = {
  categories: [],
  supportedCurrencies: ["EGP"],
};

/** Default ScanOptions with required aiContext */
function defaultOptions(overrides: Record<string, unknown> = {}): {
  aiContext: ParseSmsContext;
  scanKind: "initial" | "incremental" | "history";
  [key: string]: unknown;
} {
  return { aiContext: stubAiContext, scanKind: "initial", ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sms-sync-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSmsInbox.mockResolvedValue([]);
    mockIsKnownFinancialSender.mockReturnValue(true);
    mockIsLikelyCorruptedSmsText.mockReturnValue(false);
    mockIsExcludedBeforeSmsParsing.mockReturnValue(false);
    mockComputeSmsFingerprint.mockImplementation((input: SmsFingerprintInput) =>
      Promise.resolve(
        `hash-${input.sender}-${input.receivedAtMs}-${input.body.slice(0, 10)}`
      )
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
  });

  // =========================================================================
  // scanAndParseSms — Core Pipeline
  // =========================================================================
  describe("scanAndParseSms", () => {
    it("should return empty result for an empty inbox", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toHaveLength(0);
      expect(result.totalScanned).toBe(0);
      expect(result.totalFound).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("pins the initiating user through batch parser requests", async () => {
      await scanAndParseSms(defaultOptions());

      expect(mockParseSmsWithOrchestrator).toHaveBeenCalledWith(
        [],
        stubAiContext,
        expect.any(Function),
        undefined,
        expect.objectContaining({ expectedUserId: "user-a" })
      );
    });

    it("carries a deferred scan-session recovery guard into remote parsing", async () => {
      const ensureRemoteScanSession = jest.fn<Promise<void>, []>(() =>
        Promise.resolve()
      );
      mockInitializeSmsParserScanSession.mockResolvedValueOnce(
        ensureRemoteScanSession
      );

      await scanAndParseSms(defaultOptions());

      expect(mockParseSmsWithOrchestrator).toHaveBeenCalledWith(
        [],
        stubAiContext,
        expect.any(Function),
        undefined,
        expect.objectContaining({ ensureRemoteScanSession })
      );
    });

    it("aborts before parsing when the authenticated user changes", async () => {
      const userDataAccessMock = jest.requireMock<{
        assertExpectedCurrentUser: jest.Mock;
      }>("@/services/user-data-access");
      userDataAccessMock.assertExpectedCurrentUser.mockRejectedValueOnce(
        new Error("AUTH_SCOPE_CHANGED")
      );

      await expect(scanAndParseSms(defaultOptions())).rejects.toThrow(
        "AUTH_SCOPE_CHANGED"
      );

      expect(mockParseSmsWithOrchestrator).not.toHaveBeenCalled();
    });

    it("should parse financial SMS and include in results", async () => {
      const sms1 = createSmsMessage({
        body: "Purchase of EGP 100.00 at Carrefour",
      });
      const sms2 = createSmsMessage({
        address: "VF",
        body: "Sent EGP 500 to 01012345678",
      });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      const parsed1 = createParsedTransaction({
        amount: 100,
        counterparty: "Carrefour",
        rawSmsBody: sms1.body,
        smsFingerprint: "hash-carrefour",
        deduplicationHash: "hash-carrefour",
      });
      const parsed2 = createParsedTransaction({
        amount: 500,
        type: "EXPENSE",
        senderDisplayName: "VF",
        rawSmsBody: sms2.body,
        smsFingerprint: "hash-vf",
        deduplicationHash: "hash-vf",
      });
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed1, parsed2],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.totalScanned).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.transactions).toHaveLength(2);
    });

    it("preserves successful transactions and retryable unresolved candidates", async () => {
      const sms = createSmsMessage({ id: "sms-partial" });
      const parsed = createParsedTransaction({ smsFingerprint: "parsed-fp" });
      const pendingCandidate = {
        message: sms,
        smsFingerprint: "pending-fp",
      };
      mockReadSmsInbox.mockResolvedValue([sms]);
      const orchestratorResult: SmsParserOrchestratorResult = {
        transactions: [parsed],
        hasError: true,
        isRetryable: true,
        unresolvedCandidates: [
          {
            candidate: pendingCandidate,
            reason: "chunk_failed",
            isRetryable: true,
          },
        ],
        diagnostics: {
          mode: "hybrid",
          attemptedAi: true,
          attemptedLocal: true,
          candidateCount: 2,
          resultCount: 1,
          matchedPatternIds: ["qnb-egypt-card-purchase-egp-v1"],
          runtimeScopeCounts: { trusted_production: 1 },
        },
        safeguardSummary: {
          admittedAiCount: 1,
          deferredAiCount: 1,
          oversizedCount: 0,
          unresolvedCount: 1,
          completionStatus: "partial",
          availability: {
            reason: "rolling_limit",
            availableAt: "2026-07-21T10:00:00.000Z",
          },
        },
      };
      mockParseSmsWithOrchestrator.mockResolvedValue(orchestratorResult);

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toEqual([parsed]);
      expect(result.unresolvedCandidates).toEqual([
        {
          candidate: pendingCandidate,
          reason: "chunk_failed",
          isRetryable: true,
        },
      ]);
      expect(result.parseContext).toBe(stubAiContext);
      expect(result.parserDiagnostics.mode).toBe("hybrid");
      expect(result.safeguardSummary).toEqual(
        orchestratorResult.safeguardSummary
      );
    });

    it("preserves retryable incomplete results as a partial scan", async () => {
      const sms = createSmsMessage({ id: "sms-retryable-failure" });
      const unresolvedCandidate = {
        candidate: { message: sms, smsFingerprint: "retryable-fp" },
        reason: "chunk_failed" as const,
        isRetryable: true,
      };
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [],
        hasError: true,
        isRetryable: true,
        unresolvedCandidates: [unresolvedCandidate],
      });

      const onProgress = jest.fn<void, [SmsScanProgress]>();
      const result = await scanAndParseSms(defaultOptions(), onProgress);

      expect(result.transactions).toEqual([]);
      expect(result.unresolvedCandidates).toEqual([unresolvedCandidate]);
      expect(result.safeguardSummary).toMatchObject({
        unresolvedCount: 1,
        completionStatus: "partial",
      });
      expect(
        onProgress.mock.calls.some(
          ([progress]) => progress.currentPhase === "complete"
        )
      ).toBe(true);
    });

    it("preserves successful transactions from a mixed non-retryable parser result", async () => {
      const sms = createSmsMessage({ id: "sms-permanent-partial" });
      const parsed = createParsedTransaction();
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed],
        hasError: true,
        isRetryable: false,
        unresolvedCandidates: [
          {
            candidate: { message: sms, smsFingerprint: "permanent-fp" },
            reason: "chunk_failed",
            isRetryable: false,
          },
        ],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toEqual([parsed]);
      expect(result.unresolvedCandidates).toEqual([
        expect.objectContaining({
          reason: "chunk_failed",
          isRetryable: false,
        }),
      ]);
    });

    it("routes an exact trusted transaction before legacy OTP filtering", async () => {
      const sms = createSmsMessage({
        id: "sms-trusted-purchase",
        address: "QNB EGYPT",
        body: "Your Debit Card **2132 had a Successful transaction of EGP 490.00 @OTP STORE,your available bal.EGP10853.15 for lost/stolen card call 19700",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockGetTrustedPrefilterDisposition.mockReturnValueOnce("route_to_parser");

      await scanAndParseSms(defaultOptions());

      const candidates = mockParseSmsWithOrchestrator.mock.calls[0]?.[0] as
        | readonly SmsCandidate[]
        | undefined;
      expect(candidates).toHaveLength(1);
      expect(candidates?.[0]?.message.id).toBe("sms-trusted-purchase");
    });

    it("routes an exact trusted OTP rejection through the catalog", async () => {
      const sms = createSmsMessage({
        id: "sms-trusted-otp",
        address: "QNB EGYPT",
        body: "QNB OTP:369154 at Orange for EGP 1572 الرقم السرى مخصص لعملية الشراء اونلاين برجاء عدم الافصاح عنه",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockGetTrustedPrefilterDisposition.mockReturnValueOnce("route_to_parser");

      await scanAndParseSms(defaultOptions());

      const candidates = mockParseSmsWithOrchestrator.mock.calls[0]?.[0] as
        | readonly SmsCandidate[]
        | undefined;
      expect(candidates).toHaveLength(1);
      expect(candidates?.[0]?.message.id).toBe("sms-trusted-otp");
    });

    it("filters an exact trusted rejection before AI when hybrid is disabled", async () => {
      const sms = createSmsMessage({
        id: "sms-trusted-promotion",
        address: "QNB ALAHLI",
        body: "trusted promotional template",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockGetTrustedPrefilterDisposition.mockReturnValueOnce(
        "filter_before_ai"
      );

      await scanAndParseSms(defaultOptions());

      const candidates = mockParseSmsWithOrchestrator.mock.calls[0]?.[0] as
        | readonly SmsCandidate[]
        | undefined;
      expect(candidates).toEqual([]);
    });

    it("hard-excludes configured Arabic phrases before trusted or AI parsing", async () => {
      const excluded = createSmsMessage({
        id: "sms-hard-excluded",
        address: "QNB EGYPT",
        body: "اكسب كاش باك بقيمة EGP 125.50",
      });
      const eligible = createSmsMessage({ id: "sms-eligible" });
      mockReadSmsInbox.mockResolvedValue([excluded, eligible]);
      mockIsExcludedBeforeSmsParsing.mockImplementation(
        (body) => body === excluded.body
      );

      await scanAndParseSms(defaultOptions());

      const candidates = mockParseSmsWithOrchestrator.mock.calls[0]?.[0] as
        | readonly SmsCandidate[]
        | undefined;
      expect(candidates?.map(({ message }) => message.id)).toEqual([
        "sms-eligible",
      ]);
      // Local-only fingerprinting is required so an excluded message can form
      // part of a durable checkpoint without exposing or parsing its body.
      expect(mockComputeSmsFingerprint).toHaveBeenCalledTimes(2);
      expect(mockGetTrustedPrefilterDisposition).toHaveBeenCalledTimes(1);
    });

    it("should stop when local parser mode is blocked by AI transaction suggestions", async () => {
      mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [],
        hasError: true,
        isRetryable: false,
      });

      await expect(scanAndParseSms(defaultOptions())).rejects.toThrow(
        "SMS AI parsing failed"
      );
    });

    it("should skip SMS from non-financial senders", async () => {
      const financial = createSmsMessage({
        address: "NBE",
        body: "Purchase of EGP 200 at Shop",
      });
      const promo = createSmsMessage({
        address: "UNKNOWN",
        body: "Click here for a special offer!",
      });
      mockReadSmsInbox.mockResolvedValue([financial, promo]);

      // Only NBE is a known financial sender
      mockIsKnownFinancialSender
        .mockReturnValueOnce(true) // financial → passes filter
        .mockReturnValueOnce(false); // promo → filtered out

      const parsed = createParsedTransaction({ amount: 200 });
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.totalScanned).toBe(2);
      expect(result.totalFound).toBe(1);
      expect(result.transactions).toHaveLength(1);
    });

    it("does not send a garbled known-sender SMS to the parser", async () => {
      const garbled = createSmsMessage({
        address: "QNB ALAHLI",
        body: "??? QNB ?????? ???? 13.5% ??? 1000EGP ???????",
      });
      mockReadSmsInbox.mockResolvedValue([garbled]);
      mockIsLikelyCorruptedSmsText.mockReturnValueOnce(true);

      const result = await scanAndParseSms(defaultOptions());

      expect(mockIsLikelyCorruptedSmsText).toHaveBeenCalledWith(garbled.body);
      expect(mockComputeSmsFingerprint).toHaveBeenCalledTimes(1);
      expect(mockParseSmsWithOrchestrator).toHaveBeenCalledWith(
        [],
        stubAiContext,
        expect.any(Function),
        undefined,
        expect.objectContaining({ expectedUserId: "user-a" })
      );
      expect(result.totalFound).toBe(0);
    });

    it("should deduplicate against existing fingerprints", async () => {
      const sms1 = createSmsMessage({ body: "Debit EGP 100" });
      const sms2 = createSmsMessage({ body: "Debit EGP 200" });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      // Fingerprint for sms1 matches an existing fingerprint.
      mockComputeSmsFingerprint
        .mockResolvedValueOnce("existing-hash-1")
        .mockResolvedValueOnce("new-hash-2");

      const existingFingerprints = new Set(["existing-hash-1"]);

      // Only sms2 should reach AI (sms1 was deduped)
      const parsed = createParsedTransaction({ amount: 200 });
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed],
      });

      const result = await scanAndParseSms(
        defaultOptions({ existingFingerprints })
      );

      // Only 1 candidate should have been sent to AI
      expect(mockParseSmsWithOrchestrator).toHaveBeenCalledTimes(1);
      expect(result.totalFound).toBe(1);
      expect(result.transactions).toHaveLength(1);
    });

    it("includes sender, body, and received timestamp when fingerprinting SMS", async () => {
      jest.spyOn(Date, "now").mockReturnValue(1778418000000 + 86_400_000);
      const sms1 = createSmsMessage({
        id: "sms-1",
        address: "NBE",
        body: "Debit EGP 100 at Shop",
        date: 1778414400000,
      });
      const sms2 = createSmsMessage({
        id: "sms-2",
        address: "NBE",
        body: "Debit EGP 100 at Shop",
        date: 1778418000000,
      });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      await scanAndParseSms(defaultOptions());

      expect(mockComputeSmsFingerprint).toHaveBeenNthCalledWith(1, {
        sender: "NBE",
        body: "Debit EGP 100 at Shop",
        receivedAtMs: 1778414400000,
      });
      expect(mockComputeSmsFingerprint).toHaveBeenNthCalledWith(2, {
        sender: "NBE",
        body: "Debit EGP 100 at Shop",
        receivedAtMs: 1778418000000,
      });

      const candidates = mockParseSmsWithOrchestrator.mock.calls[0]?.[0] as
        | ReadonlyArray<{ readonly smsFingerprint: string }>
        | undefined;

      expect(candidates).toHaveLength(2);
      expect(candidates?.map((candidate) => candidate.smsFingerprint)).toEqual([
        "hash-NBE-1778414400000-Debit EGP ",
        "hash-NBE-1778418000000-Debit EGP ",
      ]);
    });

    it("should deduplicate duplicate fingerprints within the same scan before AI parsing", async () => {
      const sms1 = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      const sms2 = createSmsMessage({
        id: "sms-2",
        body: "Debit EGP 100 at Shop",
      });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);
      mockComputeSmsFingerprint.mockResolvedValue("same-sms-hash");

      await scanAndParseSms(defaultOptions());

      const candidates = mockParseSmsWithOrchestrator.mock.calls[0]?.[0] as
        | ReadonlyArray<{ readonly smsFingerprint: string }>
        | undefined;

      expect(candidates).toHaveLength(1);
      expect(candidates?.[0]?.smsFingerprint).toBe("same-sms-hash");
    });

    it("does not send SMS candidates to AI when the scan is aborted first", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      const abortController = new AbortController();
      mockReadSmsInbox.mockResolvedValue([sms]);
      abortController.abort();

      await expect(
        scanAndParseSms(defaultOptions({ abortSignal: abortController.signal }))
      ).rejects.toThrow("SMS scan aborted");

      expect(mockReadSmsInbox).not.toHaveBeenCalled();
      expect(mockParseSmsWithOrchestrator).not.toHaveBeenCalled();
    });

    it("stops fingerprinting a large inbox after the active bounded batch is aborted", async () => {
      const abortController = new AbortController();
      const messages = Array.from({ length: 60 }, (_, index) =>
        createSmsMessage({
          id: `sms-${index}`,
          body: `Debit EGP ${index + 1} at Shop`,
        })
      );
      mockReadSmsInbox.mockResolvedValue(messages);
      mockComputeSmsFingerprint.mockImplementation((input) => {
        abortController.abort();
        return Promise.resolve(`hash-${input.receivedAtMs}`);
      });

      await expect(
        scanAndParseSms(
          defaultOptions({ abortSignal: abortController.signal, batchSize: 10 })
        )
      ).rejects.toThrow("SMS scan aborted");

      expect(mockComputeSmsFingerprint).toHaveBeenCalledTimes(10);
      expect(mockParseSmsWithOrchestrator).not.toHaveBeenCalled();
    });

    it("does not complete the scan when AI parsing returns a non-retryable error", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [],
        hasError: true,
        isRetryable: false,
      });

      const onProgress = jest.fn();
      await expect(
        scanAndParseSms(defaultOptions(), onProgress)
      ).rejects.toThrow("SMS AI parsing failed");

      expect(
        onProgress.mock.calls.some(
          (call: [Record<string, unknown>]) =>
            call[0].currentPhase === "complete"
        )
      ).toBe(false);
    });

    it("should deduplicate exact duplicate AI results before review", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockComputeSmsFingerprint.mockResolvedValue("same-sms-hash");

      const parsed = createParsedTransaction({
        amount: 100,
        smsFingerprint: "same-sms-hash",
        deduplicationHash: "same-sms-hash",
      });
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed, parsed],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toHaveLength(1);
      expect(result.totalFound).toBe(1);
      expect(result.transactions[0]?.counterparty).toBe("TestShop");
    });

    it("should keep at most one AI result for each SMS fingerprint", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop plus EGP 5 fee",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockComputeSmsFingerprint.mockResolvedValue("same-sms-hash");

      const purchase = createParsedTransaction({
        amount: 100,
        counterparty: "Shop",
        smsFingerprint: "same-sms-hash",
        deduplicationHash: "same-sms-hash",
      });
      const fee = createParsedTransaction({
        amount: 5,
        counterparty: "Card fee",
        smsFingerprint: "same-sms-hash",
        deduplicationHash: "same-sms-hash",
      });
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [purchase, fee],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toHaveLength(1);
      expect(result.totalFound).toBe(1);
      expect(
        result.transactions.map((transaction) => transaction.amount)
      ).toEqual([100]);
    });

    it("loads current-user fingerprints when existing fingerprints are not supplied", async () => {
      const userDataAccessMock = jest.requireMock<{
        getCurrentUserDataScope: jest.Mock;
      }>("@/services/user-data-access");
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      expect(userDataAccessMock.getCurrentUserDataScope).toHaveBeenCalledTimes(
        1
      );
    });

    it("should use default maxCount (2000) when not specified", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      expect(mockReadSmsInbox).toHaveBeenCalledWith(
        expect.objectContaining({ maxCount: 2000 })
      );
    });
  });

  // =========================================================================
  // scanAndParseSms — Progress Callback
  // =========================================================================
  describe("progress callback", () => {
    it("should invoke onProgress after each batch", async () => {
      // Create 3 SMS; batchSize=2 → 2 filtering progress calls + ai-parsing + complete
      const messages = [
        createSmsMessage({ body: "SMS 1" }),
        createSmsMessage({ body: "SMS 2" }),
        createSmsMessage({ body: "SMS 3" }),
      ];
      mockReadSmsInbox.mockResolvedValue(messages);

      const onProgress = jest.fn();
      await scanAndParseSms(defaultOptions({ batchSize: 2 }), onProgress);

      // At minimum: 2 filtering batches + 1 ai-parsing start + 1 complete
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("should report accurate progress values", async () => {
      const sms1 = createSmsMessage({
        address: "NBE",
        body: "Purchase EGP 100 at Shop",
      });
      const sms2 = createSmsMessage({ address: "CIB", body: "Random promo" });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      const parsed = createParsedTransaction({ amount: 100 });
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed],
      });

      const onProgress = jest.fn();
      await scanAndParseSms(defaultOptions({ batchSize: 2 }), onProgress);

      // The "complete" phase should report transactionsFound = 1
      const completeCalls = onProgress.mock.calls.filter(
        (call: [Record<string, unknown>]) => call[0].currentPhase === "complete"
      ) as Array<[Record<string, unknown>]>;
      expect(completeCalls.length).toBeGreaterThanOrEqual(1);
      expect(completeCalls[0][0]).toEqual(
        expect.objectContaining({
          totalMessages: 2,
          messagesScanned: 2,
          transactionsFound: 1,
        })
      );
    });

    it("should not throw if onProgress is undefined", async () => {
      mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);

      await expect(scanAndParseSms(defaultOptions())).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // scanAndParseSms — UI Thread Yielding
  // =========================================================================
  describe("UI thread yielding", () => {
    it("should yield to InteractionManager after yieldInterval batches", async () => {
      const { InteractionManager } = jest.requireMock<{
        InteractionManager: { runAfterInteractions: jest.Mock };
      }>("react-native");

      // 6 messages, batchSize=1, yieldInterval=2 → yield at batch 2, 4, 6
      const messages = Array.from({ length: 6 }, (_, i) =>
        createSmsMessage({ body: `SMS ${i}` })
      );
      mockReadSmsInbox.mockResolvedValue(messages);

      await scanAndParseSms(defaultOptions({ batchSize: 1, yieldInterval: 2 }));

      expect(InteractionManager.runAfterInteractions).toHaveBeenCalledTimes(8);
    });
  });

  // =========================================================================
  // scanAndParseSms — Scan Guard (AsyncStorage flag)
  // =========================================================================
  describe("scan guard", () => {
    it("should set scan-in-progress flag before scanning", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      const { setItem } = getAsyncStorageMocks();
      expect(setItem).toHaveBeenCalledWith(
        "@monyvi/sms_scan_in_progress",
        "true"
      );
    });

    it("should clear scan-in-progress flag after successful scan", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      const { removeItem } = getAsyncStorageMocks();
      expect(removeItem).toHaveBeenCalledWith("@monyvi/sms_scan_in_progress");
    });

    it("should clear scan-in-progress flag even if scan throws", async () => {
      mockReadSmsInbox.mockRejectedValue(new Error("SMS read failed"));

      await expect(scanAndParseSms(defaultOptions())).rejects.toThrow(
        "SMS read failed"
      );

      const { removeItem } = getAsyncStorageMocks();
      expect(removeItem).toHaveBeenCalledWith("@monyvi/sms_scan_in_progress");
    });
  });

  // =========================================================================
  // cleanupStaleScanState
  // =========================================================================
  describe("cleanupStaleScanState", () => {
    it("should return true and remove flag when stale state exists", async () => {
      const { getItem, removeItem } = getAsyncStorageMocks();
      getItem.mockResolvedValueOnce("true");

      const wasStale = await cleanupStaleScanState();

      expect(wasStale).toBe(true);
      expect(removeItem).toHaveBeenCalledWith("@monyvi/sms_scan_in_progress");
    });

    it("should return false when no stale state", async () => {
      const { getItem, removeItem } = getAsyncStorageMocks();
      getItem.mockResolvedValueOnce(null);

      const wasStale = await cleanupStaleScanState();

      expect(wasStale).toBe(false);
      expect(removeItem).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // scanAndParseSms — Result Shape
  // =========================================================================
  describe("result shape", () => {
    it("should return readonly transactions array", async () => {
      const parsed = createParsedTransaction();
      mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
      mockParseSmsWithOrchestrator.mockResolvedValue({
        transactions: [parsed],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(Array.isArray(result.transactions)).toBe(true);
      expect(typeof result.totalScanned).toBe("number");
      expect(typeof result.totalFound).toBe("number");
      expect(typeof result.durationMs).toBe("number");
    });

    it("should measure duration in milliseconds", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      const result = await scanAndParseSms(defaultOptions());

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(5000); // sanity bound
    });
  });
});
