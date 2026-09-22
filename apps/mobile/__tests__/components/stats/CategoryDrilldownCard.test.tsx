import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { Transaction } from "@monyvi/db";

const mockT = (key: string): string => key;
const mockFocusCallbacks: Array<() => void> = [];

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void): void => {
    mockFocusCallbacks.push(callback);
  },
}));

function triggerFocusEvent(): void {
  const callback = mockFocusCallbacks.at(-1);
  if (!callback) {
    throw new Error(
      "CategoryDrilldownCard must register a useFocusEffect lifecycle handler"
    );
  }
  act(() => {
    callback();
  });
}

jest.mock("react-native-gifted-charts", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const reactNative = jest.requireActual<typeof import("react-native")>(
    "react-native"
  );
  return {
    __esModule: true,
    PieChart: (): React.ReactElement =>
      react.createElement(reactNative.View, { testID: "mock-pie-chart" }),
  };
});

jest.mock("@expo/vector-icons", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const reactNative = jest.requireActual<typeof import("react-native")>(
    "react-native"
  );
  return {
    Ionicons: (props: {
      readonly name: string;
      readonly testID?: string;
    }): React.ReactElement =>
      react.createElement(reactNative.Text, {
        testID: props.testID ?? `icon-${props.name}`,
      }),
  };
});

interface TestCategory {
  readonly id: string;
  readonly displayName: string;
  readonly level: number;
  readonly parentId: string | null;
}

let mockCategories: readonly TestCategory[] = [];
let mockTransactionsByCurrency: Record<string, Transaction[]> = {};

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: (): {
    categories: readonly TestCategory[];
    isLoading: boolean;
    error: unknown;
    retry: () => void;
  } => ({
    categories: mockCategories,
    isLoading: false,
    error: null,
    retry: (): void => undefined,
  }),
}));

jest.mock("@/hooks/useCategoryDrilldownTransactions", () => ({
  useCategoryDrilldownTransactions: (
    _year: number,
    _month: number,
    currency: string
  ): {
    transactions: readonly Transaction[];
    isLoading: boolean;
    error: Error | null;
  } => ({
    transactions: mockTransactionsByCurrency[currency] ?? [],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: mockT,
  }),
}));

import { CategoryDrilldownCard } from "@/components/stats/CategoryDrilldownCard";

const FOOD: TestCategory = {
  id: "cat-food",
  displayName: "Food",
  level: 1,
  parentId: null,
};
const RESTAURANTS: TestCategory = {
  id: "cat-restaurants",
  displayName: "Restaurants",
  level: 2,
  parentId: "cat-food",
};
const CAFES: TestCategory = {
  id: "cat-cafes",
  displayName: "Cafes",
  level: 3,
  parentId: "cat-restaurants",
};

function makeTransaction(categoryId: string, amount: number): Transaction {
  return {
    id: `tx-${categoryId}-${amount}`,
    categoryId,
    amount,
  } as unknown as Transaction;
}

