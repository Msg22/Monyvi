import * as DecimalContract from "../decimal";
import {
  compareDecimal,
  EXACT_DECIMAL_CONFIG,
  fromMinorUnits,
  parseCanonicalDecimal,
  parseLocalizedDecimal,
  roundDecimal,
  serializeDecimal,
  toMinorUnits,
} from "../decimal";

function loadDecimalApi(): {
  readonly compareDecimal: typeof compareDecimal;
  readonly EXACT_DECIMAL_CONFIG: typeof EXACT_DECIMAL_CONFIG;
  readonly fromMinorUnits: typeof fromMinorUnits;
  readonly parseCanonicalDecimal: typeof parseCanonicalDecimal;
  readonly parseLocalizedDecimal: typeof parseLocalizedDecimal;
  readonly roundDecimal: typeof roundDecimal;
  readonly serializeDecimal: typeof serializeDecimal;
  readonly toMinorUnits: typeof toMinorUnits;
} {
  return {
    compareDecimal,
    EXACT_DECIMAL_CONFIG,
    fromMinorUnits,
    parseCanonicalDecimal,
    parseLocalizedDecimal,
    roundDecimal,
    serializeDecimal,
    toMinorUnits,
  };
}

type DecimalApi = ReturnType<typeof loadDecimalApi>;

