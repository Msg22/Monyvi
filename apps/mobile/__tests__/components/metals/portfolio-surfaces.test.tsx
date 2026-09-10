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
import {
  getWealthTilesLayoutClass,
  WealthBreakdownSection,
} from "@/components/dashboard/WealthBreakdownSection";
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
  "portfolio.retry": "Try again",
  "portfolio.bought": "{{weight}} · Bought {{date}}",
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
  "portfolio.active_portfolio": "تابع قيمة ذهبك وفضتك",
  "portfolio.active_portfolio_value": "قيمة ذهبك وفضتك",
  "portfolio.active_holdings": "مقتنيات نشطة",
  "portfolio.since_purchase_label": "منذ الشراء",
  "portfolio.holdings": "المقتنيات",
  "portfolio.view_all": "عرض الكل",
  "portfolio.bought_on": "تم الشراء {{date}}",
  "portfolio.today": "اليوم",
  "portfolio.rates_updated":
    "آخر تحديث للأسعار: {{date}}، {{time}}. قد تكون تغيّرت بعد ذلك.",
  "portfolio.realized_profit_from_sold_metals":
    "أرباح محققة من المعادن المباعة",
  "portfolio.realized_loss_from_sold_metals": "خسائر محققة من المعادن المباعة",
  "portfolio.realized_result_from_sold_metals":
    "نتيجة محققة من المعادن المباعة",
  "portfolio.realized_profit": "ربح محقق",
  "portfolio.realized_loss": "خسارة محققة",
  "portfolio.realized_result": "نتيجة محققة",
  "portfolio.profit_from_sold_metals": "ربح من المعادن المباعة",
  "portfolio.loss_from_sold_metals": "خسارة من المعادن المباعة",
  "portfolio.no_loss_from_sold_metals": "لا ربح ولا خسارة من المعادن المباعة",
  "portfolio.profit_from_this_sale": "ربح من هذا البيع",
  "portfolio.loss_from_this_sale": "خسارة من هذا البيع",
  "portfolio.no_loss_from_this_sale": "لا ربح ولا خسارة من هذا البيع",
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
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    i18n: {
      resolvedLanguage:
        mockActiveTranslations === arabicTranslations ? "ar" : "en",
    },
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
  hasSoldHoldings: false,
  hasTerminalHistory: false,
  holdings: [],
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
    expect(enMetals.portfolio.active_portfolio).toBe("Your gold and silver");
    expect(arMetals.wealth_breakdown.title).toBe("أين أموالك");
    expect(arMetals.portfolio.bought).toBe("{{weight}} · تم الشراء {{date}}");
    expect(arMetals.portfolio.active_portfolio).toBe("تابع قيمة ذهبك وفضتك");
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

  it("preserves exact canonical decimals in the Home breakdown", () => {
    const exactValue = "9007199254740993.245";
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={{
          ...breakdown,
          accounts: { ...breakdown.accounts, amountDecimal: exactValue },
          totalNetWorthDecimal: exactValue,
        }}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(screen.getAllByText("9,007,199,254,740,993.24 EGP")).toHaveLength(2);
    expect(screen.queryByText(/9,007,199,254,740,992/)).toBeNull();
  });

  it.each([
    [390, 1, "flex-row"],
    [320, 1, "flex-col"],
    [390, 1.5, "flex-col"],
  ])(
    "uses responsive Home tile layout at width %s and font scale %s",
    (width, fontScale, expectedClass) =>
      expect(getWealthTilesLayoutClass(width, fontScale)).toBe(expectedClass)
  );

  it("keeps owned-metal counts visible when valuation rates are unavailable", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={{
          ...breakdown,
          metals: {
            ...breakdown.metals,
            amountDecimal: null,
            gold: {
              amountDecimal: null,
              holdingCount: 2,
              shareOfMetals: null,
            },
            silver: {
              amountDecimal: null,
              holdingCount: 1,
              shareOfMetals: null,
            },
          },
        }}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(screen.getByText("Inside metals")).toBeTruthy();
    expect(screen.getByText(/2 holdings/)).toBeTruthy();
    expect(screen.getByText(/1 holdings/)).toBeTruthy();
  });

  it("keeps section skeletons semantically visible while local reads settle", () => {
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
    expect(screen.getByTestId("metal-portfolio-summary-skeleton")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-holdings-skeleton")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-history-skeleton")).toBeTruthy();
  });

  it("renders completed sections immediately while another section is still pending", () => {
    const historyHolding = {
      ...portfolio.activeHoldings[0],
      id: "sold-ready-before-holdings",
      name: "Sold ready holding",
      status: "sold" as const,
    };
    renderPortfolio({
      readiness: {
        holdings: false,
        rateCurrency: true,
        recentHistory: true,
        summary: true,
      },
      recentHistory: [historyHolding],
    });

    expect(screen.getByText("Your gold and silver")).toBeTruthy();
    expect(screen.getByText(/Sold ready holding/)).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-holdings-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("metal-portfolio-summary-skeleton")).toBeNull();
    expect(screen.queryByTestId("metal-portfolio-history-skeleton")).toBeNull();
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

  it("formats canonical portfolio amounts without binary-number rounding", () => {
    const exactValue = "9007199254740993.245";
    const exactGain = "9007199254740993.255";
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [
          {
            ...portfolio.activeHoldings[0],
            currentPerformanceDecimal: exactGain,
            currentValueDecimal: exactValue,
          },
        ],
        activeTotalDecimal: exactValue,
        currentPerformanceDecimal: exactGain,
        holdings: [
          {
            ...portfolio.activeHoldings[0],
            currentPerformanceDecimal: exactGain,
            currentValueDecimal: exactValue,
          },
        ],
      },
    });

    expect(
      screen.getAllByText("EGP 9,007,199,254,740,993.24")
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText("+ EGP 9,007,199,254,740,993.26")
    ).not.toHaveLength(0);
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

  it("keeps ordinary-phone holding cards readable above floating tab controls", () => {
    renderPortfolio({ bottomInset: 114 });

    expect(screen.getByTestId("metal-portfolio-list")).toHaveProp(
      "contentContainerStyle",
      expect.objectContaining({ paddingBottom: 194 })
    );
    expect(
      screen.getByTestId("metal-portfolio-holding-name-gold-coin")
    ).toHaveProp("numberOfLines", 2);
    expect(
      screen.getByTestId("metal-portfolio-holding-value-gold-coin")
    ).toHaveProp("className", expect.stringContaining("w-[104px]"));
  });

  it("renders active holdings as individually bordered cards with list spacing", () => {
    const holdings = [
      portfolio.activeHoldings[0],
      {
        ...portfolio.activeHoldings[0],
        id: "gold-bar",
        name: "Gold bar",
        physicalForm: "bar",
      },
      {
        ...portfolio.activeHoldings[0],
        id: "silver-coin",
        name: "Silver coin",
        metalType: "SILVER" as const,
      },
    ];
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: holdings,
        holdings,
      },
    });

    for (const holding of holdings) {
      expect(
        screen.getByTestId(`metal-portfolio-holding-${holding.id}`)
      ).toHaveProp(
        "className",
        expect.stringContaining("rounded-2xl border border-slate-200")
      );
    }
    expect(
      screen.getAllByTestId("metal-portfolio-holding-separator")
    ).toHaveLength(2);
  });

  it("uses short visible unavailable copy in holding rows", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [
          {
            ...portfolio.activeHoldings[0],
            currentValueDecimal: null,
            currentPerformanceDecimal: null,
          },
        ],
        activeTotalDecimal: null,
        currentPerformanceDecimal: null,
        holdings: [
          {
            ...portfolio.activeHoldings[0],
            currentValueDecimal: null,
            currentPerformanceDecimal: null,
          },
        ],
        rateStatus: { state: "missing", ageMs: null },
      },
    });

    expect(screen.getByText("Value unavailable")).toBeTruthy();
    expect(
      screen.getByLabelText(
        /Current value unavailable.*current rate unavailable/
      )
    ).toBeTruthy();
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
    expect(screen.getAllByText(/Current value unavailable/)).toHaveLength(1);
    expect(screen.getByText("Value unavailable")).toBeTruthy();
    expect(
      screen.getByLabelText("Metal holding illustration unavailable")
    ).toBeTruthy();
  });

  it("renders Arabic visible labels and accessible filter output", () => {
    mockActiveTranslations = arabicTranslations;
    renderPortfolio();

    expect(screen.getByText("تابع قيمة ذهبك وفضتك")).toBeTruthy();
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

  it("uses loss language for negative sold results in summary and History", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        hasSoldHoldings: true,
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

    expect(screen.getByText("loss from sold metals")).toBeTruthy();
    expect(screen.getByText(/Loss from this sale/)).toBeTruthy();
    expect(screen.queryByText("Net proceeds")).toBeNull();
    expect(screen.queryByText(/realized/i)).toBeNull();
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
            ...portfolio.activeHoldings[0],
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
            ...portfolio.activeHoldings[0],
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

  it("distinguishes portfolio-empty, filter-empty, offline, and observer-error states without a stale-age warning", () => {
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
    expect(screen.queryByText(/older than 24 hours/i)).toBeNull();
    expect(screen.getByText(/Prices last updated/)).toBeTruthy();
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

  it("speaks the total as a current rate only when the trusted rate is fresh", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "fresh", ageMs: 1_000 },
      },
      rateProviderObservedAt: new Date("2026-08-25T10:30:00.000Z"),
    });

    expect(
      screen.getByLabelText("Metals portfolio value EGP 162,317.87. Current rate.")
    ).toBeTruthy();
  });

  it("speaks last-updated info instead of a current rate for a stale trusted rate", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "stale", ageMs: 90_000_000 },
      },
      rateProviderObservedAt: new Date("2026-08-24T10:30:00.000Z"),
    });

    expect(
      screen.getByLabelText(/^Metals portfolio value/)
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(/Metals portfolio value .*Current rate\.$/)
    ).toBeNull();
    expect(screen.queryByLabelText(/Prices last updated/)).toBeTruthy();
  });

  it("speaks unavailable when the required rate evidence is missing", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        activeTotalDecimal: null,
        currentPerformanceDecimal: null,
        rateStatus: { state: "missing", ageMs: null },
      },
      rateProviderObservedAt: null,
    });

    expect(
      screen.getByLabelText(/Metals portfolio value .*current rate unavailable/)
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(/Metals portfolio value .*Current rate\.$/)
    ).toBeNull();
  });

  it("renders the visible rate line as unavailable for a missing state even when a stale observation retained a timestamp", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "missing", ageMs: null },
      },
      rateProviderObservedAt: new Date("2026-08-24T10:30:00.000Z"),
    });

    expect(screen.getByText(/current rate unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/Prices last updated/i)).toBeNull();
    expect(
      screen.getByLabelText(/Metals portfolio value .*current rate unavailable/)
    ).toBeTruthy();
  });

  it("wraps the last-updated sentence responsively instead of clamping one line", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "stale", ageMs: 90_000_000 },
      },
      rateProviderObservedAt: new Date("2026-08-24T10:30:00.000Z"),
    });

    expect(screen.getByTestId("metal-portfolio-rate-updated")).toHaveProp(
      "className",
      expect.stringContaining("min-w-0 flex-1")
    );
    expect(screen.getByTestId("metal-portfolio-rate-updated")).toHaveProp(
      "className",
      expect.stringContaining("leading-")
    );
    expect(
      screen.getByTestId("metal-portfolio-rate-updated")
    ).not.toHaveProp("numberOfLines");
  });

  it("renders loaded holding values once rate/currency readiness settles and a skeleton while pending", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
      },
      readiness: {
        holdings: true,
        rateCurrency: false,
        recentHistory: true,
        summary: false,
      },
    });
    expect(
      screen.getByTestId("metal-portfolio-holding-value-pending-gold-coin")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("metal-portfolio-holding-value-gold-coin")
    ).toBeNull();

    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
      },
      readiness: {
        holdings: true,
        rateCurrency: true,
        recentHistory: true,
        summary: true,
      },
    });
    expect(
      screen.getByTestId("metal-portfolio-holding-value-gold-coin")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("metal-portfolio-holding-value-pending-gold-coin")
    ).toBeNull();
  });

  it("omits the rate-status line entirely for a portfolio with no active holdings", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [],
        holdings: [],
        activeTotalDecimal: null,
        currentPerformanceDecimal: null,
        allocation: { gold: "0", silver: "0" },
        listState: "PORTFOLIO_EMPTY",
        rateStatus: { state: "missing", ageMs: null },
      },
      rateProviderObservedAt: null,
    });

    expect(screen.queryByTestId("metal-portfolio-rate-updated")).toBeNull();
    expect(screen.queryByText(/Prices last updated/i)).toBeNull();
  });

  it("still shows the unavailable-rate line when a valued portfolio is missing its rate", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "missing", ageMs: null },
      },
      rateProviderObservedAt: null,
    });

    expect(screen.getByTestId("metal-portfolio-rate-updated")).toBeTruthy();
    expect(screen.getByText(/current rate unavailable/i)).toBeTruthy();
  });
});
