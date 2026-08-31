import {
  calculateRealizedAttribution,
  calculateUnrealizedAttribution,
  convertAttributionForDisplay,
} from "../attribution";
import type {
  CurrencyRateRole,
  CurrencyInstrumentCode,
  ExactDirectCurrencyRateReference,
  ExactMetalRateReference,
  MetalRateRole,
} from "../rate-reference";

const OBSERVED_AT = 1_800_000_000_000;
const CAPTURED_AT = OBSERVED_AT + 1_000;

function metalRate(
  role: MetalRateRole,
  instrumentCode: "metal:GOLD" | "metal:SILVER",
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
    source: "context-fixture",
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  });
}

function currencyRate(
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
    source: "context-fixture",
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  });
}

const CURRENT_CONTEXT = {
  metalInstrumentCode: "metal:GOLD",
  purchaseCurrencyInstrumentCode: "currency:EGP",
  pureGramsDecimal: "10",
  purchaseCostDecimal: "35",
  purchaseCurrencyDecimalPlaces: 2,
} as const;

const SALE_CONTEXT = {
  ...CURRENT_CONTEXT,
  proceedsCurrencyInstrumentCode: "currency:USD",
  grossProceedsDecimal: "100",
  feesDecimal: "5",
  proceedsCurrencyDecimalPlaces: 2,
} as const;