describe("exact Metals decimal contract", () => {
  it.each([
    ["0", "0"],
    ["-12.34", "-12.34"],
    ["123456789012345678901234567890.123456789", "123456789012345678901234567890.123456789"],
  ])("parses and serializes canonical decimal %s without precision loss", (input, expected) => {
    const { parseCanonicalDecimal, serializeDecimal } = loadDecimalApi();

    expect(serializeDecimal(parseCanonicalDecimal(input))).toBe(expected);
  });

  it("serializes trailing zeroes and negative zero to canonical plain strings", () => {
    const { parseCanonicalDecimal, serializeDecimal } = loadDecimalApi();

    expect(serializeDecimal(parseCanonicalDecimal("123.4500"))).toBe("123.45");
    expect(serializeDecimal(parseCanonicalDecimal("-0"))).toBe("0");
  });

  it.each(["1e3", "1E-3", ".5", "5.", "+5", "01.2", "NaN", "Infinity", ""])(
    "rejects non-canonical or exponent input %p",
    (input) => {
      const { parseCanonicalDecimal } = loadDecimalApi();

      expect(() => parseCanonicalDecimal(input)).toThrow();
    }
  );

  it("rejects a binary number at the canonical boundary", () => {
    const { parseCanonicalDecimal } = loadDecimalApi();

    expect(() =>
      parseCanonicalDecimal(0.1 as unknown as string)
    ).toThrow();
  });

  it("hides the mutable Decimal constructor and exposes immutable precision metadata", () => {
    const { EXACT_DECIMAL_CONFIG, roundDecimal } = loadDecimalApi();

    expect(Reflect.get(DecimalContract, "ExactDecimal")).toBeUndefined();
    expect(EXACT_DECIMAL_CONFIG).toEqual({
      precision: 50,
      rounding: "ROUND_HALF_EVEN",
    });
    expect(Reflect.set(EXACT_DECIMAL_CONFIG, "precision", 1)).toBe(false);
    expect(EXACT_DECIMAL_CONFIG.precision).toBe(50);
    expect(roundDecimal("2.345", 2)).toBe("2.34");
  });

  it("limits public exact inputs at compile time to canonical strings or branded values", () => {
    type SerializeInput = Parameters<typeof DecimalContract.serializeDecimal>[0];
    type CompareInput = Parameters<typeof DecimalContract.compareDecimal>[0];
    type RoundInput = Parameters<typeof DecimalContract.roundDecimal>[0];
    type MinorUnitInput = Parameters<typeof DecimalContract.toMinorUnits>[0];

    function verifyBinaryInputRejections(): void {
      // @ts-expect-error Binary numbers are forbidden at authoritative boundaries.
      const serializeInput: SerializeInput = 0.1;
      // @ts-expect-error Binary numbers are forbidden at authoritative boundaries.
      const compareInput: CompareInput = 0.1;
      // @ts-expect-error Binary numbers are forbidden at authoritative boundaries.
      const roundInput: RoundInput = 0.1;
      // @ts-expect-error Binary numbers are forbidden at authoritative boundaries.
      const minorUnitInput: MinorUnitInput = 0.1;
      void [serializeInput, compareInput, roundInput, minorUnitInput];
    }
    void verifyBinaryInputRejections;

    const { parseCanonicalDecimal, serializeDecimal } = loadDecimalApi();
    expect(serializeDecimal(parseCanonicalDecimal("0.1"))).toBe("0.1");
  });

  it.each([
    ["serializeDecimal", (api: DecimalApi, value: unknown) => api.serializeDecimal(value as never)],
    ["compareDecimal", (api: DecimalApi, value: unknown) => api.compareDecimal(value as never, "0")],
    ["roundDecimal", (api: DecimalApi, value: unknown) => api.roundDecimal(value as never, 2)],
    ["toMinorUnits", (api: DecimalApi, value: unknown) => api.toMinorUnits(value as never, 2)],
  ])("rejects binary-number input in %s", (_name, invoke) => {
    expect(() => invoke(loadDecimalApi(), 0.1)).toThrow();
  });

  it.each([
    ["serializeDecimal", (api: DecimalApi, value: unknown) => api.serializeDecimal(value as never)],
    ["compareDecimal", (api: DecimalApi, value: unknown) => api.compareDecimal(value as never, "0")],
    ["roundDecimal", (api: DecimalApi, value: unknown) => api.roundDecimal(value as never, 2)],
    ["toMinorUnits", (api: DecimalApi, value: unknown) => api.toMinorUnits(value as never, 2)],
  ])("rejects non-canonical string input in %s", (_name, invoke) => {
    expect(() => invoke(loadDecimalApi(), "1e3")).toThrow();
  });

  it.each([
    ["2.345", 2, "2.34"],
    ["2.355", 2, "2.36"],
    ["-2.345", 2, "-2.34"],
    ["-2.355", 2, "-2.36"],
  ])("half-even rounds %s at scale %s to %s", (input, places, expected) => {
    const { roundDecimal } = loadDecimalApi();

    expect(roundDecimal(input, places)).toBe(expected);
  });

  it.each([
    ["123.45", 2, "12345"],
    ["1.005", 2, "100"],
    ["1.015", 2, "102"],
    ["-1.005", 2, "-100"],
    ["999999999999999999999999.99", 2, "99999999999999999999999999"],
  ])("posts %s as exact integer minor units %s", (input, places, expected) => {
    const { toMinorUnits } = loadDecimalApi();

    expect(toMinorUnits(input, places)).toBe(expected);
  });

  it.each([
    ["12345", 2, "123.45"],
    ["-5", 2, "-0.05"],
    ["0", 3, "0"],
    ["42", 0, "42"],
  ])("restores minor units %s at scale %s as %s", (input, places, expected) => {
    const { fromMinorUnits } = loadDecimalApi();

    expect(fromMinorUnits(input, places)).toBe(expected);
  });

  it.each([
    ["١٢٣٫٤٥", "123.45"],
    ["-٠٫٠٠٥", "-0.005"],
    ["١٬٢٣٤٫٥٦", "1234.56"],
    ["1234,56", "1234.56"],
    ["1,23", "1.23"],
    ["١٬٢٣٤٬٥٦٧٫٨٩", "1234567.89"],
  ])("normalizes localized decimal %s to %s", (input, expected) => {
    const { parseLocalizedDecimal, serializeDecimal } = loadDecimalApi();

    expect(serializeDecimal(parseLocalizedDecimal(input))).toBe(expected);
  });

  it.each([
    ["1,234.56", "1234.56"],
    ["12,345,678.90", "12345678.9"],
    ["1,234,567", "1234567"],
  ])("normalizes grouped English decimal %s to %s", (input, expected) => {
    const { parseLocalizedDecimal, serializeDecimal } = loadDecimalApi();

    expect(serializeDecimal(parseLocalizedDecimal(input))).toBe(expected);
  });

  it.each(["12,34.56", "1,23,4.56", "1,2345.67", "1,234,56"])(
    "rejects malformed English grouping %s",
    (input) => {
      const { parseLocalizedDecimal } = loadDecimalApi();

      expect(() => parseLocalizedDecimal(input)).toThrow();
    }
  );

  it.each(["1,234", "0,123", "1234,567"])(
    "rejects ambiguous single-comma notation %s without locale context",
    (input) => {
      const { parseLocalizedDecimal } = loadDecimalApi();

      expect(() => parseLocalizedDecimal(input)).toThrow();
    }
  );

  it.each([
    ["decimal-comma", { decimalSeparator: "," as const }, "1.234"],
    ["decimal-point", { decimalSeparator: "." as const }, "1234"],
  ])(
    "uses explicit %s context to disambiguate 1,234",
    (_notation, context, expected) => {
      const { parseLocalizedDecimal, serializeDecimal } = loadDecimalApi();

      expect(
        serializeDecimal(parseLocalizedDecimal("1,234", context))
      ).toBe(expected);
    }
  );

  it.each([
    ["decimal-comma", "1,234.56", { decimalSeparator: "," as const }],
    ["decimal-point", "1,23", { decimalSeparator: "." as const }],
  ])(
    "rejects %s input that conflicts with its explicit separator context",
    (_notation, input, context) => {
      const { parseLocalizedDecimal } = loadDecimalApi();

      expect(() => parseLocalizedDecimal(input, context)).toThrow();
    }
  );

  it.each(["١٬٢", "١٬", "١٬٢٣٬٤٥٦", "١٬٢٣٤,٥٦", "١٬٢٣٤.٥٦"])(
    "rejects malformed Arabic grouping %s",
    (input) => {
      const { parseLocalizedDecimal } = loadDecimalApi();

      expect(() => parseLocalizedDecimal(input)).toThrow();
    }
  );

  it("compares huge and sub-minor decimals without number conversion", () => {
    const { compareDecimal } = loadDecimalApi();

    expect(
      compareDecimal(
        "999999999999999999999999999999.00000000000000000001",
        "999999999999999999999999999999"
      )
    ).toBe(1);
    expect(compareDecimal("0.00000000000000000001", "0.00000000000000000002")).toBe(-1);
    expect(compareDecimal("-0", "0")).toBe(0);
  });
});
