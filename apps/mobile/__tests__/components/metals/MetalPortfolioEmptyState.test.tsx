import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import {
  getMetalEmptyStateLayout,
  isTrueMetalPortfolioEmpty,
  MetalPortfolioEmptyState,
} from "@/components/metals/MetalPortfolioEmptyState";

let mockLanguage: "en" | "ar" = "en";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: mockLanguage, resolvedLanguage: mockLanguage },
    t: (key: string): string =>
      key === "portfolio.recent_history"
        ? mockLanguage === "ar"
          ? "السجل"
          : "History"
        : key === "portfolio.view_all"
          ? mockLanguage === "ar"
            ? "عرض الكل"
            : "View all"
          : key,
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

jest.mock("@/assets/images/metals/manifest", () => ({
  METAL_RENDER_MANIFEST: {
    "gold:coin": { kind: "object", source: { uri: "gold-coin" } },
    "silver:bar": { kind: "object", source: { uri: "silver-bar" } },
  },
}));

jest.mock("@expo/vector-icons", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      ReactActual.createElement(View, { testID: `icon-${name}` }),
  };
});

const ready: MetalPortfolioSectionReadiness = {
  holdings: true,
  rateCurrency: true,
  recentHistory: true,
  realizedSale: true,
  summary: true,
};
const notReady: MetalPortfolioSectionReadiness = {
  ...ready,
  summary: false,
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

describe("MetalPortfolioEmptyState", () => {
  beforeEach(() => {
    mockLanguage = "en";
  });

  it("recognizes only a ready, truly empty active portfolio", () => {
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, ready)).toBe(true);
    expect(isTrueMetalPortfolioEmpty(populatedPortfolio, ready)).toBe(false);
    expect(
      isTrueMetalPortfolioEmpty(
        { ...emptyPortfolio, listState: "FILTER_EMPTY" },
        ready
      )
    ).toBe(false);
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, notReady)).toBe(false);
    expect(isTrueMetalPortfolioEmpty(null, ready)).toBe(false);
  });

  it("renders the approved English composition and opens Add Holding", () => {
    const onAddPress = jest.fn();
    render(<MetalPortfolioEmptyState onAddPress={onAddPress} />);

    expect(screen.getByText("Start tracking your gold and silver")).toBeTruthy();
    expect(
      screen.getByText("Add your first holding to follow its value over time.")
    ).toBeTruthy();
    expect(
      screen.getByTestId("metal-empty-silver-bar-back", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    expect(
      screen.getByTestId("metal-empty-silver-bar-front", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    expect(
      screen.getByTestId("metal-empty-gold-coin", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();

    expect(
      screen.getByTestId("metal-empty-illustration", {
        includeHiddenElements: true,
      })
    ).toHaveProp("accessible", false);
    expect(
      screen.getByTestId("metal-empty-illustration", {
        includeHiddenElements: true,
      })
    ).toHaveProp("importantForAccessibility", "no-hide-descendants");

    expect(screen.getByLabelText("Add your first holding")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByLabelText("Add your first holding")).toHaveProp(
      "className",
      expect.stringContaining("min-h-14")
    );
    expect(screen.getByTestId("metal-empty-add-gradient")).toHaveProp(
      "className",
      expect.stringContaining("rounded-full")
    );
    fireEvent.press(screen.getByLabelText("Add your first holding"));
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });

  it("uses the approved Arabic copy without English UI", () => {
    mockLanguage = "ar";
    render(<MetalPortfolioEmptyState onAddPress={jest.fn()} />);

    expect(screen.getByText("ابدأ تتابع ذهبك وفضتك")).toBeTruthy();
    expect(
      screen.getByText("ضيف أول قطعة علشان تتابع قيمتها مع الوقت.")
    ).toBeTruthy();
    expect(screen.getByText("ضيف أول قطعة")).toBeTruthy();
    expect(screen.queryByText("Start tracking your gold and silver")).toBeNull();
  });

  it("reduces illustration size and gaps for compact or enlarged text", () => {
    const ordinary = getMetalEmptyStateLayout(390, 1);
    const compact = getMetalEmptyStateLayout(320, 1);
    const enlarged = getMetalEmptyStateLayout(390, 2);

    expect(ordinary.isCompact).toBe(false);
    expect(ordinary.illustrationSize).toBe(316);
    expect(compact.isCompact).toBe(true);
    expect(enlarged.isCompact).toBe(true);
    expect(compact.illustrationSize).toBeLessThan(ordinary.illustrationSize);
    expect(enlarged.verticalGap).toBeLessThan(ordinary.verticalGap);
  });

  it("keeps terminal History reachable as a secondary action", () => {
    const onHistoryPress = jest.fn();
    render(
      <MetalPortfolioEmptyState
        hasHistory
        onAddPress={jest.fn()}
        onHistoryPress={onHistoryPress}
      />
    );

    expect(screen.getByLabelText("History")).toHaveTextContent("History");
    fireEvent.press(screen.getByTestId("metal-empty-history"));
    expect(onHistoryPress).toHaveBeenCalledTimes(1);
  });
});
