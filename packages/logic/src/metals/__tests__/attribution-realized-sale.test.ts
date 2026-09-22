import { calculateRealizedAttribution } from "../attribution";
import type {
  CurrencyInstrumentCode,
  CurrencyRateRole,
  ExactDirectCurrencyRateReference,
  ExactMetalRateReference,
  MetalRateRole,
} from "../rate-reference";

const OBSERVED_AT = 1_800_000_000_000;
const CAPTURED_AT = OBSERVED_AT + 1_000;

function metalRate(
  role: MetalRateRole,
  valueDecimal: string
): ExactMetalRateReference {
  return Object.freeze({
    role,
    kind: "metal",
    instrumentCode: "metal:GOLD",
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
    source: "fixture-provider",
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  });
}

const SAME_CURRENCY_FACTS = {
  metalInstrumentCode: "metal:GOLD",
  purchaseCurrencyInstrumentCode: "currency:EGP",
  proceedsCurrencyInstrumentCode: "currency:EGP",
  purchaseCostDecimal: "30000",
  purchaseCurrencyDecimalPlaces: 2,
  proceedsCurrencyDecimalPlaces: 2,
} as const;

const FULL_BREAKDOWN_RATES_WITHOUT_PROCEEDS = {
  pureGramsDecimal: "15",
  acquisitionMetalRate: metalRate("acquisition_metal", "50"),
  acquisitionCurrencyRate: currencyRate(
    "acquisition_purchase_currency",
    "currency:EGP",
    "0.02"
  ),
  saleMetalRate: metalRate("terminal_metal", "52"),
  purchaseCurrencyAtSaleRate: currencyRate(
    "terminal_purchase_currency",
    "currency:EGP",
    "0.02"
  ),
} as const;

