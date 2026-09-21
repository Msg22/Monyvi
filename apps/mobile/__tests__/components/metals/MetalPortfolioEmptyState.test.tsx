import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { MetalPortfolioSectionReadiness } from "@/hooks/metal-portfolio-readiness";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import {
  getMetalEmptyStateLayout,
  isTrueMetalPortfolioEmpty,
  MetalPortfolioEmptyState,
} from "@/components/metals/MetalPortfolioEmptyState";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";

let mockLanguage = "en";

const translations: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    start_tracking_metals: "Start tracking your gold and silver",
    empty_metals_description:
      "Add your first holding to follow its value over time.",
    add_first_holding: "Add your first holding",
    add_first_holding_accessibility: "Add your first gold or silver holding",
    "portfolio.holdings": "Holdings",
  },
  ar: {
    start_tracking_metals: "ابدأ تتابع ذهبك وفضتك",
    empty_metals_description: "ضيف أول قطعة علشان تتابع قيمتها مع الوقت.",
    add_first_holding: "ضيف أول قطعة",
    add_first_holding_accessibility: "ضيف أول قطعة ذهب أو فضة",
    "portfolio.holdings": "المقتنيات",
  },
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, unknown>) => string;
  } => ({
    i18n: { resolvedLanguage: mockLanguage },
    t: (key: string): string => translations[mockLanguage]?.[key] ?? key,
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

const currency: CurrencyType = "EGP";
const ready: MetalPortfolioSectionReadiness = {
  holdings: true,
  rateCurrency: true,
  recentHistory: true,
  realizedSale: true,
  summary: true,
};
const notReady: MetalPortfolioSectionReadiness = {
  ...ready,
  holdings: false,
};
const emptyPortfolio = {
  activeHoldings: [],
  activeTotalDecimal: "0",
  allocation: { gold: null, silver: null },
  currentPerformanceDecimal: null,
  currentPerformanceUnavailableReason: null,
  holdings: [],
  listState: "PORTFOLIO_EMPTY",
  rateStatus: { state: "missing" },
  recentHistory: [],
  soldResultDecimal: null,
  soldResultUnavailable: false,
} as unknown as MetalPortfolioReadModel;
const populatedPortfolio = {
  ...emptyPortfolio,
  activeHoldings: [{ id: "gold-1", metalType: "GOLD" }],
  activeTotalDecimal: "1000",
  currentPerformanceDecimal: "20",
  listState: "POPULATED",
  rateStatus: { state: "fresh" },
} as unknown as MetalPortfolioReadModel;

const baseScreenProps = {
  bottomInset: 0,
  currency,
  error: null,
  isLoading: false,
  isOffline: false,
  onAddPress: jest.fn(),
  onFilterChange: jest.fn(),
  onHistoryPress: jest.fn(),
  onHoldingPress: jest.fn(),
  onRetry: jest.fn(),
  rateProviderObservedAt: null,
  recentHistory: [],
  selectedFilter: "ALL" as const,
};

describe("MetalPortfolioEmptyState", () => {
  afterEach(() => {
    mockLanguage = "en";
  });

  it("recognizes only a ready, truly empty active portfolio", () => {
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, ready)).toBe(true);
    expect(isTrueMetalPortfolioEmpty(populatedPortfolio, ready)).toBe(false);
    expect(isTrueMetalPortfolioEmpty(emptyPortfolio, notReady)).toBe(false);
    expect(isTrueMetalPortfolioEmpty(null, ready)).toBe(false);
  });

  it("renders the approved illustrated English composition and opens Add Holding", () => {
    const onAddPress = jest.fn();
    render(<MetalPortfolioEmptyState onAddPress={onAddPress} />);

    expect(screen.getByText("Start tracking your gold and silver")).toBeTruthy();
    expect(
      screen.getByText("Add your first holding to follow its value over time.")
    ).toBeTruthy();
    expect(screen.getByTestId("metal-empty-silver-bar-back")).toBeTruthy();
    expect(screen.getByTestId("metal-empty-silver-bar-front")).toBeTruthy();
    expect(screen.getByTestId("metal-empty-gold-coin")).toBeTruthy();

    const illustration = screen.getByTestId("metal-empty-illustration");
    expect(illustration.props.accessible).toBe(false);
    expect(illustration.props.importantForAccessibility).toBe(
      "no-hide-descendants"
    );

    const cta = screen.getByTestId("metal-empty-add");
    expect(cta.props.accessibilityRole).toBe("button");
    expect(cta.props.accessibilityLabel).toBe(
      "Add your first gold or silver holding"
    );
    fireEvent.press(cta);
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });

  it("uses the approved Arabic copy", () => {
    mockLanguage = "ar";
    render(<MetalPortfolioEmptyState onAddPress={jest.fn()} />);

    expect(screen.getByText("ابدأ تتابع ذهبك وفضتك")).toBeTruthy();
    expect(
      screen.getByText("ضيف أول قطعة علشان تتابع قيمتها مع الوقت.")
    ).toBeTruthy();
    expect(screen.getByText("ضيف أول قطعة")).toBeTruthy();
  });

  it("reduces illustration size and vertical spacing for compact or enlarged text", () => {
    const ordinary = getMetalEmptyStateLayout(390, 1);
    const compact = getMetalEmptyStateLayout(320, 1);
    const enlarged = getMetalEmptyStateLayout(390, 2);

    expect(ordinary.isCompact).toBe(false);
    expect(compact.isCompact).toBe(true);
    expect(enlarged.isCompact).toBe(true);
    expect(compact.illustrationSize).toBeLessThan(ordinary.illustrationSize);
    expect(enlarged.verticalGap).toBeLessThan(ordinary.verticalGap);
  });

  it("replaces zero portfolio chrome only for the true-empty state", () => {
    render(
      <MetalPortfolioScreen
        {...baseScreenProps}
        portfolio={emptyPortfolio}
        readiness={ready}
      />
    );

    expect(screen.getByTestId("metal-portfolio-empty-state")).toBeTruthy();
    expect(screen.queryByTestId("metal-portfolio-summary-layout")).toBeNull();
    expect(screen.queryByTestId("metal-portfolio-filter-bar")).toBeNull();
    expect(screen.queryByTestId("metal-portfolio-rate-updated")).toBeNull();
    expect(screen.queryByText("Holdings")).toBeNull();
  });

  it("retains populated portfolio summary, filters, and holdings heading", () => {
    render(
      <MetalPortfolioScreen
        {...baseScreenProps}
        portfolio={populatedPortfolio}
        readiness={ready}
      />
    );

    expect(screen.queryByTestId("metal-portfolio-empty-state")).toBeNull();
    expect(screen.getByTestId("metal-portfolio-summary-layout")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-filter-bar")).toBeTruthy();
    expect(screen.getByText("Holdings")).toBeTruthy();
  });
});
