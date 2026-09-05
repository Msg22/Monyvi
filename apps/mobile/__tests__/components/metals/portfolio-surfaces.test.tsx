import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { I18nManager } from "react-native";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import enMetals from "../../../locales/en/metals.json";
import arMetals from "../../../locales/ar/metals.json";
import type {
  MetalPortfolioReadModel,
  MetalPortfolioFilter,
} from "@/services/metal-portfolio-read-model-service";
import { WealthBreakdownSection } from "@/components/dashboard/WealthBreakdownSection";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";

const mockTranslations: Record<string, string> = {
  "wealth_breakdown.title": "Where your money is",
  "wealth_breakdown.accounts": "Accounts",
  "wealth_breakdown.metals": "Metals",
  "wealth_breakdown.gold": "Gold",
  "wealth_breakdown.silver": "Silver",
  "wealth_breakdown.of_net_worth": "{{share}} of net worth",
  "wealth_breakdown.of_metals": "{{share}} of Metals",
  "wealth_breakdown.net_worth": "Net worth",
  "wealth_breakdown.inside_metals": "Inside metals",
  "wealth_breakdown.metals_summary":
    "Amounts in {{currency}} · share of {{metals}}",
  "wealth_breakdown.tile_accessibility": "{{label}}. {{amount}}. {{share}}",
  "portfolio.filter.all": "All",
  "portfolio.filter.gold": "Gold",
  "portfolio.filter.silver": "Silver",
  "portfolio.current_value_unavailable":
    "Current value unavailable. {{reason}}. Holding facts are still available.",
  "portfolio.empty": "Start tracking your metals",
  "portfolio.filter_empty": "No {{filter}} holdings yet",
  "portfolio.rate_stale": "Rates: rate is older than 24 hours",
  "portfolio.offline": "Offline mode",
  "portfolio.error": "We couldn’t load your metals. Try again.",
  "portfolio.retry": "Try again",
  "portfolio.bought": "{{weight}} · Bought {{date}}",
  "portfolio.active_portfolio": "Active portfolio",
  "portfolio.active_portfolio_value": "Active portfolio value",
  "portfolio.active_holdings": "active holdings",
  "portfolio.since_purchase_label": "since purchase",
  "portfolio.holdings": "Holdings",
  "portfolio.view_all": "View all",
  "portfolio.bought_on": "Bought {{date}}",
  "portfolio.today": "today",
  "portfolio.rates_updated": "Rates updated {{when}}",
  "portfolio.realized_profit_from_sold_metals":
    "realized profit from sold metals",
  "portfolio.realized_loss_from_sold_metals": "realized loss from sold metals",
  "portfolio.realized_result_from_sold_metals":
    "realized result from sold metals",
  "portfolio.realized_profit": "Realized profit",
  "portfolio.realized_loss": "Realized loss",
  "portfolio.realized_result": "Realized result",
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
  "portfolio.since_purchase": "{{signedAmount}} since purchase",
  "portfolio.filter_accessibility":
    "{{filterName}} filter, {{selectedState}}, {{count}} holdings.",
  "portfolio.selected": "selected",
  "portfolio.not_selected": "not selected",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "form.coin": "Coin",
  "form.unknown": "Other form",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "render.neutralFallback": "Metal holding illustration unavailable",
  "status.active": "Active",
  "status.sold": "Sold",
  "status.disposed": "Disposed",
  "rate.missing": "Rates: current rate unavailable",
  "rate.stale": "Rates: rate is older than 24 hours",
  error_generic: "Something went wrong. Please try again.",
  retry: "Retry",
};

