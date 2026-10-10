import { render, screen } from "@testing-library/react-native";
import React from "react";
import * as ReactNative from "react-native";

const mockBack = jest.fn();

interface MockAccount {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly type: "CASH";
  readonly balance: number;
  readonly currency: "EGP";
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

jest.mock("expo-router", () => ({
  useRouter: (): { readonly back: jest.Mock; readonly push: jest.Mock } => ({
    back: mockBack,
    push: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 24 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, options?: Record<string, unknown>) => string;
  } => ({
    t: (key: string): string =>
      ({
        amount: "Amount",
        account: "Account",
        category: "Category",
        add_more_details: "Add more details",
        add_more_details_helper: "Note, date, recurring",
        expense: "Expense",
        income: "Income",
        transfer: "Transfer",
      })[key] ?? key,
  }),
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: (): null => null,
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
    readonly incomeCategories: readonly [];
    readonly isLoading: false;
  } => ({
    expenseCategories: mockExpenseCategories,
    incomeCategories: [],
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
  useToast: () => ({ showToast: jest.fn() }),
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
    ]),
}));

jest.mock("@/components/add-transaction/CategoryPicker", () => ({
  CategoryPicker: (): null => null,
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

jest.mock("@expo/vector-icons", () => {
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => (
      <Native.Text testID={`icon-${name}`}>{name}</Native.Text>
    ),
  };
});

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
  },
  impactAsync: jest.fn((): Promise<void> => Promise.resolve()),
}));

jest.mock("@/services/recurring-payment-service", () => ({
  createRecurringPayment: jest.fn(),
  deleteRecurringPayment: jest.fn(),
  RECURRING_PAYMENT_SERVICE_ERROR_CODES: {
    ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
    CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
    INVALID_START_DATE: "RECURRING_PAYMENT_INVALID_START_DATE",
  },
}));

jest.mock("@/services/transaction-service", () => ({
  createTransaction: jest.fn(),
}));

jest.mock("@/services/transfer-service", () => ({
  createTransfer: jest.fn(),
}));

import { ManualTransactionEntry } from "@/components/add-transaction/ManualTransactionEntry";

describe("ManualTransactionEntry compact B layout", () => {
  let dimensionsSpy: jest.SpyInstance;

  beforeEach(() => {
    dimensionsSpy = jest
      .spyOn(ReactNative, "useWindowDimensions")
      .mockReturnValue({
        width: 390,
        height: 844,
        scale: 1,
        fontScale: 1,
      });
  });

  afterEach(() => {
    dimensionsSpy.mockRestore();
  });

  it("keeps required Account and Category on one normal-width row", () => {
    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-account-category-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-row gap-3")
    );
    expect(screen.getByText("Account *")).toBeTruthy();
    expect(screen.getByText("Category *")).toBeTruthy();
    expect(screen.getByTestId("manual-account-selector")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );
    expect(screen.getByTestId("manual-category-selector")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );
  });

  it("reflows the selector row on compact width", () => {
    dimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 1,
      fontScale: 1,
    });

    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-account-category-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-col gap-3")
    );
  });

  it("reflows the selector row for enlarged text without shrinking labels", () => {
    dimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1.5,
    });

    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-account-category-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-col gap-3")
    );
  });

  it("uses the approved collapsed optional-details card with calendar helper copy", () => {
    render(<ManualTransactionEntry />);

    expect(screen.getByText("Add more details")).toBeTruthy();
    expect(screen.getByText("Note, date, recurring")).toBeTruthy();
    expect(screen.getByTestId("icon-calendar-outline")).toBeTruthy();
  });
});
