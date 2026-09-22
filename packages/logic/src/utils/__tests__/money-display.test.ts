/**
 * Unit tests for the centralized money display policy.
 *
 * The policy hides a zero-only fractional part while retaining the currency's
 * normal precision whenever any fractional digit is non-zero:
 * - `35,500.00` -> `35,500`
 * - `35,500.01` -> `35,500.01`
 * - `35,500.10` -> `35,500.10`
 *
 * It must be safe for canonical financial decimal strings (no binary floating
 * point coercion) and preserve currency precision, signs, grouping, and locale.
 *
 * @module money-display.test
 */

import {
  formatMoneyAmount,
  getCurrencyDisplayPrecision,
} from "../money-display";

describe("getCurrencyDisplayPrecision", () => {
  it("returns zero for zero-decimal currencies", () => {
    expect(getCurrencyDisplayPrecision("JPY")).toBe(0);
    expect(getCurrencyDisplayPrecision("KRW")).toBe(0);
    expect(getCurrencyDisplayPrecision("ISK")).toBe(0);
  });

  it("returns two for ordinary currencies", () => {
    expect(getCurrencyDisplayPrecision("EGP")).toBe(2);
    expect(getCurrencyDisplayPrecision("USD")).toBe(2);
    expect(getCurrencyDisplayPrecision("EUR")).toBe(2);
  });

  it("returns three for three-decimal currencies", () => {
    expect(getCurrencyDisplayPrecision("KWD")).toBe(3);
    expect(getCurrencyDisplayPrecision("BHD")).toBe(3);
    expect(getCurrencyDisplayPrecision("OMR")).toBe(3);
    expect(getCurrencyDisplayPrecision("JOD")).toBe(3);
    expect(getCurrencyDisplayPrecision("IQD")).toBe(3);
    expect(getCurrencyDisplayPrecision("LYD")).toBe(3);
    expect(getCurrencyDisplayPrecision("TND")).toBe(3);
  });

  it("returns eight for BTC satoshi precision", () => {
    expect(getCurrencyDisplayPrecision("BTC")).toBe(8);
  });
});

describe("formatMoneyAmount canonical decimal strings", () => {
  it("hides the fractional part when every display fraction digit is zero", () => {
    expect(formatMoneyAmount("35500.00", { currency: "EGP" })).toBe("35,500");
    expect(formatMoneyAmount("0.00", { currency: "EGP" })).toBe("0");
  });

  it("keeps both fractional digits when the fractional part is non-zero", () => {
    expect(formatMoneyAmount("35500.01", { currency: "EGP" })).toBe(
      "35,500.01"
    );
    expect(formatMoneyAmount("35500.10", { currency: "EGP" })).toBe(
      "35,500.10"
    );
  });

  it("preserves the negative sign for whole and fractional values", () => {
    expect(formatMoneyAmount("-35500.00", { currency: "EGP" })).toBe(
      "-35,500"
    );
    expect(formatMoneyAmount("-35500.10", { currency: "EGP" })).toBe(
      "-35,500.10"
    );
  });

  it("normalizes a negative zero canonical value to zero", () => {
    expect(formatMoneyAmount("-0.00", { currency: "EGP" })).toBe("0");
  });

  it("respects zero-decimal currencies", () => {
    expect(formatMoneyAmount("1000.00", { currency: "JPY" })).toBe("1,000");
    expect(formatMoneyAmount("1000.00", { currency: "KRW" })).toBe("1,000");
  });

  it("respects three-decimal currencies", () => {
    expect(formatMoneyAmount("1.000", { currency: "KWD" })).toBe("1");
    expect(formatMoneyAmount("1.250", { currency: "KWD" })).toBe("1.250");
    expect(formatMoneyAmount("1.010", { currency: "BHD" })).toBe("1.010");
  });

  it("respects BTC satoshi precision", () => {
    expect(formatMoneyAmount("0.00000000", { currency: "BTC" })).toBe("0");
    expect(formatMoneyAmount("0.00012345", { currency: "BTC" })).toBe(
      "0.00012345"
    );
  });

  it("formats large canonical values without binary floating point loss", () => {
    expect(
      formatMoneyAmount("9007199254740993.00", { currency: "EGP" })
    ).toBe("9,007,199,254,740,993");
    expect(
      formatMoneyAmount("9007199254740993.10", { currency: "EGP" })
    ).toBe("9,007,199,254,740,993.10");
  });

  it("uses the requested locale while keeping Western digits for Arabic-Latin", () => {
    expect(
      formatMoneyAmount("1234.50", {
        currency: "EGP",
        locale: "ar-EG-u-nu-latn",
      })
    ).toBe("1,234.50");
  });

  it("presents Arabic-Indic digits for the Arabic locale", () => {
    expect(formatMoneyAmount("1234.00", { currency: "EGP", locale: "ar-EG" })).toBe(
      "\u0661\u066c\u0662\u0663\u0664"
    );
  });

  it("rejects non-canonical input instead of coercing it through a number", () => {
    expect(() => formatMoneyAmount("1e3", { currency: "EGP" })).toThrow();
    expect(() => formatMoneyAmount("1,234.56", { currency: "EGP" })).toThrow();
  });
});

describe("formatMoneyAmount numeric values", () => {
  it("matches the centralized policy for numbers", () => {
    expect(formatMoneyAmount(35500, { currency: "EGP" })).toBe("35,500");
    expect(formatMoneyAmount(35500.01, { currency: "EGP" })).toBe("35,500.01");
    expect(formatMoneyAmount(35500.1, { currency: "EGP" })).toBe("35,500.10");
    expect(formatMoneyAmount(-35500.5, { currency: "EGP" })).toBe("-35,500.50");
  });

  it("normalizes negative zero", () => {
    expect(formatMoneyAmount(-0, { currency: "EGP" })).toBe("0");
  });
});

describe("retained fixed-precision exceptions", () => {
  it("honors an explicit minimumFractionDigits override", () => {
    expect(
      formatMoneyAmount("100", {
        currency: "EGP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ).toBe("100.00");
  });

  it("honors an explicit whole-number override", () => {
    expect(
      formatMoneyAmount("1234.56", {
        currency: "EGP",
        maximumFractionDigits: 0,
      })
    ).toBe("1,235");
  });
});