const arabicTranslations: Record<string, string> = {
  "wealth_breakdown.title": "أين أموالك",
  "wealth_breakdown.accounts": "الحسابات",
  "wealth_breakdown.metals": "المعادن",
  "wealth_breakdown.gold": "ذهب",
  "wealth_breakdown.silver": "فضة",
  "wealth_breakdown.of_net_worth": "{{amount}} · {{share}} من صافي الثروة",
  "wealth_breakdown.of_metals": "{{amount}} · {{share}} من المعادن",
  "portfolio.filter.all": "الكل",
  "portfolio.filter.gold": "ذهب",
  "portfolio.filter.silver": "فضة",
  "portfolio.current_value_unavailable":
    "القيمة الحالية غير متاحة. {{reason}}. بيانات الحيازة ما زالت متاحة.",
  "portfolio.bought": "{{weight}} · تم الشراء {{date}}",
  "portfolio.total": "قيمة محفظة المعادن",
  "portfolio.total_accessibility":
    "قيمة محفظة المعادن {{amount}}. الحالة: {{status}}.",
  "portfolio.current_rate": "سعر حديث",
  "portfolio.active_portfolio": "المحفظة النشطة",
  "portfolio.active_portfolio_value": "قيمة المحفظة النشطة",
  "portfolio.active_holdings": "مقتنيات نشطة",
  "portfolio.since_purchase_label": "منذ الشراء",
  "portfolio.holdings": "المقتنيات",
  "portfolio.view_all": "عرض الكل",
  "portfolio.bought_on": "تم الشراء {{date}}",
  "portfolio.today": "اليوم",
  "portfolio.rates_updated": "تم تحديث الأسعار {{when}}",
  "portfolio.realized_profit_from_sold_metals":
    "أرباح محققة من المعادن المباعة",
  "portfolio.realized_loss_from_sold_metals": "خسائر محققة من المعادن المباعة",
  "portfolio.realized_result_from_sold_metals":
    "نتيجة محققة من المعادن المباعة",
  "portfolio.realized_profit": "ربح محقق",
  "portfolio.realized_loss": "خسارة محققة",
  "portfolio.realized_result": "نتيجة محققة",
  "portfolio.since_purchase": "{{signedAmount}} منذ الشراء",
  "portfolio.filter_accessibility":
    "عامل التصفية {{filterName}}، {{selectedState}}، {{count}} حيازة.",
  "portfolio.selected": "محدد",
  "portfolio.not_selected": "غير محدد",
  "status.active": "نشطة",
  "status.sold": "مباعة",
  "status.disposed": "تم التخلّص منها",
  "metal.gold": "ذهب",
  "form.coin": "عملة",
  "rate.missing": "أسعار السوق: السعر الحالي غير متاح",
};

let mockActiveTranslations = mockTranslations;

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    t: (key: string, values?: Record<string, string>): string => {
      const template = mockActiveTranslations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        template
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      React.createElement(View, { testID: `icon-${name}` }),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

const currency: CurrencyType = "EGP";

const breakdown: WealthBreakdownReadModel = {
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
  hasTerminalHistory: false,
  holdings: [],
  listState: "POPULATED",
  rateStatus: { state: "fresh", ageMs: 1_000 },
  recentHistory: [],
  soldResultDecimal: null,
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
      selectedFilter="ALL"
      onFilterChange={jest.fn()}
      onHistoryPress={jest.fn()}
      onHoldingPress={jest.fn()}
      onRetry={jest.fn()}
      {...overrides}
    />
  );
}

