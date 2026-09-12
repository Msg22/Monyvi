import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("Stats currency review regressions", () => {
  it("waits for preference/discovery state and suppresses stale aggregates per selected currency", () => {
    const screen = read("../../app/(private)/(tabs)/stats.tsx");
    const drilldownHook = read(
      "../../hooks/useCategoryDrilldownTransactions.ts"
    );

    expect(screen).toContain("isLoading: isPreferredCurrencyLoading");
    expect(screen).toContain("isPreferredCurrencyLoading");
    expect(screen).toContain("error");
    expect(screen).toContain("retry");
    expect(screen).toContain("key={`quick-stats-${selectedCurrency}`}");
    expect(screen).not.toContain(
      "key={`category-drilldown-${selectedCurrency}`}"
    );
    expect(drilldownHook).toContain("activeScopeKey");
    expect(drilldownHook).toContain(
      "queryState.scopeKey === activeScopeKey"
    );
  });

  it("preserves the selected chart period while refreshing chart data by currency", () => {
    const screen = read("../../app/(private)/(tabs)/stats.tsx");
    const chart = read("../../components/stats/MonthlyExpenseChart.tsx");

    expect(screen).not.toContain("key={`monthly-chart-${selectedCurrency}`}");
    expect(chart).toContain('useState<PeriodFilter>("6m")');
    expect(chart).toContain("key={`${currency}-${period}`}");
  });

  it("uses Skeleton rather than ActivityIndicator while chart data reloads", () => {
    const chart = read("../../components/stats/MonthlyExpenseChart.tsx");

    expect(chart).toContain(
      'import { Skeleton } from "@/components/ui/Skeleton"'
    );
    expect(chart).not.toContain("ActivityIndicator");
  });

  it("uses Skeleton rather than ActivityIndicator while Quick Stats reloads", () => {
    const quickStats = read("../../components/stats/QuickStats.tsx");

    expect(quickStats).toContain(
      'import { Skeleton } from "@/components/ui/Skeleton"'
    );
    expect(quickStats).not.toContain("ActivityIndicator");
  });

  it("keeps every available transaction currency selectable in a virtualized list", () => {
    const source = read("../../components/stats/StatsCurrencyFilter.tsx");

    expect(source).toContain("FlatList");
    expect(source).not.toContain("ScrollView");
    expect(source).not.toContain("items.map");
    expect(source).toContain('accessibilityRole="radio"');
    expect(source).toContain("selected: isSelected");
    expect(source).toContain("useLocale");
    expect(source).toContain("currencyDisplay: \"name\"");
  });

  it("clamps the currency menu to the remaining viewport height", () => {
    const source = read("../../components/stats/StatsCurrencyFilter.tsx");

    expect(source).toContain('Dimensions.get("window").height');
    expect(source).toContain('Dimensions.addEventListener("change"');
    expect(source).toContain("measureInWindow");
    expect(source).toContain("maxHeight: menuMaxHeight");
    expect(source).not.toContain('className="max-h-72"');
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
