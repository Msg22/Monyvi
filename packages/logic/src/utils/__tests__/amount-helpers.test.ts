import { evaluateAmountExpression } from "../../parsers/expression-evaluator";
import {
  parsePositiveFiniteAmountInput,
  parsePositiveMoneyAmount,
} from "../amount-helpers";

describe("amount helpers", () => {
  it("parses positive finite amount input", () => {
    expect(parsePositiveFiniteAmountInput("1,250.50")).toBe(1250.5);
    expect(parsePositiveFiniteAmountInput("0")).toBeNull();
    expect(parsePositiveFiniteAmountInput("12+")).toBeNull();
  });

  it("parses only valid localized budget money amounts", () => {
    expect(parsePositiveMoneyAmount(" 100 ")).toBe(100);
    expect(parsePositiveMoneyAmount("100.5")).toBe(100.5);
    expect(parsePositiveMoneyAmount(".5")).toBe(0.5);
    expect(parsePositiveMoneyAmount("١٢٣٫٤٥")).toBe(123.45);
    expect(parsePositiveMoneyAmount("٫٥")).toBe(0.5);
    expect(parsePositiveMoneyAmount("999999999.99")).toBe(999999999.99);
  });

  it.each([
    "",
    "0",
    "-1",
    "1,000",
    "1.234",
    "1e3",
    "12abc",
    "Infinity",
    "1000000000",
  ])("rejects invalid budget money input %p", (value) => {
    expect(parsePositiveMoneyAmount(value)).toBeNull();
  });

  it("evaluates calculator expressions without executing arbitrary input", () => {
    expect(evaluateAmountExpression("12+3*2")).toBe(18);
    expect(evaluateAmountExpression("10 / 4")).toBe(2.5);
    expect(evaluateAmountExpression("8-5")).toBe(3);
    expect(evaluateAmountExpression("12+")).toBeNull();
    expect(evaluateAmountExpression("10/0")).toBeNull();
    expect(evaluateAmountExpression("globalThis.process.exit()")).toBeNull();
  });
});
