import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("Stats currency screen contract", () => {
  it("owns one selected currency and passes it to every Stats section", () => {
    const source = read("../../app/(private)/(tabs)/stats.tsx");

    expect(source).toContain("useStatsCurrencyFilter");
    expect(source).toContain("<StatsCurrencyFilter");
    expect(source).toContain("selectedCurrency={selectedCurrency}");
    expect(source).toMatch(/<QuickStats[\s\S]*?currency=\{selectedCurrency\}/);
    expect(source).toMatch(/<MonthlyExpenseChart[\s\S]*?currency=\{selectedCurrency\}/);
    expect(source).toMatch(/<CategoryDrilldownCard[\s\S]*?currency=\{selectedCurrency\}/);
  });

  it("uses the shared Skeleton during currency discovery", () => {
    const source = read("../../app/(private)/(tabs)/stats.tsx");

    expect(source).toContain('import { Skeleton } from "@/components/ui/Skeleton"');
    expect(source).toContain('testID="stats-currency-loading"');
    expect(source).toContain("<Skeleton");
  });

  it("keeps the Stats currency local instead of changing the global preference", () => {
    const source = read("../../app/(private)/(tabs)/stats.tsx");

    expect(source).not.toContain("setPreferredCurrency(");
  });

  it("does not add FX conversion to the Stats screen", () => {
    const source = read("../../app/(private)/(tabs)/stats.tsx");

    expect(source).not.toContain("useMarketRates");
    expect(source).not.toContain("getCurrencyRate");
  });
});
