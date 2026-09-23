import { calculateMetalHoldingPreviewDetails } from "@/services/metal-holding-preview-service";
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
});
