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

function loadPurityCatalogApi(): {
  readonly createPuritySnapshot: typeof createPuritySnapshot;
  readonly getPurityCatalog: typeof getPurityCatalog;
  readonly getPurityEntry: typeof getPurityEntry;
  readonly PURITY_CATALOG_VERSION: typeof PURITY_CATALOG_VERSION;
  readonly resolvePuritySelection: typeof resolvePuritySelection;
} {
  return {
    createPuritySnapshot,
    getPurityCatalog,
    getPurityEntry,
    PURITY_CATALOG_VERSION,
    resolvePuritySelection,
  };
}

function loadValuationApi(): {
  readonly calculateMetalReferenceValue: typeof calculateMetalReferenceValue;
  readonly calculatePureGrams: typeof calculatePureGrams;
} {
  return { calculateMetalReferenceValue, calculatePureGrams };
}

const EXPECTED_CATALOG_V1 = [
  { code: "gold-9999", metal: "GOLD", labelKey: "purity_gold_9999", factorDecimal: "0.9999", catalogVersion: "1" },
  { code: "gold-999", metal: "GOLD", labelKey: "purity_gold_999", factorDecimal: "0.999", catalogVersion: "1" },
  { code: "gold-995", metal: "GOLD", labelKey: "purity_gold_995", factorDecimal: "0.995", catalogVersion: "1" },
  { code: "gold-97916", metal: "GOLD", labelKey: "purity_gold_97916", factorDecimal: "0.97916", catalogVersion: "1" },
  { code: "gold-9167", metal: "GOLD", labelKey: "purity_gold_9167", factorDecimal: "0.9167", catalogVersion: "1" },
  { code: "gold-875", metal: "GOLD", labelKey: "purity_gold_875", factorDecimal: "0.875", catalogVersion: "1" },
  { code: "gold-750", metal: "GOLD", labelKey: "purity_gold_750", factorDecimal: "0.75", catalogVersion: "1" },
  { code: "gold-58333", metal: "GOLD", labelKey: "purity_gold_58333", factorDecimal: "0.58333", catalogVersion: "1" },
  { code: "gold-500", metal: "GOLD", labelKey: "purity_gold_500", factorDecimal: "0.5", catalogVersion: "1" },
  { code: "gold-375", metal: "GOLD", labelKey: "purity_gold_375", factorDecimal: "0.375", catalogVersion: "1" },
  { code: "silver-9999", metal: "SILVER", labelKey: "purity_silver_9999", factorDecimal: "0.9999", catalogVersion: "1" },
  { code: "silver-999", metal: "SILVER", labelKey: "purity_silver_999", factorDecimal: "0.999", catalogVersion: "1" },
  { code: "silver-925", metal: "SILVER", labelKey: "purity_silver_925", factorDecimal: "0.925", catalogVersion: "1" },
  { code: "silver-900", metal: "SILVER", labelKey: "purity_silver_900", factorDecimal: "0.9", catalogVersion: "1" },
  { code: "silver-800", metal: "SILVER", labelKey: "purity_silver_800", factorDecimal: "0.8", catalogVersion: "1" },
  { code: "silver-600", metal: "SILVER", labelKey: "purity_silver_600", factorDecimal: "0.6", catalogVersion: "1" },
];

describe("Metals purity catalog v1", () => {
  it("publishes exactly the approved Gold and Silver catalog with stable literal codes", () => {
    const { PURITY_CATALOG_VERSION, getPurityCatalog } = loadPurityCatalogApi();

    expect(PURITY_CATALOG_VERSION).toBe("1");
    expect(
      getPurityCatalog().map(({ code, metal, labelKey, factorDecimal, catalogVersion }) => ({
        code,
        metal,
        labelKey,
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
      .find(({ code }) => code === "gold-999");
    expect(exact999).toBeDefined();
    if (exact999 === undefined) {
      throw new Error("Approved 24K · 999 catalog entry is missing");
    }

    expect(getPurityEntry("GOLD", exact999.code)).toEqual({
      code: exact999.code,
      metal: "GOLD",
      labelKey: "purity_gold_999",
      factorDecimal: "0.999",
      catalogVersion: "1",
    });
    expect(resolvePuritySelection("GOLD", "gold-999")).toEqual({
      available: true,
      entry: exact999,
    });
    expect(resolvePuritySelection("GOLD", "24K · 999")).toEqual({
      available: false,
      reason: "unknown_purity",
    });
    expect(resolvePuritySelection("GOLD", "24K")).toEqual({
      available: false,
      reason: "unknown_purity",
    });
  });

  it("keeps captured purity evidence and valuation behavior unchanged after mutation attempts", () => {
    const { createPuritySnapshot, getPurityCatalog } = loadPurityCatalogApi();
    const { calculatePureGrams } = loadValuationApi();

    const exact999 = getPurityCatalog().find(({ code }) => code === "gold-999");
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
    } catch {
      // Mutation rejection is allowed; observable captured evidence remains authoritative.
    }
    try {
      (exact999 as { factorDecimal: string }).factorDecimal = "0.5";
    } catch {
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
    [
      "pure grams",
      () =>
        calculatePureGrams({
          weightGramsDecimal: "9".repeat(51),
          purityFactorDecimal: "1",
        }),
    ],
    [
      "reference value",
      () =>
        calculateMetalReferenceValue({
          weightGramsDecimal: "9".repeat(51),
          purityFactorDecimal: "1",
          metalUsdPerPureGramDecimal: "1",
          currencyUsdPerUnitDecimal: "1",
        }),
    ],
  ] as const)("rejects a 51-significant-digit weight before %s arithmetic", (_case, calculate) => {
    expect(calculate()).toEqual({
      available: false,
      reason: "invalid_weight",
    });
  });

  it("preserves an exact 50-significant-digit weight without rounding", () => {
    const weightGramsDecimal = "9".repeat(50);

    expect(
      calculatePureGrams({
        weightGramsDecimal,
        purityFactorDecimal: "1",
      })
    ).toEqual({ available: true, valueDecimal: weightGramsDecimal });
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
