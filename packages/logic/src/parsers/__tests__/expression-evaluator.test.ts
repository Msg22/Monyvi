import { evaluateAmountExpression } from "../expression-evaluator";

describe("evaluateAmountExpression", () => {
  it("evaluates addition, subtraction, multiplication, division, and precedence", () => {
    expect(evaluateAmountExpression("12+3*4")).toBe(24);
    expect(evaluateAmountExpression("20/4+6")).toBe(11);
    expect(evaluateAmountExpression("50-12.5")).toBe(37.5);
  });

  it("returns a normalized decimal for floating point expressions", () => {
    expect(evaluateAmountExpression("0.1+0.2")).toBe(0.3);
  });

  it("rejects trailing operators and malformed expressions", () => {
    expect(evaluateAmountExpression("12+")).toBeNull();
    expect(evaluateAmountExpression("1..2")).toBeNull();
    expect(evaluateAmountExpression("+12")).toBeNull();
  });

  it("rejects unsafe characters and non-finite results", () => {
    expect(evaluateAmountExpression("alert(1)")).toBeNull();
    expect(evaluateAmountExpression("1/0")).toBeNull();
  });

  it("rejects empty or whitespace-only input", () => {
    expect(evaluateAmountExpression("")).toBeNull();
    expect(evaluateAmountExpression("   ")).toBeNull();
  });
});
