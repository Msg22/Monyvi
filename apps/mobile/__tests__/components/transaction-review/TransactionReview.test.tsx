import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReviewableTransaction } from "@monyvi/logic";
import React from "react";
import { TransactionReview } from "@/components/transaction-review/TransactionReview";
import {
  type UseTransactionReviewStateResult,
  useTransactionReviewState,
} from "@/hooks/useTransactionReviewState";

const mockPageHeader = jest.fn();

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (props: Record<string, unknown>): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockPageHeader(props);
    return ReactActual.createElement(ReactNative.View, {
      testID: "page-header",
    });
  },
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks/useAccountDisplayNames", () => ({
  useAccountDisplayNames: (): ReadonlyMap<string, string> => new Map(),
}));

jest.mock("@/utils/transaction-review-provider", () => ({
  resolveTransactionReviewProvider: (): null => null,
}));

jest.mock("@/hooks/useTransactionReviewState", () => ({
  useTransactionReviewState: jest.fn(),
}));

jest.mock("@/components/modals/PeriodFilterModal", () => ({
  PeriodFilterModal: (): null => null,
}));

jest.mock("@/components/modals/TypeFilterModal", () => ({
  TypeFilterModal: (): null => null,
}));

jest.mock("@/components/transactions/TransactionFiltersBar", () => ({
  TransactionFiltersBar: (): null => null,
}));

const mockReviewFiltersSheet = jest.fn();

jest.mock("@/components/transaction-review/ReviewFiltersSheet", () => ({
  ReviewFiltersSheet: (props: Record<string, unknown>): null => {
    mockReviewFiltersSheet(props);
    return null;
  },
}));

jest.mock("@/components/transaction-review/ReviewActionBar", () => ({
  ReviewActionBar: (): null => null,
}));

jest.mock(
  "@/components/transaction-review/edit-modal/TransactionEditModal",
  () => ({
    TransactionEditModal: (): null => null,
  })
);

jest.mock("@/components/transaction-review/get-expanded-content", () => ({
  getExpandedContent: (): null => null,
  OriginalContentBlock: (): null => null,
}));

jest.mock("@/components/transaction-review/TransactionItem", () => ({
  ReviewTransactionItemSkeleton: (): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(ReactNative.View, {
      testID: "transaction-review-row-skeleton",
    });
  },
  TransactionItem: ({
    transaction,
  }: {
    readonly transaction: ReviewableTransaction;
  }): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      ReactNative.Text,
      null,
      transaction.counterparty
    );
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, options?: Record<string, unknown>) => string;
  } => ({
    t: (key: string, options?: Record<string, unknown>): string => {
      const count =
        typeof options?.count === "number" || typeof options?.count === "string"
          ? options.count
          : 0;
      const countText = String(count);
      const translations: Record<string, string> = {
        deselect_all: "Deselect All",
        deselect_shown: "Deselect shown",
        no_matching_filters: "No transactions match your filters",
        review_empty_auto_selected: "No transactions were auto-selected.",
        review_empty_needs_review: "All visible transactions are selected.",
        review_items_count: `Review ${countText} items`,
        review_mode_all: "All",
        review_mode_auto_selected: "Auto-selected",
        review_mode_needs_review: "Needs review",
        review_summary_auto_selected: `${countText} auto-selected`,
        review_summary_found: `${countText} found`,
        review_summary_needs_review: `${countText} need review`,
        review_summary_title: "Review suggestions",
        review_trust_copy: "Saved only after you tap Save",
        select_all: "Select All",
        select_shown: "Select shown",
        show_all: "Show all",
      };
      return translations[key] ?? key;
    },
  }),
}));

const mockUseTransactionReviewState =
  useTransactionReviewState as jest.MockedFunction<
    typeof useTransactionReviewState
  >;

interface ParserTaggedTransaction extends ReviewableTransaction {
  readonly parserSource: string;
}

function createTransaction(): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: new Date("2026-07-09T10:00:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.95,
    originLabel: "BANK",
    source: "SMS",
  };
}

