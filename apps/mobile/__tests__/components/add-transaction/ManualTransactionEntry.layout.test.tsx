import { render, screen } from "@testing-library/react-native";
import React from "react";

import { Dropdown } from "@/components/ui/Dropdown";
import { TextField } from "@/components/ui/TextField";

let mockWindowDimensions = {
  width: 390,
  height: 844,
  scale: 1,
  fontScale: 1,
};

jest.mock("react-native", () => {
  const actual =
    jest.requireActual<typeof import("react-native")>("react-native");
  const mocked = {};

  Object.defineProperties(mocked, Object.getOwnPropertyDescriptors(actual));
  Object.defineProperty(mocked, "useWindowDimensions", {
    configurable: true,
    enumerable: true,
    value: (): typeof mockWindowDimensions => mockWindowDimensions,
  });

  return mocked;
});

let mockLocaleFontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    isRTL: false,
    fontFamily: mockLocaleFontFamily,
  }),
}));

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
  CategoryIconFromModel: (): null => null,
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
  beforeEach(() => {
    mockWindowDimensions = {
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1,
    };
    mockLocaleFontFamily = {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    };
  });

  it("keeps required Account and Category on one normal-width row", () => {
    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-account-category-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-row gap-3")
    );
    expect(screen.getByText("Account *")).toBeTruthy();
    expect(screen.getByText("Category *")).toBeTruthy();
    expect(screen.getByTestId("manual-account-selector-trigger")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );
    expect(screen.getByTestId("manual-category-selector-trigger")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );
  });

  it("reflows the selector row on compact width", () => {
    mockWindowDimensions = {
      width: 320,
      height: 640,
      scale: 1,
      fontScale: 1,
    };

    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-account-category-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-col gap-3")
    );
  });

  it("reflows the selector row for enlarged text without shrinking labels", () => {
    mockWindowDimensions = {
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1.5,
    };

    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-account-category-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-col gap-3")
    );
  });

  it("uses the approved amount typography and 8dp field-label gap", () => {
    render(<ManualTransactionEntry />);

    const amountField = screen
      .UNSAFE_getAllByType(TextField)
      .find((node) => node.props.testID === "manual-amount-input");
    if (!amountField) throw new Error("Manual amount TextField not found");

    expect(amountField.props.className).toContain("text-lg");
    expect(amountField.props.className).toContain("leading-7");
    expect(amountField.props.labelClassName).toContain("mb-2");
    expect(amountField.props.style).toEqual({
      fontFamily: "Inter_500Medium",
    });
    expect(amountField.props.labelStyle).toEqual({
      fontFamily: "Inter_400Regular",
    });
  });

  it("applies locale fonts to selector values and compact Optional copy", () => {
    render(<ManualTransactionEntry />);

    const dropdowns = screen.UNSAFE_getAllByType(Dropdown);
    const accountDropdown = dropdowns.find(
      (node) => node.props.testID === "manual-account-selector"
    );
    const categoryDropdown = dropdowns.find(
      (node) => node.props.testID === "manual-category-selector"
    );
    if (!accountDropdown || !categoryDropdown) {
      throw new Error("Manual selector Dropdowns not found");
    }

    for (const dropdown of [accountDropdown, categoryDropdown]) {
      expect(dropdown.props.selectedTextClassName).toContain("text-sm");
      expect(dropdown.props.selectedTextClassName).toContain("leading-[22px]");
      expect(dropdown.props.selectedTextStyle).toEqual({
        fontFamily: "Inter_400Regular",
      });
    }

    expect(screen.getByText("Add more details")).toHaveStyle({
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      lineHeight: 28,
    });
    expect(screen.getByText("Note, date, recurring")).toHaveStyle({
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 20,
    });
  });

  it("switches compact Manual typography to Noto Sans Arabic", () => {
    mockLocaleFontFamily = {
      regular: "NotoSansArabic_400Regular",
      medium: "NotoSansArabic_500Medium",
      semiBold: "NotoSansArabic_600SemiBold",
      bold: "NotoSansArabic_700Bold",
    };

    render(<ManualTransactionEntry />);

    const amountField = screen
      .UNSAFE_getAllByType(TextField)
      .find((node) => node.props.testID === "manual-amount-input");
    const accountDropdown = screen
      .UNSAFE_getAllByType(Dropdown)
      .find((node) => node.props.testID === "manual-account-selector");
    if (!amountField || !accountDropdown) {
      throw new Error("Arabic Manual typography targets not found");
    }

    expect(amountField.props.style).toEqual({
      fontFamily: "NotoSansArabic_500Medium",
    });
    expect(accountDropdown.props.selectedTextStyle).toEqual({
      fontFamily: "NotoSansArabic_400Regular",
    });
    expect(screen.getByText("Add more details")).toHaveStyle({
      fontFamily: "NotoSansArabic_700Bold",
    });
  });

  it("uses the approved collapsed optional-details card with calendar helper copy", () => {
    render(<ManualTransactionEntry />);

    expect(screen.getByText("Add more details")).toBeTruthy();
    expect(screen.getByText("Note, date, recurring")).toBeTruthy();
    expect(screen.getByTestId("icon-calendar-outline")).toBeTruthy();
  });
});
