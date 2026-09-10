import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildTrustFromSelectedSnapshot,
  summarizeLiveRatesTrust,
  type LiveRatesTrustState,
  type SelectedSnapshotTrustInput,
} from "@/services/live-rates-trust-read-model-service";
import type { SelectedCurrentMarketRate } from "@/services/market-rate-snapshot-read-model-service";
import type { CurrentMarketInstrument } from "@monyvi/logic";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");
const DAY_MS = 86_400_000;

interface RateSeed {
  readonly valueDecimal?: string;
  readonly providerObservedAt?: Date | null;
  readonly source?: string;
}

function createTrustInput(
  rates: Readonly<Partial<Record<CurrentMarketInstrument, RateSeed>>>
): SelectedSnapshotTrustInput {
  const ratesByInstrument = new Map<
    CurrentMarketInstrument,
    SelectedCurrentMarketRate
  >();

  for (const instrumentCode of Object.keys(rates)) {
    if (!isCurrentMarketInstrument(instrumentCode)) {
      throw new Error(`unexpected test instrument: ${instrumentCode}`);
    }
    const seed = rates[instrumentCode];
    if (!seed) {
      continue;
    }
    const providerObservedAt =
      seed.providerObservedAt === undefined
        ? new Date(NOW_MS - 1_000)
        : seed.providerObservedAt;
    const ageMs =
      providerObservedAt === null ? null : NOW_MS - providerObservedAt.getTime();
    const state: LiveRatesTrustState =
      providerObservedAt === null
        ? "unknown"
        : (ageMs ?? 0) > DAY_MS
          ? "stale"
          : "fresh";
    const isMetal = instrumentCode.startsWith("metal:");

    ratesByInstrument.set(instrumentCode, {
      instrumentCode,
      valueDecimal: seed.valueDecimal ?? "100.25",
      normalizedUsdPerBaseDecimal: seed.valueDecimal ?? "100.25",
      unit: isMetal
        ? "usd_per_pure_gram"
        : "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt,
      source: seed.source ?? "metals.dev",
      quality: "valid",
      freshness: state === "invalid" ? "unknown" : state,
      ageMs,
    });
  }

  return {
    capturedAt: new Date(NOW_MS),
    ratesByInstrument,
  };
}

function isCurrentMarketInstrument(
  value: string
): value is CurrentMarketInstrument {
  return (
    value === "metal:GOLD" ||
    value === "metal:SILVER" ||
    /^currency:[A-Z]{3}$/.test(value)
  );
}

describe("buildTrustFromSelectedSnapshot", () => {
  it("maps only the selected snapshot's exact values and trust evidence", () => {
    const trust = buildTrustFromSelectedSnapshot(
      createTrustInput({
        "metal:GOLD": { valueDecimal: "3738.74000000" },
        "metal:SILVER": {
          valueDecimal: "43.73874000",
          providerObservedAt: new Date(NOW_MS - DAY_MS - 1),
        },
        "currency:EGP": { valueDecimal: "0.0210523309" },
        "currency:USD": { valueDecimal: "1" },
      })
    );

    expect(trust.gold).toMatchObject({
      state: "fresh",
      valueDecimal: "3738.74000000",
      source: "metals.dev",
      quality: "valid",
    });
    expect(trust.silver).toMatchObject({
      state: "stale",
      ageMs: DAY_MS + 1,
      valueDecimal: "43.73874000",
    });
    expect(trust.currencies.get("EGP")?.valueDecimal).toBe("0.0210523309");
    expect(trust.currencies.get("USD")?.valueDecimal).toBe("1");
  });

  it("keeps Unknown freshness when the selected snapshot has null provider time", () => {
    const trust = buildTrustFromSelectedSnapshot(
      createTrustInput({ "metal:GOLD": { providerObservedAt: null } })
    );

    expect(trust.gold.state).toBe("unknown");
    expect(trust.gold.providerObservedAt).toBeNull();
    expect(trust.gold.valueDecimal).not.toBeNull();
  });

  it("never queries observations independently and never mixes another snapshot", () => {
    const serviceText = readFileSync(
      join(
        __dirname,
        "../../services/live-rates-trust-read-model-service.ts"
      ),
      "utf8"
    );

    expect(serviceText).not.toContain("observeLiveRatesTrust");
    expect(serviceText).not.toContain("buildLiveRatesTrustReadModel");
    expect(serviceText).not.toContain(".query(");
    expect(serviceText).not.toContain(".observe(");
    expect(serviceText).not.toContain("watermelondb");

    const moduleExports = require(
      "@/services/live-rates-trust-read-model-service"
    );
    expect(moduleExports.observeLiveRatesTrust).toBeUndefined();
    expect(moduleExports.buildLiveRatesTrustReadModel).toBeUndefined();
  });

  it("summarizes worst-case trust states", () => {
    expect(summarizeLiveRatesTrust([])).toBe("missing");
    expect(
      summarizeLiveRatesTrust([
        { state: "fresh", ageMs: 1, providerObservedAt: new Date(NOW_MS) },
        { state: "stale", ageMs: DAY_MS + 1, providerObservedAt: null },
      ])
    ).toBe("stale");
  });
});
