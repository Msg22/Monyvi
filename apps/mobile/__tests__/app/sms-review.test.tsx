import { act, render, screen } from "@testing-library/react-native";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import React from "react";
import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";

interface MockTransactionReviewProps {
  readonly partialResults: {
    readonly safeguardSummary: SmsScanSafeguardSummary;
    readonly retryableCount: number;
    readonly canRetry: boolean;
    readonly hasRetryError: boolean;
    readonly onRetry: () => void;
  };
  readonly onBack: () => void;
  readonly onDiscard: () => void;
  readonly isSaving: boolean;
  readonly onSave: (
    selected: readonly ParsedSmsTransaction[],
    accountMap: ReadonlyMap<number, string>,
    toAccountMap: ReadonlyMap<number, string>
  ) => Promise<void>;
}

interface MockConfirmationModalProps {
  readonly onConfirm: () => void;
}

interface MockConsentSheetProps {
  readonly visible: boolean;
  readonly onContinue: () => Promise<void>;
  readonly onNotNow: () => void;
  readonly onPrivacyDetails: () => void;
}

const mockClearTransactions = jest.fn();
const mockRetry = jest.fn<Promise<void>, []>();
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockMarkSyncComplete = jest.fn<Promise<void>, []>();
const mockShowToast = jest.fn();
const mockBatchCreateTransactions = jest.fn();
const mockTransactionReview = jest.fn<
  void,
  [props: MockTransactionReviewProps]
>();
const mockConfirmationModal = jest.fn<
  void,
  [props: MockConfirmationModalProps]
>();
const mockConsentSheet = jest.fn<void, [props: MockConsentSheetProps]>();
const mockGrantConsent = jest.fn<Promise<void>, []>();
const mockDismissConsentRequired = jest.fn();
let mockRetryState = {
  unresolvedCount: 2,
  retryableCount: 2,
  isRetrying: false,
  hasRetryError: false,
  isConsentRequired: false,
  dismissConsentRequired: mockDismissConsentRequired,
  retry: mockRetry,
};
const mockSafeguardSummary: SmsScanSafeguardSummary = {
  admittedAiCount: 1,
  deferredAiCount: 1,
  oversizedCount: 0,
  unresolvedCount: 1,
  availability: {
    reason: "scan_limit",
    availableAt: "2026-07-21T16:30:00.000Z",
  },
  completionStatus: "partial",
};
let focusCleanup: (() => void) | undefined;

const mockTransaction: ParsedSmsTransaction = {
  amount: 10,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "QA Merchant",
  date: new Date("2026-07-16T12:00:00Z"),
  categoryId: "category-other",
  categoryDisplayName: "Other",
  confidence: 0.5,
  originLabel: "QNB EGYPT",
  source: "SMS",
  smsFingerprint: "fingerprint-1",
  senderDisplayName: "QNB EGYPT",
  rawSmsBody: "raw",
};
let mockReviewTransactions: readonly ParsedSmsTransaction[] = [mockTransaction];

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | undefined): void => {
    focusCleanup = callback();
  },
  useRouter: () => ({
    back: mockRouterBack,
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    transactions: mockReviewTransactions,
    unresolvedCandidates: mockRetryState.unresolvedCount > 0 ? [{}] : [],
    safeguardSummary: mockSafeguardSummary,
    clearTransactions: mockClearTransactions,
  }),
}));

jest.mock("@/hooks/useSmsReviewRetry", () => ({
  useSmsReviewRetry: () => mockRetryState,
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({ grantConsent: mockGrantConsent }),
}));

jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: (props: MockConsentSheetProps): null => {
    mockConsentSheet(props);
    return null;
  },
}));

jest.mock("@/components/transaction-review/TransactionReview", () => ({
  TransactionReview: (props: MockTransactionReviewProps): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockTransactionReview(props);
    return <ReactNative.View testID="transaction-review" />;
  },
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (props: MockConfirmationModalProps): null => {
    mockConfirmationModal(props);
    return null;
  },
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({ markSyncComplete: mockMarkSyncComplete }),
}));

jest.mock("@/services/batch-create-transactions", () => ({
  batchCreateTransactions: (...args: readonly unknown[]): unknown =>
    mockBatchCreateTransactions(...args),
}));

