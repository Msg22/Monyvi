import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import { Pressable } from "react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCreateTransaction = jest.fn();
const mockCreateTransfer = jest.fn();
const mockCreateRecurringPayment = jest.fn();
const mockDeleteRecurringPayment = jest.fn();
const mockShowToast = jest.fn();

interface MockAccount {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly type: "CASH" | "BANK";
  readonly balance: number;
  readonly currency: "EGP" | "USD";
}

const mockAccounts: readonly MockAccount[] = [
  {
    id: "cash-1",
    name: "Cash",
    isDefault: true,
    type: "CASH",
    balance: 1000,
    currency: "EGP",
  },
  {
    id: "usd-1",
    name: "USD account",
    isDefault: false,
    type: "BANK",
    balance: 1000,
    currency: "USD",
  },
];

const mockExpenseCategories = [
  {
    id: "food",
    displayName: "Food",
    color: "#16a34a",
    icon: "restaurant-outline",
    iconLibrary: "ionicons",
    isExpense: true,
  },
] as const;

const mockIncomeCategories = [
  {
    id: "salary",
    displayName: "Salary",
    color: "#16a34a",
    icon: "cash-outline",
    iconLibrary: "ionicons",
    isIncome: true,
  },
] as const;

jest.mock("expo-router", () => ({
  useRouter: (): {
    readonly back: jest.Mock;
    readonly push: jest.Mock;
  } => ({
    back: mockBack,
    push: mockPush,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 24 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, options?: Record<string, unknown>) => string;
  } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: (): { readonly accounts: readonly MockAccount[] } => ({
    accounts: mockAccounts,
  }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: (): {
    readonly expenseCategories: typeof mockExpenseCategories;
    readonly incomeCategories: typeof mockIncomeCategories;
    readonly isLoading: false;
  } => ({
    expenseCategories: mockExpenseCategories,
    incomeCategories: mockIncomeCategories,
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: (): { readonly children: readonly [] } => ({
    children: [],
  }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { readonly selectedSnapshot: null } => ({
    selectedSnapshot: null,
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/useBudgetAlert", () => ({
  useBudgetAlert: () => ({
    alert: null,
    isVisible: false,
    checkAfterTransaction: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    dismiss: jest.fn(),
    viewBudget: jest.fn(),
  }),
}));

jest.mock("@/hooks/useFormScroll", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    useFormScroll: () => ({
      scrollViewRef: ReactActual.createRef(),
      getFieldRef: (): React.RefObject<null> => ReactActual.createRef(),
      onScroll: jest.fn(),
      scrollToFirstError: jest.fn(),
    }),
  };
});

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, Record<string, unknown>> =>
    new Map([
      [
        "food",
        {
          id: "food",
          displayName: "Food",
          color: "#16a34a",
          icon: "restaurant-outline",
          iconLibrary: "ionicons",
        },
      ],
      [
        "salary",
        {
          id: "salary",
          displayName: "Salary",
          color: "#16a34a",
          icon: "cash-outline",
          iconLibrary: "ionicons",
        },
      ],
    ]),
}));

jest.mock("@/components/add-transaction/CategoryPicker", () => ({
  CategoryPicker: (): null => null,
}));

jest.mock("@/components/add-transaction/OptionalSection", () => ({
  OptionalSection: (): null => null,
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): null => null,
  IconLibrary: {},
}));

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (): null => null,
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));

jest.mock("@/components/ui/EmptyStateCard", () => ({
  EmptyStateCard: (): null => null,
}));

jest.mock("@/components/budget/BudgetAlertModal", () => ({
  BudgetAlertModal: (): null => null,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
  },
  impactAsync: jest.fn((): Promise<void> => Promise.resolve()),
}));

jest.mock("@/services/recurring-payment-service", () => ({
  createRecurringPayment: (...args: unknown[]): unknown =>
    mockCreateRecurringPayment(...args),
  deleteRecurringPayment: (...args: unknown[]): unknown =>
    mockDeleteRecurringPayment(...args),
  RECURRING_PAYMENT_SERVICE_ERROR_CODES: {
    ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
    CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
    INVALID_START_DATE: "RECURRING_PAYMENT_INVALID_START_DATE",
  },
}));

jest.mock("@/services/transaction-service", () => ({
  createTransaction: (...args: unknown[]): unknown =>
    mockCreateTransaction(...args),
}));

jest.mock("@/services/transfer-service", () => ({
  createTransfer: (...args: unknown[]): unknown => mockCreateTransfer(...args),
}));

