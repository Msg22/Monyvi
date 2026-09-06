import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(__dirname, "../..", path), "utf8");
}

describe("PR #271 validated Metals review regressions", () => {
  it("does not truncate lifecycle evidence needed to resolve portfolio ownership", () => {
    const value = source("services/metal-portfolio-read-model-service.ts");
    const queryBody = value.slice(
      value.indexOf("export function observePortfolioRecentHistory"),
      value.indexOf("export function shapeMetalPortfolioHoldings")
    );
    expect(queryBody).not.toContain("Q.take(RECENT_HISTORY_LIMIT)");
    expect(value).toContain(".slice(0, RECENT_HISTORY_LIMIT)");
  });

  it("uses the lifecycle-aware wealth projection for the Home headline total", () => {
    const value = source("app/(private)/(tabs)/index.tsx");
    expect(value).toContain("wealthBreakdown.totalNetWorthDecimal");
    expect(value).toMatch(/TotalNetWorthCard[\s\S]*totalNetWorth=\{lifecycleAwareNetWorth\}/);
  });

  it("preserves an unavailable Accounts total instead of inventing zero", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).not.toContain('accountsValueDecimal ?? "0"');
    expect(value).toContain("accountsValueDecimal === null");
  });

  it("does not publish inert detail action descriptors before action routes are integrated", () => {
    const value = source("app/(private)/metals/[id].tsx");
    expect(value).not.toContain("getHoldingActionDescriptors");
    expect(value).toContain("actions={[]}");
  });

  it("pages History holdings without globally truncating lifecycle chains", () => {
    const value = source("services/metal-history-read-model-service.ts");
    const observer = value.slice(
      value.indexOf("export function observeMetalHistoryEvents"),
      value.indexOf("export async function readMetalHistoryReadModel")
    );
    expect(observer).not.toContain("Q.take(");
    const dependencies = value.slice(
      value.indexOf("async function readHistoryDependencies"),
      value.indexOf("function shapeReadHistoryHoldings")
    );
    expect(dependencies.match(/Q\.take\(/g) ?? []).toHaveLength(1);
  });

  it("preserves rate-reference action identity and scopes detail references to the canonical action", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toContain("acquisitionActionId");
    expect(value).toContain("actionId: reference.actionId");
    expect(value).toContain("expectation.actionId");
  });

  it("converts lifecycle-backed detail values to the preferred currency", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toContain("convertDetailValueForDisplay");
    expect(value).toContain("preferredCurrency");
  });

  it("keeps combined gain when only the detailed attribution breakdown is unavailable", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toContain("totalGainDecimal: attribution?.combinedDecimal ?? null");
  });

  it("propagates observation time from the exact lifecycle valuation references", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toContain("currentValueObservedAt");
    expect(value).toContain("resolveCurrentValueObservedAt");
  });

  it("uses canonical purity catalog labels rather than storage-code digit fallbacks", () => {
    const detail = source("components/metals/MetalHoldingDetailScreen.tsx");
    const portfolio = source("components/metals/portfolio-presentation.ts");
    expect(detail).toContain("resolvePuritySelection");
    expect(detail).not.toContain("function purityLabel(");
    expect(portfolio).not.toContain("function formatPurityCode(");
  });

  it("distinguishes unavailable performance from unavailable current value", () => {
    const value = source("components/metals/MetalPortfolioScreen.tsx");
    expect(value).toContain('t("portfolio.performance_unavailable")');
  });

  it("refetches detail and History when their routes regain focus", () => {
    expect(source("hooks/useMetalHoldingDetail.ts")).toContain("useIsFocused");
    expect(source("hooks/useMetalHistory.ts")).toContain("useIsFocused");
  });

  it("clears stale detail identity before reads and on failures", () => {
    const value = source("hooks/useMetalHoldingDetail.ts");
    expect(value).toMatch(/setModel\(null\);[\s\S]*readMetalDetailReadModel/);
    expect(value).toMatch(/catch[\s\S]*setModel\(null\)/);
  });

  it("derives portfolio trust from the currency and only metals actually owned", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).toContain("activeMetalTypes");
    expect(value).toContain("getPortfolioRateStatus(currentRates, preferredCurrency, activeMetalTypes)");
  });

  it("reclassifies cached portfolio trust as time advances and retains last valid rates on observer errors", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).toContain("RATE_STATUS_REFRESH_INTERVAL_MS");
    expect(value).toContain("trustRefreshRevision");
    expect(value).not.toMatch(/error:[\s\S]{0,300}setCurrentRates\(createInitialTrustReadModel\(\)\)/);
  });

  it("View all expands the selected holding timeline instead of opening global History", () => {
    const route = source("app/(private)/metals/[id].tsx");
    const detail = source("components/metals/MetalHoldingDetailScreen.tsx");
    expect(route).not.toContain('router.push("/metals/history")');
    expect(detail).toContain("showAllHistory");
  });

  it("keeps the approved calculation disclosure reachable from Holding Detail", () => {
    const value = source("components/metals/MetalHoldingDetailScreen.tsx");
    expect(value).toContain("CalculationBreakdown");
    expect(value).toContain("showCalculation");
  });

  it("excludes BTC and all non-ISO Metals instruments from Live Rates currencies", () => {
    const value = source("hooks/useLiveRatesScreen.ts");
    expect(value).toMatch(/SUPPORTED_CURRENCIES\.filter\([\s\S]*isSupportedMetalsIsoCurrencyCode/);
  });

  it("binds displayed Live Rates values to validated observation values", () => {
    const value = source("hooks/useLiveRatesScreen.ts");
    expect(value).toContain("trustedLatestRates");
    expect(value).toContain("trustReadModel");
  });

  it("surfaces initial refresh failure in the no-cache Live Rates state", () => {
    const value = source("components/live-rates/LiveRatesScreen.tsx");
    expect(value).toContain("initial_refresh_failed");
  });

  it("bounds observation subscriptions to latest-per-instrument reads", () => {
    const value = source("services/live-rates-trust-read-model-service.ts");
    expect(value).toContain("Q.take(1)");
    expect(value).toContain("combineLatest");
  });

  it("formats detail money with the resolved app locale", () => {
    const value = source("components/metals/MetalHoldingDetailScreen.tsx");
    const displayAmount = value.slice(value.indexOf("function displayAmount"));
    expect(displayAmount).not.toContain('toLocaleString("en-US"');
    expect(displayAmount).toContain("locale");
  });

  it("exposes the same shaped financial facts in holding-row accessibility", () => {
    const value = source("components/metals/MetalPortfolioScreen.tsx");
    expect(value).not.toContain("accessibilityLabel={holding.name}");
    expect(value).toContain("holdingAccessibilityLabel");
  });
});