function createReviewState(
  overrides: Partial<UseTransactionReviewStateResult>
): UseTransactionReviewStateResult {
  const transaction = createTransaction();
  return {
    accountMatches: new Map(),
    applyReviewFilters: jest.fn(),
    allSelected: false,
    autoSelectedCount: 0,
    categoryMap: new Map(),
    editModalIndex: null,
    effectiveTransactions: [transaction],
    expenseCategories: [],
    filteredTransactions: [transaction],
    getFilteredTransactionCount: jest.fn(() => 1),
    handleCreatePendingAccount: jest.fn(),
    handleEditModalSave: jest.fn(),
    handleOpenEditModal: jest.fn(),
    handleReviewNeeds: jest.fn(),
    handleShowAutoSelected: jest.fn(),
    handleSave: jest.fn(),
    handleShowAll: jest.fn(),
    handleToggleAll: jest.fn(),
    handleToggleItem: jest.fn(),
    handleTypeToggle: jest.fn(),
    incomeCategories: [],
    invalidIndices: new Set(),
    isReviewMetadataReady: true,
    latestRates: null,
    listItems: [],
    needsReviewCount: 0,
    pendingAccounts: [],
    period: "all_time",
    reviewMetaByIndex: new Map(),
    reviewMode: "all",
    resolvedAccountMatchIndices: new Set([0]),
    searchQuery: "",
    selectedCount: 0,
    selectedIndices: new Set(),
    selectedIndicesRef: { current: new Set() },
    selectedTypes: ["All"],
    setEditModalIndex: jest.fn(),
    setPeriod: jest.fn(),
    setReviewMode: jest.fn(),
    setSearchQuery: jest.fn(),
    transactionOverrides: new Map(),
    userAccounts: [],
    ...overrides,
  };
}

function renderReview(state: Partial<UseTransactionReviewStateResult>): void {
  mockUseTransactionReviewState.mockReturnValue(createReviewState(state));
  render(
    <TransactionReview
      transactions={[createTransaction()]}
      onSave={jest.fn()}
      onDiscard={jest.fn()}
      isSaving={false}
    />
  );
}

