import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  isTrueMetalPortfolioEmpty,
  type MetalPortfolioSectionReadiness,
} from "@/hooks/metal-portfolio-readiness";
import type {
  MetalPortfolioHoldingInput,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
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

const activeHolding: MetalPortfolioHoldingInput = {
  currentPerformanceDecimal: null,
  currentValueDecimal: null,
  id: "holding-1",
  isEffective: true,
  isVisible: true,
  metalType: "GOLD",
  name: "Wedding coin",
  occurredAt: new Date("2026-08-20T10:00:00.000Z"),
  physicalForm: "COIN",
  purchaseCurrency: "EGP",
  purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
  purchasePriceDecimal: "151278.20",
  purityCatalogVersion: "1",
  purityCode: "gold-999",
  purityFactorDecimal: "0.999",
  soldResultDecimal: null,
  status: "active",
  userId: "user-1",
  weightGramsDecimal: "31.125",
};

describe("My Metals inline empty active-items state", () => {
  beforeEach((): void => {
    mockLanguage = "en";
  });

  it("requires ready active-item evidence, not loading, a filter-empty state, or a missing portfolio", (): void => {
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, ready)).toBe(true);
    expect(
      isTrueMetalPortfolioEmpty(
        {
          ...emptyPortfolio,
          listState: "FILTER_EMPTY",
        },
        ready
      )
    ).toBe(false);
    expect(
      isTrueMetalPortfolioEmpty(
        {
          ...emptyPortfolio,
          activeHoldings: [activeHolding],
        },
        ready
      )
    ).toBe(false);
    expect(
      isTrueMetalPortfolioEmpty(emptyPortfolio, { ...ready, summary: false })
    ).toBe(false);
    expect(isTrueMetalPortfolioEmpty(null, ready)).toBe(false);
  });

  it("reuses original gold/silver overlap in a 196 × 141.12 inline illustration without a nested scroll view", (): void => {
    const onAddPress = jest.fn();
    render(<MetalPortfolioEmptyState onAddPress={onAddPress} />);

    expect(
      screen.getByTestId("metal-empty-illustration", {
        includeHiddenElements: true,
      })
    ).toHaveStyle({ width: 196, height: 141.12 });
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

    expect(
      screen.getByText("Start tracking your gold and silver")
    ).toBeTruthy();
    expect(
      screen.getByText("Add your first holding to follow its value over time.")
    ).toBeTruthy();
    const addLabel = "Add holding";
    expect(screen.getByLabelText(addLabel)).toHaveProp(
      "className",
      expect.stringContaining("rounded-xl")
    );
    expect(screen.getByLabelText(addLabel)).toHaveProp(
      "className",
      expect.stringContaining("border-nileGreen-500")
    );
    expect(screen.getByLabelText(addLabel)).toHaveProp(
      "className",
      expect.stringContaining("min-h-11")
    );
    expect(screen.getByTestId("icon-add")).toBeTruthy();

    fireEvent.press(screen.getByLabelText(addLabel));
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
