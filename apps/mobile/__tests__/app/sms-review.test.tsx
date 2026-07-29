import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import React from "react";

import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";

interface MockTransactionReviewProps {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly subtitle: string;
  readonly selectionOverrides: ReadonlyMap<number, boolean | null>;
  readonly partialResults?: {
    readonly safeguardSummary: SmsScanSafeguardSummary;
    readonly retryableCount: number;
    readonly canRetry: boolean;
    readonly hasRetryError: boolean;
    readonly onRetry: () => void;
  };
  readonly onBack: () => void;
  readonly onReviewLater: () => void;
  readonly onDiscard: () => void;
  readonly onDiscardItem: (
    index: number,
    wasSelected: boolean
  ) => Promise<void>;
  readonly onSelectionChange: (
    index: number,
    selected: boolean
  ) => Promise<void>;
  readonly undoBanner?: {
    readonly onUndo: () => Promise<void>;
  };
  readonly isSaving: boolean;
  readonly onSave: (
    selected: readonly ParsedSmsTransaction[],
    accountMap: ReadonlyMap<number, string>,
    toAccountMap: ReadonlyMap<number, string>
  ) => Promise<void>;
}

interface MockConfirmationModalProps {
  readonly visible: boolean;
  readonly message: string;
  readonly onConfirm: () => void;
}

interface MockConsentSheetProps {
  readonly visible: boolean;
  readonly onContinue: () => Promise<void>;
  readonly onPrivacyDetails: () => void;
}

const mockClearTransactions = jest.fn();
const mockRetry = jest.fn<Promise<void>, []>();
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockMarkSyncComplete = jest.fn<Promise<void>, []>();
const mockShowToast = jest.fn();
const mockSaveSelectedDrafts = jest.fn();
const mockDiscardAll = jest.fn();
const mockDiscardOne = jest.fn();
const mockSetSelection = jest.fn();
const mockQueueRefetch = jest.fn<Promise<void>, []>();
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

let mockUndoState = {
  undoItem: null as object | null,
  discardedName: null as string | null,
  discard: mockDiscardOne,
  undo: jest.fn<Promise<boolean>, []>(),
  close: jest.fn(),
};

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

let mockQueueItems = [
  {
    draftId: "draft-1",
    queueId: "queue-1",
    transaction: mockTransaction,
    selectionOverride: true,
    position: 0,
    parsedAt: new Date("2026-07-16T12:00:00Z"),
    updatedAt: new Date("2026-07-16T12:00:00Z"),
    hardValidationReasons: ["account_required"] as const,
  },
];
let mockQueueLoading = false;
let mockQueueError: Error | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockRouterBack,
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    unresolvedCandidates: mockRetryState.unresolvedCount > 0 ? [{}] : [],
    safeguardSummary: mockSafeguardSummary,
    parserDiagnostics: null,
    clearTransactions: mockClearTransactions,
  }),
}));

jest.mock("@/hooks/useSmsReviewDraftQueue", () => ({
  useSmsReviewDraftQueue: () => ({
    userId: "user-1",
    queueId: mockQueueItems.length > 0 ? "queue-1" : null,
    items: mockQueueItems,
    itemCount: mockQueueItems.length,
    isLoading: mockQueueLoading,
    error: mockQueueError,
    refetch: mockQueueRefetch,
  }),
}));

