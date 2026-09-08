import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(__dirname, "../..", path), "utf8");
}

function sliceBetween(
  value: string,
  startMarker: string,
  endMarker: string | null
): string {
  const start = value.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  if (endMarker === null) {
    return value.slice(start);
  }
  const end = value.indexOf(endMarker);
  expect(end).toBeGreaterThan(start);
  return value.slice(start, end);
}

describe("PR #271 validated Metals review regressions", () => {
  it("does not truncate lifecycle evidence needed to resolve portfolio ownership", () => {
    const value = source("services/metal-portfolio-read-model-service.ts");
    const queryBody = sliceBetween(
      value,
      "export function observePortfolioRecentHistory",
      "export function shapeMetalPortfolioHoldings"
    );
    expect(queryBody).not.toContain("Q.take(RECENT_HISTORY_LIMIT)");
    expect(value).toContain(".slice(0, RECENT_HISTORY_LIMIT)");
  });

  it("observes portfolio columns that can change in place", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).toMatch(
      /observePortfolioHoldingStates\(currentUserId\)\.observeWithColumns\(\[\s*\.\.\.PORTFOLIO_HOLDING_STATE_OBSERVED_COLUMNS,/
    );
    expect(value).toMatch(
      /observePortfolioAssets\(currentUserId\)\s*\.observeWithColumns\(\[\.\.\.PORTFOLIO_ASSET_OBSERVED_COLUMNS\]\)/
    );
    expect(value).toMatch(
      /query\s*\.observeWithColumns\(\[\.\.\.PORTFOLIO_ASSET_METAL_OBSERVED_COLUMNS\]\)/
    );
  });

  it("uses the lifecycle-aware wealth projection for the Home headline total", () => {
    const value = source("app/(private)/(tabs)/index.tsx");
    expect(value).toContain("wealthBreakdown?.totalNetWorthDecimal");
    expect(value).toMatch(
      /TotalNetWorthCard[\s\S]*totalNetWorth=\{lifecycleAwareNetWorth\}/
    );
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
    const observer = sliceBetween(
      value,
      "export function observeMetalHistoryEvents",
      "export async function readMetalHistoryReadModel"
    );
    expect(observer).not.toContain("Q.take(");
    const dependencies = sliceBetween(
      value,
      "async function readHistoryDependencies",
      "function shapeReadHistoryHoldings"
    );
    expect(dependencies).not.toMatch(/metal_lifecycle_events[\s\S]*Q\.take\(/);
  });

  it("preserves rate-reference action identity and scopes detail references to the effective action", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    const shaping = source("services/metal-detail-read-model-shaping.ts");
    expect(value).toContain("effectiveActionId");
    expect(shaping).toContain("actionId: reference.actionId");
    expect(value).toContain("expectation.actionId");
  });

  it("converts lifecycle-backed detail values to the preferred currency", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toContain("convertDetailValueForDisplay");
    expect(value).toContain("times(purchaseRateDecimal)");
    expect(value).toContain("dividedBy(preferredRateDecimal)");
  });

  it("keeps combined gain when only detailed attribution is unavailable", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toMatch(
      /totalGainDecimal:\s*attribution\?\.totalGainDecimal\s*\?\?\s*null/
    );
  });

  it("propagates observation time from lifecycle valuation references", () => {
    expect(source("services/metal-detail-read-model-service.ts")).toContain(
      "resolveCurrentValueObservedAt"
    );
  });

  it("validates purity tuples against the canonical catalog", () => {
    const value = source("services/metal-detail-read-model-service.ts");
    expect(value).toContain("resolvePuritySelection");
    expect(value).toContain("entry.factorDecimal");
  });

  it("uses canonical purity catalog labels instead of storage-code digit fallbacks", () => {
    const detail = source("components/metals/MetalHoldingDetailScreen.tsx");
    const history = source("components/metals/MetalHistoryScreen.tsx");
    const portfolio = source("components/metals/portfolio-presentation.ts");
    expect(detail).toContain("resolvePuritySelection");
    expect(history).toContain("resolvePuritySelection");
    expect(portfolio).toContain("purityLabelKey");
    expect(detail).not.toContain("function purityLabel(code");
    expect(history).not.toContain("function purityLabel(code");
  });

  it("distinguishes unavailable performance from unavailable current value", () => {
    const value = source("components/metals/MetalPortfolioScreen.tsx");
    expect(value).toContain("performanceUnavailableReason");
    expect(value).toContain("portfolio.performance_unavailable_rate_reference");
    expect(value).toContain("portfolio.performance_unavailable");
  });

  it("refetches detail and History when their routes regain focus", () => {
    expect(source("hooks/useMetalHoldingDetail.ts")).toContain("useIsFocused");
    expect(source("hooks/useMetalHistory.ts")).toContain("useIsFocused");
  });

  it("clears stale detail and History identity before scoped reads and failures", () => {
    const detail = source("hooks/useMetalHoldingDetail.ts");
    const history = source("hooks/useMetalHistory.ts");
    expect(detail).toMatch(/setModel\(null\);[\s\S]*readMetalDetailReadModel/);
    expect(detail).toMatch(/catch[\s\S]*setModel\(null\)/);
    expect(history).toMatch(
      /setHistoryState\(\{ history: emptyHistory\(filter\), userId \}\);[\s\S]*readMetalHistoryReadModel/
    );
    expect(history).toMatch(
      /catch[\s\S]*setHistoryState\(\{ history: emptyHistory\(filter\), userId \}\)/
    );
  });

  it("derives portfolio trust from the currency and only active metals owned", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).toContain("activeMetalTypes");
    expect(value).toContain("getPortfolioRateStatus(");
  });

  it("reclassifies cached portfolio trust over time and retains last valid rates on observer errors", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).toContain("RATE_STATUS_REFRESH_INTERVAL_MS");
    expect(value).toContain("trustObservationRef.current?.refresh()");
    expect(value).not.toMatch(
      /error:[\s\S]{0,300}setCurrentRates\(createEmptyTrustReadModel\(\)\)/
    );
  });

  it("resets the portfolio filter on a new focused visit", () => {
    const value = source("hooks/useMetalPortfolio.ts");
    expect(value).toContain("useIsFocused");
    expect(value).toContain('setSelectedFilter("ALL")');
  });

  it("View all expands the selected holding timeline instead of opening global History", () => {
    const route = source("app/(private)/metals/[id].tsx");
    const detail = source("components/metals/MetalHoldingDetailScreen.tsx");
    expect(route).not.toContain('router.push("/metals/history")');
    expect(detail).toContain("showAllHistory");
  });

  it("keeps the approved calculation disclosure reachable inline", () => {
    const value = source("components/metals/MetalHoldingDetailScreen.tsx");
    expect(value).toContain("CalculationBreakdown");
    expect(value).toContain("showCalculation");
  });

  it("preserves reconciliation state in detail and renders sync recovery states", () => {
    const service = source("services/metal-detail-read-model-service.ts");
    const screen = source("components/metals/MetalHoldingDetailScreen.tsx");
    expect(service).toContain("reconciliationState");
    expect(screen).toContain("sync_pending");
    expect(screen).toContain("sync_failed");
  });

  it("excludes BTC and all non-ISO Metals instruments from Live Rates currencies", () => {
    expect(source("hooks/useLiveRatesScreen.ts")).toMatch(
      /SUPPORTED_CURRENCIES\.filter\([\s\S]*isSupportedMetalsIsoCurrencyCode/
    );
  });

  it("surfaces initial refresh failure in the no-cache Live Rates state", () => {
    expect(source("components/live-rates/LiveRatesScreen.tsx")).toContain(
      "initial_refresh_failed"
    );
  });

  it("bounds observation subscriptions to one latest row per instrument", () => {
    expect(source("services/live-rates-trust-read-model-service.ts")).toContain(
      "Q.take(1)"
    );
  });

  it("supplies a conservative timestamp for summarized fresh currency trust", () => {
    expect(source("hooks/useLiveRatesScreen.ts")).toContain(
      "getConservativeObservedAt"
    );
  });

  it("formats detail money with the resolved app locale", () => {
    const value = source("components/metals/MetalHoldingDetailScreen.tsx");
    const displayAmount = sliceBetween(value, "function displayAmount", null);
    expect(displayAmount).not.toContain('toLocaleString("en-US"');
    expect(displayAmount).toContain("locale");
  });

  it("exposes shaped financial facts in holding-row accessibility", () => {
    const value = source("components/metals/MetalPortfolioScreen.tsx");
    expect(value).not.toContain("accessibilityLabel={holding.name}");
    expect(value).toContain("holdingAccessibilityLabel");
  });

  it("keeps stale or missing rate warnings when a timestamp is available", () => {
    const value = source("components/metals/MetalPortfolioScreen.tsx");
    const formatter = sliceBetween(
      value,
      "function formatRateUpdatedLabel",
      null
    );
    expect(formatter).toContain('state !== "fresh"');
    expect(formatter).toContain("t(`rate.${state}`)");
  });

  it("renders both Home metal rows and their holding counts", () => {
    const value = source("components/dashboard/WealthBreakdownSection.tsx");
    expect(value).toContain("breakdown.metals.gold.holdingCount");
    expect(value).toContain("breakdown.metals.silver.holdingCount");
    expect(value).not.toContain("{hasPositiveGold && (");
    expect(value).not.toContain("{hasPositiveSilver && (");
  });

  it("pages History by effective event time, excludes incomplete reconciliation, and exposes counts", () => {
    const value = source("services/metal-history-read-model-service.ts");
    expect(value).toContain("orderTerminalStatesByEffectiveEventTime");
    expect(value).toContain("isReportableReconciliationState");
    expect(value).toContain("counts");
    expect(value).toContain("occurredAt");
  });

  it("distinguishes initial History load failure from an empty result", () => {
    expect(source("components/metals/MetalHistoryScreen.tsx")).toContain(
      't("history.load_error")'
    );
  });

  it("shows result counts in visible and spoken History filter labels", () => {
    const value = source("components/metals/MetalHistoryScreen.tsx");
    expect(value).toContain("history.counts");
    expect(value).toContain("filter_accessibility");
  });

  it("interpolates the acquisition amount into Paid in both locales", () => {
    expect(source("locales/en/metals.json")).toContain(
      '"paid": "Paid {{amount}}"'
    );
    expect(source("locales/ar/metals.json")).toContain(
      '"paid": "تم الدفع {{amount}}"'
    );
  });
});
