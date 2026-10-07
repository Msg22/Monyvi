import type { CurrencyType } from "@monyvi/db";

import {
  buildCurrentRateInputs,
  getCurrentValueRates,
} from "@/services/metal-detail-rate-inputs";
import type {
  LiveRatesTrustReadModel,
  LiveRatesTrustState,
  LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";

function trustValue(
  state: LiveRatesTrustState,
  source: string
): LiveRatesTrustValue {
  return {
    state,
    ageMs: state === "fresh" ? 1_000 : null,
    providerObservedAt:
      state === "missing" ? null : new Date("2026-10-07T10:00:00.000Z"),
    quality: state === "missing" ? null : "valid",
    source,
    valueDecimal: state === "missing" ? null : "1",
  };
}

function rates(
  overrides: Partial<
    Record<"gold" | "silver" | "EGP" | "EUR", LiveRatesTrustValue>
  > = {}
): LiveRatesTrustReadModel {
  const currencies = new Map<CurrencyType, LiveRatesTrustValue>();
  currencies.set("EGP", overrides.EGP ?? trustValue("stale", "egp"));
  currencies.set("EUR", overrides.EUR ?? trustValue("unknown", "eur"));
  return {
    gold: overrides.gold ?? trustValue("fresh", "gold"),
    silver: overrides.silver ?? trustValue("invalid", "silver"),
    currencies,
  };
}

describe("metal detail current rate inputs", () => {
  it("uses the Gold rate for USD purchase-currency performance when preferred currency is omitted", () => {
    const input = {
      asset: { purchaseCurrency: "USD" },
      currentRates: rates(),
      metal: { metalType: "GOLD" as const },
    };

    expect(getCurrentValueRates(input)).toEqual([]);
    expect(buildCurrentRateInputs(input, true)).toEqual([
      expect.objectContaining({
        id: "metal:GOLD",
        source: "gold",
        state: "fresh",
      }),
    ]);
  });

  it("keeps explicit Silver and non-USD purchase-FX identities when preferred currency is omitted", () => {
    const input = {
      asset: { purchaseCurrency: "EGP" },
      currentRates: rates(),
      metal: { metalType: "SILVER" as const },
    };

    expect(buildCurrentRateInputs(input, true)).toEqual([
      expect.objectContaining({
        id: "metal:SILVER",
        source: "silver",
        state: "invalid",
      }),
      expect.objectContaining({
        id: "currency:EGP",
        source: "egp",
        state: "stale",
      }),
    ]);
  });

  it("preserves preferred-currency current-value inputs and adds purchase FX only for displayed performance", () => {
    const input = {
      asset: { purchaseCurrency: "EGP" },
      currentRates: rates(),
      metal: { metalType: "GOLD" as const },
      preferredCurrency: "EUR" as const,
    };

    expect(buildCurrentRateInputs(input, false)).toEqual([
      expect.objectContaining({ id: "metal:GOLD", source: "gold" }),
      expect.objectContaining({ id: "currency:EUR", source: "eur" }),
    ]);
    expect(buildCurrentRateInputs(input, true)).toEqual([
      expect.objectContaining({ id: "metal:GOLD", source: "gold" }),
      expect.objectContaining({ id: "currency:EUR", source: "eur" }),
      expect.objectContaining({ id: "currency:EGP", source: "egp" }),
    ]);
  });

  it("keeps a missing relevant purchase FX status paired with its currency ID", () => {
    const input = {
      asset: { purchaseCurrency: "EGP" },
      currentRates: rates({
        EGP: trustValue("missing", "missing-egp"),
      }),
      metal: { metalType: "GOLD" as const },
    };

    expect(buildCurrentRateInputs(input, true)).toEqual([
      expect.objectContaining({ id: "metal:GOLD", source: "gold" }),
      expect.objectContaining({
        id: "currency:EGP",
        source: "missing-egp",
        state: "missing",
      }),
    ]);
  });

  it("returns no rate inputs when neither current value nor performance can be displayed", () => {
    const input = {
      asset: { purchaseCurrency: "EGP" },
      currentRates: rates(),
      metal: { metalType: "GOLD" as const },
    };

    expect(buildCurrentRateInputs(input, false)).toEqual([]);
  });
});
