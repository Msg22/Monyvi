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
    expect(source).toContain("<QuickStats currency={selectedCurrency}");
    expect(source).toContain("<MonthlyExpenseChart currency={selectedCurrency}");
    expect(source).toContain("<CategoryDrilldownCard currency={selectedCurrency}");
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
