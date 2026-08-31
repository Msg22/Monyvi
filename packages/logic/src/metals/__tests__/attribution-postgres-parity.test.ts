import {
  calculateRealizedAttribution,
  calculateUnrealizedAttribution,
  convertAttributionForDisplay,
  roundAttributionForDisplay,
} from "../attribution";
import type {
  CurrencyInstrumentCode,
  CurrencyRateRole,
  ExactDirectCurrencyRateReference,
  ExactInverseCurrencyRateReference,
  ExactMetalRateReference,
  MetalInstrumentCode,
  MetalRateRole,
} from "../rate-reference";
import { normalizeUsdPerUnitRate } from "../valuation";

function loadAttributionApi(): {
  readonly calculateRealizedAttribution: typeof calculateRealizedAttribution;
  readonly calculateUnrealizedAttribution: typeof calculateUnrealizedAttribution;
  readonly convertAttributionForDisplay: typeof convertAttributionForDisplay;
  readonly roundAttributionForDisplay: typeof roundAttributionForDisplay;
} {
  return {
    calculateRealizedAttribution,
    calculateUnrealizedAttribution,
    convertAttributionForDisplay,
    roundAttributionForDisplay,
  };
}

function loadValuationApi(): {
  readonly normalizeUsdPerUnitRate: typeof normalizeUsdPerUnitRate;
} {
  return { normalizeUsdPerUnitRate };
}

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
    role, kind: "currency", instrumentCode, valueDecimal,
    unit: "usd_per_currency_unit", orientation: "quote_per_base",
    providerObservedAt: OBSERVED_AT, source: "fixture-provider", quality: "valid",
    capturedAt: CAPTURED_AT, capturedFreshness: "fresh",
  });
}

function inverseCurrencyRate(
  role: CurrencyRateRole,
  instrumentCode: CurrencyInstrumentCode,
  valueDecimal: string
): ExactInverseCurrencyRateReference {
  return Object.freeze({
    role, kind: "currency", instrumentCode, valueDecimal,
    unit: "currency_units_per_usd", orientation: "base_per_quote",
    providerObservedAt: OBSERVED_AT, source: "fixture-provider", quality: "valid",
    capturedAt: CAPTURED_AT, capturedFreshness: "fresh",
  });
}

const CURRENT_CONTEXT = {
  metalInstrumentCode: "metal:GOLD",
  purchaseCurrencyInstrumentCode: "currency:EGP",
} as const;
const SALE_CONTEXT = {
  ...CURRENT_CONTEXT,
  proceedsCurrencyInstrumentCode: "currency:EGP",
} as const;
const DISPLAY_CONTEXT = {
  canonicalCurrencyInstrumentCode: "currency:EGP",
  preferredCurrencyInstrumentCode: "currency:SAR",
} as const;

const ACQUISITION_METAL_RATE = metalRate("acquisition_metal", "metal:GOLD", "2");
const ACQUISITION_EGP_RATE = directCurrencyRate("acquisition_purchase_currency", "currency:EGP", "0.5");
const VALUATION_METAL_RATE = metalRate("current_metal", "metal:GOLD", "3");
const VALUATION_EGP_RATE = directCurrencyRate("current_purchase_currency", "currency:EGP", "0.25");
const SALE_METAL_RATE = metalRate("terminal_metal", "metal:GOLD", "3");
const PURCHASE_AT_SALE_EGP_RATE = directCurrencyRate("terminal_purchase_currency", "currency:EGP", "0.25");
const PROCEEDS_EGP_RATE = directCurrencyRate("terminal_proceeds_currency", "currency:EGP", "0.25");
const USD_RATE = directCurrencyRate("terminal_proceeds_currency", "currency:USD", "1");
const DISPLAY_PURCHASE_EGP_RATE = directCurrencyRate("display_purchase_currency", "currency:EGP", "0.25");
const DISPLAY_PREFERRED_SAR_RATE = directCurrencyRate("display_preferred_currency", "currency:SAR", "1");
const VALUATION_SILVER_RATE = metalRate("current_metal", "metal:SILVER", "3");
const VALUATION_SAR_RATE = directCurrencyRate("current_purchase_currency", "currency:SAR", "0.25");
const SALE_SILVER_RATE = metalRate("terminal_metal", "metal:SILVER", "3");
const PURCHASE_AT_SALE_SAR_RATE = directCurrencyRate("terminal_purchase_currency", "currency:SAR", "0.25");
const PROCEEDS_SAR_RATE = directCurrencyRate("terminal_proceeds_currency", "currency:SAR", "0.25");