jest.mock("@/hooks/useSmsReviewUndo", () => ({
  useSmsReviewUndo: () => mockUndoState,
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

jest.mock("@/components/transaction-review/SmsReviewUndoBanner", () => ({
  SmsReviewUndoBanner: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View testID="sms-review-undo-banner" />;
  },
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (props: MockConfirmationModalProps): null => {
    mockConfirmationModal(props);
    return null;
  },
}));

jest.mock("@/components/sms-sync/SafeguardQaDiagnosticsPanel", () => ({
  SafeguardQaDiagnosticsPanel: (): null => null,
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

jest.mock("@/services/sms-review-draft-command-service", () => ({
  discardEverySmsReviewDraft: (...args: readonly unknown[]): unknown =>
    mockDiscardAll(...args),
  editSmsReviewDraft: jest.fn(),
  setSmsReviewDraftSelection: (...args: readonly unknown[]): unknown =>
    mockSetSelection(...args),
}));

jest.mock("@/services/sms-review-draft-save-service", () => {
  class MockValidationError extends Error {}
  return {
    saveSelectedSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
      mockSaveSelectedDrafts(...args),
    SmsReviewDraftSaveValidationError: MockValidationError,
  };
});

jest.mock("@/services/sms-live-detection-handler", () => ({
  setReviewingActive: jest.fn(),
  flushQueuedTransactions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/sms-safeguard-qa-diagnostics-service", () => ({
  createSmsSafeguardQaDiagnostics: (): null => null,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: (): null => null }));

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
import { SmsReviewDraftSaveValidationError } from "@/services/sms-review-draft-save-service";

describe("SMS review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueLoading = false;
    mockQueueError = null;
    mockQueueItems = [
      {
        draftId: "draft-1",
        queueId: "queue-1",
        transaction: mockTransaction,
        selectionOverride: true,
        position: 0,
        parsedAt: new Date("2026-07-16T12:00:00Z"),
        updatedAt: new Date("2026-07-16T12:00:00Z"),
        hardValidationReasons: ["account_required"] as const,
      },
    ];
    mockRetryState = {
      unresolvedCount: 2,
      retryableCount: 2,
      isRetrying: false,
      hasRetryError: false,
      isConsentRequired: false,
      dismissConsentRequired: mockDismissConsentRequired,
      retry: mockRetry,
    };
    mockRetry.mockResolvedValue(undefined);
    mockGrantConsent.mockResolvedValue(undefined);
    mockDiscardAll.mockResolvedValue(undefined);
    mockDiscardOne.mockResolvedValue(undefined);
    mockSetSelection.mockResolvedValue(undefined);
    mockQueueRefetch.mockResolvedValue(undefined);
    mockMarkSyncComplete.mockResolvedValue(undefined);
    mockSaveSelectedDrafts.mockResolvedValue({ savedCount: 1 });
    mockUndoState = {
      undoItem: null,
      discardedName: null,
      discard: mockDiscardOne,
      undo: jest.fn<Promise<boolean>, []>(),
      close: jest.fn(),
    };
  });

  it("renders durable queue items and forces a hard-invalid override off", () => {
    render(<SmsReviewScreen />);

    const props = mockTransactionReview.mock.calls[0]?.[0];
    expect(props?.transactions[0]?.reviewStatus).toBe("needs_review");
    expect(props?.transactions[0]?.reviewReasons).toContain("account_needed");
    expect(props?.selectionOverrides.get(0)).toBe(false);
    expect(props?.partialResults?.canRetry).toBe(true);
  });

  it("rejects selecting a draft with unresolved hard validation", async () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    if (!props) throw new Error("TransactionReview was not rendered");

    await expect(props.onSelectionChange(0, true)).rejects.toThrow(
      "sms_review_draft_hard_validation_required"
    );
    expect(mockSetSelection).not.toHaveBeenCalled();
  });

  it("clears volatile scan state when the review route unmounts", () => {
    const { unmount } = render(<SmsReviewScreen />);

    unmount();

    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockDiscardAll).not.toHaveBeenCalled();
  });

  it("keeps durable drafts but clears transient scan data when reviewing later", () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];

    act(() => props?.onReviewLater());

    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/(private)/(tabs)");
    expect(mockDiscardAll).not.toHaveBeenCalled();
  });

  it("opens generalized privacy details without clearing durable work", () => {
    mockRetryState = { ...mockRetryState, isConsentRequired: true };
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];

    act(() => consentProps?.onPrivacyDetails());

    expect(mockRouterPush).toHaveBeenCalledWith("/privacy-details");
    expect(mockClearTransactions).not.toHaveBeenCalled();
  });

  it("discards every suggestion only after final confirmation", async () => {
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];

    act(() => reviewProps?.onDiscard());
    const confirmation = mockConfirmationModal.mock.calls.at(-1)?.[0];
    expect(confirmation?.visible).toBe(true);
    act(() => confirmation?.onConfirm());

    await waitFor(() =>
      expect(mockDiscardAll).toHaveBeenCalledWith("user-1", "queue-1", [
        "draft-1",
      ])
    );
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/(private)/(tabs)");
  });

  it("removes one suggestion immediately without waiting for persistence", async () => {
    mockQueueItems = [
      mockQueueItems[0],
      {
        ...mockQueueItems[0],
        draftId: "draft-2",
        transaction: {
          ...mockTransaction,
          smsFingerprint: "fingerprint-2",
        },
        position: 1,
      },
    ];
    mockDiscardOne.mockReturnValue(new Promise<void>(() => undefined));
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls.at(-1)?.[0];
    if (!reviewProps) throw new Error("TransactionReview was not rendered");

    act(() => {
      void reviewProps.onDiscardItem(0, true);
    });

    await waitFor(() => {
      const latestProps = mockTransactionReview.mock.calls.at(-1)?.[0];
      expect(latestProps?.transactions).toHaveLength(1);
      expect(latestProps?.transactions[0]?.smsFingerprint).toBe(
        "fingerprint-2"
      );
    });
    expect(mockDiscardOne).toHaveBeenCalledWith(
      "draft-1",
      "user-1",
      expect.objectContaining({ selectionOverride: true })
    );
    expect(screen.getByTestId("transaction-review")).toBeTruthy();
  });

  it("reconciles an optimistic undo with the restored draft by fingerprint", async () => {
    const discardedItem = mockQueueItems[0];
    mockQueueItems = [
      discardedItem,
      {
        ...discardedItem,
        draftId: "draft-2",
        transaction: {
          ...mockTransaction,
          smsFingerprint: "fingerprint-2",
        },
        position: 1,
      },
    ];
    mockUndoState = {
      ...mockUndoState,
      undoItem: { draftId: discardedItem.draftId },
      discardedName: "QA Merchant",
      undo: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    };
    const view = render(<SmsReviewScreen />);
    const initialProps = mockTransactionReview.mock.calls.at(-1)?.[0];
    if (!initialProps) throw new Error("TransactionReview was not rendered");

    await act(async () => {
      await initialProps.onDiscardItem(0, false);
    });
    const discardedProps = mockTransactionReview.mock.calls.at(-1)?.[0];
    if (!discardedProps?.undoBanner) {
      throw new Error("Undo banner was not rendered");
    }

    await act(async () => {
      await discardedProps.undoBanner?.onUndo();
    });
    expect(
      mockTransactionReview.mock.calls.at(-1)?.[0]?.transactions
    ).toHaveLength(2);
    expect(
      mockTransactionReview.mock.calls.at(-1)?.[0]?.selectionOverrides.get(0)
    ).toBe(false);

    mockQueueItems = [
      {
        ...discardedItem,
        draftId: "restored-draft-1",
      },
      mockQueueItems[1],
    ];
    view.rerender(<SmsReviewScreen />);

    await waitFor(() => {
      const transactions =
        mockTransactionReview.mock.calls.at(-1)?.[0]?.transactions ?? [];
      expect(transactions).toHaveLength(2);
      expect(
        new Set(transactions.map((transaction) => transaction.smsFingerprint))
          .size
      ).toBe(2);
    });
  });

  it("shows the live review count and freezes the confirmed discard count", () => {
    const view = render(<SmsReviewScreen />);
    const initialReview = mockTransactionReview.mock.calls.at(-1)?.[0];

    expect(initialReview?.subtitle).toBe("review_sms_source_summary:1");

    act(() => initialReview?.onDiscard());
    expect(mockConfirmationModal.mock.calls.at(-1)?.[0]?.message).toBe(
      "sms_review_discard_all_message:1"
    );

    mockQueueItems = [
      ...mockQueueItems,
      {
        ...mockQueueItems[0],
        draftId: "draft-2",
        transaction: {
          ...mockTransaction,
          smsFingerprint: "fingerprint-2",
        },
        position: 1,
      },
    ];
    view.rerender(<SmsReviewScreen />);

    expect(mockTransactionReview.mock.calls.at(-1)?.[0]?.subtitle).toBe(
      "review_sms_source_summary:2"
    );
    expect(mockConfirmationModal.mock.calls.at(-1)?.[0]?.message).toBe(
      "sms_review_discard_all_message:1"
    );
  });

  it("saves selected drafts atomically and enters loading before navigation", async () => {
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];
    if (!reviewProps) throw new Error("TransactionReview was not rendered");

    await act(async () => {
      await reviewProps.onSave(
        [mockTransaction],
        new Map([[0, "account-1"]]),
        new Map()
      );
    });

    expect(mockSaveSelectedDrafts).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUserId: "user-1",
        transactionAccountMap: new Map([[0, "account-1"]]),
      })
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "success",
      title: "sms_review_saved:1",
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      "/(private)/(tabs)/transactions"
    );
    expect(screen.queryByTestId("transaction-review")).toBeNull();
  });

  it("refreshes durable validation state before showing save guidance", async () => {
    mockSaveSelectedDrafts.mockRejectedValueOnce(
      new SmsReviewDraftSaveValidationError(["account_required"])
    );
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];
    if (!reviewProps) throw new Error("TransactionReview was not rendered");

    await act(async () => {
      await reviewProps.onSave([mockTransaction], new Map(), new Map());
    });

    expect(mockQueueRefetch).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "warning",
      title: "sms_review_fix_selected",
      message: "sms_review_fix_selected_message",
    });
    expect(mockQueueRefetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockShowToast.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("does not expose technical storage errors in save feedback", async () => {
    mockSaveSelectedDrafts.mockRejectedValueOnce(
      new Error("sqlite disk is full")
    );
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];
    if (!reviewProps) throw new Error("TransactionReview was not rendered");

    await act(async () => {
      await reviewProps.onSave([mockTransaction], new Map(), new Map());
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "save_error",
      message: "sms_review_save_failed_message",
    });
  });

  it("shows partial-result guidance when no draft was accepted", () => {
    mockQueueItems = [];
    mockRetryState = { ...mockRetryState, retryableCount: 0 };

    render(<SmsReviewScreen />);

    expect(screen.getByTestId("partial-sms-results-notice")).toBeTruthy();
    expect(screen.getByText("no_transactions_to_review")).toBeTruthy();
  });

  it("keeps Undo visible after discarding the final suggestion", () => {
    mockQueueItems = [];
    mockUndoState = {
      ...mockUndoState,
      undoItem: { draftId: "discarded-final" },
      discardedName: "Final merchant",
    };

    render(<SmsReviewScreen />);

    expect(screen.getByTestId("sms-review-undo-banner")).toBeTruthy();
  });

  it("keeps Undo recoverable and shows friendly feedback when restore fails", async () => {
    const undo = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValue(new Error("adapter failed"));
    mockUndoState = {
      undoItem: {},
      discardedName: "QA Merchant",
      discard: mockDiscardOne,
      undo,
      close: jest.fn(),
    };
    render(<SmsReviewScreen />);
    const reviewProps = mockTransactionReview.mock.calls[0]?.[0];

    await act(async () => {
      await reviewProps?.undoBanner?.onUndo();
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "sms_review_undo_failed",
      message: "sms_review_undo_failed_message",
    });
    expect(mockUndoState.undoItem).not.toBeNull();
  });

  it("shows the skeleton while the current-user queue is loading", () => {
    mockQueueLoading = true;

    render(<SmsReviewScreen />);

    expect(screen.queryByTestId("transaction-review")).toBeNull();
  });

  it("re-consents before retrying unresolved messages", async () => {
    mockRetryState = { ...mockRetryState, isConsentRequired: true };
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];
    if (!consentProps) throw new Error("Consent sheet was not rendered");

    await act(async () => {
      await consentProps.onContinue();
    });

    expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    expect(mockDismissConsentRequired).toHaveBeenCalledTimes(1);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
