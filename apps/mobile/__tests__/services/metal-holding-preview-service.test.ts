import {
  calculateMetalHoldingPreviewDetails,
  calculateMetalHoldingPreviewValuation,
  resolveMetalCalculationHolding,
} from "@/services/metal-holding-preview-service";
import type { NormalizedMetalHoldingFormData } from "@/validation/metal-holding-form-validation";

const HOLDING: NormalizedMetalHoldingFormData = {
  name: "Savings coin",
  metal: "GOLD",
  weightGramsDecimal: "10",
  purity: {
    code: "gold-999",
    catalogVersion: "1",
    factorDecimal: "0.999",
    labelKey: "purity_gold_999",
  },
  purchasePriceDecimal: "47800",
  purchaseCurrency: "EGP",
  purchaseDate: "2026-08-26",
  physicalForm: "COIN",
  notes: "",
};

describe("metal holding preview service", () => {
  it("retains exact valuation until the final since-purchase rounding", () => {
    const holding: NormalizedMetalHoldingFormData = {
      ...HOLDING,
      weightGramsDecimal: "1",
      purity: {
        code: "gold-500",
        catalogVersion: "1",
        factorDecimal: "0.5",
        labelKey: "purity_gold_500",
      },
      purchasePriceDecimal: "0.01",
    };
    const valuation = calculateMetalHoldingPreviewValuation(holding, {
      metalUsdPerPureGramDecimal: "2.01",
      currencyUsdPerUnitDecimal: "1",
      currencyMinorUnits: 2,
    });

    expect(valuation).toEqual({ available: true, valueDecimal: "1.005" });
    expect(calculateMetalHoldingPreviewDetails(holding, valuation, 2)).toEqual({
      resultSincePurchaseDecimal: "1.00",
      resultDirection: "positive",
      purityPercentDecimal: "50.0",
    });
  });

  it("calculates exact current result and purity disclosure for the live preview", () => {
    const valuation = {
      available: true,
      valueDecimal: "52150.32",
    } as const;
    expect(calculateMetalHoldingPreviewDetails(HOLDING, valuation, 2)).toEqual({
      resultSincePurchaseDecimal: "4350.32",
      resultDirection: "positive",
      purityPercentDecimal: "99.9",
    });
  });

  it("keeps result unavailable when the current valuation is unavailable", () => {
    expect(
      calculateMetalHoldingPreviewDetails(
        HOLDING,
        { available: false, reason: "missing_rate" },
        2
      )
    ).toEqual({
      resultSincePurchaseDecimal: null,
      resultDirection: "unavailable",
      purityPercentDecimal: "99.9",
    });
  });

  describe("resolveMetalCalculationHolding regressions", () => {
    it("resolves calculation holding with blank name and blank price in EGP without inventing fake values", () => {
      const calculation = resolveMetalCalculationHolding({
        metal: "GOLD",
        weightGrams: "10.000",
        purityCode: "gold-999",
        purchasePrice: "",
        purchaseCurrency: "EGP",
        preferredCurrency: "EGP",
        currencyMinorUnits: 2,
      });

      expect(calculation).not.toBeNull();
      expect(calculation?.name).toBe("");
      expect(calculation?.purchasePriceDecimal).toBe("0");
      expect(calculation?.purchaseCurrency).toBe("EGP");
      expect(calculation?.weightGramsDecimal).toBe("10");

      if (calculation) {
        const valuation = calculateMetalHoldingPreviewValuation(calculation, {
          metalUsdPerPureGramDecimal: "80.00",
          currencyUsdPerUnitDecimal: "0.02", // 1 USD = 50 EGP
          currencyMinorUnits: 2,
        });
        expect(valuation).toEqual({ available: true, valueDecimal: "40000" });
      }
    });

    it("uses the quoted 24K rate directly while preserving the recorded 0.999 purity tuple", () => {
      const calculation = resolveMetalCalculationHolding({
        metal: "GOLD",
        weightGrams: "10",
        purityCode: "gold-999",
        purchasePrice: "60000",
        purchaseCurrency: "EGP",
        preferredCurrency: "EGP",
        currencyMinorUnits: 2,
      });

      expect(calculation?.purity.factorDecimal).toBe("0.999");
      if (!calculation) throw new Error("Expected canonical Gold holding");

      expect(
        calculateMetalHoldingPreviewValuation(calculation, {
          metalUsdPerPureGramDecimal: "139.9466",
          currencyUsdPerUnitDecimal: "0.02",
          currencyMinorUnits: 2,
        })
      ).toEqual({ available: true, valueDecimal: "69973.3" });
    });

    it("resolves calculation holding with blank name and blank price in JPY without failing on zero minor units", () => {
      const calculation = resolveMetalCalculationHolding({
        metal: "GOLD",
        weightGrams: "5.5",
        purityCode: "gold-999",
        purchasePrice: "",
        purchaseCurrency: "JPY",
        preferredCurrency: "JPY",
        currencyMinorUnits: 0,
      });

      expect(calculation).not.toBeNull();
      expect(calculation?.name).toBe("");
      expect(calculation?.purchasePriceDecimal).toBe("0");
      expect(calculation?.purchaseCurrency).toBe("JPY");
      expect(calculation?.weightGramsDecimal).toBe("5.5");

      if (calculation) {
        const valuation = calculateMetalHoldingPreviewValuation(calculation, {
          metalUsdPerPureGramDecimal: "80.00",
          currencyUsdPerUnitDecimal: "0.00666667",
          currencyMinorUnits: 0,
        });
        expect(valuation.available).toBe(true);
      }
    });

    it("returns null (honest unavailable) for invalid weight or karat", () => {
      expect(
        resolveMetalCalculationHolding({
          metal: "GOLD",
          weightGrams: "invalid-weight",
          purityCode: "gold-999",
          preferredCurrency: "EGP",
        })
      ).toBeNull();

      expect(
        resolveMetalCalculationHolding({
          metal: "GOLD",
          weightGrams: "10",
          purityCode: "nonexistent-karat",
          preferredCurrency: "EGP",
        })
      ).toBeNull();

      expect(
        resolveMetalCalculationHolding({
          metal: "GOLD",
          weightGrams: "-1",
          purityCode: "gold-999",
          preferredCurrency: "EGP",
        })
      ).toBeNull();
    });
  });
});
