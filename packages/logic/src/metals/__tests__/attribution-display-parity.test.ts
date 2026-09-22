import {
  calculateUnrealizedAttribution,
  convertAttributionForDisplay,
  roundAttributionForDisplay,
} from "../attribution";
import type {
  CurrencyInstrumentCode,
  CurrencyRateRole,
  ExactDirectCurrencyRateReference,
  ExactMetalRateReference,
  MetalInstrumentCode,
  MetalRateRole,
} from "../rate-reference";

const OBSERVED_AT = 1_800_000_000_000;
const CAPTURED_AT = OBSERVED_AT + 1_000;

function metalRate(
  role: MetalRateRole,
  instrumentCode: MetalInstrumentCode,
  valueDecimal: string
): ExactMetalRateReference {
  return Object.freeze({
    role,
    kind: "metal",
    instrumentCode,
    valueDecimal,
    unit: "usd_per_pure_gram",
    orientation: "quote_per_base",
    providerObservedAt: OBSERVED_AT,
    source: "fixture-provider",
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  });
}

function directCurrencyRate(
  role: CurrencyRateRole,
  instrumentCode: CurrencyInstrumentCode,
  valueDecimal: string
): ExactDirectCurrencyRateReference {
  return Object.freeze({
    role,
    kind: "currency",
    instrumentCode,
    valueDecimal,
    unit: "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: OBSERVED_AT,
    source: "fixture-provider",
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  });
}

const CURRENT_CONTEXT = {
  metalInstrumentCode: "metal:GOLD",
  purchaseCurrencyInstrumentCode: "currency:EGP",
} as const;
const DISPLAY_CONTEXT = {
  canonicalCurrencyInstrumentCode: "currency:EGP",
  preferredCurrencyInstrumentCode: "currency:SAR",
} as const;
const ACQUISITION_METAL_RATE = metalRate(
  "acquisition_metal",
  "metal:GOLD",
  "2"
);
const ACQUISITION_EGP_RATE = directCurrencyRate(
  "acquisition_purchase_currency",
  "currency:EGP",
  "0.5"
);
const VALUATION_METAL_RATE = metalRate("current_metal", "metal:GOLD", "3");
const VALUATION_EGP_RATE = directCurrencyRate(
  "current_purchase_currency",
  "currency:EGP",
  "0.25"
);
const DISPLAY_PURCHASE_EGP_RATE = directCurrencyRate(
  "display_purchase_currency",
  "currency:EGP",
  "0.25"
);
const DISPLAY_PREFERRED_SAR_RATE = directCurrencyRate(
  "display_preferred_currency",
  "currency:SAR",
  "1"
);

