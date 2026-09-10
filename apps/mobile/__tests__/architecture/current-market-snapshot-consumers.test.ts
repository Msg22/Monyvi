import { readFileSync } from "node:fs";
import { join } from "node:path";

const MOBILE_ROOT = join(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(join(MOBILE_ROOT, relativePath), "utf8");
}

interface ForbiddenRule {
  readonly file: string;
  readonly patterns: readonly (RegExp | string)[];
  readonly why: string;
}

const CURRENT_RATE_CONSUMERS: readonly ForbiddenRule[] = [
  {
    file: "hooks/useLiveRatesScreen.ts",
    patterns: [
      "observeLiveRatesTrust",
      /convertCurrency\(/,
      /getMetalPrice\(/,
      /getGoldPurityPrice\(/,
      /latestRates\b(?!,)/,
    ],
    why: "current displayed rates must come from the exact selected snapshot",
  },
  {
    file: "hooks/useMetalPortfolio.ts",
    patterns: [
      "observeLiveRatesTrust",
      "observeSelectedMarketRateSnapshot",
    ],
    why: "portfolio must consume the shared selected snapshot facade",
  },
  {
    file: "hooks/useMetalHoldingDetail.ts",
    patterns: [
      "observeLiveRatesTrust",
      "observeSelectedMarketRateSnapshot",
    ],
    why: "detail must consume the shared selected snapshot facade",
  },
  {
    file: "hooks/useNetWorth.ts",
    patterns: ["latestRates"],
    why: "net worth current conversion must consume the selected snapshot",
  },
  {
    file: "services/net-worth-read-model-service.ts",
    patterns: [
      /convertCurrency\(/,
      /calculateAccountsTotalBalance\(/,
      /calculateTotalAssets\(/,
      /MarketRate\b/,
      /weightGramsDecimal\s*\?\?/,
      /purityFactorDecimal\s*\?\?/,
    ],
    why: "net worth must use exact snapshot and exact holding inputs",
  },
  {
    file: "services/live-rates-trust-read-model-service.ts",
    patterns: ["observeLiveRatesTrust", ".observe(", ".query("],
    why: "the trust service must be a pure selected-snapshot mapper",
  },
  {
    file: "hooks/useMarketRates.ts",
    patterns: [/\.isStale\(\)/, /\.getAge\(\)/],
    why: "current freshness must derive from provider observation time only",
  },
  {
    file: "services/live-rates-refresh-service.ts",
    patterns: [
      "pullMarketRates(",
      "pullMarketRateObservations(",
      'get<MarketRateObservation>("market_rate_observations")',
    ],
    why: "manual refresh must pull and apply a complete envelope only",
  },
  {
    file: "services/sync/atomic-pull-strategies.ts",
    patterns: ["pullMarketRates(", "pullMarketRateObservations("],
    why: "normal sync must use the complete snapshot RPC",
  },
  {
    file: "providers/MarketRatesRealtimeProvider.tsx",
    patterns: ["console.error", "selectMarketRateSnapshot", "applyRemoteChanges"],
    why: "realtime may trigger normal sync but cannot promote a root",
  },
];

const NO_UNSAFE_DOUBLE_ASSERTION_FILES = [
  "hooks/useLiveRatesScreen.ts",
  "hooks/useMarketRates.ts",
  "hooks/useMetalHoldingDetail.ts",
  "hooks/useMetalPortfolio.ts",
  "hooks/useNetWorth.ts",
  "providers/MarketRatesRealtimeProvider.tsx",
  "services/live-rates-refresh-service.ts",
  "services/live-rates-trust-read-model-service.ts",
  "services/market-rate-snapshot-read-model-service.ts",
  "services/net-worth-read-model-service.ts",
  "services/sync/atomic-pull-strategies.ts",
  "services/sync/market-rate-snapshot-pull.ts",
] as const;

describe("issue #302 current-rate consumer bypass guard", () => {
  for (const rule of CURRENT_RATE_CONSUMERS) {
    it(`forbids independent current-rate selection in ${rule.file}`, () => {
      const text = source(rule.file);
      for (const pattern of rule.patterns) {
        const hit =
          typeof pattern === "string"
            ? text.includes(pattern)
            : pattern.test(text);
        expect({
          file: rule.file,
          pattern: String(pattern),
          reason: rule.why,
          hit,
        }).toEqual({
          file: rule.file,
          pattern: String(pattern),
          reason: rule.why,
          hit: false,
        });
      }
    });
  }

  it("routes the production sync entry point through the atomic pull orchestrator", () => {
    const syncEntryPoint = source("services/sync.ts");
    const atomicPull = source("services/sync/atomic-pull-strategies.ts");

    expect(syncEntryPoint).toContain(
      'from "./sync/atomic-pull-strategies"'
    );
    expect(atomicPull).toContain("pullMarketRateSnapshots");
    expect(atomicPull).toContain("market_rate_observations");
  });

  it("uses one selected snapshot stream for all current React consumers", () => {
    expect(source("hooks/useLiveRatesScreen.ts")).toContain("useMarketRates()");
    expect(source("hooks/useMetalPortfolio.ts")).toContain("useMarketRates()");
    expect(source("hooks/useMetalHoldingDetail.ts")).toContain(
      "useMarketRates()"
    );
    expect(source("hooks/useNetWorth.ts")).toContain("useMarketRates()");
  });

  it.each(NO_UNSAFE_DOUBLE_ASSERTION_FILES)(
    "contains no unsafe double assertion in %s",
    (file) => {
      expect(source(file)).not.toContain("as unknown as");
    }
  );
});
