import {
  calculateUnrealizedAttribution,
  convertAttributionForDisplay,
  roundAttributionForDisplay,
} from "../attribution";
import type {
  ExactDirectCurrencyRateReference,
  ExactMetalRateReference,
} from "../rate-reference";

const DISPLAY_CANONICAL_RATE = Object.freeze({
  role: "display_purchase_currency" as const,
  kind: "currency" as const,
  instrumentCode: "currency:EGP" as const,
  valueDecimal: "1",
  unit: "usd_per_currency_unit" as const,
  orientation: "quote_per_base" as const,
  providerObservedAt: 1_000,
  source: "fixture-provider",
  quality: "valid" as const,
  capturedAt: 2_000,
  capturedFreshness: "fresh" as const,
});

const DISPLAY_PREFERRED_RATE = Object.freeze({
  ...DISPLAY_CANONICAL_RATE,
  role: "display_preferred_currency" as const,
  instrumentCode: "currency:SAR" as const,
  valueDecimal: "3",
});

function metalRate(
  role: "acquisition_metal" | "current_metal",
  valueDecimal: string
): ExactMetalRateReference {
  return Object.freeze({
    role,
    kind: "metal" as const,
    instrumentCode: "metal:GOLD" as const,
    valueDecimal,
    unit: "usd_per_pure_gram" as const,
    orientation: "quote_per_base" as const,
    providerObservedAt: 1_000,
    source: "fixture-provider",
    quality: "valid" as const,
    capturedAt: 2_000,
    capturedFreshness: "fresh" as const,
  });
}

function currencyRate(
  role: "acquisition_purchase_currency" | "current_purchase_currency",
  valueDecimal: string
): ExactDirectCurrencyRateReference {
  return Object.freeze({
    ...DISPLAY_CANONICAL_RATE,
    role,
    valueDecimal,
  });
}

describe("Metals attribution rounding validation", () => {
  it("rejects a component mismatch beyond the approved two-minor-unit rounding tolerance", () => {
    expect(
      roundAttributionForDisplay({
        combinedDecimal: "100",
        components: {
          metalMovementDecimal: "0",
          currencyMovementDecimal: "0",
          purchaseCostDecimal: "0",
        },
        decimalPlaces: 2,
      })
    ).toEqual({
      available: false,
      reason: "attribution_components_mismatch",
    });
  });

  it("rejects a small component mismatch that did not come from final rounding", () => {
    expect(
      roundAttributionForDisplay({
        combinedDecimal: "0.02",
        components: { metalMovementDecimal: "0.01" },
        decimalPlaces: 2,
      })
    ).toEqual({
      available: false,
      reason: "attribution_components_mismatch",
    });
  });

  it("preserves an exact source attribution through repeating display conversion", () => {
    expect(
      convertAttributionForDisplay({
        canonicalCurrencyInstrumentCode: "currency:EGP",
        preferredCurrencyInstrumentCode: "currency:SAR",
        attribution: {
          available: true,
          value: {
            combinedDecimal: "2",
            components: {
              metalMovementDecimal: "1",
              currencyMovementDecimal: "1",
            },
          },
        },
        canonicalCurrencyAtDisplayRate: DISPLAY_CANONICAL_RATE,
        preferredCurrencyAtDisplayRate: DISPLAY_PREFERRED_RATE,
        decimalPlaces: 2,
      })
    ).toEqual({
      available: true,
      value: {
        combinedDecimal: "0.67",
        displayedComponents: {
          metalMovementDecimal: "0.33",
          currencyMovementDecimal: "0.33",
        },
        displayedComponentSumDecimal: "0.66",
        roundingDifferenceMinorUnits: "1",
        requiresRoundingExplanation: true,
      },
    });
  });

  it("rejects a true source mismatch before display conversion", () => {
    expect(
      convertAttributionForDisplay({
        canonicalCurrencyInstrumentCode: "currency:EGP",
        preferredCurrencyInstrumentCode: "currency:SAR",
        attribution: {
          available: true,
          value: {
            combinedDecimal: "2",
            components: {
              metalMovementDecimal: "1",
              currencyMovementDecimal: "0.9",
            },
          },
        },
        canonicalCurrencyAtDisplayRate: DISPLAY_CANONICAL_RATE,
        preferredCurrencyAtDisplayRate: DISPLAY_PREFERRED_RATE,
        decimalPlaces: 2,
      })
    ).toEqual({
      available: false,
      reason: "attribution_components_mismatch",
    });
  });

  it("preserves calculated attribution with non-terminating internal divisions", () => {
    const calculated = calculateUnrealizedAttribution({
      metalInstrumentCode: "metal:GOLD",
      purchaseCurrencyInstrumentCode: "currency:EGP",
      pureGramsDecimal: "1",
      purchaseCostDecimal: "1",
      purchaseCurrencyDecimalPlaces: 2,
      acquisitionMetalRate: metalRate("acquisition_metal", "1"),
      acquisitionCurrencyRate: currencyRate("acquisition_purchase_currency", "3"),
      valuationMetalRate: metalRate("current_metal", "2"),
      valuationCurrencyRate: currencyRate("current_purchase_currency", "7"),
    });
    if (!calculated.available || !calculated.value.breakdown.available) {
      throw new Error("Expected detailed calculated attribution");
    }

    expect(
      convertAttributionForDisplay({
        canonicalCurrencyInstrumentCode: "currency:EGP",
        preferredCurrencyInstrumentCode: "currency:SAR",
        attribution: {
          available: true,
          value: {
            combinedDecimal: calculated.value.combinedDecimal,
            components: calculated.value.breakdown.value.components,
          },
        },
        canonicalCurrencyAtDisplayRate: DISPLAY_CANONICAL_RATE,
        preferredCurrencyAtDisplayRate: DISPLAY_PREFERRED_RATE,
        decimalPlaces: 2,
      })
    ).toMatchObject({ available: true });
  });
});