jest.mock("@/services/sms-live-detection-handler", () => ({
  setReviewingActive: jest.fn(),
  flushQueuedTransactions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

jest.mock("expo-status-bar", () => ({ StatusBar: (): null => null }));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly count?: number }): string =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

import SmsReviewScreen from "@/app/(private)/sms-review";

describe("SMS review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCleanup = undefined;
    mockRetry.mockResolvedValue(undefined);
    mockMarkSyncComplete.mockResolvedValue(undefined);
    mockGrantConsent.mockResolvedValue(undefined);
    mockRetryState = {
      unresolvedCount: 2,
      retryableCount: 2,
      isRetrying: false,
      hasRetryError: false,
      isConsentRequired: false,
      dismissConsentRequired: mockDismissConsentRequired,
      retry: mockRetry,
    };
    mockReviewTransactions = [mockTransaction];
    mockBatchCreateTransactions.mockResolvedValue({
      savedCount: 1,
      failedCount: 0,
      errors: [],
    });
  });

  it("connects partial retry and clears transient state on Back", () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    if (!props) throw new Error("TransactionReview was not rendered");

    expect(props.partialResults.safeguardSummary).toEqual(mockSafeguardSummary);
    expect(props.partialResults.retryableCount).toBe(2);
    expect(props.partialResults.canRetry).toBe(true);
    props.partialResults.onRetry();
    expect(mockRetry).toHaveBeenCalledTimes(1);

    props.onBack();
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it("preserves transient state while opening privacy details", () => {
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];
    if (!consentProps) throw new Error("Consent sheet was not rendered");

    act(() => consentProps.onPrivacyDetails());
    focusCleanup?.();

    expect(mockDismissConsentRequired).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/ai-privacy-details");
    expect(mockClearTransactions).not.toHaveBeenCalled();
  });

  it("clears transient state when the review route unmounts", () => {
    const { unmount } = render(<SmsReviewScreen />);

    unmount();

    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
  });

  it("clears transient state after discard and successful save", async () => {
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];
    if (!reviewProps) throw new Error("TransactionReview was not rendered");

    act(() => reviewProps.onDiscard());
    const modalProps = mockConfirmationModal.mock.calls.at(-1)?.[0];
    if (!modalProps) throw new Error("ConfirmationModal was not rendered");
    act(() => modalProps.onConfirm());
    expect(mockRouterReplace).toHaveBeenCalledWith("/(private)/(tabs)");

    await act(async () => {
      await reviewProps.onSave([mockTransaction], new Map(), new Map());
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      "/(private)/(tabs)/transactions"
    );
    expect(mockClearTransactions).toHaveBeenCalledTimes(2);
  });

  it("passes retry errors to the inline notice", () => {
    mockRetryState = { ...mockRetryState, hasRetryError: true };

    render(<SmsReviewScreen />);

    expect(
      mockTransactionReview.mock.calls[0]?.[0].partialResults.hasRetryError
    ).toBe(true);
  });

  it("disables review actions while unresolved messages are retrying", () => {
    mockRetryState = { ...mockRetryState, isRetrying: true };

    render(<SmsReviewScreen />);

    expect(mockTransactionReview.mock.calls[0]?.[0].isSaving).toBe(true);
  });

  it("disables unresolved-message retry while transactions are saving", async () => {
    let finishSave: (() => void) | undefined;
    mockBatchCreateTransactions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = () =>
            resolve({ savedCount: 1, failedCount: 0, errors: [] });
        })
    );

    const { rerender } = render(<SmsReviewScreen />);
    const initialProps = mockTransactionReview.mock.calls.at(-1)?.[0];
    if (!initialProps) throw new Error("TransactionReview was not rendered");

    let savePromise: Promise<void> | undefined;
    act(() => {
      savePromise = initialProps.onSave(
        [mockTransaction],
        new Map(),
        new Map()
      );
    });
    rerender(<SmsReviewScreen />);

    const savingProps = mockTransactionReview.mock.calls.at(-1)?.[0];
    expect(savingProps?.partialResults.canRetry).toBe(false);

    await act(async () => {
      finishSave?.();
      await savePromise;
    });
  });

  it("keeps Save enabled and does not advance the sync checkpoint for a permanent remainder", async () => {
    mockRetryState = {
      ...mockRetryState,
      unresolvedCount: 1,
      retryableCount: 0,
    };

    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];
    if (!reviewProps) throw new Error("TransactionReview was not rendered");

    expect(reviewProps.partialResults).toEqual(
      expect.objectContaining({
        safeguardSummary: mockSafeguardSummary,
        canRetry: false,
      })
    );
    expect(reviewProps.isSaving).toBe(false);

    await act(async () => {
      await reviewProps.onSave([mockTransaction], new Map(), new Map());
    });

    expect(mockMarkSyncComplete).not.toHaveBeenCalled();
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
  });

  it("shows an honest partial-result notice when no transactions were accepted", () => {
    mockReviewTransactions = [];
    mockRetryState = {
      ...mockRetryState,
      unresolvedCount: 2,
      retryableCount: 0,
    };

    render(<SmsReviewScreen />);

    expect(screen.getByTestId("partial-sms-results-notice")).toBeTruthy();
    expect(screen.getByText("no_transactions_to_review")).toBeTruthy();
  });

  it("re-consents and retries unresolved messages after consent expires", async () => {
    mockRetryState = { ...mockRetryState, isConsentRequired: true };
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];
    if (!consentProps) throw new Error("Consent sheet was not rendered");

    expect(consentProps.visible).toBe(true);
    await act(async () => {
      await consentProps.onContinue();
    });

    expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    expect(mockDismissConsentRequired).toHaveBeenCalledTimes(1);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps consent recovery open when granting consent fails", async () => {
    mockRetryState = { ...mockRetryState, isConsentRequired: true };
    mockGrantConsent.mockRejectedValueOnce(new Error("offline"));
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];
    if (!consentProps) throw new Error("Consent sheet was not rendered");

    await act(async () => {
      await consentProps.onContinue();
    });

    expect(mockDismissConsentRequired).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "ai_consent_retry_error",
    });
  });
});
