import {
  createPuritySnapshot,
  getPurityCatalog,
  getPurityEntry,
  PURITY_CATALOG_VERSION,
  resolvePuritySelection,
} from "../purity-catalog";
import {
  calculateMetalReferenceValue,
  calculatePureGrams,
} from "../valuation";

function loadPurityCatalogApi() {
  return {
    createPuritySnapshot,
    getPurityCatalog,
    getPurityEntry,
    PURITY_CATALOG_VERSION,
    resolvePuritySelection,
  };
}

function loadValuationApi() {
  return { calculateMetalReferenceValue, calculatePureGrams };
}

const EXPECTED_CATALOG_V1 = [
  { metal: "GOLD", label: "24K · 999.9", factorDecimal: "0.9999", catalogVersion: "1" },
  { metal: "GOLD", label: "24K · 999", factorDecimal: "0.999", catalogVersion: "1" },
  { metal: "GOLD", label: "995 bullion", factorDecimal: "0.995", catalogVersion: "1" },
  { metal: "GOLD", label: "23.5K · 979.16", factorDecimal: "0.97916", catalogVersion: "1" },
  { metal: "GOLD", label: "22K · 916.7", factorDecimal: "0.9167", catalogVersion: "1" },
  { metal: "GOLD", label: "21K · 875", factorDecimal: "0.875", catalogVersion: "1" },
  { metal: "GOLD", label: "18K · 750", factorDecimal: "0.75", catalogVersion: "1" },
  { metal: "GOLD", label: "14K · 583.33", factorDecimal: "0.58333", catalogVersion: "1" },
  { metal: "GOLD", label: "12K · 500", factorDecimal: "0.5", catalogVersion: "1" },
  { metal: "GOLD", label: "9K · 375", factorDecimal: "0.375", catalogVersion: "1" },
  { metal: "SILVER", label: "999.9 bullion", factorDecimal: "0.9999", catalogVersion: "1" },
  { metal: "SILVER", label: "999 bullion", factorDecimal: "0.999", catalogVersion: "1" },
  { metal: "SILVER", label: "925", factorDecimal: "0.925", catalogVersion: "1" },
  { metal: "SILVER", label: "900", factorDecimal: "0.9", catalogVersion: "1" },
  { metal: "SILVER", label: "800", factorDecimal: "0.8", catalogVersion: "1" },
  { metal: "SILVER", label: "600", factorDecimal: "0.6", catalogVersion: "1" },
];

describe("Metals purity catalog v1", () => {
  it("publishes exactly the approved Gold and Silver catalog with stable literal codes", () => {
    const { PURITY_CATALOG_VERSION, getPurityCatalog } = loadPurityCatalogApi();

    expect(PURITY_CATALOG_VERSION).toBe("1");
    expect(
      getPurityCatalog().map(({ metal, label, factorDecimal, catalogVersion }) => ({
        metal,
        label,
        factorDecimal,
        catalogVersion,
      }))
    ).toEqual(EXPECTED_CATALOG_V1);
    expect(new Set(getPurityCatalog().map(({ code }) => code)).size).toBe(16);
    expect(getPurityCatalog().map(({ code }) => code)).toEqual(
      loadPurityCatalogApi().getPurityCatalog().map(({ code }) => code)
    );
  });

  it("keeps exact 24K · 999 separate from 24K · 999.9 and forbids bare 24K", () => {
    const { getPurityEntry, resolvePuritySelection } = loadPurityCatalogApi();

    const exact999 = loadPurityCatalogApi()
      .getPurityCatalog()
      .find(({ metal, label }) => metal === "GOLD" && label === "24K · 999");
    expect(exact999).toBeDefined();
    if (exact999 === undefined) {
      throw new Error("Approved 24K · 999 catalog entry is missing");
    }

    expect(getPurityEntry("GOLD", exact999.code)).toEqual({
      code: exact999.code,
      metal: "GOLD",
      label: "24K · 999",
      factorDecimal: "0.999",
      catalogVersion: "1",
    });
    expect(resolvePuritySelection("GOLD", "24K")).toEqual({
      available: false,
      reason: "ambiguous_purity",
    });
  });

  it("keeps captured purity evidence and valuation behavior unchanged after mutation attempts", () => {
    const { createPuritySnapshot, getPurityCatalog } = loadPurityCatalogApi();
    const { calculatePureGrams } = loadValuationApi();

    const exact999 = getPurityCatalog().find(
      ({ metal, label }) => metal === "GOLD" && label === "24K · 999"
    );
    expect(exact999).toBeDefined();
    if (exact999 === undefined) {
      throw new Error("Approved 24K · 999 catalog entry is missing");
    }
    const snapshot = createPuritySnapshot("GOLD", exact999.code);

    expect(snapshot).toEqual({
      code: exact999.code,
      catalogVersion: "1",
      factorDecimal: "0.999",
    });

    try {
      (snapshot as { factorDecimal: string }).factorDecimal = "0.5";
    } catch (_error: unknown) {
      // Mutation rejection is allowed; observable captured evidence remains authoritative.
    }
    try {
      (exact999 as { factorDecimal: string }).factorDecimal = "0.5";
    } catch (_error: unknown) {
      // Mutation rejection is allowed; observable captured evidence remains authoritative.
    }

    expect(snapshot).toEqual({
      code: exact999.code,
      catalogVersion: "1",
      factorDecimal: "0.999",
    });
    expect(
      calculatePureGrams({
        weightGramsDecimal: "10",
        purityFactorDecimal: snapshot.factorDecimal,
      })
    ).toEqual({ available: true, valueDecimal: "9.99" });
  });

  it("rejects unsupported metals instead of falling back to another catalog", () => {
    const { resolvePuritySelection } = loadPurityCatalogApi();

    expect(resolvePuritySelection("PLATINUM", "999")).toEqual({
      available: false,
      reason: "unsupported_metal",
    });
  });

  it("rejects an unknown exact purity without inferring from display text", () => {
    const { resolvePuritySelection } = loadPurityCatalogApi();

    expect(resolvePuritySelection("SILVER", "Sterling silver")).toEqual({
      available: false,
      reason: "unknown_purity",
    });
  });
});

