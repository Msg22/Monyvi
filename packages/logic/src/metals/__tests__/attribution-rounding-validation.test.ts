import { roundAttributionForDisplay } from "../attribution";

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
});
