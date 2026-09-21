import { render, screen } from "@testing-library/react-native";
import React from "react";

let mockTabBarHeight = 114;

jest.mock("@react-navigation/bottom-tabs", () => {
  const actual = jest.requireActual<
    typeof import("@react-navigation/bottom-tabs")
  >("@react-navigation/bottom-tabs");

  return {
    ...actual,
    useBottomTabBarHeight: (): number => mockTabBarHeight,
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: {
      readonly language: string;
      readonly resolvedLanguage: string;
    };
    readonly t: (key: string) => string;
  } => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string): string => key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: (): null => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34 }),
}));
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));
jest.mock("@/components/metals/AddHoldingModal", () => ({
  AddHoldingModal: (): null => null,
}));
jest.mock("@/components/metals/MetalPortfolioScreen", () => ({
  MetalPortfolioScreen: ({
    bottomInset,
  }: {
    readonly bottomInset: number;
  }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <View
        testID="metals-inset-contract"
        accessibilityValue={{ now: bottomInset }}
      />
    );
  },
}));
jest.mock("@/components/stats/CategoryDrilldownCard", () => ({
  CategoryDrilldownCard: (): null => null,
}));
jest.mock("@/components/stats/MonthlyExpenseChart", () => ({
  MonthlyExpenseChart: (): null => null,
}));
jest.mock("@/components/stats/QuickStats", () => ({
  QuickStats: (): null => null,
}));
jest.mock("@/hooks/useMetalPortfolio", () => ({
  useMetalPortfolio: (): {
    readonly error: null;
    readonly isLoading: false;
    readonly isOffline: false;
    readonly onFilterChange: jest.Mock;
    readonly portfolio: null;
    readonly refresh: jest.Mock;
    readonly selectedFilter: string;
  } => ({
    error: null,
    isLoading: false,
    isOffline: false,
    onFilterChange: jest.fn(),
    portfolio: null,
    refresh: jest.fn(),
    selectedFilter: "all",
  }),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));
jest.mock("@/hooks/useQuickActionFabVisibility", () => ({
  useSuppressQuickActionFabWhenFocused: (): void => undefined,
}));
jest.mock("@/hooks/useStatsCurrencyFilter", () => ({
  useStatsCurrencyFilter: () => ({
    availableCurrencies: ["EGP"],
    selectedCurrency: "EGP",
    selectCurrency: jest.fn(),
  }),
}));

import MetalsScreen from "@/app/(private)/(tabs)/metals";
import StatsScreen from "@/app/(private)/(tabs)/stats";

describe("absolute tab bar content clearance", () => {
  beforeEach((): void => {
    mockTabBarHeight = 114;
  });

  it("uses the measured tab bar height for Metals list content", () => {
    render(<MetalsScreen />);

    expect(screen.getByTestId("metals-inset-contract")).toHaveProp(
      "accessibilityValue",
      { now: 114 }
    );
  });

  it("uses the measured tab bar height for Stats scroll content", () => {
    render(<StatsScreen />);

    expect(screen.getByTestId("stats-scroll")).toHaveProp(
      "contentContainerStyle",
      expect.objectContaining({ paddingBottom: 134 })
    );
  });
});
