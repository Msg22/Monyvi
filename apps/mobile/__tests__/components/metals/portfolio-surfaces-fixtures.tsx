import { render } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import type { MetalPortfolioReadModel } from "@/services/metal-portfolio-read-model-service";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";

export const mockTranslations: Record<string, string> = {
  "wealth_breakdown.title": "Where your money is",
  "wealth_breakdown.accounts": "Accounts",
  "wealth_breakdown.metals": "Gold & silver",
  "wealth_breakdown.gold": "Gold",
  "wealth_breakdown.silver": "Silver",
  "wealth_breakdown.of_net_worth": "{{share}} of net worth",
  "wealth_breakdown.of_metals": "{{share}} of gold & silver",
  "wealth_breakdown.net_worth": "Net worth",
  "wealth_breakdown.inside_metals": "Inside gold & silver",
  "wealth_breakdown.metals_summary":
    "Amounts in {{currency}} · share of {{metals}}",
  "wealth_breakdown.tile_accessibility": "{{label}}. {{amount}}. {{share}}",
  holding: "{{count}} holdings",
  "portfolio.filter.all": "All",
  "portfolio.filter.gold": "Gold",
  "portfolio.filter.silver": "Silver",
  "portfolio.current_value_unavailable":
    "Current value unavailable. {{reason}}. Holding facts are still available.",
  "portfolio.value_unavailable_short": "Value unavailable",
  "portfolio.empty": "Start tracking your metals",
  "portfolio.filter_empty": "No {{filter}} holdings yet",
  "portfolio.offline": "Offline mode",
  "portfolio.error": "We couldn’t load your metals. Try again.",
  "portfolio.active_portfolio": "Your Metals",
  "portfolio.active_portfolio_value": "Your Metals Value",
  "portfolio.active_holdings_one": "{{count}} item",
  "portfolio.active_holdings_other": "{{count}} items",
  "portfolio.items_heading": "Your items",
  "portfolio.prices_per_gram": "Prices per gram",
  "portfolio.per_gram": "/ g",
  "portfolio.rates_updated_compact": "Updated {{date}}, {{time}}",
  "portfolio.rates_updated_today": "Updated today, {{time}}",
  "portfolio.since_purchase_label": "since purchase",
  "portfolio.holdings": "Holdings",
  "portfolio.view_all": "View all",
  add_holding: "Add holding",
  "history.empty": "No holdings here yet",
  "portfolio.bought_on": "Bought {{date}}",
  "portfolio.today": "today",
  "portfolio.rates_updated":
    "Prices last updated {{date}} at {{time}}. They may have changed since then.",
  "portfolio.realized_profit_from_sold_metals":
    "realized profit from sold metals",
  "portfolio.realized_loss_from_sold_metals": "realized loss from sold metals",
  "portfolio.realized_result_from_sold_metals":
    "realized result from sold metals",
  "portfolio.realized_profit": "Realized profit",
  "portfolio.realized_loss": "Realized loss",
  "portfolio.realized_result": "Realized result",
  "portfolio.profit_from_sold_metals": "profit from sold metals",
  "portfolio.loss_from_sold_metals": "loss from sold metals",
  "portfolio.no_loss_from_sold_metals": "no profit or loss from sold metals",
  "portfolio.profit_from_this_sale": "Profit from this sale",
  "portfolio.loss_from_this_sale": "Loss from this sale",
  "portfolio.no_loss_from_this_sale": "No profit or loss from this sale",
  start_tracking_metals: "Start tracking your metals",
  empty_metals_description:
    "Add your gold and silver holdings to keep their value in one place.",
  gold: "Gold",
  silver: "Silver",
  offline_mode: "Offline mode",
  "portfolio.active": "Active",
  "portfolio.recent_history": "History",
  "portfolio.total": "Metals portfolio value",
  "portfolio.total_accessibility":
    "Metals portfolio value {{amount}}. {{status}}.",
  "portfolio.current_rate": "Current rate",
  "portfolio.rates_updated_fresh": "Rates updated {{date}} at {{time}}",
  "portfolio.since_purchase": "{{signedAmount}} since purchase",
  "portfolio.filter_accessibility":
    "{{filterName}} filter, {{selectedState}}, {{count}} holdings.",
  "portfolio.selected": "selected",
  "portfolio.not_selected": "not selected",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "form.coin": "Coin",
  purity_gold_999: "24K · 999",
  "form.unknown": "Other form",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "render.neutralFallback": "Metal holding illustration unavailable",
  "status.active": "Active",
  "status.sold": "Sold",
  "status.disposed": "Disposed",
  "rate.missing": "Rates: current rate unavailable",
  "rate.stale": "Last available price",
  "rate.short_stale": "Last available",
  "rate.short_unknown": "Age unknown",
  "portfolio.allocation_accessibility":
    "Portfolio allocation: {{goldShare}} gold, {{silverShare}} silver.",
  "portfolio.purity_tile.gold-999": "24K",
  "portfolio.purity_tile.gold-875": "21K",
  "portfolio.purity_tile.gold-750": "18K",
  "portfolio.purity_tile.silver-999": "999",
  error_generic: "Something went wrong. Please try again.",
  retry: "Retry",
};

