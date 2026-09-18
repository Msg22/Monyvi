import { render, screen } from "@testing-library/react-native";
import React from "react";

const mockBack = jest.fn();
let mockAmountDisplayValue = "";
let mockTransactionByIdResult: {
  readonly transaction: Record<string, unknown> | null;
  readonly isLoading: boolean;
};
let mockAccounts: Array<Record<string, unknown>>;

const mockView = (testID: string): React.JSX.Element => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");
  return <ReactNative.View testID={testID} />;
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly id: string } => ({ id: "tx-1" }),
  useRouter: (): { readonly back: jest.Mock } => ({ back: mockBack }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: true } => ({ isDark: true }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/hooks/useTransactionById", () => ({
  useTransactionById: (): {
    readonly transaction: Record<string, unknown> | null;
    readonly isLoading: boolean;
  } => mockTransactionByIdResult,
}));

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: (): {
    readonly accounts: ReadonlyArray<Record<string, unknown>>;
  } => ({
    accounts: mockAccounts,
  }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: (): {
    readonly expenseCategories: ReadonlyArray<Record<string, unknown>>;
    readonly incomeCategories: readonly [];
  } => ({
    expenseCategories: [
      {
        id: "cat-food",
        displayName: "Food",
      },
    ],
    incomeCategories: [],
  }),
}));

jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: (): { readonly children: readonly [] } => ({
    children: [],
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, Record<string, unknown>> =>
    new Map([
      [
        "cat-food",
        {
          id: "cat-food",
          displayName: "Food",
        },
      ],
    ]),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): React.JSX.Element => mockView("page-header"),
}));

jest.mock("@/components/add-transaction/AmountDisplay", () => ({
  AmountDisplay: ({ amount }: { readonly amount: string }): React.JSX.Element => {
    mockAmountDisplayValue = amount;
    return mockView("amount-display");
  },
}));

jest.mock("@/components/add-transaction/CalculatorKeypad", () => ({
  CalculatorKeypad: (): React.JSX.Element => mockView("calculator"),
}));

jest.mock("@/components/add-transaction/TypeTabs", () => ({
  TypeTabs: (): React.JSX.Element => mockView("type-tabs"),
}));

jest.mock("@/components/edit-transaction/EditTransactionFields", () => ({
  EditTransactionFields: (): React.JSX.Element => mockView("edit-fields"),
}));

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (): null => null,
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (): null => null,
}));

jest.mock("@/components/transactions/RecurringWarningBanner", () => ({
  RecurringWarningBanner: (): null => null,
}));

jest.mock("@/services/transaction-service", () => ({
  convertTransactionToTransfer: jest.fn(),
  deleteTransaction: jest.fn(),
  updateTransaction: jest.fn(),
}));

import EditTransaction from "@/app/(private)/edit-transaction";

describe("EditTransaction dark theme styling", () => {
  beforeEach(() => {
    mockAmountDisplayValue = "";
    mockAccounts = [
      {
        id: "account-1",
        name: "Cash",
        type: "CASH",
        balance: 1000,
        currency: "EGP",
      },
    ];
    mockTransactionByIdResult = {
      transaction: {
        id: "tx-1",
        amount: 100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "account-1",
        counterparty: undefined,
        note: undefined,
        date: new Date("2026-05-01T12:00:00.000Z"),
      },
      isLoading: false,
    };
  });

  it("uses the themed app background on the screen root", async () => {
    render(<EditTransaction />);

    await screen.findByTestId("edit-transaction-screen");

    expect(screen.getByTestId("edit-transaction-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("uses the themed app background while loading the transaction", async () => {
    mockTransactionByIdResult = {
      transaction: null,
      isLoading: true,
    };

    render(<EditTransaction />);

    await screen.findByTestId("edit-transaction-skeleton");

    expect(screen.getByTestId("edit-transaction-skeleton")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("uses the themed app background when the transaction is missing", async () => {
    mockTransactionByIdResult = {
      transaction: null,
      isLoading: false,
    };

    render(<EditTransaction />);

    await screen.findByText("transaction_not_found");

    expect(screen.getByTestId("edit-transaction-not-found")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("initializes a stored small BTC amount as canonical decimal input", async () => {
    mockAccounts = [
      {
        id: "account-1",
        name: "BTC",
        type: "BANK",
        balance: 1,
        currency: "BTC",
      },
    ];
    mockTransactionByIdResult = {
      transaction: {
        id: "tx-1",
        amount: 0.00000001,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "account-1",
        counterparty: undefined,
        note: undefined,
        date: new Date("2026-05-01T12:00:00.000Z"),
      },
      isLoading: false,
    };

    render(<EditTransaction />);

    await screen.findByTestId("edit-transaction-screen");
    expect(mockAmountDisplayValue).toBe("0.00000001");
  });

  it("does not show a balance warning for an unchanged expense already reflected in the account balance", async () => {
    mockTransactionByIdResult = {
      transaction: {
        id: "tx-1",
        amount: 1100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "account-1",
        counterparty: undefined,
        note: undefined,
        date: new Date("2026-05-01T12:00:00.000Z"),
      },
      isLoading: false,
    };

    render(<EditTransaction />);

    await screen.findByTestId("edit-transaction-screen");

    expect(screen.queryByText(/will put your balance/i)).toBeNull();
    expect(screen.queryByText(/warning_negative_balance/i)).toBeNull();
  });

  it("recomputes the balance warning when an observed account balance changes", async () => {
    const account = {
      id: "account-1",
      name: "Cash",
      type: "CASH",
      balance: 100,
      currency: "EGP",
    };
    mockAccounts = [account];
    mockTransactionByIdResult = {
      transaction: {
        id: "tx-1",
        amount: 1100,
        type: "EXPENSE",
        categoryId: "cat-food",
        accountId: "account-1",
        counterparty: undefined,
        note: undefined,
        date: new Date("2026-05-01T12:00:00.000Z"),
      },
      isLoading: false,
    };

    const { rerender } = render(<EditTransaction />);

    await screen.findByTestId("edit-transaction-screen");
    expect(screen.queryByText(/warning_negative_balance/i)).toBeNull();

    account.balance = -100;
    rerender(<EditTransaction />);

    expect(await screen.findByText(/warning_negative_balance/i)).toBeTruthy();
  });
});