describe("CategoryDrilldownCard chevron accuracy", () => {
  beforeEach(() => {
    mockCategories = [FOOD, RESTAURANTS, CAFES];
    mockTransactionsByCurrency = {};
  });

  it("hides the chevron and drilldown behavior when only the parent has spending", () => {
    mockTransactionsByCurrency.EGP = [makeTransaction("cat-food", 50)];

    render(<CategoryDrilldownCard currency="EGP" />);

    expect(screen.getByTestId("drilldown-category-cat-food")).toHaveProp(
      "accessibilityRole",
      "text"
    );
    expect(screen.queryByTestId("drilldown-chevron-cat-food")).toBeNull();

    fireEvent.press(screen.getByTestId("drilldown-category-cat-food"));
    expect(screen.getByText("Food")).toBeOnTheScreen();
    expect(screen.queryByText("no_spending_data")).toBeNull();
  });

  it("shows the chevron when a direct child has spending", () => {
    mockTransactionsByCurrency.EGP = [makeTransaction("cat-restaurants", 40)];

    render(<CategoryDrilldownCard currency="EGP" />);

    expect(screen.getByTestId("drilldown-chevron-cat-food")).toBeOnTheScreen();
    expect(screen.getByTestId("drilldown-category-cat-food")).toHaveProp(
      "accessibilityRole",
      "button"
    );
  });

  it("shows the chevron when only a deeper descendant has spending", () => {
    mockTransactionsByCurrency.EGP = [makeTransaction("cat-cafes", 25)];

    render(<CategoryDrilldownCard currency="EGP" />);

    expect(screen.getByTestId("drilldown-chevron-cat-food")).toBeOnTheScreen();
  });

  it("recalculates chevron availability when the selected currency changes", () => {
    mockTransactionsByCurrency.EGP = [makeTransaction("cat-food", 50)];
    mockTransactionsByCurrency.USD = [makeTransaction("cat-restaurants", 30)];

    const { rerender } = render(<CategoryDrilldownCard currency="EGP" />);
    expect(screen.queryByTestId("drilldown-chevron-cat-food")).toBeNull();
    expect(screen.getByTestId("drilldown-category-cat-food")).toHaveProp(
      "accessibilityRole",
      "text"
    );

    rerender(<CategoryDrilldownCard currency="USD" />);
    expect(screen.getByTestId("drilldown-chevron-cat-food")).toBeOnTheScreen();
    expect(screen.getByTestId("drilldown-category-cat-food")).toHaveProp(
      "accessibilityRole",
      "button"
    );
  });
});

describe("CategoryDrilldownCard navigation reset", () => {
  beforeEach(() => {
    mockCategories = [FOOD, RESTAURANTS, CAFES];
    mockTransactionsByCurrency = {};
    mockFocusCallbacks.length = 0;
  });

  function renderDrilledCard(): void {
    mockTransactionsByCurrency.EGP = [
      makeTransaction("cat-food", 50),
      makeTransaction("cat-restaurants", 40),
    ];
    mockTransactionsByCurrency.USD = [
      makeTransaction("cat-food", 10),
      makeTransaction("cat-cafes", 5),
    ];
  }

  it("returns to root categories after leaving and returning to Stats", () => {
    renderDrilledCard();
    render(<CategoryDrilldownCard currency="EGP" />);

    fireEvent.press(screen.getByTestId("drilldown-category-cat-food"));
    expect(screen.getByTestId("drilldown-category-cat-restaurants")).toBeOnTheScreen();
    expect(screen.queryByTestId("drilldown-category-cat-food")).toBeNull();

    triggerFocusEvent();

    expect(screen.getByTestId("drilldown-category-cat-food")).toBeOnTheScreen();
    expect(screen.queryByTestId("drilldown-category-cat-restaurants")).toBeNull();
  });

  it("returns to root categories when the selected currency changes", () => {
    renderDrilledCard();
    const { rerender } = render(<CategoryDrilldownCard currency="EGP" />);

    fireEvent.press(screen.getByTestId("drilldown-category-cat-food"));
    expect(screen.getByText("Restaurants")).toBeOnTheScreen();

    rerender(<CategoryDrilldownCard currency="USD" />);

    expect(screen.getByTestId("drilldown-category-cat-food")).toBeOnTheScreen();
    expect(screen.queryByTestId("drilldown-category-cat-restaurants")).toBeNull();
  });

  it("keeps the drilldown position across ordinary re-renders while staying on Stats", () => {
    renderDrilledCard();
    const { rerender } = render(<CategoryDrilldownCard currency="EGP" />);

    fireEvent.press(screen.getByTestId("drilldown-category-cat-food"));
    expect(screen.getByText("Restaurants")).toBeOnTheScreen();

    rerender(<CategoryDrilldownCard currency="EGP" />);

    expect(screen.getByText("Restaurants")).toBeOnTheScreen();
    expect(screen.queryByTestId("drilldown-category-cat-food")).toBeNull();
  });
});