export const mockArabicTranslations: Record<string, string> = {
  ...mockTranslations,
  "portfolio.active_portfolio": "معادنك",
  "portfolio.bought_on": "تم الشراء {{date}}",
  "portfolio.filter_accessibility":
    "عامل التصفية {{filterName}}، {{selectedState}}، {{count}} حيازة.",
  "portfolio.filter.all": "الكل",
  "portfolio.selected": "محدد",
};

export const currency: CurrencyType = "EGP";

export const breakdown: WealthBreakdownReadModel = {
  accounts: { amountDecimal: "1062237.75", shareOfNetWorth: "85.4" },
  metals: {
    amountDecimal: "181426.17",
    shareOfNetWorth: "14.6",
    gold: {
      amountDecimal: "162317.87",
      holdingCount: 1,
      shareOfMetals: "89.5",
    },
    silver: {
      amountDecimal: "19108.30",
      holdingCount: 1,
      shareOfMetals: "10.5",
    },
  },
  totalNetWorthDecimal: "1243663.92",
};

export const portfolio: MetalPortfolioReadModel = {
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
  purityPriceTiles: [
    {
      id: "gold-24k",
      metal: "GOLD",
      purityCode: "gold-999",
      pricePerGramDecimal: "5215.00",
      state: "fresh",
    },
    {
      id: "gold-21k",
      metal: "GOLD",
      purityCode: "gold-875",
      pricePerGramDecimal: "4567.97",
      state: "fresh",
    },
    {
      id: "gold-18k",
      metal: "GOLD",
      purityCode: "gold-750",
      pricePerGramDecimal: "3915.16",
      state: "fresh",
    },
    {
      id: "silver-999",
      metal: "SILVER",
      purityCode: "silver-999",
      pricePerGramDecimal: "65.20",
      state: "fresh",
    },
  ],
  rateStatus: { state: "fresh", ageMs: 1_000 },
  recentHistory: [],
  soldResultDecimal: null,
  soldResultUnavailable: false,
};

export function renderPortfolio(
  overrides: Partial<React.ComponentProps<typeof MetalPortfolioScreen>> = {}
): void {
  render(
    <MetalPortfolioScreen
      currency={currency}
      isLoading={false}
      error={null}
      portfolio={{ ...portfolio, holdings: portfolio.activeHoldings }}
      rateProviderObservedAt={new Date("2026-08-25T10:30:00.000Z")}
      selectedFilter="ALL"
      onFilterChange={jest.fn()}
      onHistoryPress={jest.fn()}
      onHoldingPress={jest.fn()}
      onRetry={jest.fn()}
      {...overrides}
    />
  );
}