describe("attribution expected instrument context", () => {
  it("rejects a current Silver rate for a Gold holding when acquisition Metal evidence is missing", () => {
    expect(
      calculateUnrealizedAttribution({
        ...CURRENT_CONTEXT,
        acquisitionMetalRate: null,
        acquisitionCurrencyRate: currencyRate(
          "acquisition_purchase_currency",
          "currency:EGP",
          "0.5"
        ),
        valuationMetalRate: metalRate("current_metal", "metal:SILVER", "3"),
        valuationCurrencyRate: currencyRate(
          "current_purchase_currency",
          "currency:EGP",
          "0.25"
        ),
      })
    ).toEqual({ available: false, reason: "valuation_metal_rate_unavailable" });
  });

  it("rejects a SAR current rate for an EGP purchase when acquisition FX evidence is missing", () => {
    expect(
      calculateUnrealizedAttribution({
        ...CURRENT_CONTEXT,
        acquisitionMetalRate: metalRate("acquisition_metal", "metal:GOLD", "2"),
        acquisitionCurrencyRate: null,
        valuationMetalRate: metalRate("current_metal", "metal:GOLD", "3"),
        valuationCurrencyRate: currencyRate(
          "current_purchase_currency",
          "currency:SAR",
          "0.25"
        ),
      })
    ).toEqual({ available: false, reason: "valuation_currency_rate_unavailable" });
  });

  it("rejects terminal Metal and purchase FX mismatches without acquisition evidence", () => {
    const result = calculateRealizedAttribution({
      ...SALE_CONTEXT,
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: metalRate("terminal_metal", "metal:SILVER", "3"),
      purchaseCurrencyAtSaleRate: currencyRate(
        "terminal_purchase_currency",
        "currency:SAR",
        "0.25"
      ),
      proceedsCurrencyAtSaleRate: currencyRate(
        "terminal_proceeds_currency",
        "currency:USD",
        "1"
      ),
    });

    expect(result).toEqual({
      available: false,
      reason: "purchase_currency_at_sale_rate_unavailable",
    });
  });

  it("rejects proceeds FX that does not match the independently expected proceeds currency", () => {
    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        acquisitionMetalRate: metalRate("acquisition_metal", "metal:GOLD", "2"),
        acquisitionCurrencyRate: currencyRate(
          "acquisition_purchase_currency",
          "currency:EGP",
          "0.5"
        ),
        saleMetalRate: metalRate("terminal_metal", "metal:GOLD", "3"),
        purchaseCurrencyAtSaleRate: currencyRate(
          "terminal_purchase_currency",
          "currency:EGP",
          "0.25"
        ),
        proceedsCurrencyAtSaleRate: currencyRate(
          "terminal_proceeds_currency",
          "currency:SAR",
          "0.2"
        ),
      })
    ).toEqual({
      available: false,
      reason: "proceeds_currency_at_sale_rate_unavailable",
    });
  });

  it("uses identity conversion for a same-currency sale despite differing terminal snapshots", () => {
    expect(
      calculateRealizedAttribution({
        ...CURRENT_CONTEXT,
        proceedsCurrencyInstrumentCode: "currency:EGP",
        grossProceedsDecimal: "150",
        feesDecimal: "10",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: metalRate(
          "acquisition_metal",
          "metal:GOLD",
          "2"
        ),
        acquisitionCurrencyRate: currencyRate(
          "acquisition_purchase_currency",
          "currency:EGP",
          "0.5"
        ),
        saleMetalRate: metalRate("terminal_metal", "metal:GOLD", "3"),
        purchaseCurrencyAtSaleRate: currencyRate(
          "terminal_purchase_currency",
          "currency:EGP",
          "0.25"
        ),
        proceedsCurrencyAtSaleRate: currencyRate(
          "terminal_proceeds_currency",
          "currency:EGP",
          "0.5"
        ),
      })
    ).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "105",
        canonicalGrossProceedsDecimal: "150",
        canonicalFeesDecimal: "10",
        breakdown: {
          available: true,
          value: {
            components: {
              saleDifferenceDecimal: "30",
              feeDecimal: "-10",
            },
          },
        },
      },
    });
  });

  it("uses identity conversion for same-currency display despite differing snapshots", () => {
    expect(
      convertAttributionForDisplay({
        attribution: {
          available: true,
          value: {
            combinedDecimal: "100",
            components: {
              metalMovementDecimal: "60",
              currencyMovementDecimal: "40",
            },
          },
        },
        canonicalCurrencyInstrumentCode: "currency:EGP",
        preferredCurrencyInstrumentCode: "currency:EGP",
        canonicalCurrencyAtDisplayRate: currencyRate(
          "display_purchase_currency",
          "currency:EGP",
          "0.25"
        ),
        preferredCurrencyAtDisplayRate: currencyRate(
          "display_preferred_currency",
          "currency:EGP",
          "0.5"
        ),
        decimalPlaces: 2,
      })
    ).toMatchObject({
      available: true,
      value: {
        consumedRateReferences: [],
        combinedDecimal: "100.00",
        displayedComponents: {
          metalMovementDecimal: "60.00",
          currencyMovementDecimal: "40.00",
        },
      },
    });
  });

  it("returns immutable validated rates consumed by cross-currency display conversion", () => {
    const canonicalRate = currencyRate(
      "display_purchase_currency",
      "currency:EGP",
      "0.25"
    );
    const preferredRate = currencyRate(
      "display_preferred_currency",
      "currency:USD",
      "1"
    );
    const result = convertAttributionForDisplay({
      attribution: {
        available: true,
        value: {
          combinedDecimal: "100",
          components: {
            metalMovementDecimal: "60",
            currencyMovementDecimal: "40",
          },
        },
      },
      canonicalCurrencyInstrumentCode: "currency:EGP",
      preferredCurrencyInstrumentCode: "currency:USD",
      canonicalCurrencyAtDisplayRate: canonicalRate,
      preferredCurrencyAtDisplayRate: preferredRate,
      decimalPlaces: 2,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "25.00",
        displayedComponents: {
          metalMovementDecimal: "15.00",
          currencyMovementDecimal: "10.00",
        },
        consumedRateReferences: [canonicalRate, preferredRate],
      },
    });
    if (result.available) {
      expect(Object.isFrozen(result.value.consumedRateReferences)).toBe(true);
      expect(
        result.value.consumedRateReferences.every((reference) =>
          Object.isFrozen(reference)
        )
      ).toBe(true);
    }
  });

  it.each([
    ["missing", null, null],
    [
      "unknown-freshness",
      {
        ...currencyRate(
          "display_purchase_currency",
          "currency:EGP",
          "0.25"
        ),
        providerObservedAt: null,
        capturedFreshness: "unknown" as const,
      },
      {
        ...currencyRate(
          "display_preferred_currency",
          "currency:EGP",
          "0.25"
        ),
        providerObservedAt: null,
        capturedFreshness: "unknown" as const,
      },
    ],
  ] as const)(
    "keeps already-canonical same-currency display available with %s snapshots",
    (_state, canonicalRate, preferredRate) => {
      expect(
        convertAttributionForDisplay({
          attribution: {
            available: true,
            value: {
              combinedDecimal: "100",
              components: { metalMovementDecimal: "100" },
            },
          },
          canonicalCurrencyInstrumentCode: "currency:EGP",
          preferredCurrencyInstrumentCode: "currency:EGP",
          canonicalCurrencyAtDisplayRate: canonicalRate,
          preferredCurrencyAtDisplayRate: preferredRate,
          decimalPlaces: 2,
        })
      ).toMatchObject({
        available: true,
        value: {
          combinedDecimal: "100.00",
          displayedComponents: { metalMovementDecimal: "100.00" },
        },
      });
    }
  );

  it.each([
    [
      "instrument mismatch",
      currencyRate("display_purchase_currency", "currency:SAR", "0.2"),
    ],
    [
      "role mismatch",
      currencyRate("terminal_purchase_currency", "currency:EGP", "0.25"),
    ],
    [
      "invalid quality",
      {
        ...currencyRate(
          "display_purchase_currency",
          "currency:EGP",
          "0.25"
        ),
        quality: "unknown",
      } as unknown as ExactDirectCurrencyRateReference,
    ],
    [
      "invalid value",
      currencyRate("display_purchase_currency", "currency:EGP", "0"),
    ],
  ] as const)(
    "ignores redundant same-currency display evidence with %s",
    (_case, redundantRate) => {
      expect(
        convertAttributionForDisplay({
          attribution: {
            available: true,
            value: {
              combinedDecimal: "10",
              components: { metal: "10" },
            },
          },
          canonicalCurrencyInstrumentCode: "currency:EGP",
          preferredCurrencyInstrumentCode: "currency:EGP",
          canonicalCurrencyAtDisplayRate: redundantRate,
          preferredCurrencyAtDisplayRate: null,
          decimalPlaces: 2,
        })
      ).toEqual({
        available: true,
        value: {
          consumedRateReferences: [],
          combinedDecimal: "10.00",
          displayedComponents: { metal: "10.00" },
          displayedComponentSumDecimal: "10.00",
          roundingDifferenceMinorUnits: "0",
          requiresRoundingExplanation: false,
        },
      });
    }
  );
  it.each([
    [
      "canonical_currency_display_rate_unavailable",
      "currency:SAR",
      "currency:USD",
    ],
    [
      "preferred_currency_display_rate_unavailable",
      "currency:EGP",
      "currency:SAR",
    ],
  ] as const)("rejects mismatched display context with %s", (reason, canonicalCode, preferredCode) => {
    expect(
      convertAttributionForDisplay({
        attribution: {
          available: true,
          value: { combinedDecimal: "10", components: { metal: "10" } },
        },
        canonicalCurrencyInstrumentCode: "currency:EGP",
        preferredCurrencyInstrumentCode: "currency:USD",
        canonicalCurrencyAtDisplayRate: currencyRate(
          "display_purchase_currency",
          canonicalCode,
          canonicalCode === "currency:EGP" ? "0.25" : "0.2"
        ),
        preferredCurrencyAtDisplayRate: currencyRate(
          "display_preferred_currency",
          preferredCode,
          preferredCode === "currency:USD" ? "1" : "0.2"
        ),
        decimalPlaces: 2,
      })
    ).toEqual({ available: false, reason });
  });
});