describe("realized sale attribution availability", () => {
  it("publishes a same-currency combined result without terminal FX evidence", () => {
    const result = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: "15",
      grossProceedsDecimal: "36000",
      feesDecimal: "500",
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: null,
      proceedsCurrencyAtSaleRate: null,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "5500",
        netProceedsDecimal: "35500",
        canonicalGrossProceedsDecimal: "36000",
        canonicalFeesDecimal: "500",
        consumedRateReferences: [],
        breakdown: {
          available: false,
          reasons: [
            "acquisition_metal_rate_unavailable",
            "acquisition_currency_rate_unavailable",
            "sale_metal_rate_unavailable",
            "purchase_currency_at_sale_rate_unavailable",
          ],
        },
      },
    });
  });

  it("publishes a same-currency profit with no fee", () => {
    expect(
      calculateRealizedAttribution({
        ...SAME_CURRENCY_FACTS,
        pureGramsDecimal: "15",
        grossProceedsDecimal: "36000",
        feesDecimal: "0",
        acquisitionMetalRate: null,
        acquisitionCurrencyRate: null,
        saleMetalRate: null,
        purchaseCurrencyAtSaleRate: null,
        proceedsCurrencyAtSaleRate: null,
      })
    ).toMatchObject({
      available: true,
      value: { combinedDecimal: "6000", netProceedsDecimal: "36000" },
    });
  });

  it("publishes same-currency loss and exact zero results", () => {
    const loss = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: "15",
      grossProceedsDecimal: "20000",
      feesDecimal: "1000",
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: null,
      proceedsCurrencyAtSaleRate: null,
    });
    const zero = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: "15",
      grossProceedsDecimal: "30500",
      feesDecimal: "500",
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: null,
      proceedsCurrencyAtSaleRate: null,
    });

    expect(loss).toMatchObject({
      available: true,
      value: { combinedDecimal: "-11000", netProceedsDecimal: "19000" },
    });
    expect(zero).toMatchObject({
      available: true,
      value: { combinedDecimal: "0" },
    });
  });

  it("keeps the same-currency breakdown available when only the purchase terminal FX is missing the proceeds snapshot", () => {
    const result = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      ...FULL_BREAKDOWN_RATES_WITHOUT_PROCEEDS,
      grossProceedsDecimal: "36000",
      feesDecimal: "500",
      proceedsCurrencyAtSaleRate: null,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "5500",
        breakdown: { available: true },
      },
    });
  });

  it("keeps the combined result available while reporting the missing terminal purchase FX in the breakdown", () => {
    const result = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: "15",
      grossProceedsDecimal: "36000",
      feesDecimal: "500",
      acquisitionMetalRate: metalRate("acquisition_metal", "50"),
      acquisitionCurrencyRate: currencyRate(
        "acquisition_purchase_currency",
        "currency:EGP",
        "0.02"
      ),
      saleMetalRate: metalRate("terminal_metal", "52"),
      purchaseCurrencyAtSaleRate: null,
      proceedsCurrencyAtSaleRate: null,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "5500",
        breakdown: {
          available: false,
          reasons: ["purchase_currency_at_sale_rate_unavailable"],
        },
      },
    });
  });

  it("keeps the combined realized result available when pure grams are missing and only marks the breakdown unavailable", () => {
    const result = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: null,
      grossProceedsDecimal: "36000",
      feesDecimal: "500",
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: null,
      proceedsCurrencyAtSaleRate: null,
    });

    expect(result).toMatchObject({
      available: true,
      value: {
        combinedDecimal: "5500",
        netProceedsDecimal: "35500",
        breakdown: { available: false },
      },
    });
    if (!result.available || result.value.breakdown.available) {
      throw new Error("expected breakdown to be unavailable");
    }
    expect(result.value.breakdown.reasons).toContain("pure_grams_unavailable");
  });

  it("keeps optional mismatched same-currency FX out of the combined result", () => {
    const mismatchedPurchase = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: "15",
      grossProceedsDecimal: "36000",
      feesDecimal: "500",
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: currencyRate(
        "terminal_purchase_currency",
        "currency:SAR",
        "0.02"
      ),
      proceedsCurrencyAtSaleRate: null,
    });
    const mismatchedProceeds = calculateRealizedAttribution({
      ...SAME_CURRENCY_FACTS,
      pureGramsDecimal: "15",
      grossProceedsDecimal: "36000",
      feesDecimal: "500",
      acquisitionMetalRate: null,
      acquisitionCurrencyRate: null,
      saleMetalRate: null,
      purchaseCurrencyAtSaleRate: null,
      proceedsCurrencyAtSaleRate: currencyRate(
        "terminal_proceeds_currency",
        "currency:SAR",
        "0.02"
      ),
    });

    if (
      !mismatchedPurchase.available ||
      mismatchedPurchase.value.breakdown.available
    ) {
      throw new Error(
        "Expected the optional purchase FX to affect breakdown only"
      );
    }
    expect(mismatchedPurchase.value.combinedDecimal).toBe("5500");
    expect(mismatchedPurchase.value.breakdown.reasons).toContain(
      "purchase_currency_at_sale_rate_unavailable"
    );
    expect(mismatchedProceeds).toMatchObject({
      available: true,
      value: { combinedDecimal: "5500" },
    });
  });

  it("still requires terminal FX evidence for a cross-currency combined result", () => {
    expect(
      calculateRealizedAttribution({
        ...SAME_CURRENCY_FACTS,
        proceedsCurrencyInstrumentCode: "currency:USD",
        pureGramsDecimal: "15",
        grossProceedsDecimal: "1000",
        feesDecimal: "0",
        acquisitionMetalRate: null,
        acquisitionCurrencyRate: null,
        saleMetalRate: null,
        purchaseCurrencyAtSaleRate: currencyRate(
          "terminal_purchase_currency",
          "currency:EGP",
          "0.02"
        ),
        proceedsCurrencyAtSaleRate: null,
      })
    ).toEqual({
      available: false,
      reason: "proceeds_currency_at_sale_rate_unavailable",
    });
  });
});