describe("rounding explanation and hand-derived PostgreSQL numeric compatibility fixtures", () => {
  it("explains the allowed two-minor-unit display difference without a balancing component", () => {
    expect(
      roundAttributionForDisplay({
        combinedDecimal: "0.015",
        components: {
          metalMovementDecimal: "0.005",
          currencyMovementDecimal: "0.005",
          purchaseCostDecimal: "0.005",
        },
        decimalPlaces: 2,
      })
    ).toEqual({
      available: true,
      value: {
        combinedDecimal: "0.02",
        displayedComponents: {
          metalMovementDecimal: "0.00",
          currencyMovementDecimal: "0.00",
          purchaseCostDecimal: "0.00",
        },
        displayedComponentSumDecimal: "0.00",
        roundingDifferenceMinorUnits: "2",
        requiresRoundingExplanation: true,
      },
    });
  });

  it("converts combined P/L and every component through one exact display FX basis before final rounding", () => {
    expect(
      convertAttributionForDisplay({
        ...DISPLAY_CONTEXT,
        attribution: {
          available: true,
          value: {
            combinedDecimal: "0.005",
            components: {
              metalMovementDecimal: "0.001",
              currencyMovementDecimal: "0.004",
            },
          },
        },
        canonicalCurrencyAtDisplayRate: directCurrencyRate(
          "display_purchase_currency",
          "currency:EGP",
          "0.6"
        ),
        preferredCurrencyAtDisplayRate: directCurrencyRate(
          "display_preferred_currency",
          "currency:SAR",
          "0.2"
        ),
        decimalPlaces: 2,
      })
    ).toEqual({
      available: true,
      value: {
        consumedRateReferences: [
          directCurrencyRate(
            "display_purchase_currency",
            "currency:EGP",
            "0.6"
          ),
          directCurrencyRate(
            "display_preferred_currency",
            "currency:SAR",
            "0.2"
          ),
        ],
        combinedDecimal: "0.02",
        displayedComponents: {
          metalMovementDecimal: "0.00",
          currencyMovementDecimal: "0.01",
        },
        displayedComponentSumDecimal: "0.01",
        roundingDifferenceMinorUnits: "1",
        requiresRoundingExplanation: true,
      },
    });
  });

  it("preserves an unavailable canonical attribution without fabricating display value", () => {
    expect(
      convertAttributionForDisplay({
        ...DISPLAY_CONTEXT,
        attribution: { available: false, reason: "purchase_cost_unavailable" },
        canonicalCurrencyAtDisplayRate: DISPLAY_PURCHASE_EGP_RATE,
        preferredCurrencyAtDisplayRate: DISPLAY_PREFERRED_SAR_RATE,
        decimalPlaces: 2,
      })
    ).toEqual({ available: false, reason: "purchase_cost_unavailable" });
  });

  it.each([
    [
      "canonical_currency_display_rate_unavailable",
      { canonicalCurrencyAtDisplayRate: null },
    ],
    [
      "preferred_currency_display_rate_unavailable",
      { preferredCurrencyAtDisplayRate: null },
    ],
  ] as const)(
    "keeps display attribution unavailable for %s",
    (reason, missingRate) => {
      expect(
        convertAttributionForDisplay({
          ...DISPLAY_CONTEXT,
          attribution: {
            available: true,
            value: {
              combinedDecimal: "85",
              components: { metalMovementDecimal: "20" },
            },
          },
          canonicalCurrencyAtDisplayRate: DISPLAY_PURCHASE_EGP_RATE,
          preferredCurrencyAtDisplayRate: DISPLAY_PREFERRED_SAR_RATE,
          decimalPlaces: 2,
          ...missingRate,
        })
      ).toEqual({ available: false, reason });
    }
  );

  it.each([
    {
      name: "terminating exact decimals",
      pureGramsDecimal: "10",
      purchaseCostDecimal: "35",
      purchaseCurrencyDecimalPlaces: 2,
      expectedExactNumeric: {
        metalMovementDecimal: "20",
        currencyMovementDecimal: "60",
        purchaseCostDecimal: "5",
        combinedDecimal: "85",
      },
    },
    {
      name: "high-precision exact decimals",
      pureGramsDecimal: "0.000001",
      purchaseCostDecimal: "0.01",
      purchaseCurrencyDecimalPlaces: 2,
      expectedExactNumeric: {
        metalMovementDecimal: "0.000002",
        currencyMovementDecimal: "0.000006",
        purchaseCostDecimal: "-0.009996",
        combinedDecimal: "-0.009988",
      },
    },
  ])(
    "matches a hand-derived exact-decimal fixture intended for future PostgreSQL numeric parity: $name",
    ({
      pureGramsDecimal,
      purchaseCostDecimal,
      purchaseCurrencyDecimalPlaces,
      expectedExactNumeric,
    }) => {
      const result = calculateUnrealizedAttribution({
        ...CURRENT_CONTEXT,
        pureGramsDecimal,
        purchaseCostDecimal,
        purchaseCurrencyDecimalPlaces,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        valuationMetalRate: VALUATION_METAL_RATE,
        valuationCurrencyRate: VALUATION_EGP_RATE,
      });

      expect(result).toMatchObject({
        available: true,
        value: {
          combinedDecimal: expectedExactNumeric.combinedDecimal,
          breakdown: {
            available: true,
            value: {
              components: {
                metalMovementDecimal: expectedExactNumeric.metalMovementDecimal,
                currencyMovementDecimal:
                  expectedExactNumeric.currencyMovementDecimal,
                purchaseCostDecimal: expectedExactNumeric.purchaseCostDecimal,
              },
            },
          },
        },
      });
    }
  );
});
