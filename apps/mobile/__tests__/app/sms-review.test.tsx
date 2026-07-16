import { act, render } from "@testing-library/react-native";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import React from "react";

interface MockTransactionReviewProps {
  readonly partialResults: {
    readonly unresolvedCount: number;
    readonly onRetry: () => void;
  };
  readonly onBack: () => void;
  readonly onDiscard: () => void;
  readonly onSave: (
    selected: readonly ParsedSmsTransaction[],
    accountMap: ReadonlyMap<number, string>,
    toAccountMap: ReadonlyMap<number, string>
  ) => Promise<void>;
}

interface MockConfirmationModalProps {
  readonly onConfirm: () => void;
}

const mockClearTransactions = jest.fn();
const mockRetry = jest.fn<Promise<void>, []>();
const mockRouterBack = jest.fn();
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

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | undefined): void => {
    focusCleanup = callback();
  },
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    transactions: [mockTransaction],
    clearTransactions: mockClearTransactions,
  }),
}));

jest.mock("@/hooks/useSmsReviewRetry", () => ({
  useSmsReviewRetry: () => ({
    retryableCount: 2,
    isRetrying: false,
    hasRetryError: false,
    retry: mockRetry,
  }),
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
    mockBatchCreateTransactions.mockResolvedValue({
      savedCount: 1,
      failedCount: 0,
      errors: [],
    });
  });

  it("connects partial retry and clears transient state on Back or abandonment", () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    if (!props) throw new Error("TransactionReview was not rendered");

    expect(props.partialResults.unresolvedCount).toBe(2);
    props.partialResults.onRetry();
    expect(mockRetry).toHaveBeenCalledTimes(1);

    props.onBack();
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).toHaveBeenCalledTimes(1);

    focusCleanup?.();
    expect(mockClearTransactions).toHaveBeenCalledTimes(2);
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
});
