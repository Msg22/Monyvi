import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import MyMetalsRoute from "../../app/(private)/(tabs)/metals";

const mockPush = jest.fn();
const mockSuppressFab = jest.fn();
const mockOnFilterChange = jest.fn();
const mockRefresh = jest.fn();
let mockIsEmpty = true;

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]): unknown => mockPush(...args) },
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  useBottomTabBarHeight: (): number => 80,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key === "my_metals" ? "My Metals" : key,
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));

jest.mock("@/hooks/useQuickActionFabVisibility", () => ({
  useSuppressQuickActionFabWhenFocused: (suppressed: boolean): void => {
    mockSuppressFab(suppressed);
  },
}));

jest.mock("@/hooks/metal-portfolio-readiness", () => ({
  isTrueMetalPortfolioEmpty: (): boolean => mockIsEmpty,
}));

jest.mock("@/hooks/useMetalPortfolio", () => ({
  useMetalPortfolio: () => ({
    error: null,
    isLoading: false,
    onFilterChange: mockOnFilterChange,
    portfolio: {
      activeHoldings: [],
      holdings: [],
      listState: "PORTFOLIO_EMPTY",
      recentHistory: [],
    },
    rateProviderObservedAt: null,
    readiness: {
      holdings: true,
      rateCurrency: true,
      recentHistory: true,
      realizedSale: true,
      summary: true,
    },
    recentHistory: [],
    refresh: mockRefresh,
    selectedFilter: "ALL",
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => {
  const { Text, View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({ title }: { readonly title: string }): React.JSX.Element => (
      <View><Text>{title}</Text></View>
    ),
  };
});

jest.mock("@/components/metals/MetalPortfolioScreen", () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalPortfolioScreen: ({
      onAddHoldingPress,
      onHistoryPress,
      onHoldingPress,
      onRetry,
    }: {
      readonly onAddHoldingPress?: () => void;
      readonly onHistoryPress: () => void;
      readonly onHoldingPress: (id: string) => void;
      readonly onRetry: () => void;
    }): React.JSX.Element => (
      <View testID="portfolio-inline-route">
        <Pressable testID="route-add" onPress={onAddHoldingPress}><Text>Add</Text></Pressable>
        <Pressable testID="route-history" onPress={onHistoryPress}><Text>History</Text></Pressable>
        <Pressable testID="route-holding" onPress={() => onHoldingPress("disposed-1")}><Text>Holding</Text></Pressable>
        <Pressable testID="route-retry" onPress={onRetry}><Text>Retry</Text></Pressable>
      </View>
    ),
  };
});

beforeEach((): void => {
  jest.clearAllMocks();
  mockIsEmpty = true;
});

describe("My Metals empty-active-items routing", () => {
  it("retains the portfolio screen rather than replacing rates and History with a full-screen empty state", (): void => {
    render(<MyMetalsRoute />);
    expect(screen.getByText("My Metals")).toBeTruthy();
    expect(screen.getByTestId("portfolio-inline-route")).toBeTruthy();
    expect(mockSuppressFab).toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByTestId("route-add"));
    expect(mockPush).toHaveBeenCalledWith("/metals/add");
    fireEvent.press(screen.getByTestId("route-history"));
    expect(mockPush).toHaveBeenCalledWith("/metals/history");
    fireEvent.press(screen.getByTestId("route-holding"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/metals/[id]",
      params: { id: "disposed-1" },
    });
    fireEvent.press(screen.getByTestId("route-retry"));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("preserves ordinary FAB visibility behavior when active holdings exist", (): void => {
    mockIsEmpty = false;
    render(<MyMetalsRoute />);
    expect(mockSuppressFab).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("portfolio-inline-route")).toBeTruthy();
  });
});
