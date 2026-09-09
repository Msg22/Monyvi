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
    patterns: ["observeLiveRatesTrust"],
    why: "portfolio current valuation must consume the selected snapshot",
  },
  {
    file: "hooks/useMetalHoldingDetail.ts",
    patterns: ["observeLiveRatesTrust"],
    why: "detail current valuation must consume the selected snapshot",
  },
  {
    file: "hooks/useNetWorth.ts",
    patterns: ["latestRates"],
    why: "net worth current conversion must consume the selected snapshot",
  },
  {
    file: "services/net-worth-read-model-service.ts",
    patterns: [/convertCurrency\(/, /calculateAccountsTotalBalance\(/, /calculateTotalAssets\(/, /MarketRate\b/],
    why: "net worth must use exact snapshot rate strings, not wide MarketRate numbers",
  },
  {
    file: "services/live-rates-trust-read-model-service.ts",
    patterns: ["observeLiveRatesTrust", ".observe(", ".query("],
    why: "the trust service must be a pure mapper over one selected snapshot",
  },
  {
    file: "hooks/useMarketRates.ts",
    patterns: [/\.isStale\(\)/, /\.getAge\(\)/],
    why: "current freshness must derive from snapshot provider observation time only",
  },
];

describe("issue #302 current-rate consumer bypass guard", () => {
  for (const rule of CURRENT_RATE_CONSUMERS) {
    it(`forbids independent current-rate selection in ${rule.file}`, () => {
      const text = source(rule.file);
      for (const pattern of rule.patterns) {
        if (typeof pattern === "string") {
          expect({ file: rule.file, found: pattern, hit: text.includes(pattern) }).toEqual({
            file: rule.file,
            found: pattern,
            hit: false,
          });
        } else {
          expect({
            file: rule.file,
            pattern: String(pattern),
            hit: pattern.test(text),
          }).toEqual({
            file: rule.file,
            pattern: String(pattern),
            hit: false,
          });
        }
      }
    });
  }
});
