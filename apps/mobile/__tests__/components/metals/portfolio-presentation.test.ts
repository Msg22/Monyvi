import { formatCodeAmount } from "@/components/metals/portfolio-presentation";

describe("metal portfolio presentation", () => {
  it.each(["0.004", "-0.004"])(
    "renders a signed sub-cent amount %s as neutral display zero",
    (value) => {
      expect(formatCodeAmount(value, "EGP", "en-GB", true)).toBe("EGP 0.00");
    }
  );

  it.each([
    ["0.006", "+ EGP 0.01"],
    ["-0.006", "- EGP 0.01"],
  ] as const)("preserves the rounded sign for %s", (value, expected) => {
    expect(formatCodeAmount(value, "EGP", "en-GB", true)).toBe(expected);
  });
});
