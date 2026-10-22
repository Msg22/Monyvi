import { act, renderHook } from "@testing-library/react-native";
import { useSmsScan } from "@/hooks/useSmsScan";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";
import type {
  SmsParserDiagnostics,
  SmsScanSafeguardSummary,
} from "@/services/sms-parser-result-contract";
import type { AccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";
import type {
  SmsScanProgress,
  SmsScanResult,
} from "@/services/sms-sync-service";

const mockScanAndParseSms = jest.fn<
  Promise<SmsScanResult>,
  [
    {
      readonly scanKind: string;
      readonly aiContext: ParseSmsContext;
      readonly abortSignal?: AbortSignal;
    },
    ((progress: SmsScanProgress) => void)?,
  ]
>();
const mockLoggerError = jest.fn();
const mockLoadAccountReviewAccountSnapshots = jest.fn<
  Promise<AccountReviewAccountSnapshots>,
  []
>();

jest.mock("@/services/sms-sync-service", () => ({
  scanAndParseSms: (
    options: {
      readonly scanKind: string;
      readonly aiContext: ParseSmsContext;
      readonly abortSignal?: AbortSignal;
    },
    onProgress?: (progress: SmsScanProgress) => void
  ): Promise<SmsScanResult> => mockScanAndParseSms(options, onProgress),
}));

jest.mock("@/services/ai-sms-parser-service", () => ({
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

jest.mock("@/services/authenticated-edge-function-service", () => ({
  isEdgeFunctionAuthenticationError: (error: unknown): boolean =>
    error instanceof Error &&
    error.name === "EdgeFunctionAuthenticationRequiredError",
}));

jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots:
    (): Promise<AccountReviewAccountSnapshots> =>
      mockLoadAccountReviewAccountSnapshots(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const canonicalReviewAccountSnapshots: AccountReviewAccountSnapshots = {
  ownerId: "user-1",
  preferredCurrency: "EGP",
  accounts: [
    {
      id: "acc-cib-1",
      name: "CIB Current",
      currency: "EGP",
      type: "BANK",
      institutionId: "cib",
      providerDisplayName: "CIB Egypt",
      cardLast4: "5678",
      senderNames: ["CIB"],
      isDefault: true,
    },
  ],
  providerContext: {
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [
      {
        id: "acc-cib-1",
        name: "CIB Current",
        currency: "EGP",
        type: "BANK",
        institutionId: "cib",
        providerDisplayName: "CIB Egypt",
        cardLast4: "5678",
        senderNames: ["CIB"],
      },
    ],
  },
};

/** Ordinary route context produced by app/(private)/sms-scan.tsx line 286 */
const ordinaryRouteAiContext: ParseSmsContext = {
  categories: [
    {
      id: "cat-groceries",
      displayName: "Groceries",
      systemName: "groceries",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
      isHidden: false,
      isInternal: false,
      deleted: false,
    },
  ],
  supportedCurrencies: ["EGP", "USD"],
  // reviewAccountSnapshots is omitted in ordinary route context
};

/** Match the full production scan-result contract rather than null placeholders. */
const completedParserDiagnostics: SmsParserDiagnostics = {
  mode: "hybrid",
  attemptedAi: false,
  attemptedLocal: true,
  candidateCount: 0,
  resultCount: 0,
  matchedPatternIds: [],
  runtimeScopeCounts: {},
};
const completedSafeguardSummary: SmsScanSafeguardSummary = {
  admittedAiCount: 0,
  deferredAiCount: 0,
  oversizedCount: 0,
  unresolvedCount: 0,
  completionStatus: "complete",
};
const enrichedRouteAiContext: ParseSmsContext = {
  ...ordinaryRouteAiContext,
  reviewAccountSnapshots: canonicalReviewAccountSnapshots,
};
const emptyScanResult: SmsScanResult = {
  transactions: [],
  totalScanned: 5,
  totalFound: 0,
  totalFilteredCandidates: 0,
  durationMs: 0,
  unresolvedCandidates: [],
  parseContext: enrichedRouteAiContext,
  parserDiagnostics: completedParserDiagnostics,
  safeguardSummary: completedSafeguardSummary,
  initiatingUserId: canonicalReviewAccountSnapshots.ownerId,
};

describe("sms-review production wiring regressions (#395 F3)", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockLoadAccountReviewAccountSnapshots
      .mockReset()
      .mockResolvedValue(canonicalReviewAccountSnapshots);
    mockScanAndParseSms.mockReset().mockResolvedValue(emptyScanResult);
  });

  describe("F3.1: Ordinary route context is enriched with canonical reviewAccountSnapshots", () => {
    it("enriches scan context with owned reviewAccountSnapshots before invoking scanAndParseSms", async (): Promise<void> => {
      const { result } = renderHook(() => useSmsScan());

      await act(async (): Promise<void> => {
        await result.current.startScan({
          scanKind: "initial",
          aiContext: ordinaryRouteAiContext,
        });
      });

      // Regression F3: In current production, useSmsScan forwards aiContext unchanged.
      // Because ordinaryRouteAiContext omits reviewAccountSnapshots,
      // sms-review-namespace-session-service line 129 sees !snapshots and bypasses V2.
      // Under #395, useSmsScan.startScan must enrich aiContext with canonical
      // loadAccountReviewAccountSnapshots() to enable V2 review drafts.
      expect(mockScanAndParseSms).toHaveBeenCalledTimes(1);
      const scanInvocation = mockScanAndParseSms.mock.calls[0]?.[0];

      expect(scanInvocation?.aiContext.reviewAccountSnapshots).toBeDefined();
      expect(scanInvocation?.aiContext.reviewAccountSnapshots).toEqual(
        canonicalReviewAccountSnapshots
      );
      expect(scanInvocation?.aiContext.categories).toEqual(
        ordinaryRouteAiContext.categories
      );
      expect(scanInvocation?.aiContext.supportedCurrencies).toEqual(
        ordinaryRouteAiContext.supportedCurrencies
      );
    });
  });

  describe("F3.2: Pipeline options and progress callbacks are preserved during enrichment", () => {
    it("preserves scanKind, abortSignal, and progress reporting alongside enriched context", async (): Promise<void> => {
      const abortController = new AbortController();
      let capturedProgressCall = false;

      mockScanAndParseSms.mockImplementation(
        (
          _options: {
            readonly scanKind: string;
            readonly aiContext: ParseSmsContext;
            readonly abortSignal?: AbortSignal;
          },
          onProgress?: (p: SmsScanProgress) => void
        ): Promise<SmsScanResult> => {
          onProgress?.({
            totalMessages: 10,
            messagesScanned: 5,
            transactionsFound: 1,
            candidatesFound: 2,
            currentPhase: "filtering",
            currentSender: "CIB",
            scanStartedAt: Date.now(),
          });
          capturedProgressCall = true;
          const completedScan: SmsScanResult = {
            ...emptyScanResult,
            transactions: [
              {
                amount: 250,
                currency: "EGP",
                type: "EXPENSE",
                categoryId: "cat-groceries",
                categoryDisplayName: "Groceries",
                confidence: 0.98,
                originLabel: "CIB",
                source: "SMS",
                senderDisplayName: "CIB",
                rawSmsBody: "CIB purchase EGP 250 at Groceries",
                date: new Date("2026-10-18T08:00:00Z"),
                smsFingerprint: "fp-cib-250",
              },
            ],
            totalScanned: 10,
            totalFound: 1,
            totalFilteredCandidates: 2,
            durationMs: 150,
            parserDiagnostics: {
              ...completedParserDiagnostics,
              attemptedAi: true,
              candidateCount: 2,
              resultCount: 1,
            },
            safeguardSummary: {
              ...completedSafeguardSummary,
              admittedAiCount: 1,
            },
          };
          return Promise.resolve(completedScan);
        }
      );

      const { result } = renderHook(() => useSmsScan());

      await act(async (): Promise<void> => {
        await result.current.startScan({
          scanKind: "incremental",
          aiContext: ordinaryRouteAiContext,
          abortSignal: abortController.signal,
        });
      });

      expect(mockScanAndParseSms).toHaveBeenCalledTimes(1);
      const passedOptions = mockScanAndParseSms.mock.calls[0]?.[0];

      expect(passedOptions?.scanKind).toBe("incremental");
      expect(passedOptions?.abortSignal).toBe(abortController.signal);
      expect(passedOptions?.aiContext.reviewAccountSnapshots).toEqual(
        canonicalReviewAccountSnapshots
      );
      expect(capturedProgressCall).toBe(true);
      expect(result.current.status).toBe("complete");
      expect(result.current.transactions).toHaveLength(1);
    });
  });

  describe("F3.3: Owner scope change fails closed safely", () => {
    it("fails closed without dispatching scan when account snapshot loader throws auth scope mismatch", async (): Promise<void> => {
      mockLoadAccountReviewAccountSnapshots.mockRejectedValueOnce(
        new Error("ACCOUNT_REVIEW_ACCOUNT_OWNER_MISMATCH")
      );

      const { result } = renderHook(() => useSmsScan());

      await act(async (): Promise<void> => {
        await result.current.startScan({
          scanKind: "initial",
          aiContext: ordinaryRouteAiContext,
        });
      });

      // If owner verification or snapshot loading fails, scan must NOT dispatch
      // unverified candidates to scanAndParseSms.
      expect(mockScanAndParseSms).not.toHaveBeenCalled();
      expect(result.current.status).toBe("error");
    });
  });

  describe("F3.4: Cancellation safety", () => {
    it("treats external boundary AbortError as cancellation instead of failure", async (): Promise<void> => {
      const abortError = new Error("SMS scan aborted");
      abortError.name = "AbortError";
      mockScanAndParseSms.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useSmsScan());

      await act(async (): Promise<void> => {
        await result.current.startScan({
          scanKind: "initial",
          aiContext: ordinaryRouteAiContext,
        });
      });

      expect(mockLoggerError).not.toHaveBeenCalled();
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
    });

    it("does not dispatch scan when abortSignal is pre-aborted", async (): Promise<void> => {
      const abortController = new AbortController();
      abortController.abort();

      const { result } = renderHook(() => useSmsScan());

      await act(async (): Promise<void> => {
        await result.current.startScan({
          scanKind: "initial",
          aiContext: ordinaryRouteAiContext,
          abortSignal: abortController.signal,
        });
      });

      // Hook should acknowledge pre-aborted signal and reset cleanly without calling service
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
    });
  });
});
