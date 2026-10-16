import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type {
  MetalPortfolioHoldingInput,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import MyMetalsRoute from "@/app/(private)/(tabs)/metals";
import { portfolio as portfolioFixture } from "../components/metals/portfolio-surfaces-fixtures";

let mockLanguage: "en" | "ar" = "en";
let mockPortfolioState: MetalPortfolioReadModel | null;
let mockReadinessState: MetalPortfolioSectionReadiness;
let mockErrorState: Error | null = null;
let mockFabSuppression = false;
let mockRecentHistoryState: readonly MetalPortfolioHoldingInput[] = [];

const ready: MetalPortfolioSectionReadiness = {
  holdings: true,
  rateCurrency: true,
  recentHistory: true,
  realizedSale: true,
  summary: true,
};
const emptyPortfolio: MetalPortfolioReadModel = {
  ...portfolioFixture,
  activeHoldings: [],
  holdings: [],
  listState: "PORTFOLIO_EMPTY",
  recentHistory: [],
};
const disposedTerminalHolding: MetalPortfolioHoldingInput = {
  currentPerformanceDecimal: null,
  currentValueDecimal: null,
  id: "disposed-only",
  isEffective: true,
  isVisible: true,
  metalType: "GOLD",
  name: "Gift",
  occurredAt: new Date("2026-08-24T12:00:00.000Z"),
  physicalForm: "COIN",
  purchaseCurrency: "EGP",
  purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
  purchasePriceDecimal: "47800",
  purityCatalogVersion: "1",
  purityCode: "gold-999",
  purityFactorDecimal: "0.999",
  recentHistoryOutcome: "neutral",
  soldResultDecimal: null,
  status: "disposed",
  userId: "user-1",
  weightGramsDecimal: "10.125",
};

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
            header: "معادني",
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
    recentHistory: mockRecentHistoryState,
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

jest.mock("@/components/metals/MetalPortfolioScreen", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalPortfolioScreen: ({
      error,
      onAddHoldingPress,
      onHistoryPress,
      onHoldingPress,
      onRetry,
      portfolio,
      recentHistory,
    }: {
      readonly error: Error | null;
      readonly onAddHoldingPress: () => void;
      readonly onHistoryPress: () => void;
      readonly onHoldingPress: (holdingId: string) => void;
      readonly onRetry: () => void;
      readonly portfolio: MetalPortfolioReadModel | null;
      readonly recentHistory: readonly MetalPortfolioHoldingInput[];
    }): React.JSX.Element => {
      const holdings = portfolio?.activeHoldings ?? [];
      const isInlineEmpty =
        portfolio?.listState === "PORTFOLIO_EMPTY" && holdings.length === 0;
      return ReactActual.createElement(
        View,
        { testID: "mock-portfolio-screen" },
        ReactActual.createElement(View, {
          testID: "mock-portfolio-summary-layout",
        }),
        holdings.length > 0
          ? ReactActual.createElement(View, {
              testID: "mock-portfolio-filter-bar",
            })
          : null,
        isInlineEmpty
          ? ReactActual.createElement(View, { testID: "mock-inline-empty" })
          : null,
        ReactActual.createElement(View, {
          testID: "mock-portfolio-recent-history",
        }),
        recentHistory.length === 0
          ? ReactActual.createElement(View, {
              testID: "mock-portfolio-recent-history-empty",
            })
          : ReactActual.createElement(View, {
              testID: "mock-terminal-history",
            }),
        error
          ? ReactActual.createElement(View, { testID: "mock-portfolio-error" })
          : null,
        ReactActual.createElement(Pressable, {
          onPress: onAddHoldingPress,
          testID: "mock-screen-add",
        }),
        ReactActual.createElement(Pressable, {
          onPress: onHistoryPress,
          testID: "mock-screen-history",
        }),
        ReactActual.createElement(Pressable, {
          onPress: (): void =>
            onHoldingPress(holdings[0]?.id ?? "missing-holding"),
          testID: "mock-screen-holding",
        }),
        ReactActual.createElement(Pressable, {
          onPress: onRetry,
          testID: "mock-screen-retry",
        })
      );
    },
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

describe("MyMetalsRoute portfolio composition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = "en";
    mockPortfolioState = emptyPortfolio;
    mockReadinessState = ready;
    mockErrorState = null;
    mockFabSuppression = false;
    mockRecentHistoryState = [];
  });

  it("composes header add, summary, and inline empty History while hiding only zero-item filters", () => {
    render(<MyMetalsRoute />);

    expect(screen.getByText("My Metals")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-screen")).toBeTruthy();
    expect(screen.getByTestId("mock-header-add")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-summary-layout")).toBeTruthy();
    expect(screen.queryByTestId("mock-portfolio-filter-bar")).toBeNull();
    expect(screen.getByTestId("mock-inline-empty")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-recent-history")).toBeTruthy();
    expect(
      screen.getByTestId("mock-portfolio-recent-history-empty")
    ).toBeTruthy();
    expect(mockFabSuppression).toBe(true);

    fireEvent.press(screen.getByTestId("mock-screen-add"));
    expect(router.push).toHaveBeenCalledWith("/metals/add");
    fireEvent.press(screen.getByTestId("mock-screen-history"));
    expect(router.push).toHaveBeenCalledWith("/metals/history");
    expect(screen.queryByTestId("mock-add-holding-modal")).toBeNull();
  });

  it("retains populated controls and both existing Add entry points", () => {
    mockPortfolioState = portfolioFixture;
    render(<MyMetalsRoute />);

    expect(screen.getByTestId("mock-header-add")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-screen")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-summary-layout")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-filter-bar")).toBeTruthy();
    expect(screen.queryByTestId("mock-inline-empty")).toBeNull();
    expect(mockFabSuppression).toBe(false);

    fireEvent.press(screen.getByTestId("mock-header-add"));
    expect(router.push).toHaveBeenCalledWith("/metals/add");
    fireEvent.press(screen.getByTestId("mock-screen-add"));
    expect(router.push).toHaveBeenCalledWith("/metals/add");
    fireEvent.press(screen.getByTestId("mock-screen-holding"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/metals/[id]",
      params: { id: "gold-coin" },
    });
    expect(screen.queryByTestId("mock-add-holding-modal")).toBeNull();
  });

  it("preserves the existing error surface instead of claiming the portfolio is empty", () => {
    mockErrorState = new Error("read failed");
    render(<MyMetalsRoute />);

    expect(screen.getByTestId("mock-portfolio-error")).toBeTruthy();
    expect(screen.getByTestId("mock-portfolio-screen")).toBeTruthy();
    expect(mockFabSuppression).toBe(false);
  });

  it("keeps terminal History available when there are no active holdings", () => {
    mockRecentHistoryState = [disposedTerminalHolding];
    render(<MyMetalsRoute />);

    expect(screen.getByTestId("mock-inline-empty")).toBeTruthy();
    expect(screen.getByTestId("mock-terminal-history")).toBeTruthy();
    expect(
      screen.queryByTestId("mock-portfolio-recent-history-empty")
    ).toBeNull();
  });

  it("uses the approved Arabic empty-state header with header add button", () => {
    mockLanguage = "ar";
    render(<MyMetalsRoute />);

    expect(screen.getByText("معادني")).toBeTruthy();
    expect(screen.queryByText("My Metals")).toBeNull();
    expect(screen.getByTestId("mock-header-add")).toBeTruthy();
  });
});
