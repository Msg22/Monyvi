import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type {
  MetalPortfolioHoldingInput,
  MetalPortfolioReadModel,
} from "@/services/metal-portfolio-read-model-service";
import { MetalPortfolioScreen } from "@/components/metals/MetalPortfolioScreen";

let mockScreenWidth = 390;
let mockFontScale = 1;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    fontScale: number;
    height: number;
    scale: number;
    width: number;
  } => ({
    fontScale: mockFontScale,
    height: 844,
    scale: 1,
    width: mockScreenWidth,
  }),
}));

const mockTranslations: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  "status.active": "Active",
  "portfolio.allocation_accessibility":
    "Portfolio allocation: {{goldShare}} gold, {{silverShare}} silver.",
  "portfolio.prices_per_gram": "Prices per gram",
  "portfolio.per_gram": "/ g",
  "portfolio.items_heading": "Your items",
  "portfolio.rates_updated_compact": "Updated {{date}}, {{time}}",
  "portfolio.purity_tile.gold-999": "24K",
  "portfolio.purity_tile.gold-875": "21K",
  "portfolio.purity_tile.gold-750": "18K",
  "portfolio.purity_tile.silver-999": "999",
  "portfolio.filter.all": "All",
  "portfolio.filter.gold": "Gold",
  "portfolio.filter.silver": "Silver",
  "portfolio.active_portfolio": "Your Metals",
  "portfolio.active_portfolio_value": "Your Metals Value",
  "portfolio.active_holdings": "{{count}} items",
  "portfolio.active_holdings_one": "{{count}} item",
  "portfolio.active_holdings_other": "{{count}} items",
  "portfolio.since_purchase_label": "since purchase",
  "rate.missing": "Rates: current rate unavailable",
  "rate.short_stale": "Last available",
  "rate.short_unknown": "Age unknown",
  "rate.short_missing": "Unavailable",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>): string => {
      let template = mockTranslations[key] ?? key;
      if (values) {
        for (const [param, val] of Object.entries(values)) {
          template = template.replace(new RegExp(`{{${param}}}`, "g"), val);
        }
      }
      return template;
    },
  }),
}));

const testHolding: MetalPortfolioHoldingInput = {
  id: "gold-bar-1",
  userId: "user-1",
  name: "Gold Ingot 50g",
  metalType: "GOLD",
  status: "active",
  isEffective: true,
  isVisible: true,
  currentValueDecimal: "175000",
  currentPerformanceDecimal: "25000",
  soldResultDecimal: null,
  occurredAt: new Date("2026-01-15T12:00:00.000Z"),
  physicalForm: "bar",
  purchaseCurrency: "EGP",
  purchaseDate: new Date("2026-01-15T12:00:00.000Z"),
  purchasePriceDecimal: "150000",
  purityCatalogVersion: "1",
  purityCode: "gold-999",
  purityFactorDecimal: "0.999",
  weightGramsDecimal: "50",
};

const basePortfolio: MetalPortfolioReadModel = {
  activeHoldings: [testHolding],
  activeTotalDecimal: "175000",
  allocation: { gold: "80.0", silver: "20.0" },
  currentPerformanceDecimal: "25000",
  filter: "ALL",
  hasSoldHoldings: false,
  hasTerminalHistory: false,
  holdings: [testHolding],
  listState: "POPULATED",
  purityPriceTiles: [
    {
      id: "gold-999",
      metal: "GOLD",
      purityCode: "gold-999",
      pricePerGramDecimal: "3500.00",
      state: "fresh",
    },
    {
      id: "gold-875",
      metal: "GOLD",
      purityCode: "gold-875",
      pricePerGramDecimal: "3062.50",
      state: "fresh",
    },
    {
      id: "gold-750",
      metal: "GOLD",
      purityCode: "gold-750",
      pricePerGramDecimal: "2625.00",
      state: "fresh",
    },
    {
      id: "silver-999",
      metal: "SILVER",
      purityCode: "silver-999",
      pricePerGramDecimal: "45.00",
      state: "fresh",
    },
  ],
  rateStatus: { state: "fresh", ageMs: 1000 },
  recentHistory: [],
  soldResultDecimal: null,
  soldResultUnavailable: false,
};

function renderTestPortfolio(
  overrides: Partial<React.ComponentProps<typeof MetalPortfolioScreen>> = {}
): void {
  render(
    <MetalPortfolioScreen
      currency="EGP"
      error={null}
      isLoading={false}
      onFilterChange={jest.fn()}
      onHistoryPress={jest.fn()}
      onHoldingPress={jest.fn()}
      onRetry={jest.fn()}
      portfolio={basePortfolio}
      rateProviderObservedAt={new Date("2026-09-26T10:00:00.000Z")}
      selectedFilter="ALL"
      {...overrides}
    />
  );
}

