import { evaluateAmountExpression } from "../../parsers/expression-evaluator";
import * as AmountHelpers from "../amount-helpers";
import {
  formatAmountInput,
  parseAmountInput,
  parsePositiveFiniteAmountInput,
  parsePositiveMoneyAmount,
} from "../amount-helpers";

interface StrictAmountParseOptions {
  readonly maxAmount?: number;
  readonly maxFractionDigits?: number;
}

type StrictAmountParseResult =
  | {
      readonly success: true;
      readonly amount: number;
      readonly canonical: string;
      readonly fractionDigits: number;
    }
  | {
      readonly success: false;
      readonly reason:
        | "required"
        | "invalid-format"
        | "not-positive"
        | "exceeds-maximum"
        | "exceeds-precision";
    };

type StrictAmountParser = (
  value: string,
  options?: StrictAmountParseOptions
) => StrictAmountParseResult;

const parseControlledAmountInput = parseAmountInput as (
  text: string,
  previousValue?: string
) => string;

function getStrictAmountParser(): StrictAmountParser {
  const candidate = Reflect.get(AmountHelpers, "parseStrictAmountInput");
  expect(typeof candidate).toBe("function");
  return candidate as StrictAmountParser;
}

describe("currency-aware numeric amount validation", () => {
  it("enforces the shared maximum and the existing currency precision contract", () => {
    const candidate = Reflect.get(AmountHelpers, "isValidCurrencyAmount");
    expect(typeof candidate).toBe("function");
    const isValidCurrencyAmount = candidate as (
      amount: number,
      currency: import("@monyvi/db").CurrencyType
    ) => boolean;

    expect(isValidCurrencyAmount(1_000_000_000, "EGP")).toBe(true);
    expect(isValidCurrencyAmount(1_000_000_000.01, "EGP")).toBe(false);
    expect(isValidCurrencyAmount(12.34, "EGP")).toBe(true);
    expect(isValidCurrencyAmount(12.345, "EGP")).toBe(false);
    expect(isValidCurrencyAmount(12.345, "KWD")).toBe(true);
    expect(isValidCurrencyAmount(12.3456, "KWD")).toBe(false);
    expect(isValidCurrencyAmount(0.12345678, "BTC")).toBe(true);
    expect(isValidCurrencyAmount(0.123456789, "BTC")).toBe(false);
    expect(isValidCurrencyAmount(0, "EGP")).toBe(false);
    expect(isValidCurrencyAmount(-1, "EGP")).toBe(false);
    expect(isValidCurrencyAmount(Number.POSITIVE_INFINITY, "EGP")).toBe(false);
  });
});