describe("current and realized Metals attribution", () => {
  it("produces the approved additive current attribution and V minus K", () => {
    const { calculateUnrealizedAttribution } = loadAttributionApi();

    expect(
      calculateUnrealizedAttribution({
        ...CURRENT_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        valuationMetalRate: VALUATION_METAL_RATE,
        valuationCurrencyRate: VALUATION_EGP_RATE,
      })
    ).toEqual({
      available: true,
      value: {
        combinedDecimal: "85",
        consumedRateReferences: [
          ACQUISITION_METAL_RATE,
          ACQUISITION_EGP_RATE,
          VALUATION_METAL_RATE,
          VALUATION_EGP_RATE,
        ],
        breakdown: {
          available: true,
          value: {
            components: {
              metalMovementDecimal: "20",
              currencyMovementDecimal: "60",
              purchaseCostDecimal: "5",
            },
            rateReferences: [
              ACQUISITION_METAL_RATE,
              ACQUISITION_EGP_RATE,
              VALUATION_METAL_RATE,
              VALUATION_EGP_RATE,
            ],
          },
        },
      },
    });
  });

  it("deducts a same-currency sale fee from gross proceeds and realized P/L", () => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "150",
        feesDecimal: "10",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        saleMetalRate: SALE_METAL_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
      })
    ).toEqual({
      available: true,
      value: {
        combinedDecimal: "105",
        consumedRateReferences: [
          ACQUISITION_METAL_RATE,
          ACQUISITION_EGP_RATE,
          SALE_METAL_RATE,
          PURCHASE_AT_SALE_EGP_RATE,
          PROCEEDS_EGP_RATE,
        ],
        canonicalGrossProceedsDecimal: "150",
        canonicalFeesDecimal: "10",
        netProceedsDecimal: "140",
        breakdown: {
          available: true,
          value: {
            components: {
              metalMovementDecimal: "20",
              currencyMovementDecimal: "60",
              purchaseCostDecimal: "5",
              saleDifferenceDecimal: "30",
              feeDecimal: "-10",
            },
            rateReferences: [
              ACQUISITION_METAL_RATE,
              ACQUISITION_EGP_RATE,
              SALE_METAL_RATE,
              PURCHASE_AT_SALE_EGP_RATE,
              PROCEEDS_EGP_RATE,
            ],
          },
        },
      },
    });
  });

  it("keeps current combined P/L when recorded current facts suffice but historical breakdown facts are missing", () => {
    const { calculateUnrealizedAttribution } = loadAttributionApi();

    expect(
      calculateUnrealizedAttribution({
        ...CURRENT_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: null,
        acquisitionCurrencyRate: null,
        valuationMetalRate: VALUATION_METAL_RATE,
        valuationCurrencyRate: VALUATION_EGP_RATE,
      })
    ).toEqual({
      available: true,
      value: {
        combinedDecimal: "85",
        consumedRateReferences: [
          VALUATION_METAL_RATE,
          VALUATION_EGP_RATE,
        ],
        breakdown: {
          available: false,
          reasons: [
            "acquisition_metal_rate_unavailable",
            "acquisition_currency_rate_unavailable",
          ],
        },
      },
    });
  });

  it("freezes the current rate evidence consumed by combined-only legacy P/L", () => {
    const result = calculateUnrealizedAttribution({
      ...CURRENT_CONTEXT,
      pureGramsDecimal: "10",
      purchaseCostDecimal: "35",
      purchaseCurrencyDecimalPlaces: 2,
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      valuationMetalRate: VALUATION_METAL_RATE,
      valuationCurrencyRate: VALUATION_EGP_RATE,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        consumedRateReferences: [
          { role: "current_metal" },
          { role: "current_purchase_currency" },
        ],
        breakdown: { available: false },
      },
    });
    if (result.available) {
      const consumed = Reflect.get(result.value, "consumedRateReferences");
      expect(Object.isFrozen(consumed)).toBe(true);
      expect((consumed as readonly object[]).every(Object.isFrozen)).toBe(true);
    }
  });

  it("keeps realized combined P/L when recorded sale facts suffice but detailed reference facts are missing", () => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "not-required-for-combined",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "150",
        feesDecimal: "10",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: null,
        acquisitionCurrencyRate: null,
        saleMetalRate: null,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
      })
    ).toEqual({
      available: true,
      value: {
        combinedDecimal: "105",
        consumedRateReferences: [
          PURCHASE_AT_SALE_EGP_RATE,
          PROCEEDS_EGP_RATE,
        ],
        canonicalGrossProceedsDecimal: "150",
        canonicalFeesDecimal: "10",
        netProceedsDecimal: "140",
        breakdown: {
          available: false,
          reasons: [
            "pure_grams_unavailable",
            "acquisition_metal_rate_unavailable",
            "acquisition_currency_rate_unavailable",
            "sale_metal_rate_unavailable",
          ],
        },
      },
    });
  });

  it("freezes the sale FX evidence consumed by combined-only legacy realized P/L", () => {
    const result = calculateRealizedAttribution({
      ...SALE_CONTEXT,
      pureGramsDecimal: "not-required-for-combined",
      purchaseCostDecimal: "35",
      purchaseCurrencyDecimalPlaces: 2,
      grossProceedsDecimal: "150",
      feesDecimal: "10",
      proceedsCurrencyDecimalPlaces: 2,
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
      proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        consumedRateReferences: [
          { role: "terminal_purchase_currency" },
          { role: "terminal_proceeds_currency" },
        ],
        breakdown: { available: false },
      },
    });
    if (result.available) {
      const consumed = Reflect.get(result.value, "consumedRateReferences");
      expect(Object.isFrozen(consumed)).toBe(true);
      expect((consumed as readonly object[]).every(Object.isFrozen)).toBe(true);
    }
  });

  it("snapshots validator-derived Unknown freshness without changing raw rate provenance", () => {
    const inconsistentRate = Object.freeze({
      ...VALUATION_METAL_RATE,
      providerObservedAt: CAPTURED_AT + 1,
      capturedFreshness: "fresh" as const,
      source: "future-observation-provider",
    });
    const result = calculateUnrealizedAttribution({
      ...CURRENT_CONTEXT,
      pureGramsDecimal: "10",
      purchaseCostDecimal: "35",
      purchaseCurrencyDecimalPlaces: 2,
      acquisitionMetalRate: ACQUISITION_METAL_RATE,
      acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
      valuationMetalRate: inconsistentRate,
      valuationCurrencyRate: VALUATION_EGP_RATE,
    });

    expect(result.available).toBe(true);
    if (!result.available || !result.value.breakdown.available) {
      throw new Error("Expected detailed attribution");
    }
    const captured = result.value.breakdown.value.rateReferences.find(
      ({ role }) => role === "current_metal"
    );
    expect(captured).toMatchObject({
      valueDecimal: "3",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      source: "future-observation-provider",
      providerObservedAt: null,
      capturedFreshness: "unknown",
    });
    expect(Object.isFrozen(captured)).toBe(true);
  });

  it.each([
    [
      "valuation_metal_rate_unavailable",
      {
        valuationMetalRate: VALUATION_SILVER_RATE,
        valuationCurrencyRate: VALUATION_EGP_RATE,
      },
    ],
    [
      "valuation_currency_rate_unavailable",
      {
        valuationMetalRate: VALUATION_METAL_RATE,
        valuationCurrencyRate: VALUATION_SAR_RATE,
      },
    ],
  ] as const)(
    "rejects a legacy current snapshot with explicit Gold/EGP context for %s",
    (reason, mismatchedCurrentRates) => {
      expect(
        calculateUnrealizedAttribution({
          ...CURRENT_CONTEXT,
          pureGramsDecimal: "10",
          purchaseCostDecimal: "35",
          purchaseCurrencyDecimalPlaces: 2,
          acquisitionMetalRate: null,
          acquisitionCurrencyRate: null,
          ...mismatchedCurrentRates,
        })
      ).toEqual({ available: false, reason });
    }
  );

  it.each([
    [
      "purchase_currency_at_sale_rate_unavailable",
      {
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_SAR_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
      },
    ],
    [
      "proceeds_currency_at_sale_rate_unavailable",
      {
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_SAR_RATE,
      },
    ],
  ] as const)(
    "rejects a legacy terminal snapshot with explicit EGP context for %s",
    (reason, mismatchedTerminalRates) => {
      expect(
        calculateRealizedAttribution({
          ...SALE_CONTEXT,
          pureGramsDecimal: "10",
          purchaseCostDecimal: "35",
          purchaseCurrencyDecimalPlaces: 2,
          grossProceedsDecimal: "100",
          feesDecimal: "5",
          proceedsCurrencyDecimalPlaces: 2,
          acquisitionMetalRate: null,
          acquisitionCurrencyRate: null,
          saleMetalRate: SALE_METAL_RATE,
          ...mismatchedTerminalRates,
        })
      ).toEqual({ available: false, reason });
    }
  );

  it("keeps trustworthy realized total but rejects Silver terminal attribution for a legacy Gold holding", () => {
    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "100",
        feesDecimal: "5",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: null,
        acquisitionCurrencyRate: null,
        saleMetalRate: SALE_SILVER_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
      })
    ).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "60",
        breakdown: {
          available: false,
          reasons: [
            "acquisition_metal_rate_unavailable",
            "acquisition_currency_rate_unavailable",
            "sale_metal_rate_unavailable",
          ],
        },
      },
    });
  });

  it.each(["current", "realized"] as const)(
    "rejects subminor purchase cost at the selected currency scale for %s P/L",
    (calculation) => {
      const api = loadAttributionApi();
      const common = {
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35.001",
        purchaseCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
      };

      const result = calculation === "current"
        ? api.calculateUnrealizedAttribution({
            ...CURRENT_CONTEXT,
            ...common,
            valuationMetalRate: VALUATION_METAL_RATE,
            valuationCurrencyRate: VALUATION_EGP_RATE,
          })
        : api.calculateRealizedAttribution({
            ...SALE_CONTEXT,
            ...common,
            grossProceedsDecimal: "100",
            feesDecimal: "5",
            proceedsCurrencyDecimalPlaces: 2,
        saleMetalRate: SALE_METAL_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
          });

      expect(result).toEqual({
        available: false,
        reason: "purchase_cost_unavailable",
      });
    }
  );

  it("converts cross-currency proceeds and fees through sale-time FX orientation", () => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    const result = calculateRealizedAttribution({
      ...SALE_CONTEXT,
      pureGramsDecimal: "10",
      purchaseCostDecimal: "35",
      purchaseCurrencyDecimalPlaces: 2,
      grossProceedsDecimal: "100",
      feesDecimal: "5",
      proceedsCurrencyDecimalPlaces: 2,
      acquisitionMetalRate: ACQUISITION_METAL_RATE,
      acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        saleMetalRate: SALE_METAL_RATE,
      purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
      proceedsCurrencyInstrumentCode: "currency:USD",
      proceedsCurrencyAtSaleRate: USD_RATE,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "345",
        canonicalGrossProceedsDecimal: "400",
        canonicalFeesDecimal: "20",
        netProceedsDecimal: "95",
        breakdown: {
          available: true,
          value: {
            components: {
              saleDifferenceDecimal: "280",
              feeDecimal: "-20",
            },
          },
        },
      },
    });
  });

  it.each([
    ["zero gross", { grossProceedsDecimal: "0" }, "gross_proceeds_unavailable"],
    ["negative gross", { grossProceedsDecimal: "-1" }, "gross_proceeds_unavailable"],
    ["invalid gross", { grossProceedsDecimal: "not-a-decimal" }, "gross_proceeds_unavailable"],
    ["subminor gross", { grossProceedsDecimal: "100.001" }, "gross_proceeds_unavailable"],
    ["negative fee", { feesDecimal: "-0.01" }, "fees_unavailable"],
    ["fee over gross", { feesDecimal: "100.01" }, "fees_unavailable"],
    ["invalid fee", { feesDecimal: "not-a-decimal" }, "fees_unavailable"],
    ["subminor fee", { feesDecimal: "0.001" }, "fees_unavailable"],
  ] as const)("rejects %s before emitting realized P/L", (_case, override, reason) => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "100",
        feesDecimal: "5",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        saleMetalRate: SALE_METAL_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
        ...override,
      })
    ).toEqual({ available: false, reason });
  });

  it("allows fee equal to positive gross and emits exact zero net proceeds", () => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "100",
        feesDecimal: "100",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        saleMetalRate: SALE_METAL_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyAtSaleRate: PROCEEDS_EGP_RATE,
      })
    ).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "-35",
        netProceedsDecimal: "0",
        breakdown: {
          available: true,
          value: { components: { feeDecimal: "-100" } },
        },
      },
    });
  });

  it("normalizes reciprocal FX orientations to the same USD-per-unit factor", () => {
    const { normalizeUsdPerUnitRate } = loadValuationApi();

    expect(normalizeUsdPerUnitRate(directCurrencyRate("current_purchase_currency", "currency:EGP", "0.02"))).toEqual({
      available: true,
      value: "0.02",
    });
    expect(
      normalizeUsdPerUnitRate(
      inverseCurrencyRate("current_purchase_currency", "currency:EGP", "50")
      )
    ).toEqual({ available: true, value: "0.02" });
  });

  it.each([
    ["purchase_cost_unavailable", { purchaseCostDecimal: null }],
    ["valuation_metal_rate_unavailable", { valuationMetalRate: null }],
    ["valuation_currency_rate_unavailable", { valuationCurrencyRate: null }],
  ] as const)("makes current attribution unavailable for %s", (reason, missingInput) => {
    const { calculateUnrealizedAttribution } = loadAttributionApi();

    expect(
        calculateUnrealizedAttribution({
          ...CURRENT_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        valuationMetalRate: VALUATION_METAL_RATE,
        valuationCurrencyRate: VALUATION_EGP_RATE,
        ...missingInput,
      })
    ).toEqual({ available: false, reason });
  });

  it.each([
    ["acquisition_metal_rate_unavailable", { acquisitionMetalRate: null }],
    ["acquisition_currency_rate_unavailable", { acquisitionCurrencyRate: null }],
  ] as const)("keeps current combined P/L while the breakdown reports %s", (reason, missingInput) => {
    const { calculateUnrealizedAttribution } = loadAttributionApi();

    expect(
        calculateUnrealizedAttribution({
          ...CURRENT_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        valuationMetalRate: VALUATION_METAL_RATE,
        valuationCurrencyRate: VALUATION_EGP_RATE,
        ...missingInput,
      })
    ).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "85",
        breakdown: { available: false, reasons: [reason] },
      },
    });
  });

  it.each([
    ["purchase_cost_unavailable", { purchaseCostDecimal: null }],
    ["purchase_currency_at_sale_rate_unavailable", { purchaseCurrencyAtSaleRate: null }],
    ["proceeds_currency_at_sale_rate_unavailable", { proceedsCurrencyAtSaleRate: null }],
  ] as const)("makes realized attribution unavailable for %s", (reason, missingInput) => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "100",
        feesDecimal: "5",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        saleMetalRate: SALE_METAL_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyInstrumentCode: "currency:USD",
        proceedsCurrencyAtSaleRate: USD_RATE,
        ...missingInput,
      })
    ).toEqual({ available: false, reason });
  });

  it.each([
    ["acquisition_metal_rate_unavailable", { acquisitionMetalRate: null }],
    ["acquisition_currency_rate_unavailable", { acquisitionCurrencyRate: null }],
    ["sale_metal_rate_unavailable", { saleMetalRate: null }],
  ] as const)("keeps realized combined P/L while the breakdown reports %s", (reason, missingInput) => {
    const { calculateRealizedAttribution } = loadAttributionApi();

    expect(
      calculateRealizedAttribution({
        ...SALE_CONTEXT,
        pureGramsDecimal: "10",
        purchaseCostDecimal: "35",
        purchaseCurrencyDecimalPlaces: 2,
        grossProceedsDecimal: "100",
        feesDecimal: "5",
        proceedsCurrencyDecimalPlaces: 2,
        acquisitionMetalRate: ACQUISITION_METAL_RATE,
        acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
        saleMetalRate: SALE_METAL_RATE,
        purchaseCurrencyAtSaleRate: PURCHASE_AT_SALE_EGP_RATE,
        proceedsCurrencyInstrumentCode: "currency:USD",
        proceedsCurrencyAtSaleRate: USD_RATE,
        ...missingInput,
      })
    ).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "345",
        breakdown: { available: false, reasons: [reason] },
      },
    });
  });

  it("captures immutable rate snapshots instead of retaining mutable latest-rate references", () => {
    const { calculateUnrealizedAttribution } = loadAttributionApi();
    const mutableRate = { ...VALUATION_METAL_RATE };

    const result = calculateUnrealizedAttribution({
      ...CURRENT_CONTEXT,
      pureGramsDecimal: "10",
      purchaseCostDecimal: "35",
      purchaseCurrencyDecimalPlaces: 2,
      acquisitionMetalRate: ACQUISITION_METAL_RATE,
      acquisitionCurrencyRate: ACQUISITION_EGP_RATE,
      valuationMetalRate: mutableRate,
      valuationCurrencyRate: VALUATION_EGP_RATE,
    });
    mutableRate.valueDecimal = "999";

    expect(result).toMatchObject({ available: true, value: { combinedDecimal: "85" } });
    if (!result.available || !result.value.breakdown.available) {
      throw new Error("Expected detailed attribution");
    }
    expect(result.value.breakdown.value.rateReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instrumentCode: "metal:GOLD",
          valueDecimal: "3",
          providerObservedAt: OBSERVED_AT,
          source: "fixture-provider",
        }),
      ])
    );
  });
});

