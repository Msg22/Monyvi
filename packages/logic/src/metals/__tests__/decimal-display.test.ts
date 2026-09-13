import { formatCanonicalDecimalForDisplay } from "../decimal";

describe("formatCanonicalDecimalForDisplay", () => {
  it("preserves integers beyond JavaScript number precision and rounds half-even", () => {
    expect(
      formatCanonicalDecimalForDisplay("9007199254740993.245", {
        locale: "en-GB",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })
    ).toBe("9,007,199,254,740,993.24");
    expect(
      formatCanonicalDecimalForDisplay("9007199254740993.255", {
        locale: "en-GB",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })
    ).toBe("9,007,199,254,740,993.26");
  });

  it("uses the requested locale while retaining Western digits for Arabic", () => {
    expect(
      formatCanonicalDecimalForDisplay("1234.5", {
        locale: "ar-EG-u-nu-latn",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })
    ).toBe("1,234.50");
  });

  it("trims optional trailing zeroes without losing the required precision", () => {
    expect(
      formatCanonicalDecimalForDisplay("-1234.500", {
        locale: "en-GB",
        maximumFractionDigits: 3,
        minimumFractionDigits: 1,
      })
    ).toBe("-1,234.5");
  });
});