describe("exact purity and valuation", () => {
  it("accepts the exact FR-083 weight and purity scale boundaries", () => {
    const { calculatePureGrams } = loadValuationApi();

    expect(
      calculatePureGrams({
        weightGramsDecimal: "1.234",
        purityFactorDecimal: "0.999999",
      })
    ).toEqual({ available: true, valueDecimal: "1.233998766" });
  });

  it.each([
    ["weight", { weightGramsDecimal: "1.2345", purityFactorDecimal: "0.999999" }, "invalid_weight"],
    ["purity", { weightGramsDecimal: "1.234", purityFactorDecimal: "0.9999999" }, "invalid_purity"],
  ] as const)("rejects %s precision beyond the FR-083 boundary", (_case, input, reason) => {
    const { calculatePureGrams } = loadValuationApi();

    expect(calculatePureGrams(input)).toEqual({ available: false, reason });
  });

  it.each([
    ["10", "0.999", "9.99"],
    ["0.001", "0.999999", "0.000999999"],
    ["999999999999999999.999", "0.999999", "999998999999999999.999000001"],
  ])("calculates %s g at factor %s as exact pure grams %s", (weight, factor, expected) => {
    const { calculatePureGrams } = loadValuationApi();

    expect(calculatePureGrams({ weightGramsDecimal: weight, purityFactorDecimal: factor })).toEqual({
      available: true,
      valueDecimal: expected,
    });
  });

  it("values exact 24K · 999 Gold from USD per pure gram and USD per currency unit", () => {
    const { calculateMetalReferenceValue } = loadValuationApi();

    expect(
      calculateMetalReferenceValue({
        weightGramsDecimal: "10",
        purityFactorDecimal: "0.999",
        metalUsdPerPureGramDecimal: "100",
        currencyUsdPerUnitDecimal: "0.02",
      })
    ).toEqual({ available: true, valueDecimal: "49950" });
  });

  it("does not round pure grams before valuation", () => {
    const { calculateMetalReferenceValue } = loadValuationApi();

    expect(
      calculateMetalReferenceValue({
        weightGramsDecimal: "0.001",
        purityFactorDecimal: "0.333333",
        metalUsdPerPureGramDecimal: "3",
        currencyUsdPerUnitDecimal: "0.1",
      })
    ).toEqual({ available: true, valueDecimal: "0.00999999" });
  });

  it.each([
    [{ weightGramsDecimal: "0", purityFactorDecimal: "0.999", metalUsdPerPureGramDecimal: "100", currencyUsdPerUnitDecimal: "0.02" }, "invalid_weight"],
    [{ weightGramsDecimal: "10", purityFactorDecimal: "1.000001", metalUsdPerPureGramDecimal: "100", currencyUsdPerUnitDecimal: "0.02" }, "invalid_purity"],
    [{ weightGramsDecimal: "10", purityFactorDecimal: "0.999", metalUsdPerPureGramDecimal: "0", currencyUsdPerUnitDecimal: "0.02" }, "invalid_metal_rate"],
    [{ weightGramsDecimal: "10", purityFactorDecimal: "0.999", metalUsdPerPureGramDecimal: "100", currencyUsdPerUnitDecimal: "0" }, "invalid_currency_rate"],
  ])("marks unavailable input as %s instead of zero valuation", (input, reason) => {
    const { calculateMetalReferenceValue } = loadValuationApi();

    expect(calculateMetalReferenceValue(input)).toEqual({ available: false, reason });
  });
});
