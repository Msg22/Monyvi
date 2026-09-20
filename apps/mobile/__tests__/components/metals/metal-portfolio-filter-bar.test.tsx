import { render } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type {
  MetalPortfolioFilter,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";

const mockTranslations: Record<string, string> = {
  "portfolio.filter.all": "All",
  "portfolio.filter.gold": "Gold",
  "portfolio.filter.silver": "Silver",
  "portfolio.filter_accessibility":
    "{{filterName}} filter, {{selectedState}}, {{count}} holdings.",
  "portfolio.selected": "selected",
  "portfolio.not_selected": "not selected",
  "portfolio.total": "Metals portfolio value",
  "portfolio.total_accessibility":
    "Metals portfolio value {{amount}}. {{status}}.",
  "portfolio.current_rate": "Current rate",
  "portfolio.rates_updated_fresh": "Rates updated {{date}} at {{time}}",
  "portfolio.today": "today",
  "portfolio.active_portfolio": "Your gold and silver",
  "portfolio.active_portfolio_value": "Your gold and silver value",
  "portfolio.active_holdings": "active holdings",
  "portfolio.since_purchase_label": "since purchase",
  "portfolio.since_purchase": "{{signedAmount}} since purchase",
  "portfolio.holdings": "Holdings",
  "portfolio.view_all": "View all",
  "portfolio.bought_on": "Bought {{date}}",
  "portfolio.bought": "{{weight}} · Bought {{date}}",
  "rate.missing": "Rates: current rate unavailable",
  "metal.gold": "Gold",
  "form.coin": "Coin",
  purity_gold_999: "24K · 999",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "render.neutralFallback": "Metal holding illustration unavailable",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>): string => {
      const template = mockTranslations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        template
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: (): React.JSX.Element => createElement(View, { testID: "icon" }),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

const currency: CurrencyType = "EGP";

const portfolio: MetalPortfolioReadModel = {
  activeHoldings: [
    {
      id: "gold-coin",
      userId: "user-1",
      name: "Wedding coin",
      metalType: "GOLD",
      status: "active",
      isEffective: true,
      isVisible: true,
      currentValueDecimal: "162317.87",
      currentPerformanceDecimal: "11039.67",
      soldResultDecimal: null,
      occurredAt: new Date("2026-08-20T10:00:00.000Z"),
      physicalForm: "coin",
      purchaseCurrency: "EGP",
      purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
      purchasePriceDecimal: "151278.20",
      purityCatalogVersion: "1",
      purityCode: "gold-999",
      purityFactorDecimal: "0.999",
      weightGramsDecimal: "31.125",
    },
  ],
  activeTotalDecimal: "162317.87",
  allocation: { gold: "100", silver: "0" },
  currentPerformanceDecimal: "11039.67",
  filter: "ALL",
  hasSoldHoldings: false,
  hasTerminalHistory: false,
  holdings: [],
  listState: "POPULATED",
  rateStatus: { state: "fresh", ageMs: 1_000 },
  recentHistory: [],
  soldResultDecimal: null,
  soldResultUnavailable: false,
};

function renderFilterBar(
  selectedFilter: MetalPortfolioFilter
): ReturnType<typeof render> {
  return render(
    <MetalPortfolioScreen
      currency={currency}
      isLoading={false}
      isOffline={false}
      error={null}
      portfolio={{ ...portfolio, holdings: portfolio.activeHoldings }}
      rateProviderObservedAt={new Date()}
      selectedFilter={selectedFilter}
      onFilterChange={jest.fn()}
      onHistoryPress={jest.fn()}
      onHoldingPress={jest.fn()}
      onRetry={jest.fn()}
    />
  );
}

describe("MetalPortfolioScreen segmented filter", () => {
  it("owns the outer rounded border once and never overlays the selected tab", () => {
    const view = renderFilterBar("ALL");

    expect(view.getByTestId("metal-portfolio-filter-bar")).toHaveProp(
      "accessibilityRole",
      "tablist"
    );
    expect(view.getByTestId("metal-portfolio-filter-bar")).toHaveProp(
      "className",
      expect.stringContaining("border")
    );
    expect(view.getByTestId("metal-portfolio-filter-bar")).toHaveProp(
      "className",
      expect.stringContaining("rounded-xl")
    );
    expect(view.getByTestId("metal-portfolio-filter-bar")).toHaveProp(
      "className",
      expect.stringContaining("overflow-hidden")
    );

    for (const filter of ["ALL", "GOLD", "SILVER"]) {
      // No per-tab border overlay exists to clip or double the outer corners.
      expect(
        view.queryByTestId(`metal-portfolio-filter-border-${filter}`)
      ).toBeNull();
      // Every segment keeps the 44px minimum touch target.
      expect(view.getByTestId(`metal-portfolio-filter-${filter}`)).toHaveProp(
        "className",
        expect.stringContaining("min-h-11")
      );
    }

    // Selection is a background fill on the first tab; outer corners stay intact.
    expect(view.getByTestId("metal-portfolio-filter-ALL")).toHaveProp(
      "className",
      expect.stringContaining("bg-nileGreen-50")
    );
    expect(view.getByTestId("metal-portfolio-filter-ALL")).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
    expect(view.getByTestId("metal-portfolio-filter-GOLD")).toHaveProp(
      "accessibilityState",
      { selected: false }
    );

    // Dividers separate all but the last segment.
    expect(view.getByTestId("metal-portfolio-filter-ALL")).toHaveProp(
      "className",
      expect.stringContaining("border-e")
    );
    expect(view.getByTestId("metal-portfolio-filter-GOLD")).toHaveProp(
      "className",
      expect.stringContaining("border-e")
    );
    expect(view.getByTestId("metal-portfolio-filter-SILVER")).toHaveProp(
      "className",
      expect.not.stringContaining("border-e")
    );
  });

  it("shows selection on the last segment without an inner border", () => {
    const view = renderFilterBar("SILVER");

    expect(view.getByTestId("metal-portfolio-filter-SILVER")).toHaveProp(
      "className",
      expect.stringContaining("bg-nileGreen-50")
    );
    expect(view.getByTestId("metal-portfolio-filter-SILVER")).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
    expect(
      view.queryByTestId("metal-portfolio-filter-border-SILVER")
    ).toBeNull();
  });
});
