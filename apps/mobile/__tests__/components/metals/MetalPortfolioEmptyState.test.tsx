import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  isTrueMetalPortfolioEmpty,
  type MetalPortfolioSectionReadiness,
} from "@/hooks/metal-portfolio-readiness";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import {
  getMetalEmptyStateLayout,
  MetalPortfolioEmptyState,
} from "@/components/metals/MetalPortfolioEmptyState";

let mockLanguage: "en" | "ar" = "en";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: mockLanguage,
      resolvedLanguage: mockLanguage,
    },
    t: (key: string): string => {
      if (key === "add_holding") {
        return mockLanguage === "ar" ? "إضافة مقتنى" : "Add holding";
      }
      return key;
    },
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
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

const emptyPortfolio = {
  activeHoldings: [],
  holdings: [],
  listState: "PORTFOLIO_EMPTY",
  recentHistory: [],
} as unknown as MetalPortfolioReadModel;

describe("My Metals inline empty active-items state", () => {
  beforeEach((): void => {
    mockLanguage = "en";
  });

  it("requires ready active-item evidence, not loading, a filter-empty state, or a missing portfolio", (): void => {
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, ready)).toBe(true);
    expect(
      isTrueMetalPortfolioEmpty({
        ...emptyPortfolio,
        listState: "FILTER_EMPTY",
      }, ready)
    ).toBe(false);
    expect(
      isTrueMetalPortfolioEmpty(
        { ...emptyPortfolio, activeHoldings: [{ id: "holding-1" }] },
        ready
      )
    ).toBe(false);
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, { ...ready, summary: false })).toBe(false);
    expect(isTrueMetalPortfolioEmpty(null, ready)).toBe(false);
  });

  it("reuses original gold/silver overlap in a 196 × 141.12 inline illustration without a nested scroll view", (): void => {
    const onAddPress = jest.fn();
    render(<MetalPortfolioEmptyState onAddPress={onAddPress} />);

    const illustration = screen.getByTestId("metal-empty-illustration", {
      includeHiddenElements: true,
    });
    expect(illustration).toHaveStyle({ width: 196, height: 141.12 });
    expect(illustration).toHaveProp("accessible", false);
    expect(illustration).toHaveProp(
      "importantForAccessibility",
      "no-hide-descendants"
    );
    expect(
      screen.getByTestId("metal-empty-silver-stack", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    expect(
      screen.getByTestId("metal-empty-gold-coin", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-empty-state")).toHaveProp(
      "className",
      expect.stringContaining("items-center")
    );
    expect(screen.queryByTestId("metal-empty-add-gradient")).toBeNull();
    expect(screen.queryByTestId("metal-empty-history")).toBeNull();

    expect(screen.getByText("Start tracking your gold and silver")).toBeTruthy();
    expect(
      screen.getByText("Add your first holding to follow its value over time.")
    ).toBeTruthy();
    const add = screen.getByLabelText("Add holding");
    expect(add).toHaveProp("className", expect.stringContaining("rounded-xl"));
    expect(add).toHaveProp("className", expect.stringContaining("border-nileGreen-500"));
    expect(add).toHaveProp("className", expect.stringContaining("min-h-11"));
    expect(screen.getByTestId("icon-add")).toBeTruthy();

    fireEvent.press(add);
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });

  it("uses unchanged Arabic title/body but the existing short localized Add holding label", (): void => {
    mockLanguage = "ar";
    render(<MetalPortfolioEmptyState onAddPress={jest.fn()} />);
    expect(screen.getByText("ابدأ تتابع ذهبك وفضتك")).toBeTruthy();
    expect(
      screen.getByText("ضيف أول قطعة علشان تتابع قيمتها مع الوقت.")
    ).toBeTruthy();
    expect(screen.getByLabelText("إضافة مقتنى")).toBeTruthy();
    expect(screen.queryByText("Add your first holding")).toBeNull();
  });

  it("preserves the reference size at 360px and caps the illustration on very narrow screens", (): void => {
    expect(getMetalEmptyStateLayout(360, 1).illustrationSize).toBe(196);
    expect(getMetalEmptyStateLayout(390, 2).illustrationSize).toBe(196);
    expect(getMetalEmptyStateLayout(230, 2).illustrationSize).toBeLessThan(196);
    expect(getMetalEmptyStateLayout(360, 1).verticalGap).toBe(12);
  });
});