import {
  ManualTransactionEntry,
  type ManualTransactionEntryHandle,
} from "@/components/add-transaction/ManualTransactionEntry";

function ManualWithHeader({
  isActive = true,
}: {
  readonly isActive?: boolean;
}): React.JSX.Element {
  const manualRef = React.useRef<ManualTransactionEntryHandle>(null);

  return (
    <>
      <Pressable
        testID="header-save"
        onPress={() => {
          void manualRef.current?.save();
        }}
      />
      <ManualTransactionEntry ref={manualRef} isActive={isActive} />
    </>
  );
}

function focusAmount(): void {
  fireEvent(screen.getByTestId("manual-amount-input"), "focus", {});
}

describe("ManualTransactionEntry compact focus contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTransaction.mockResolvedValue({ id: "transaction-1" });
    mockCreateTransfer.mockResolvedValue(undefined);
    mockCreateRecurringPayment.mockResolvedValue({ id: "recurring-1" });
    mockDeleteRecurringPayment.mockResolvedValue(undefined);
  });

  it("starts with a regular amount field and no calculator", () => {
    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-amount-input")).toHaveProp(
      "showSoftInputOnFocus",
      false
    );
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();
  });

  it("keeps direct input and calculator edits synchronized while focused", async () => {
    render(<ManualTransactionEntry />);

    focusAmount();
    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1234.5");

    expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue(
      "1,234.5"
    );
    expect(screen.getByTestId("calculator-key-1")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calculator-key-plus"));
    fireEvent.press(screen.getByTestId("calculator-key-2"));
    fireEvent.press(screen.getByTestId("calculator-key-equals"));

    await waitFor(() =>
      expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue(
        "1,236.5"
      )
    );
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it("evaluates on Done, dismisses the calculator, and never saves", async () => {
    render(<ManualTransactionEntry />);

    focusAmount();
    fireEvent.press(screen.getByTestId("calculator-key-2"));
    fireEvent.press(screen.getByTestId("calculator-key-plus"));
    fireEvent.press(screen.getByTestId("calculator-key-3"));
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    await waitFor(() =>
      expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue("5")
    );
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateTransfer).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("keeps header Save as the only persistence action", async () => {
    render(<ManualWithHeader />);

    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1");
    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() =>
      expect(mockCreateTransaction).toHaveBeenCalledTimes(1)
    );
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        currency: "EGP",
        accountId: "cash-1",
        categoryId: "food",
        source: "MANUAL",
        type: "EXPENSE",
      })
    );
  });

  it("dismisses focus when Manual deactivates without destroying the draft", async () => {
    const view = render(<ManualTransactionEntry isActive />);

    focusAmount();
    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "12");
    expect(screen.getByTestId("calculator-key-1")).toBeTruthy();

    view.rerender(<ManualTransactionEntry isActive={false} />);

    await waitFor(() =>
      expect(screen.queryByTestId("calculator-key-1")).toBeNull()
    );
    expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue("12");

    view.rerender(<ManualTransactionEntry isActive />);

    expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue("12");
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();
  });

  it("keeps source and target transfer focus independent and saves the edited conversion", async () => {
    render(<ManualWithHeader />);

    fireEvent.press(screen.getByTestId("type-tab-TRANSFER"));

    const sourceInput = screen.getByTestId("manual-amount-input");
    expect(
      screen.getByTestId("manual-amount-input-trailing-adornment")
    ).toHaveTextContent("EGP");

    fireEvent(sourceInput, "focus", {});
    fireEvent.changeText(sourceInput, "10");
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    const targetInput = await screen.findByTestId(
      "manual-transfer-target-amount-input"
    );
    expect(targetInput).toHaveProp("showSoftInputOnFocus", false);
    expect(
      screen.getByTestId(
        "manual-transfer-target-amount-input-trailing-adornment"
      )
    ).toHaveTextContent("USD");

    fireEvent(targetInput, "focus", {});
    fireEvent.press(screen.getByTestId("calculator-key-2"));
    fireEvent.press(screen.getByTestId("calculator-key-0"));
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    await waitFor(() => expect(targetInput).toHaveDisplayValue("20"));
    expect(sourceInput).toHaveDisplayValue("10");
    expect(mockCreateTransfer).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(mockCreateTransfer).toHaveBeenCalledTimes(1));
    expect(mockCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10,
        currency: "EGP",
        fromAccountId: "cash-1",
        toAccountId: "usd-1",
        convertedAmount: 20,
        exchangeRate: 2,
      })
    );
  });
});