describe("TransactionReview", () => {
  beforeEach(() => {
    mockUseTransactionReviewState.mockReset();
    mockPageHeader.mockReset();
    mockReviewFiltersSheet.mockReset();
  });

  it("delegates the approved review header to PageHeader", () => {
    mockUseTransactionReviewState.mockReturnValue(createReviewState({}));
    const onBack = jest.fn();

    render(
      <TransactionReview
        transactions={[createTransaction()]}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        isSaving={false}
        title="Review transactions"
        subtitle="3 found from SMS scan"
        onBack={onBack}
      />
    );

    expect(mockPageHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        onBack,
        showBackButton: true,
        subtitle: "3 found from SMS scan",
        title: "Review transactions",
        variant: "review",
      })
    );
  });

  it("uses all-copy when the all view is unfiltered", () => {
    renderReview({});

    expect(screen.getByText("Select All")).toBeTruthy();
  });

  it("uses shown-copy when filters scope the all view", () => {
    renderReview({ allSelected: true, searchQuery: "bank" });

    expect(screen.getByText("Deselect shown")).toBeTruthy();
    expect(screen.queryByText("Deselect All")).toBeNull();
  });

  it("does not show parser-source implementation labels in regular UI", () => {
    const parserTaggedTransaction: ParserTaggedTransaction = {
      ...createTransaction(),
      counterparty: "CARREFOUR CAIRO",
      parserSource: "local parser",
    };

    renderReview({
      effectiveTransactions: [parserTaggedTransaction],
      filteredTransactions: [parserTaggedTransaction],
      listItems: [
        {
          key: "tx-0",
          tx: parserTaggedTransaction,
          originalIndex: 0,
        },
      ],
    });

    expect(screen.getByText("CARREFOUR CAIRO")).toBeTruthy();
    expect(screen.queryByText(/local parser/i)).toBeNull();
    expect(screen.queryByText(/AI parser/i)).toBeNull();
    expect(screen.queryByText(/fixture parser/i)).toBeNull();
  });

  it("keeps the safety notice readable above the footer in dark mode", () => {
    const transaction = createTransaction();
    renderReview({
      listItems: [{ key: "tx-0", tx: transaction, originalIndex: 0 }],
    });

    expect(screen.getByText("review_ai_accuracy_notice")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-secondary-dark")
    );
  });

  it("reveals matched rows progressively while unresolved rows stay skeletons", () => {
    const readyTransaction = {
      ...createTransaction(),
      counterparty: "Ready Shop",
    };
    const pendingTransaction = {
      ...createTransaction(),
      counterparty: "Pending Shop",
    };

    renderReview({
      effectiveTransactions: [readyTransaction, pendingTransaction],
      filteredTransactions: [readyTransaction, pendingTransaction],
      isReviewMetadataReady: false,
      listItems: [
        { key: "tx-0", tx: readyTransaction, originalIndex: 0 },
        { key: "tx-1", tx: pendingTransaction, originalIndex: 1 },
      ],
      resolvedAccountMatchIndices: new Set([0]),
    });

    expect(screen.getByText("Ready Shop")).toBeTruthy();
    expect(screen.queryByText("Pending Shop")).toBeNull();
    expect(
      screen.getAllByTestId("transaction-review-row-skeleton")
    ).toHaveLength(1);
  });

  it("keeps provisional summary counts behind skeletons until matching finishes", () => {
    renderReview({ isReviewMetadataReady: false });

    expect(
      screen.getByTestId("review-summary-auto-selected-count-skeleton")
    ).toBeTruthy();
    expect(
      screen.getByTestId("review-summary-needs-review-count-skeleton")
    ).toBeTruthy();
    expect(screen.getByTestId("review-mode-needs_review")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByTestId("review-select-toggle")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
  });

  it("exposes a stable review-screen readiness signal for E2E", () => {
    renderReview({});

    expect(screen.getByTestId("transaction-review-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("keeps the approved SMS workspace compatible with light and dark themes", () => {
    mockUseTransactionReviewState.mockReturnValue(createReviewState({}));

    render(
      <TransactionReview
        transactions={[createTransaction()]}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        isSaving={false}
        workspaceVariant="sms"
      />
    );

    expect(screen.getByTestId("transaction-review-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("uses the compact proportions from the approved SMS review mockup", () => {
    mockUseTransactionReviewState.mockReturnValue(createReviewState({}));

    render(
      <TransactionReview
        transactions={[createTransaction()]}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        isSaving={false}
        workspaceVariant="sms"
      />
    );

    expect(screen.getByTestId("review-summary-card")).toHaveProp(
      "className",
      expect.stringContaining("py-2")
    );
    expect(screen.getByTestId("review-mode-control")).toHaveProp(
      "className",
      expect.stringContaining("h-10")
    );
    expect(screen.getByTestId("review-selection-row")).toHaveProp(
      "className",
      expect.stringContaining("mt-2")
    );
  });

  it("opens one consolidated filter sheet from the filter trigger", () => {
    const applyReviewFilters = jest.fn();
    const getFilteredTransactionCount = jest.fn(() => 1);
    renderReview({ applyReviewFilters, getFilteredTransactionCount });

    fireEvent.press(screen.getByTestId("review-filter-trigger"));

    expect(mockReviewFiltersSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        getResultCount: getFilteredTransactionCount,
        onApply: applyReviewFilters,
        visible: true,
      })
    );
  });

  it("exposes each summary count as one accessible E2E signal", () => {
    renderReview({ autoSelectedCount: 2, needsReviewCount: 1 });

    expect(screen.getByTestId("review-summary-auto-selected")).toBeTruthy();
    expect(screen.getByTestId("review-summary-needs-review")).toBeTruthy();
    expect(screen.getByLabelText("2 auto-selected")).toBeTruthy();
    expect(screen.getByLabelText("1 need review")).toBeTruthy();
  });

  it("uses the filter-clearing needs-review handler from the segmented tab", () => {
    const handleReviewNeeds = jest.fn();
    const setReviewMode = jest.fn();

    renderReview({
      handleReviewNeeds,
      needsReviewCount: 1,
      searchQuery: "hidden",
      setReviewMode,
    });

    fireEvent.press(screen.getByTestId("review-mode-needs_review"));

    expect(handleReviewNeeds).toHaveBeenCalledTimes(1);
    expect(setReviewMode).not.toHaveBeenCalledWith("needs_review");
  });

  it("uses the filter-clearing auto-selected handler from the segmented tab", () => {
    const handleShowAutoSelected = jest.fn();
    const setReviewMode = jest.fn();

    renderReview({
      autoSelectedCount: 1,
      handleShowAutoSelected,
      searchQuery: "hidden",
      setReviewMode,
    });

    fireEvent.press(screen.getByText("Auto-selected"));

    expect(handleShowAutoSelected).toHaveBeenCalledTimes(1);
    expect(setReviewMode).not.toHaveBeenCalledWith("auto_selected");
  });
});
