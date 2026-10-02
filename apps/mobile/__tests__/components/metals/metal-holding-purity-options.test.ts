import {
  getMetalHoldingFormPurityLabel,
  getMetalHoldingPurityOptions,
} from "@/components/metals/metal-holding-purity-options";

describe("holding form purity choices", () => {
  it("offers one 24K gold choice plus 21K and 18K without fineness numbers", () => {
    expect(getMetalHoldingPurityOptions("GOLD")).toEqual([
      { value: "gold-999", label: "24K" },
      { value: "gold-875", label: "21K" },
      { value: "gold-750", label: "18K" },
    ]);
  });

  it("retains the existing silver purity choices", () => {
    expect(getMetalHoldingPurityOptions("SILVER").map(({ value }) => value)).toEqual([
      "silver-9999",
      "silver-999",
      "silver-925",
      "silver-900",
      "silver-800",
      "silver-600",
    ]);
  });

  it("shows an older recorded Gold grade without changing its catalog identity", () => {
    expect(getMetalHoldingFormPurityLabel("GOLD", "gold-9167")).toBe("22K");
    expect(
      getMetalHoldingFormPurityLabel("GOLD", "gold-999", "عيار ٢٤ · ٩٩٩")
    ).toBe("عيار ٢٤");
  });
});