describe("rounding explanation and hand-derived PostgreSQL numeric compatibility fixtures", () => {
  it("explains the allowed two-minor-unit display difference without a balancing component", () => {
    const { roundAttributionForDisplay } = loadAttributionApi();

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
    const { convertAttributionForDisplay } = loadAttributionApi();

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
        consumedRateReferences: [directCurrencyRate("display_purchase_currency", "currency:EGP", "0.6"), directCurrencyRate("display_preferred_currency", "currency:SAR", "0.2")],
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
    const { convertAttributionForDisplay } = loadAttributionApi();

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
  ] as const)("keeps display attribution unavailable for %s", (reason, missingRate) => {
    const { convertAttributionForDisplay } = loadAttributionApi();

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
  });

  it.each([
    {
      name: "terminating exact decimals",
      derivation: "Hand-derived from FR-050 with q=10, m_a=2, m_v=3, x_Pa=0.5, x_Pv=0.25, K=35.",
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
      derivation: "Hand-derived from FR-050 with q=0.000001, EGP minor-unit purchase cost K=0.01, and the same exact rates; no database query was executed.",
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
  ])("matches a hand-derived exact-decimal fixture intended for future PostgreSQL numeric parity: $name", ({ pureGramsDecimal, purchaseCostDecimal, purchaseCurrencyDecimalPlaces, expectedExactNumeric }) => {
    const { calculateUnrealizedAttribution } = loadAttributionApi();
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
              currencyMovementDecimal: expectedExactNumeric.currencyMovementDecimal,
              purchaseCostDecimal: expectedExactNumeric.purchaseCostDecimal,
            },
          },
        },
      },
    });
  });
});
