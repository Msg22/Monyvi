import {
  MAX_TRANSACTION_AMOUNT,
  parseAmountInput,
  parseStrictAmountInput,
} from "../amount-helpers";

describe("amount review follow-up regressions", () => {
  it("lets a user correct preserved invalid raw text one character at a time", () => {
    expect(parseAmountInput("1e3", "")).toBe("1e3");
    expect(parseAmountInput("1e", "1e3")).toBe("1e");
    expect(parseAmountInput("1", "1e")).toBe("1");
  });

  it("keeps non-positive error priority ahead of excess precision", () => {
    expect(
      parseStrictAmountInput("0.000", {
        maxAmount: MAX_TRANSACTION_AMOUNT,
        maxFractionDigits: 2,
      })
    ).toEqual({ success: false, reason: "not-positive" });
  });
});
