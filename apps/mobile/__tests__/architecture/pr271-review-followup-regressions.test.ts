import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("PR #271 review follow-up regressions", () => {
  it("tracks successful empty History reads as loaded", () => {
    const value = source("apps/mobile/hooks/useMetalHistory.ts");
    expect(value).toContain("hasLoaded");
    expect(value).not.toContain("lastLoadedRef.current.itemCount > 0");
  });

  it("bounds Kong health fetches and sleeps by the deadline", () => {
    const value = source("scripts/restart-local-kong.js");
    expect(value).toContain("AbortSignal.timeout");
    expect(value).toMatch(/Math\.min\(\s*HEALTH_POLL_INTERVAL_MS,\s*remainingMs\s*\)/s);
  });

  it("observes mutable detail columns including asset-metal facts", () => {
    const hook = source("apps/mobile/hooks/useMetalHoldingDetail.ts");
    const service = source("apps/mobile/services/metal-detail-read-model-service.ts");
    expect(hook).toContain("observeWithColumns");
    expect(hook).toContain("observeMetalDetailAssetMetal");
    expect(service).toContain("export function observeMetalDetailAssetMetal");
    for (const column of [
      "name",
      "purchase_date",
      "purchase_price_decimal",
      "purchase_currency",
      "acquisition_action_id",
      "status",
      "effective_action_id",
      "effective_event_id",
      "is_visible",
      "reconciliation_state",
      "metal_type",
      "item_form",
      "purity_catalog_version",
      "purity_code",
      "purity_factor_decimal",
      "weight_grams_decimal",
    ]) {
      expect(hook).toContain(`\"${column}\"`);
    }
  });

  it("uses exact USD identity for current detail attribution without a redundant observation", () => {
    const value = source("apps/mobile/services/metal-detail-read-model-service.ts");
    expect(value).toContain('instrumentCode === "currency:USD"');
    expect(value).toContain('valueDecimal: "1"');
    expect(value).toContain('source: null');
  });

  it("keeps nullable current-rate source usable for attribution", () => {
    const value = source("apps/mobile/services/metal-detail-read-model-service.ts");
    expect(value).not.toContain('typeof value.source !== "string"');
    expect(value).toContain("source: value.source ?? null");
  });

  it("keeps Home hero totals as canonical decimal strings", () => {
    const route = source("apps/mobile/app/(private)/(tabs)/index.tsx");
    const card = source("apps/mobile/components/dashboard/TotalNetWorthCard.tsx");
    expect(route).not.toMatch(/const parsed = Number\(value\)/);
    expect(card).toMatch(/netWorth:\s*number \| string \| null/);
    expect(card).toMatch(/netWorthInUSD\??:\s*number \| string \| null/);
    expect(card).toContain("formatCanonicalDecimalForDisplay");
  });

  it("validates History lifecycle entries before counts and pagination", () => {
    const value = source("apps/mobile/services/metal-history-read-model-service.ts");
    expect(value).not.toContain("countTerminalStates(orderedStates)");
    expect(value).not.toContain("pageTerminalStatesByEffectiveEventTime(");
    expect(value).toMatch(/shapeReadHistoryHoldings[\s\S]*buildMetalHistoryReadModel/);
  });

  it("renders trust and provenance when detail current value is available", () => {
    const value = source("apps/mobile/components/metals/MetalHoldingDetailScreen.tsx");
    expect(value).toContain("metal-holding-detail-rate-trust");
    expect(value).toContain("rate.short_");
    expect(value).toContain("rate.source");
    expect(value).toContain("rate.quality");
  });

  it("validates the complete Arabic active-holdings plural set", () => {
    const ar = JSON.parse(
      source("apps/mobile/locales/ar/metals.json")
    ) as Record<string, unknown>;
    const portfolio = ar.portfolio as Record<string, unknown>;
    for (const suffix of ["zero", "one", "two", "few", "many", "other"]) {
      expect(portfolio[`active_holdings_${suffix}`]).toEqual(expect.any(String));
    }
    const schema = source("apps/mobile/i18n/translation-schemas.ts");
    expect(schema).toContain('"portfolio.active_holdings"');
  });

  it("reflows the portfolio summary through the shared responsive helper", () => {
    const value = source("apps/mobile/components/metals/MetalPortfolioScreen.tsx");
    expect(value).toContain("shouldUseCompactLayout");
    expect(value).toContain("useWindowDimensions");
    expect(value).toContain("metal-portfolio-summary-layout");
    expect(value).toMatch(/isCompact[\s\S]*flex-col/);
  });

  it("preserves Silver's established half-row Live Rates footprint", () => {
    const value = source("apps/mobile/components/live-rates/LiveRatesScreen.tsx");
    expect(value).toContain("live-rates-silver-layout-spacer");
    expect(value).toMatch(/flex-row mt-3[\s\S]*gap:\s*12/);
  });
});
