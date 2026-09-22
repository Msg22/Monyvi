import {
  formatCodeAmount,
  getMetalHoldingPresentation,
} from "@/components/metals/portfolio-presentation";
import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";

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

  it.each([
    ["KWD", "1.2345", "KWD 1.234"],
    ["BHD", "1.2345", "BHD 1.234"],
    ["OMR", "1.2345", "OMR 1.234"],
    ["JPY", "1234.5", "JPY 1,234"],
    ["KRW", "1234.5", "KRW 1,234"],
    ["EGP", "1.2345", "EGP 1.23"],
  ] as const)(
    "formats %s amounts with the currency's minor-unit precision",
    (currency, value, expected) => {
      expect(formatCodeAmount(value, currency, "en-GB")).toBe(expected);
    }
  );

  function holding(
    overrides: Partial<MetalPortfolioHoldingInput> = {}
  ): MetalPortfolioHoldingInput {
    return {
      currentPerformanceDecimal: null,
      currentValueDecimal: null,
      id: "holding-1",
      isEffective: true,
      isVisible: true,
      metalType: "GOLD",
      name: "Gold coin",
      occurredAt: new Date("2026-08-20T10:00:00.000Z"),
      physicalForm: "coin",
      purchaseCurrency: "EGP",
      purchaseDate: null,
      purchasePriceDecimal: null,
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      soldResultDecimal: null,
      status: "active",
      userId: "user-1",
      weightGramsDecimal: "10",
      ...overrides,
    };
  }

  it("returns the catalog purity label only when the full tuple matches", () => {
    expect(
      getMetalHoldingPresentation(holding()).purityLabelKey
    ).toBe("purity_gold_9999");
    expect(
      getMetalHoldingPresentation(
        holding({ purityFactorDecimal: "1" })
      ).purityLabelKey
    ).toBeNull();
    expect(
      getMetalHoldingPresentation(
        holding({ purityFactorDecimal: null })
      ).purityLabelKey
    ).toBeNull();
  });
});
