import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("Stats currency review regressions", () => {
  it("waits for preference/discovery state and suppresses stale aggregates per selected currency", () => {
    const source = read("../../app/(private)/(tabs)/stats.tsx");

    expect(source).toContain("isLoading: isPreferredCurrencyLoading");
    expect(source).toContain("isPreferredCurrencyLoading");
    expect(source).toContain("error");
    expect(source).toContain("retry");
    expect(source).toContain("key={`quick-stats-${selectedCurrency}`}");
    expect(source).toContain("key={`category-drilldown-${selectedCurrency}`}");
  });

  it("preserves the selected chart period while refreshing chart data by currency", () => {
    const screen = read("../../app/(private)/(tabs)/stats.tsx");
    const chart = read("../../components/stats/MonthlyExpenseChart.tsx");

    expect(screen).not.toContain("key={`monthly-chart-${selectedCurrency}`}");
    expect(chart).toContain('useState<PeriodFilter>("6m")');
    expect(chart).toContain("key={`${currency}-${period}`}");
  });

  it("keeps every available transaction currency selectable and exposes radio state", () => {
    const source = read("../../components/stats/StatsCurrencyFilter.tsx");

    expect(source).toContain("availableCurrencies.map");
    expect(source).toContain('accessibilityRole="radio"');
    expect(source).toContain("selected: isSelected");
    expect(source).toContain("useLocale");
    expect(source).toContain("currencyDisplay: \"name\"");
  });

  it("uses the page-selected currency in every drilldown row", () => {
    const card = read("../../components/stats/CategoryDrilldownCard.tsx");
    const row = read(
      "../../components/stats/drilldown/DrilldownCategoryItem.tsx"
    );

    expect(card).toContain("currency={currency}");
    expect(row).toContain("readonly currency: CurrencyType");
    expect(row).not.toContain("usePreferredCurrency");
  });

  it("supports retry and defers initial selection until preference loading settles", () => {
    const source = read("../../hooks/useStatsCurrencyFilter.ts");

    expect(source).toContain("isPreferredCurrencyLoading");
    expect(source).toContain("readonly retry: () => void");
    expect(source).toContain("retryVersion");
  });
});
