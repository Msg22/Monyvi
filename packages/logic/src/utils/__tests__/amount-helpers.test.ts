import {
  evaluateAmountExpression,
  parsePositiveFiniteAmountInput,
} from "../amount-helpers";

describe("amount helpers", () => {
  it("parses positive finite amount input", () => {
    expect(parsePositiveFiniteAmountInput("1,250.50")).toBe(1250.5);
    expect(parsePositiveFiniteAmountInput("0")).toBeNull();
    expect(parsePositiveFiniteAmountInput("12+")).toBeNull();
  });

  it("evaluates calculator expressions without executing arbitrary input", () => {
    expect(evaluateAmountExpression("12+3*2")).toBe(18);
    expect(evaluateAmountExpression("10 / 4")).toBe(2.5);
    expect(evaluateAmountExpression("-5+8")).toBe(3);
    expect(evaluateAmountExpression("12+")).toBeNull();
    expect(evaluateAmountExpression("10/0")).toBeNull();
    expect(evaluateAmountExpression("globalThis.process.exit()")).toBeNull();
  });
});
