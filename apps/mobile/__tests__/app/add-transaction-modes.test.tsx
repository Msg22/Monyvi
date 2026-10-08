import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

let mockRouteParams: Readonly<Record<string, string | undefined>> = {};
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: (): {
    readonly back: jest.Mock;
    readonly push: jest.Mock;
    readonly replace: jest.Mock;
  } => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: (): Readonly<Record<string, string | undefined>> =>
    mockRouteParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => {
      const normalized = key.toLowerCase();
      if (normalized.includes("manual")) return "Manual";
      if (normalized.includes("voice")) return "Voice";
      return key;
    },
  }),
}));

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    accounts: [
      {
        id: "cash-1",
        name: "Cash",
        isDefault: true,
        type: "CASH",
        balance: 1000,
        currency: "EGP",
      },
    ],
  }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    expenseCategories: [
      {
        id: "cat-food",
        displayName: "Food",
        color: "#16a34a",
        icon: "restaurant-outline",
        iconLibrary: "ionicons",
      },
    ],
    incomeCategories: [],
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: () => ({ children: [] }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: () => ({ selectedSnapshot: null }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));

jest.mock("@/hooks/useBudgetAlert", () => ({
  useBudgetAlert: () => ({
    alert: null,
    isVisible: false,
    checkAfterTransaction: jest.fn().mockResolvedValue(false),
    dismiss: jest.fn(),
    viewBudget: jest.fn(),
  }),
}));

jest.mock("@/hooks/useFormScroll", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    useFormScroll: () => ({
      scrollViewRef: ReactActual.createRef(),
      getFieldRef: () => ReactActual.createRef(),
      onScroll: jest.fn(),
      scrollToFirstError: jest.fn(),
    }),
  };
});

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: () =>
    new Map([
      [
        "cat-food",
        {
          id: "cat-food",
          displayName: "Food",
          color: "#16a34a",
          icon: "restaurant-outline",
          iconLibrary: "ionicons",
        },
      ],
    ]),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({ title }: { readonly title: string }): React.JSX.Element => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <Text testID="page-header">{title}</Text>;
  },
}));

jest.mock("@/components/add-transaction/AmountDisplay", () => ({
  AmountDisplay: ({
    amount,
  }: {
    readonly amount: string;
  }): React.JSX.Element => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <Text testID="manual-amount">{amount}</Text>;
  },
}));

jest.mock("@/components/add-transaction/CalculatorKeypad", () => ({
  CalculatorKeypad: ({
    onKeyPress,
  }: {
    readonly onKeyPress: (key: "1") => Promise<void>;
  }): React.JSX.Element => {
    const { Pressable, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <Pressable testID="key-1" onPress={() => void onKeyPress("1")}>
        <Text>1</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/add-transaction/TypeTabs", () => ({
  TypeTabs: (): null => null,
}));

jest.mock("@/components/add-transaction/CategoryPicker", () => ({
  CategoryPicker: (): null => null,
}));

jest.mock("@/components/add-transaction/TransferFields", () => ({
  TransferFields: (): null => null,
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

import AddTransaction from "@/app/(private)/add-transaction";

function renderRoute(mode: string | undefined): ReturnType<typeof render> {
  mockRouteParams = mode === undefined ? {} : { mode };
  return render(<AddTransaction />);
}

describe("AddTransaction unified mode intent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  it("uses one Add Transaction shell and selects Voice for mode=voice", () => {
    renderRoute("voice");

    expect(screen.getAllByTestId("page-header")).toHaveLength(1);

    expect(screen.getByRole("tab", { name: "Voice" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    expect(screen.getByRole("tab", { name: "Manual" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: false })
    );
  });

  it("preserves observable Manual amount state across safe mode switches", () => {
    renderRoute("manual");

    fireEvent.press(screen.getByTestId("key-1"));
    expect(screen.getByTestId("manual-amount")).toHaveTextContent("1");

    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));

    expect(screen.getByTestId("manual-amount")).toHaveTextContent("1");
  });
});
