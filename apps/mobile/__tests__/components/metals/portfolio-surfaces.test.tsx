import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { I18nManager } from "react-native";

import { WealthBreakdownSection } from "@/components/dashboard/WealthBreakdownSection";
import type { MetalPortfolioFilter } from "@/services/metal-portfolio-read-model-service";
import {
  breakdown,
  currency,
  mockArabicTranslations,
  mockTranslations,
  portfolio,
  renderPortfolio,
} from "./portfolio-surfaces-fixtures";

let mockActiveTranslations = mockTranslations;

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    i18n: {
      resolvedLanguage:
        mockActiveTranslations === mockArabicTranslations ? "ar" : "en",
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

jest.mock("@/hooks/useUiPolishCopy", () => ({
  useUiPolishCopy: () => ({
    metals_empty: {
      header: "My Metals",
      title: "Start tracking your gold and silver",
      body: "Add your first holding to follow its value over time.",
      cta: "Add your first holding",
    },
  }),
}));

describe("US1 portfolio surfaces", () => {
  afterEach(() => {
    mockActiveTranslations = mockTranslations;
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
    expect(
      screen.getByTestId("metal-portfolio-holdings-skeleton")
    ).toBeTruthy();
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
        realizedSale: true,
        summary: true,
      },
      recentHistory: [historyHolding],
    });

    expect(screen.getByText("Your Metals")).toBeTruthy();
    expect(screen.getByText(/Sold ready holding/)).toBeTruthy();
    expect(
      screen.getByTestId("metal-portfolio-holdings-skeleton")
    ).toBeTruthy();
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

  it("fills the single-metal allocation rail and provides continuous boundary when both metals are present", () => {
    renderPortfolio();

    expect(screen.getByTestId("metal-portfolio-allocation")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-allocation-gold")).toHaveStyle({
      width: "100%",
    });
    expect(
      screen.queryByTestId("metal-portfolio-allocation-silver")
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
    mockActiveTranslations = mockArabicTranslations;
    renderPortfolio();

    expect(screen.getByText("معادنك")).toBeTruthy();
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

    expect(screen.getByText("loss from sold metals")).toBeTruthy();
    expect(screen.getByText(/Loss from this sale/)).toBeTruthy();
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

  it("mirrors forward chevrons and filter chrome in RTL", () => {
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
      // RTL keeps the same logical structure: the outer control owns the only
      // rounded border, and the first/last dividers stay logical.
      expect(
        screen.queryByTestId("metal-portfolio-filter-border-ALL")
      ).toBeNull();
      expect(screen.getByTestId("metal-portfolio-filter-bar")).toHaveProp(
        "className",
        expect.stringContaining("overflow-hidden")
      );
      expect(screen.getByTestId("metal-portfolio-filter-ALL")).toHaveProp(
        "className",
        expect.stringContaining("border-e")
      );
      expect(screen.getByTestId("metal-portfolio-filter-SILVER")).toHaveProp(
        "className",
        expect.not.stringContaining("border-e")
      );
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
    expect(
      screen.getByText("Start tracking your gold and silver")
    ).toBeTruthy();
    // An empty portfolio has no active purchase: no signed performance metric.
    expect(screen.queryByText("since purchase")).toBeNull();

    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: [],
        listState: "FILTER_EMPTY",
        rateStatus: { state: "stale", ageMs: 86_400_001 },
      },
      selectedFilter: "SILVER" as MetalPortfolioFilter,
    });
    expect(screen.getByText("No Silver holdings yet")).toBeTruthy();
    expect(screen.queryByText(/older than 24 hours/i)).toBeNull();
    expect(
      screen.getByTestId("metal-portfolio-rate-updated")
    ).toHaveTextContent(/Updated /);
    expect(screen.queryByText("Offline mode")).toBeNull();

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
    expect(screen.getByTestId("metal-portfolio-list")).toHaveProp(
      "removeClippedSubviews",
      false
    );
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

  it("shows the provider observation timestamp for a fresh rate instead of one unlabeled current rate", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "fresh", ageMs: 1_000 },
      },
      rateProviderObservedAt: new Date("2026-08-25T10:30:00.000Z"),
    });

    // Visible and spoken copy agree and both carry the provider timestamp.
    expect(
      screen.getByTestId("metal-portfolio-rate-updated")
    ).toHaveTextContent(/Updated /);
    expect(
      screen.getByLabelText(/Metals portfolio value .*Rates updated .* at /)
    ).toBeTruthy();
    expect(screen.queryByText("Current rate")).toBeNull();
  });

  it("uses the localized today label for a same-day fresh rate", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "fresh", ageMs: 1_000 },
      },
      rateProviderObservedAt: new Date(),
    });

    expect(
      screen.getByTestId("metal-portfolio-rate-updated")
    ).toHaveTextContent(/Updated today/);
  });

  it("derives the Prices per gram header from the displayed tiles, not holdings", () => {
    // No active holdings, so the holdings-derived rateStatus is fresh (fresh
    // currency input only), while the displayed gold tiles are stale.
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [],
        holdings: [],
        activeTotalDecimal: null,
        currentPerformanceDecimal: null,
        allocation: { gold: "0", silver: "0" },
        listState: "FILTER_EMPTY",
        rateStatus: { state: "fresh", ageMs: 1_000 },
        purityPriceTiles: portfolio.purityPriceTiles.map((tile) =>
          tile.metal === "GOLD" ? { ...tile, state: "stale" as const } : tile
        ),
      },
      selectedFilter: "GOLD",
      rateProviderObservedAt: new Date(),
    });

    // The header must carry the stale qualifier from the gold tiles even
    // though no holding consumes the stale gold input.
    expect(
      screen.getByTestId("metal-portfolio-rate-updated")
    ).toHaveTextContent(/Last available/);
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

    // The trust status must live inside the single spoken total label.
    expect(
      screen.getByLabelText(/^Metals portfolio value .*Prices last updated/)
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(/^Metals portfolio value .*Current rate\.$/)
    ).toBeNull();
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
        purityPriceTiles: portfolio.purityPriceTiles.map((tile) => ({
          ...tile,
          pricePerGramDecimal: null,
          state: "missing" as const,
        })),
      },
      rateProviderObservedAt: new Date("2026-08-24T10:30:00.000Z"),
    });

    expect(screen.getByText(/current rate unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/Prices last updated/i)).toBeNull();
    expect(
      screen.getByLabelText(/Metals portfolio value .*current rate unavailable/)
    ).toBeTruthy();
  });

  it("displays the compact timestamp with provider date and time", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "stale", ageMs: 90_000_000 },
      },
      rateProviderObservedAt: new Date("2026-08-24T10:30:00.000Z"),
    });

    expect(
      screen.getByTestId("metal-portfolio-rate-updated")
    ).toHaveTextContent(/Updated 24 Aug 2026/);
  });

  it("renders exactly four compact purity price tiles and Your items section header", () => {
    renderPortfolio();

    expect(screen.getByText("Prices per gram")).toBeTruthy();
    expect(screen.getByText("Your items")).toBeTruthy();
    expect(screen.getByTestId("metal-rate-tile-gold-24k")).toBeTruthy();
    expect(screen.getByTestId("metal-rate-tile-gold-21k")).toBeTruthy();
    expect(screen.getByTestId("metal-rate-tile-gold-18k")).toBeTruthy();
    expect(screen.getByTestId("metal-rate-tile-silver-999")).toBeTruthy();

    expect(screen.getByText("Gold · 24K")).toBeTruthy();
    expect(screen.getByText("Gold · 21K")).toBeTruthy();
    expect(screen.getByText("Gold · 18K")).toBeTruthy();
    expect(screen.getByText("Silver · 999")).toBeTruthy();
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
        realizedSale: true,
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
        realizedSale: true,
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

  it("preserves an explicit missing-rate message alongside prices when active items are empty", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [],
        holdings: [],
        activeTotalDecimal: null,
        currentPerformanceDecimal: null,
        allocation: { gold: null, silver: null },
        listState: "PORTFOLIO_EMPTY",
        rateStatus: { state: "missing", ageMs: null },
        purityPriceTiles: portfolio.purityPriceTiles.map((tile) => ({
          ...tile,
          pricePerGramDecimal: null,
          state: "missing" as const,
        })),
      },
      rateProviderObservedAt: null,
    });

    expect(screen.getByTestId("metal-portfolio-rates-section")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-rate-updated")).toBeTruthy();
    expect(screen.getByText(/current rate unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/Prices last updated/i)).toBeNull();
  });

  it("still shows the unavailable-rate line when a valued portfolio is missing its rate", () => {
    renderPortfolio({
      portfolio: {
        ...portfolio,
        holdings: portfolio.activeHoldings,
        rateStatus: { state: "missing", ageMs: null },
        purityPriceTiles: portfolio.purityPriceTiles.map((tile) => ({
          ...tile,
          pricePerGramDecimal: null,
          state: "missing" as const,
        })),
      },
      rateProviderObservedAt: null,
    });

    expect(screen.getByTestId("metal-portfolio-rate-updated")).toBeTruthy();
    expect(screen.getByText(/current rate unavailable/i)).toBeTruthy();
  });
});
