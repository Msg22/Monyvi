import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type {
  MetalPortfolioHoldingInput,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";

const mockTranslations: Record<string, string> = {
  "portfolio.current_value_unavailable":
    "Current value unavailable. {{reason}}. Holding facts are still available.",
  "portfolio.value_unavailable_short": "Value unavailable",
  "portfolio.active_portfolio": "Your gold and silver",
  "portfolio.active_portfolio_value": "Your gold and silver value",
  "portfolio.active_holdings": "active holdings",
  "portfolio.since_purchase_label": "since purchase",
  "portfolio.holdings": "Holdings",
  "portfolio.view_all": "View all",
  "portfolio.bought_on": "Bought {{date}}",
  "portfolio.today": "today",
  "portfolio.rates_updated":
    "Prices last updated {{date}} at {{time}}. They may have changed since then.",
  "portfolio.profit_from_sold_metals": "profit from sold metals",
  "portfolio.loss_from_sold_metals": "loss from sold metals",
  "portfolio.no_loss_from_sold_metals": "no profit or loss from sold metals",
  "portfolio.profit_from_this_sale": "Profit from this sale",
  "portfolio.loss_from_this_sale": "Loss from this sale",
  "portfolio.no_loss_from_this_sale": "No profit or loss from this sale",
  gold: "Gold",
  silver: "Silver",
  "portfolio.recent_history": "History",
  "portfolio.total": "Metals portfolio value",
  "portfolio.total_accessibility":
    "Metals portfolio value {{amount}}. {{status}}.",
  "portfolio.current_rate": "Current rate",
  "portfolio.since_purchase": "{{signedAmount}} since purchase",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "form.coin": "Coin",
  purity_gold_999: "24K · 999",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "status.active": "Active",
  "status.sold": "Sold",
  "status.disposed": "Disposed",
  "rate.missing": "Rates: current rate unavailable",
  "rate.stale": "Last available price",
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
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      createElement(View, { testID: `icon-${name}` }),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

const currency: CurrencyType = "EGP";

const activeHolding: MetalPortfolioHoldingInput = {
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
};

const portfolio: MetalPortfolioReadModel = {
  activeHoldings: [activeHolding],
  activeTotalDecimal: "162317.87",
  allocation: { gold: "100", silver: "0" },
  currentPerformanceDecimal: "11039.67",
  filter: "ALL",
  hasSoldHoldings: false,
  hasTerminalHistory: false,
  holdings: [activeHolding],
  listState: "POPULATED",
  rateStatus: { state: "fresh", ageMs: 1_000 },
  recentHistory: [],
  soldResultDecimal: null,
  soldResultUnavailable: false,
};

function renderPortfolio(
  overrides: Partial<React.ComponentProps<typeof MetalPortfolioScreen>> = {}
): void {
  render(
    <MetalPortfolioScreen
      currency={currency}
      isLoading={false}
      isOffline={false}
      error={null}
      portfolio={{ ...portfolio, holdings: portfolio.activeHoldings }}
      rateProviderObservedAt={new Date("2026-08-25T10:30:00.000Z")}
      selectedFilter="ALL"
      onFilterChange={(): void => undefined}
      onHistoryPress={(): void => undefined}
      onHoldingPress={(): void => undefined}
      onRetry={(): void => undefined}
      {...overrides}
    />
  );
}

describe("portfolio realized-sale presentation", () => {
  it("uses loss language for negative sold results in summary and History", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        hasSoldHoldings: true,
        soldResultDecimal: "-1250",
        recentHistory: [
          {
            ...activeHolding,
            id: "sold-loss",
            name: "Sold at a loss",
            soldResultDecimal: "-1250",
            status: "sold",
          },
        ],
      },
    });

    expect(screen.getByText("loss from sold metals")).toBeTruthy();
    expect(screen.getByText(/Loss from this sale/)).toBeTruthy();
    expect(screen.queryByText("Net proceeds")).toBeNull();
    expect(screen.queryByText(/realized/i)).toBeNull();
  });

  it("skeletons realized-sale presentation while the sale evidence is still loading, then reveals it once ready", () => {
    const realizedPortfolio: MetalPortfolioReadModel = {
      ...portfolio,
      holdings: portfolio.activeHoldings,
      hasSoldHoldings: true,
      soldResultDecimal: "5500",
      recentHistory: [
        {
          ...activeHolding,
          id: "sold-pending",
          name: "Sold pending evidence",
          soldResultDecimal: "5500",
          status: "sold",
        },
      ],
    };

    renderPortfolio({
      portfolio: realizedPortfolio,
      readiness: {
        holdings: true,
        rateCurrency: true,
        recentHistory: true,
        realizedSale: false,
        summary: true,
      },
    });
    // Active holdings and current values stay visible; only realized-sale bits
    // show the shared Skeleton while the sale snapshots settle.
    expect(
      screen.getByTestId("metal-portfolio-holding-value-gold-coin")
    ).toBeTruthy();
    expect(
      screen.getByTestId("metal-portfolio-realized-sale-skeleton")
    ).toBeTruthy();
    expect(
      screen.getByTestId("metal-portfolio-history-result-pending-sold-pending")
    ).toBeTruthy();
    expect(screen.queryByText("profit from sold metals")).toBeNull();

    renderPortfolio({
      portfolio: realizedPortfolio,
      readiness: {
        holdings: true,
        rateCurrency: true,
        recentHistory: true,
        realizedSale: true,
        summary: true,
      },
    });
    expect(
      screen.queryByTestId("metal-portfolio-realized-sale-skeleton")
    ).toBeNull();
    expect(
      screen.queryByTestId(
        "metal-portfolio-history-result-pending-sold-pending"
      )
    ).toBeNull();
    expect(screen.getByText("profit from sold metals")).toBeTruthy();
    expect(screen.getByText(/Profit from this sale/)).toBeTruthy();
  });

  it("omits the sold result row without a dash when the result is unavailable", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        hasSoldHoldings: true,
        soldResultUnavailable: true,
        soldResultDecimal: null,
        recentHistory: [
          {
            ...activeHolding,
            id: "sold-unknown",
            name: "Sold without trustworthy evidence",
            soldResultDecimal: null,
            status: "sold",
          },
        ],
      },
    });

    expect(screen.getByText(/Sold without trustworthy evidence/)).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText(/realized/i)).toBeNull();
    expect(screen.queryByText(/this sale/i)).toBeNull();
  });

  it("uses profit language and exact canonical amounts for a positive sold result", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        hasSoldHoldings: true,
        soldResultDecimal: "5500",
        recentHistory: [
          {
            ...activeHolding,
            id: "sold-profit",
            name: "QA Sold Gold Coin",
            soldResultDecimal: "5500",
            status: "sold",
          },
        ],
      },
    });

    expect(screen.getAllByText("EGP 5,500.00").length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.getByText("profit from sold metals")).toBeTruthy();
    expect(screen.getByText(/Profit from this sale/)).toBeTruthy();
  });

  it("opens active and recent holdings while keeping disposed History free of realized P/L", () => {
    const onHoldingPress = jest.fn();
    const onHistoryPress = jest.fn();
    renderPortfolio({
      onHoldingPress,
      onHistoryPress,
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        recentHistory: [
          {
            ...activeHolding,
            id: "disposed-ring",
            name: "Gifted ring",
            soldResultDecimal: null,
            status: "disposed",
          },
        ],
      },
    });

    fireEvent.press(screen.getByTestId("metal-portfolio-holding-gold-coin"));
    expect(onHoldingPress).toHaveBeenCalledWith("gold-coin");

    fireEvent.press(screen.getByTestId("metal-portfolio-view-all"));
    expect(onHistoryPress).toHaveBeenCalledTimes(1);

    fireEvent.press(
      screen.getByTestId("metal-portfolio-history-disposed-ring")
    );
    expect(onHoldingPress).toHaveBeenCalledWith("disposed-ring");
    expect(screen.getByText(/Disposed.*Gifted ring/)).toBeTruthy();
    expect(screen.queryByText("Realized result")).toBeNull();
  });
});
