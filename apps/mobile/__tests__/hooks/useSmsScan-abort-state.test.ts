/** P2: a pre-aborted second SMS scan must retire a prior completed hook
 * result before any new scan or account-snapshot loading is dispatched.
 * Use the real hook and its React state transitions; mock service boundaries.
 */
import { act, renderHook } from "@testing-library/react-native";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { useSmsScan } from "@/hooks/useSmsScan";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";
import type { AccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";
import type { logger } from "@/utils/logger";
import type {
  ScanOptions,
  SmsScanProgress,
  SmsScanResult,
} from "@/services/sms-sync-service";

const mockScanAndParseSms = jest.fn<
  Promise<SmsScanResult>,
  [options: ScanOptions, onProgress?: (progress: SmsScanProgress) => void]
>();
const mockLoadAccountReviewAccountSnapshots = jest.fn<
  Promise<AccountReviewAccountSnapshots>,
  []
>();
type LoggerError = typeof logger.error;
const mockLoggerError = jest.fn<
  ReturnType<LoggerError>,
  Parameters<LoggerError>
>();

jest.mock("@/services/sms-sync-service", () => ({
  scanAndParseSms: (
    options: ScanOptions,
    onProgress?: (progress: SmsScanProgress) => void
  ): Promise<SmsScanResult> => mockScanAndParseSms(options, onProgress),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots:
    (): Promise<AccountReviewAccountSnapshots> =>
      mockLoadAccountReviewAccountSnapshots(),
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
jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: (...args: Parameters<LoggerError>): ReturnType<LoggerError> => {
      mockLoggerError(...args);
    },
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const aiContext: ParseSmsContext = {
  categories: [],
  supportedCurrencies: ["EGP"],
};
const scanOptions = {
  scanKind: "initial" as const,
  aiContext,
};

const ownedSnapshots: AccountReviewAccountSnapshots = {
  ownerId: "user-a",
  preferredCurrency: "EGP",
  accounts: [],
  providerContext: {
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [],
  },
};
const parsedTransaction: ParsedSmsTransaction = {
  amount: 50,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "Merchant",
  date: new Date("2026-07-20T12:00:00.000Z"),
  categoryId: "category-1",
  categoryDisplayName: "Shopping",
  confidence: 0.98,
  originLabel: "QNB EGYPT",
  source: "SMS",
  smsFingerprint: "scan-fingerprint-1",
  senderDisplayName: "QNB EGYPT",
  rawSmsBody: "Card purchase 50 EGP",
};
const completedProgress: SmsScanProgress = {
  totalMessages: 1,
  messagesScanned: 1,
  transactionsFound: 1,
  candidatesFound: 1,
  currentPhase: "complete",
  currentSender: "",
  scanStartedAt: Date.parse("2026-07-20T12:00:00.000Z"),
};
const completedResult: SmsScanResult = {
  transactions: [parsedTransaction],
  totalScanned: 1,
  totalFound: 1,
  totalFilteredCandidates: 1,
  durationMs: 50,
  unresolvedCandidates: [],
  parseContext: aiContext,
  parserDiagnostics: {
    mode: "ai-primary",
    attemptedAi: true,
    attemptedLocal: false,
    candidateCount: 1,
    resultCount: 1,
    matchedPatternIds: [],
    runtimeScopeCounts: {},
  },
  safeguardSummary: {
    admittedAiCount: 1,
    deferredAiCount: 0,
    oversizedCount: 0,
    unresolvedCount: 0,
    completionStatus: "complete",
  },
  initiatingUserId: "user-a",
};

describe("useSmsScan pre-aborted restart clears prior scan state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadAccountReviewAccountSnapshots.mockResolvedValue(ownedSnapshots);
  });

  it("retires prior result, transactions and progress without a second scan dispatch", async () => {
    mockScanAndParseSms.mockImplementationOnce(
      (_options, onProgress): Promise<SmsScanResult> => {
        onProgress?.(completedProgress);
        return Promise.resolve(completedResult);
      }
    );
    const { result } = renderHook(() => useSmsScan());

    await act(async () => {
      await result.current.startScan(scanOptions);
    });

    // First scan really traversed this hook's progress and completion states.
    expect(mockScanAndParseSms).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("complete");
    expect(result.current.result).toBe(completedResult);
    expect(result.current.transactions).toEqual([parsedTransaction]);
    expect(result.current.progress).toEqual(completedProgress);
    expect(result.current.error).toBeNull();

    const controller = new AbortController();
    controller.abort();
    await act(async () => {
      await result.current.startScan({
        ...scanOptions,
        abortSignal: controller.signal,
      });
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.transactions).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockScanAndParseSms).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
