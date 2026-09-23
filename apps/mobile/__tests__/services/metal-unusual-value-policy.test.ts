import { evaluateMetalUnusualValuePolicy } from "../../services/metal-unusual-value-policy";

describe("metals unusual-value policy v1", () => {
  it.each([
    ["GOLD", "999.999", false],
    ["GOLD", "1000", true],
    ["SILVER", "9999.999", false],
    ["SILVER", "10000", true],
  ] as const)(
    "applies the metal-specific inclusive weight boundary for %s at %s",
    (metal, weightGramsDecimal, expected) => {
      expect(
        evaluateMetalUnusualValuePolicy({
          metal,
          weightGramsDecimal,
          purchasePriceDecimal: "1",
          purchaseCurrencyUsdPerUnitDecimal: "0.02",
          egpUsdPerUnitDecimal: "0.02",
        }).isUnusual
      ).toBe(expected);
    }
  );

  it("warns when the converted purchase amount equals EGP 10,000,000", () => {
    expect(
      evaluateMetalUnusualValuePolicy({
        metal: "GOLD",
        weightGramsDecimal: "10",
        purchasePriceDecimal: "200000",
        purchaseCurrencyUsdPerUnitDecimal: "1",
        egpUsdPerUnitDecimal: "0.02",
      })
    ).toEqual({
      policyVersion: "metals-unusual-value/v1",
      isUnusual: true,
      reasons: ["purchase_amount"],
    });
  });

  it("does not invent a monetary decision when truthful FX conversion is unavailable", () => {
    expect(
      evaluateMetalUnusualValuePolicy({
        metal: "SILVER",
        weightGramsDecimal: "9999.999",
        purchasePriceDecimal: "999999999",
        purchaseCurrencyUsdPerUnitDecimal: null,
        egpUsdPerUnitDecimal: "0.02",
      })
    ).toEqual({
      policyVersion: "metals-unusual-value/v1",
      isUnusual: false,
      reasons: [],
    });
  });

  it("retains a weight warning even when monetary FX is unavailable", () => {
    expect(
      evaluateMetalUnusualValuePolicy({
        metal: "SILVER",
        weightGramsDecimal: "10000",
        purchasePriceDecimal: "1",
        purchaseCurrencyUsdPerUnitDecimal: null,
        egpUsdPerUnitDecimal: null,
      }).reasons
    ).toEqual(["weight"]);
  });
});
