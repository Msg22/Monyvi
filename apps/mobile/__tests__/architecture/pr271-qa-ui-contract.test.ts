import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const portfolioSource = readFileSync(
  resolve(ROOT, "apps/mobile/components/metals/MetalPortfolioScreen.tsx"),
  "utf8"
);
const detailSource = readFileSync(
  resolve(ROOT, "apps/mobile/components/metals/MetalHoldingDetailScreen.tsx"),
  "utf8"
);

function compact(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("PR #271 QA UI contracts", () => {
  it("lets the last-updated sentence wrap naturally on compact and enlarged layouts", () => {
    expect(portfolioSource).toContain('testID="metal-portfolio-rate-updated"');
    expect(compact(portfolioSource)).toMatch(
      /metal-portfolio-rate-updated[^>]*className="[^"]*min-w-0[^"]*flex-1[^"]*leading-/
    );
    expect(compact(portfolioSource)).not.toMatch(
      /metal-portfolio-rate-updated[^>]*numberOfLines=\{1\}/
    );
  });

  it("shows holding facts while rate/currency values remain a Skeleton", () => {
    expect(portfolioSource).toContain("isRateCurrencyReady");
    expect(portfolioSource).toContain("metal-portfolio-holding-value-pending-");
    expect(compact(portfolioSource)).toMatch(
      /isRateCurrencyReady \? .*metal-portfolio-holding-value-/
    );
  });

  it("never renders raw rate-provider source identifiers in holding detail", () => {
    expect(detailSource).not.toContain('t("detail.rate_source"');
    expect(detailSource).not.toMatch(/currentValueRateStatus\??\.source/);
  });

  it("removes the duplicate terminal-state title from the detail body", () => {
    expect(detailSource).not.toMatch(/model\.status === "active" \? null :/);
  });

  it("renders a friendly breakdown fallback when attribution evidence is unavailable", () => {
    expect(detailSource).toContain("detail.calculation_breakdown_unavailable");
    expect(detailSource).toContain("CalculationBreakdown");
  });
});