describe("US1 portfolio surfaces", () => {
  afterEach(() => {
    mockActiveTranslations = mockTranslations;
  });

  it("keeps approved English and Arabic portfolio copy in both locale resources", () => {
    expect(enMetals.wealth_breakdown.title).toBe("Where your money is");
    expect(enMetals.portfolio.bought).toBe("{{weight}} · Bought {{date}}");
    expect(arMetals.wealth_breakdown.title).toBe("أين أموالك");
    expect(arMetals.portfolio.bought).toBe("{{weight}} · تم الشراء {{date}}");
  });

  it("renders approved additive Concept C below the net-worth hero contract", () => {
    const onAccountsPress = jest.fn();
    const onMetalsPress = jest.fn();

    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={breakdown}
        onAccountsPress={onAccountsPress}
        onMetalsPress={onMetalsPress}
      />
    );

    expect(screen.getByText("Where your money is")).toBeTruthy();
    expect(screen.getByText("Accounts")).toBeTruthy();
    expect(screen.getAllByText("Metals")).toHaveLength(1);
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByLabelText(/Accounts.*85.4/)).toBeTruthy();
    expect(screen.getByLabelText(/Metals.*14.6/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("wealth-breakdown-accounts"));
    fireEvent.press(screen.getByTestId("wealth-breakdown-metals"));
    expect(onAccountsPress).toHaveBeenCalledTimes(1);
    expect(onMetalsPress).toHaveBeenCalledTimes(1);
  });

  it("keeps Concept C and My Metals skeletons semantically visible while local reads settle", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading
        breakdown={null}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );
    expect(screen.getByTestId("wealth-breakdown-skeleton")).toBeTruthy();

    renderPortfolio({ isLoading: true, portfolio: null });
    expect(screen.getByTestId("metal-portfolio-skeleton")).toBeTruthy();
  });

  it("defaults to All, exposes Gold and Silver filters, and preserves exact holding identity", () => {
    const onFilterChange = jest.fn();
    renderPortfolio({ onFilterChange });

    expect(
      screen.getByLabelText("All filter, selected, 1 holdings.")
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Gold filter, not selected, 1 holdings.")
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Silver filter, not selected, 0 holdings.")
    ).toBeTruthy();
    expect(screen.getByText(/24K · 999/)).toBeTruthy();
    expect(screen.getByText(/31.125.*Bought/)).toBeTruthy();
    expect(screen.getByLabelText(/Gold Coin illustration/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("metal-portfolio-filter-GOLD"));
    expect(onFilterChange).toHaveBeenCalledWith("GOLD");
  });

  it("hides allocation until both Gold and Silver have positive owned value", () => {
    renderPortfolio();

    expect(screen.queryByTestId("metal-portfolio-allocation")).toBeNull();
    expect(
      screen.queryByTestId("metal-portfolio-allocation-legend")
    ).toBeNull();
  });

  it("fills the proportional allocation bar and preserves All tab corners", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [
          ...portfolio.activeHoldings,
          {
            ...portfolio.activeHoldings[0],
            id: "silver-bar",
            metalType: "SILVER",
            name: "Silver bar",
            currentValueDecimal: "40579.47",
          },
        ],
        activeTotalDecimal: "202897.34",
        allocation: { gold: "80", silver: "20" },
        holdings: portfolio.activeHoldings,
      },
    });

    expect(screen.getByTestId("metal-portfolio-allocation")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-allocation-gold")).toHaveStyle({
      width: "80%",
    });
    expect(screen.getByTestId("metal-portfolio-allocation-silver")).toHaveStyle(
      {
        width: "20%",
      }
    );
    expect(screen.getByTestId("metal-portfolio-filter-border-ALL")).toHaveProp(
      "className",
      expect.stringContaining("rounded-l-")
    );
  });

  it("omits purchase date, retains recorded facts, and speaks unavailable value truthfully", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [
          {
            ...portfolio.activeHoldings[0],
            currentValueDecimal: null,
            currentPerformanceDecimal: null,
            purchaseDate: null,
            physicalForm: "unsupported shape",
          },
        ],
        holdings: [
          {
            ...portfolio.activeHoldings[0],
            currentValueDecimal: null,
            currentPerformanceDecimal: null,
            purchaseDate: null,
            physicalForm: "unsupported shape",
          },
        ],
        activeTotalDecimal: null,
        currentPerformanceDecimal: null,
        rateStatus: { state: "missing", ageMs: null },
      },
    });

    expect(screen.queryByText(/Bought/)).toBeNull();
    expect(screen.getAllByText(/Current value unavailable/)).toHaveLength(2);
    expect(
      screen.getByLabelText("Metal holding illustration unavailable")
    ).toBeTruthy();
  });

  it("renders Arabic visible labels and accessible filter output", () => {
    mockActiveTranslations = arabicTranslations;
    renderPortfolio();

    expect(screen.getByText("المحفظة النشطة")).toBeTruthy();
    expect(screen.getByText(/تم الشراء/)).toBeTruthy();
    expect(screen.getByLabelText(/عامل التصفية الكل/)).toBeTruthy();
  });

  it("renders only bounded terminal holdings in the read-model supplied History", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        recentHistory: [
          {
            ...portfolio.activeHoldings[0],
            id: "sold-gold",
            name: "Sold coin",
            status: "sold",
            occurredAt: new Date("2026-08-31T10:00:00.000Z"),
          },
        ],
      },
    });

    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText(/Sold coin/)).toBeTruthy();
  });

  it("speaks tile amounts and shares for screen readers", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={breakdown}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(
      screen.getByLabelText(
        /Accounts\. 1,062,237\.75 EGP\. 85\.4% of net worth/
      )
    ).toBeTruthy();
  });

  it("uses loss language for negative realized P/L in summary and History", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        soldResultDecimal: "-1250",
        recentHistory: [
          {
            ...portfolio.activeHoldings[0],
            id: "sold-loss",
            name: "Sold at a loss",
            soldResultDecimal: "-1250",
            status: "sold",
          },
        ],
      },
    });

    expect(screen.getByText("realized loss from sold metals")).toBeTruthy();
    expect(screen.getByText(/Realized loss/)).toBeTruthy();
    expect(screen.queryByText("Net proceeds")).toBeNull();
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
            ...portfolio.activeHoldings[0],
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

  it("mirrors forward chevrons in RTL", () => {
    const originalIsRTL = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });

    try {
      renderPortfolio({
        portfolio: {
          ...portfolio,
          recentHistory: [
            { ...portfolio.activeHoldings[0], id: "sold-gold", status: "sold" },
          ],
        },
      });

      expect(screen.getAllByTestId("icon-chevron-back")).toHaveLength(2);
      expect(screen.queryByTestId("icon-chevron-forward")).toBeNull();
    } finally {
      Object.defineProperty(I18nManager, "isRTL", {
        configurable: true,
        value: originalIsRTL,
      });
    }
  });

  it("distinguishes portfolio-empty, filter-empty, stale, offline, and observer-error states", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [],
        holdings: [],
        listState: "PORTFOLIO_EMPTY",
      },
    });
    expect(screen.getByText("Start tracking your metals")).toBeTruthy();

    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: [],
        listState: "FILTER_EMPTY",
        rateStatus: { state: "stale", ageMs: 86_400_001 },
      },
      selectedFilter: "SILVER" as MetalPortfolioFilter,
      isOffline: true,
    });
    expect(screen.getByText("No Silver holdings yet")).toBeTruthy();
    expect(
      screen.getByLabelText(/Rates: rate is older than 24 hours/)
    ).toBeTruthy();
    expect(screen.getByText("Offline mode")).toBeTruthy();

    const onRetry = jest.fn();
    renderPortfolio({ error: new Error("local observer failed"), onRetry });
    fireEvent.press(screen.getByText("Retry"));
    expect(
      screen.getByText("Something went wrong. Please try again.")
    ).toBeTruthy();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps both surfaces mounted with compact, accessible test roots", () => {
    renderPortfolio();
    expect(screen.getByTestId("metal-portfolio-root")).toBeTruthy();
    expect(
      screen.getByTestId("metal-portfolio-holding-gold-coin")
    ).toBeTruthy();

    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={breakdown}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );
    expect(screen.getByTestId("wealth-breakdown-root")).toBeTruthy();
  });
});