describe("amount helpers", () => {
  describe("strict shared amount grammar", () => {
    it.each([
      ["1234.50", 1234.5, "1234.50", 2],
      [".5", 0.5, ".5", 1],
      ["1,234.50", 1234.5, "1234.50", 2],
      ["1,000,000,000", 1_000_000_000, "1000000000", 0],
    ] as const)(
      "parses %s without changing its numeric meaning",
      (value, amount, canonical, fractionDigits) => {
        const parseStrictAmountInput = getStrictAmountParser();

        expect(
          parseStrictAmountInput(value, {
            maxAmount: AmountHelpers.MAX_TRANSACTION_AMOUNT,
            maxFractionDigits: 2,
          })
        ).toEqual({ success: true, amount, canonical, fractionDigits });
      }
    );

    it.each([
      ["", "required"],
      ["12,5", "invalid-format"],
      ["1,23", "invalid-format"],
      ["1,2345", "invalid-format"],
      ["1e3", "invalid-format"],
      ["+5", "invalid-format"],
      ["abc", "invalid-format"],
      ["Infinity", "invalid-format"],
      ["NaN", "invalid-format"],
      ["1.2.3", "invalid-format"],
      ["12abc", "invalid-format"],
      ["12.", "invalid-format"],
      ["0", "not-positive"],
      ["-5", "not-positive"],
      ["1000000000.01", "exceeds-maximum"],
      ["1.234", "exceeds-precision"],
    ] as const)("rejects %p as %s", (value, reason) => {
      const parseStrictAmountInput = getStrictAmountParser();

      expect(
        parseStrictAmountInput(value, {
          maxAmount: AmountHelpers.MAX_TRANSACTION_AMOUNT,
          maxFractionDigits: 2,
        })
      ).toEqual({ success: false, reason });
    });

    it("supports the existing three- and eight-decimal currency contracts", () => {
      const parseStrictAmountInput = getStrictAmountParser();

      expect(
        parseStrictAmountInput("12.345", { maxFractionDigits: 3 })
      ).toEqual({
        success: true,
        amount: 12.345,
        canonical: "12.345",
        fractionDigits: 3,
      });
      expect(
        parseStrictAmountInput("0.12345678", { maxFractionDigits: 8 })
      ).toEqual({
        success: true,
        amount: 0.12345678,
        canonical: "0.12345678",
        fractionDigits: 8,
      });
      expect(
        parseStrictAmountInput("0.123456789", { maxFractionDigits: 8 })
      ).toEqual({ success: false, reason: "exceeds-precision" });
    });

    it("rejects a canonical decimal above the maximum before number conversion", () => {
      const parseStrictAmountInput = getStrictAmountParser();

      expect(
        parseStrictAmountInput("1000000000.00000001", {
          maxAmount: AmountHelpers.MAX_TRANSACTION_AMOUNT,
          maxFractionDigits: 8,
        })
      ).toEqual({ success: false, reason: "exceeds-maximum" });
    });

    it("prioritizes the maximum error when amount and precision are both invalid", () => {
      const parseStrictAmountInput = getStrictAmountParser();

      expect(
        parseStrictAmountInput("1000000000.001", {
          maxAmount: AmountHelpers.MAX_TRANSACTION_AMOUNT,
          maxFractionDigits: 2,
        })
      ).toEqual({ success: false, reason: "exceeds-maximum" });
    });
  });

  describe("controlled amount input changes", () => {
    it("canonicalizes valid grouped input and preserves safe intermediate decimals", () => {
      expect(parseControlledAmountInput("1,234.50", "")).toBe("1234.50");
      expect(parseControlledAmountInput("12.", "12")).toBe("12.");
      expect(formatAmountInput(parseControlledAmountInput("1,234.50", ""))).toBe(
        "1,234.50"
      );
    });

    it("supports a one-character edit against the formatted display", () => {
      expect(parseControlledAmountInput("1,2345", "1234")).toBe("12345");
      expect(parseControlledAmountInput("1,23", "1234")).toBe("123");
    });

    it("rejects invalid pasted text instead of repairing it into another amount", () => {
      expect(parseControlledAmountInput("12,5", "42")).toBe("42");
      expect(parseControlledAmountInput("1e3", "42")).toBe("42");
      expect(parseControlledAmountInput("1.2.3", "42")).toBe("42");
    });
  });

  it("parses only positive finite values that use valid grouping", () => {
    expect(parsePositiveFiniteAmountInput("1,250.50")).toBe(1250.5);
    expect(parsePositiveFiniteAmountInput("0")).toBeNull();
    expect(parsePositiveFiniteAmountInput("12+")).toBeNull();
    expect(parsePositiveFiniteAmountInput("12,5")).toBeNull();
    expect(parsePositiveFiniteAmountInput("1,23")).toBeNull();
    expect(parsePositiveFiniteAmountInput("1e3")).toBeNull();
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
interface EditableInputTestOptions {
  readonly allowNegative?: boolean;
}

interface EditableInputTestResolution {
  readonly accepted: boolean;
  readonly value: string;
}

type EditableInputResolver = (
  text: string,
  previousValue: string,
  options?: EditableInputTestOptions
) => EditableInputTestResolution;

type EditableDisplay = {
  readonly kind: "groupable" | "raw";
  readonly text: string;
};

type EditableDisplaySelector = (
  value: string,
  options?: EditableInputTestOptions
) => EditableDisplay;

function getEditableInputResolver(): EditableInputResolver {
  const candidate: unknown = Reflect.get(
    AmountHelpers,
    "resolveEditableAmountInputChange"
  );
  expect(typeof candidate).toBe("function");
  return candidate as EditableInputResolver;
}

function getEditableDisplaySelector(): EditableDisplaySelector {
  const candidate: unknown = Reflect.get(AmountHelpers, "getEditableAmountDisplay");
  expect(typeof candidate).toBe("function");
  return candidate as EditableDisplaySelector;
}

describe("T006 editable amount foundation contract", () => {
  it.each([
    ["12345.678", "12,345.678"],
    ["1234567.8900", "1,234,567.8900"],
    ["1250.755", "1,250.755"],
    ["12.", "12."],
    ["", ""],
  ] as const)(
    "groups unsigned entry %s without rounding or changing trailing digits",
    (canonical, display) => {
      expect(getEditableDisplaySelector()(canonical)).toEqual({
        kind: "groupable",
        text: display,
      });
    }
  );

  it.each([
    "abc12345",
    "12..34",
    "12,34",
    "1,23,456",
    "--1234",
    "1e3",
  ])("preserves malformed entry %s verbatim on display", (raw) => {
    expect(getEditableDisplaySelector()(raw)).toEqual({
      kind: "raw",
      text: raw,
    });
  });

  it.each([
    ["-1234.567", "-1,234.567"],
    ["-1,234.567", "-1,234.567"],
    ["-", "-"],
    ["-0.000", "-0.000"],
    ["-1.123456", "-1.123456"],
  ] as const)(
    "groups signed edit %s without losing the sign or fractional text",
    (canonical, display) => {
      expect(
        getEditableDisplaySelector()(canonical, { allowNegative: true })
      ).toEqual({ kind: "groupable", text: display });
    }
  );

  it("does not group an unsigned field's rejected negative value", () => {
    expect(getEditableDisplaySelector()("-1234.567")).toEqual({
      kind: "raw",
      text: "-1234.567",
    });
  });

  it("preserves the old unsigned resolver and parser two-argument contracts", () => {
    const resolve = getEditableInputResolver();
    const prior = "1234";
    const edits = ["1,2345", "1,23", "12,34", "abc12345", "-1234.567"];

    for (const text of edits) {
      expect(resolve(text, prior)).toEqual(
        AmountHelpers.resolveAmountInputChange(text, prior)
      );
    }

    expect(parseAmountInput("1,2345", prior)).toBe("12345");
    expect(parseAmountInput("12,5", "42")).toBe("42");
    // This legacy formatter must not be changed globally to fix field display.
    expect(formatAmountInput("abc12345")).toBe("abc12,345");
    expect(formatAmountInput("-1234.567")).toBe("-1,234.567");
  });

  it("accepts signed intermediate minus, decimals, and trailing zeros", () => {
    const resolve = getEditableInputResolver();
    let previousValue = "";
    for (const value of ["-", "-1", "-12.", "-12.30", "-12.3000"]) {
      expect(
        resolve(value, previousValue, { allowNegative: true })
      ).toEqual({ accepted: true, value });
      previousValue = value;
    }
  });

  it("canonicalizes signed grouped paste without adding a precision limit", () => {
    const resolve = getEditableInputResolver();
    expect(
      resolve("-1,234.567", "-1234.56", { allowNegative: true })
    ).toEqual({ accepted: true, value: "-1234.567" });
    expect(
      resolve("-1.123456", "-1.12345", { allowNegative: true })
    ).toEqual({ accepted: true, value: "-1.123456" });
    expect(
      resolve("-0.000", "-", { allowNegative: true })
    ).toEqual({ accepted: true, value: "-0.000" });
  });

  it("resolves a one-character edit inside a signed grouped display", () => {
    const resolve = getEditableInputResolver();
    expect(
      resolve("-1,2345", "-1234", { allowNegative: true })
    ).toEqual({ accepted: true, value: "-12345" });
    expect(
      resolve("-1,294.50", "-1234.50", { allowNegative: true })
    ).toEqual({ accepted: true, value: "-1294.50" });
  });

  it("permits sign removal and grouped separator deletion in signed mode", () => {
    const resolve = getEditableInputResolver();
    expect(
      resolve("-1234.50", "-1234.50", { allowNegative: true })
    ).toEqual({ accepted: true, value: "-1234.50" });
    expect(
      resolve("1,234.50", "-1234.50", { allowNegative: true })
    ).toEqual({ accepted: true, value: "1234.50" });
    expect(
      resolve("1234.50", "-1234.50", { allowNegative: true })
    ).toEqual({ accepted: true, value: "1234.50" });
  });

  it("marks malformed input as rejected without silently repairing it", () => {
    const resolve = getEditableInputResolver();
    for (const raw of ["abc12345", "12..34", "12,34", "--1234"]) {
      expect(resolve(raw, "1234", { allowNegative: true }).accepted).toBe(
        false
      );
    }
    // The component, not a permissive parser, forwards the exact raw text.
  });

  it("continues accepting existing weight precision in unsigned mode", () => {
    const resolve = getEditableInputResolver();
    expect(resolve("1,250.755", "1250.75")).toEqual({
      accepted: true,
      value: "1250.755",
    });
    expect(getEditableDisplaySelector()("1250.755")).toEqual({
      kind: "groupable",
      text: "1,250.755",
    });
  });
});
describe("T006 Q3 immutable legacy unsigned resolver outputs", () => {
  it.each([
    ["1,234.50", "", true, "1234.50"],
    ["1,2345", "1234", true, "12345"],
    ["1,23", "1234", true, "123"],
    ["abc12345", "42", false, "42"],
    ["1..2", "42", false, "42"],
    ["-1,234.50", "42", false, "42"],
  ] as const)(
    "retains legacy accepted/value result for %s with previous %s",
    (input, previous, accepted, value) => {
      expect(AmountHelpers.resolveAmountInputChange(input, previous)).toEqual({
        accepted,
        value,
      });
      expect(parseAmountInput(input, previous)).toBe(value);
    }
  );

  it("retains the existing unsigned formatter independent of the new display classifier", () => {
    expect(formatAmountInput("abc12345")).toBe("abc12,345");
    expect(formatAmountInput("-1234.567")).toBe("-1,234.567");
    expect(formatAmountInput("1250.7550")).toBe("1,250.7550");
  });
});
