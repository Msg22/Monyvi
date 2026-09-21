import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import MyMetalsRoute from "@/app/(private)/(tabs)/metals";

let mockLanguage = "en";
let mockPortfolioState: MetalPortfolioReadModel | null;
let mockReadinessState: MetalPortfolioSectionReadiness;

const ready: MetalPortfolioSectionReadiness = {
  holdings: true,
  rateCurrency: true,
  recentHistory: true,
  realizedSale: true,
  summary: true,
};
const emptyPortfolio = {
  activeHoldings: [],
  holdings: [],
  listState: "PORTFOLIO_EMPTY",
  recentHistory: [],
} as unknown as MetalPortfolioReadModel;
const populatedPortfolio = {
  ...emptyPortfolio,
  activeHoldings: [{ id: "gold-1", metalType: "GOLD" }],
  listState: "POPULATED",
} as unknown as MetalPortfolioReadModel;

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => {
      const copy: Readonly<Record<string, Readonly<Record<string, string>>>> = {
        en: { my_metals: "My Metals", add_holding: "Add holding" },
        ar: { my_metals: "ذهبك وفضتك", add_holding: "إضافة مقتنى" },
      };
      return copy[mockLanguage]?.[key] ?? key;
    },
  }),
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  useBottomTabBarHeight: (): number => 80,
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));

jest.mock("@/hooks/useMetalPortfolio", () => ({
  useMetalPortfolio: () => ({
    error: null,
    isLoading: false,
    isOffline: false,
    onFilterChange: jest.fn(),
    portfolio: mockPortfolioState,
    rateProviderObservedAt: null,
    readiness: mockReadinessState,
    recentHistory: [],
    refresh: jest.fn(),
    selectedFilter: "ALL",
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      rightAction,
      title,
    }: {
      readonly rightAction?: { readonly onPress: () => void };
      readonly title: string;
    }): React.JSX.Element =>
      ReactActual.createElement(
        View,
        { testID: "mock-metals-header" },
        ReactActual.createElement(Text, null, title),
        rightAction
          ? ReactActual.createElement(Pressable, {
              onPress: rightAction.onPress,
              testID: "mock-header-add",
            })
          : null
      ),
  };
});

jest.mock("@/components/metals/MetalPortfolioScreen", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalPortfolioScreen: ({
      onAddPress,
    }: {
      readonly onAddPress?: () => void;
    }): React.JSX.Element =>
      ReactActual.createElement(Pressable, {
        onPress: onAddPress,
        testID: "mock-empty-cta",
      }),
  };
});

jest.mock("@/components/metals/AddHoldingModal", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AddHoldingModal: ({ visible }: { readonly visible: boolean }): React.JSX.Element =>
      ReactActual.createElement(View, {
        accessibilityState: { expanded: visible },
        testID: "mock-add-holding-modal",
      }),
  };
});

describe("MyMetalsRoute empty-state chrome", () => {
  beforeEach(() => {
    mockLanguage = "en";
    mockPortfolioState = emptyPortfolio;
    mockReadinessState = ready;
  });

  it("uses the empty CTA as the only Add action and opens the existing journey", () => {
    render(<MyMetalsRoute />);

    expect(screen.getByText("My Metals")).toBeTruthy();
    expect(screen.queryByTestId("mock-header-add")).toBeNull();

    fireEvent.press(screen.getByTestId("mock-empty-cta"));
    expect(
      screen.getByTestId("mock-add-holding-modal").props.accessibilityState
    ).toEqual({ expanded: true });
  });

  it("keeps the header Add action for a populated portfolio", () => {
    mockPortfolioState = populatedPortfolio;
    render(<MyMetalsRoute />);

    expect(screen.getByTestId("mock-header-add")).toBeTruthy();
  });

  it("uses the approved Arabic header while empty", () => {
    mockLanguage = "ar";
    render(<MyMetalsRoute />);

    expect(screen.getByText("ذهبك وفضتك")).toBeTruthy();
    expect(screen.queryByTestId("mock-header-add")).toBeNull();
  });
});
