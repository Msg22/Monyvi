import { render, screen } from "@testing-library/react-native";
import React from "react";
import type { ReviewableTransaction } from "@monyvi/logic";
import { TransactionReview } from "@/components/transaction-review/TransactionReview";

const mockTransaction: ReviewableTransaction & {
  readonly parserSource: string;
} = {
  amount: 250,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "CARREFOUR CAIRO",
  date: new Date(2026, 3, 8, 14, 23),
  categoryId: "cat-shopping",
  categoryDisplayName: "Shopping",
  confidence: 0.96,
  originLabel: "NBE",
  source: "SMS",
  deduplicationHash: "fingerprint-1",
  parserSource: "local parser",
};

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/hooks/useAccountDisplayNames", () => ({
  useAccountDisplayNames: (): ReadonlyMap<string, string> => new Map(),
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

jest.mock("@/components/transaction-review/ReviewActionBar", () => ({
  ReviewActionBar: (): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(ReactNative.View, {
      testID: "review-action-bar",
    });
  },
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

jest.mock("@/hooks/useTransactionReviewState", () => ({
  useTransactionReviewState: (): unknown => ({
    searchQuery: "",
    selectedTypes: ["All"],
    filteredTransactions: [mockTransaction],
    selectedCount: 1,
    period: "all",
    setPeriodModalVisible: jest.fn(),
    setTypeModalVisible: jest.fn(),
    setSearchQuery: jest.fn(),
    setPeriod: jest.fn(),
    handleTypeToggle: jest.fn(),
    periodModalVisible: false,
    typeModalVisible: false,
    listItems: [
      {
        kind: "transaction",
        key: "tx-0",
        tx: mockTransaction,
        originalIndex: 0,
      },
    ],
    transactionOverrides: new Map(),
    accountMatches: new Map(),
    invalidIndices: new Set(),
    handleToggleItem: jest.fn(),
    handleOpenEditModal: jest.fn(),
    selectedIndicesRef: { current: new Set([0]) },
    selectedIndices: new Set([0]),
    allSelected: true,
    handleToggleAll: jest.fn(),
    handleSave: jest.fn(),
    editModalIndex: null,
    effectiveTransactions: [mockTransaction],
    userAccounts: [],
    categoryMap: new Map(),
    pendingAccounts: [],
    latestRates: [],
    expenseCategories: [],
    incomeCategories: [],
    handleEditModalSave: jest.fn(),
    handleCreatePendingAccount: jest.fn(),
    setEditModalIndex: jest.fn(),
  }),
}));

describe("TransactionReview", () => {
  it("does not show parser-source implementation labels in regular UI", () => {
    render(
      <TransactionReview
        transactions={[mockTransaction]}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByText("CARREFOUR CAIRO")).toBeTruthy();
    expect(screen.queryByText(/local parser/i)).toBeNull();
    expect(screen.queryByText(/AI parser/i)).toBeNull();
    expect(screen.queryByText(/fixture parser/i)).toBeNull();
  });
});
