import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import MyMetalsRoute from "@/app/(private)/(tabs)/metals";

let mockLanguage: "en" | "ar" = "en";
let mockPortfolioState: MetalPortfolioReadModel | null;
let mockReadinessState: MetalPortfolioSectionReadiness;
let mockErrorState: Error | null = null;
let mockFabSuppression = false;
let mockEmptyHasHistory = false;

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
  useTranslation: () => ({
    t: (key: string): string => {
      if (key === "my_metals")
        return mockLanguage === "ar" ? "معادني" : "My Metals";
      if (key === "add_holding")
        return mockLanguage === "ar" ? "إضافة مقتنى" : "Add holding";
      return key;
    },
  }),
}));

jest.mock("@/hooks/useUiPolishCopy", () => ({
  useUiPolishCopy: () => ({
    wealth_breakdown: {},
    metals_empty:
      mockLanguage === "ar"
        ? {
            header: "ذهبك وفضتك",
            title: "ابدأ تتابع ذهبك وفضتك",
            body: "ضيف أول قطعة علشان تتابع قيمتها مع الوقت.",
            cta: "ضيف أول قطعة",
          }
        : {
            header: "My Metals",
            title: "Start tracking your gold and silver",
            body: "Add your first holding to follow its value over time.",
            cta: "Add your first holding",
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
    error: mockErrorState,
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

jest.mock("@/hooks/useQuickActionFabVisibility", () => ({
  useSuppressQuickActionFabWhenFocused: (isSuppressed: boolean): void => {
    mockFabSuppression = isSuppressed;
  },
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

jest.mock("@/components/metals/MetalPortfolioEmptyState", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const actual = jest.requireActual<
    typeof import("@/components/metals/MetalPortfolioEmptyState")
  >("@/components/metals/MetalPortfolioEmptyState");
  return {
    ...actual,
    MetalPortfolioEmptyState: ({
      hasHistory,
      onAddPress,
    }: {
      readonly hasHistory?: boolean;
      readonly onAddPress: () => void;
    }): React.JSX.Element => {
      mockEmptyHasHistory = Boolean(hasHistory);
      return ReactActual.createElement(
        View,
        { testID: "mock-premium-empty-state" },
        ReactActual.createElement(Pressable, {
          onPress: onAddPress,
          testID: "mock-empty-cta",
        })
      );
    },
  };
});

jest.mock("@/components/metals/MetalPortfolioScreen", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalPortfolioScreen: (): React.JSX.Element =>
      ReactActual.createElement(
        View,
        { testID: "mock-populated-portfolio" },
        ReactActual.createElement(View, {
          testID: "metal-portfolio-summary-layout",
        }),
        ReactActual.createElement(View, {
          testID: "metal-portfolio-filter-bar",
        }),
        ReactActual.createElement(Text, null, "Holdings")
      ),
  };
});

jest.mock("@/components/metals/AddHoldingModal", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AddHoldingModal: ({
      visible,
    }: {
      readonly visible: boolean;
    }): React.JSX.Element =>
      ReactActual.createElement(View, {
        accessibilityState: { expanded: visible },
        testID: "mock-add-holding-modal",
      }),
  };
});

describe("MyMetalsRoute premium empty-state chrome", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = "en";
    mockPortfolioState = emptyPortfolio;
    mockReadinessState = ready;
    mockErrorState = null;
    mockFabSuppression = false;
    mockEmptyHasHistory = false;
  });

  it("uses the empty CTA as the only Add action and hides zero portfolio chrome", () => {
    render(<MyMetalsRoute />);

    expect(screen.getByText("My Metals")).toBeTruthy();
    expect(screen.getByTestId("mock-premium-empty-state")).toBeTruthy();
    expect(screen.getAllByTestId("mock-empty-cta")).toHaveLength(1);
    expect(screen.queryByTestId("mock-header-add")).toBeNull();
    expect(screen.queryByTestId("metal-portfolio-summary-layout")).toBeNull();
    expect(screen.queryByTestId("metal-portfolio-filter-bar")).toBeNull();
    expect(screen.queryByText("Holdings")).toBeNull();
    expect(mockFabSuppression).toBe(true);

    fireEvent.press(screen.getByTestId("mock-empty-cta"));
    expect(router.push).toHaveBeenCalledWith("/metals/add");
    expect(screen.queryByTestId("mock-add-holding-modal")).toBeNull();
  });

  it("retains populated controls and both existing Add entry points", () => {
    mockPortfolioState = populatedPortfolio;
    render(<MyMetalsRoute />);

    expect(screen.getByTestId("mock-header-add")).toBeTruthy();
    expect(screen.getByTestId("mock-populated-portfolio")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-summary-layout")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-filter-bar")).toBeTruthy();
    expect(screen.getByText("Holdings")).toBeTruthy();
    expect(mockFabSuppression).toBe(false);

    fireEvent.press(screen.getByTestId("mock-header-add"));
    expect(router.push).toHaveBeenCalledWith("/metals/add");
    expect(screen.queryByTestId("mock-add-holding-modal")).toBeNull();
  });

  it("preserves the existing error surface instead of claiming the portfolio is empty", () => {
    mockErrorState = new Error("read failed");
    render(<MyMetalsRoute />);

    expect(screen.queryByTestId("mock-premium-empty-state")).toBeNull();
    expect(screen.getByTestId("mock-populated-portfolio")).toBeTruthy();
    expect(mockFabSuppression).toBe(false);
  });

  it("keeps terminal History available when there are no active holdings", () => {
    mockPortfolioState = {
      ...emptyPortfolio,
      hasTerminalHistory: true,
    };

    render(<MyMetalsRoute />);

    expect(screen.getByTestId("mock-premium-empty-state")).toBeTruthy();
    expect(mockEmptyHasHistory).toBe(true);
  });

  it("uses the approved Arabic empty-state header", () => {
    mockLanguage = "ar";
    render(<MyMetalsRoute />);

    expect(screen.getByText("ذهبك وفضتك")).toBeTruthy();
    expect(screen.queryByText("My Metals")).toBeNull();
    expect(screen.queryByTestId("mock-header-add")).toBeNull();
  });
});