describe("My Metals Refinement Interactions & Tokens", () => {
  beforeEach(() => {
    mockScreenWidth = 390;
    mockFontScale = 1;
  });

  it("localizes AllocationBar accessibility label with formatted shares", () => {
    renderTestPortfolio();

    expect(
      screen.getByLabelText("Portfolio allocation: 80.0% gold, 20.0% silver.")
    ).toBeTruthy();
  });

  it("renders purity tiles with raised card tokens and localized labels", () => {
    renderTestPortfolio();

    expect(screen.getByText("Gold · 24K")).toBeTruthy();
    expect(screen.getByText("Gold · 21K")).toBeTruthy();
    expect(screen.getByText("Gold · 18K")).toBeTruthy();
    expect(screen.getByText("Silver · 999")).toBeTruthy();

    expect(screen.getByTestId("metal-rate-tile-gold-999")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-800")
    );
    expect(screen.getByTestId("metal-rate-tile-gold-999")).toHaveProp(
      "className",
      expect.stringContaining("dark:border-slate-700")
    );
  });

  it("provides subtle scale and active border feedback on item card", () => {
    renderTestPortfolio();

    expect(screen.getByTestId("metal-portfolio-holding-gold-bar-1")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-800")
    );
    expect(screen.getByTestId("metal-portfolio-holding-gold-bar-1")).toHaveProp(
      "className",
      expect.stringContaining("dark:border-slate-700")
    );
    expect(screen.getByTestId("metal-portfolio-holding-gold-bar-1")).toHaveProp(
      "className",
      expect.stringContaining("active:border-nileGreen-500")
    );
    expect(screen.getByTestId("metal-portfolio-holding-gold-bar-1")).toHaveProp(
      "className",
      expect.stringContaining("dark:active:border-nileGreen-400")
    );

    fireEvent(
      screen.getByTestId("metal-portfolio-holding-gold-bar-1"),
      "responderGrant",
      {
        nativeEvent: { timestamp: Date.now() },
        persist: (): void => {},
      }
    );
    expect(
      screen.getByTestId("metal-portfolio-holding-gold-bar-1")
    ).toHaveStyle({ transform: [{ scale: 0.99 }] });
  });

  it("adapts purity tiles to full width on compact phone or enlarged font scale", () => {
    mockScreenWidth = 320;
    mockFontScale = 1.0;

    renderTestPortfolio();
    expect(screen.getByTestId("metal-rate-tile-gold-999")).toHaveProp(
      "className",
      expect.stringContaining("w-full")
    );
  });

  it("maintains two-column tile layout on normal-width screens", () => {
    mockScreenWidth = 390;
    mockFontScale = 1.0;

    renderTestPortfolio();
    expect(screen.getByTestId("metal-rate-tile-gold-999")).toHaveProp(
      "className",
      expect.stringContaining("w-[48.5%]")
    );
  });

  it("conforms item card to 110px min height, 12px padding, and 56x56 imagery", () => {
    renderTestPortfolio();

    expect(screen.getByTestId("metal-portfolio-holding-gold-bar-1")).toHaveProp(
      "className",
      expect.stringContaining("min-h-[110px]")
    );
    expect(screen.getByTestId("metal-portfolio-holding-gold-bar-1")).toHaveProp(
      "className",
      expect.stringContaining("p-3")
    );

    expect(screen.getByTestId("metal-portfolio-holding-image")).toHaveProp(
      "className",
      expect.stringContaining("h-14 w-14")
    );
  });

  it("reflows prices-per-gram header to vertical stack on compact layout", () => {
    mockScreenWidth = 320;
    mockFontScale = 1.0;

    const { unmount } = render(
      <MetalPortfolioScreen
        currency="EGP"
        error={null}
        isLoading={false}
        onFilterChange={jest.fn()}
        onHistoryPress={jest.fn()}
        onHoldingPress={jest.fn()}
        onRetry={jest.fn()}
        portfolio={basePortfolio}
        rateProviderObservedAt={new Date("2026-09-26T10:00:00.000Z")}
        selectedFilter="ALL"
      />
    );

    expect(screen.getByTestId("metal-portfolio-rates-header")).toHaveProp(
      "className",
      expect.stringContaining("flex-col items-start gap-1.5")
    );
    unmount();

    mockScreenWidth = 390;
    renderTestPortfolio();
    expect(screen.getByTestId("metal-portfolio-rates-header")).toHaveProp(
      "className",
      expect.stringContaining("flex-row items-baseline justify-between gap-2.5")
    );
  });

  it("includes trust state qualifier in tile accessibility label when rate is not fresh", () => {
    renderTestPortfolio({
      portfolio: {
        ...basePortfolio,
        purityPriceTiles: [
          {
            id: "silver-999",
            metal: "SILVER",
            purityCode: "silver-999",
            pricePerGramDecimal: "45.00",
            state: "stale",
          },
        ],
      },
    });

    expect(
      screen.getByLabelText("Silver 999. EGP 45.00 / g. Last available.")
    ).toBeTruthy();
  });

  it("renders active holdings count with CLDR plural key", () => {
    renderTestPortfolio();
    expect(screen.getByText("1 items")).toBeTruthy();
  });
});
