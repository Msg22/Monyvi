interface MetalHoldingFormData {
  readonly name: string;
  readonly metal: string | null;
  readonly weightGrams: string;
  readonly purityCode: string | null;
  readonly purchasePrice: string;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: string | null;
  readonly physicalForm: string | null;
  readonly notes: string | null;
  readonly unusualValueAcknowledged: boolean;
}

interface MetalHoldingFormValidationContext {
  readonly locale: "en" | "ar";
  readonly decimalSeparator?: "." | ",";
  readonly today: string;
  readonly currencyMinorUnits: number;
  readonly safeRange: {
    readonly maximumWeightGramsDecimal: string;
    readonly maximumPurchasePriceDecimal: string;
  };
  readonly isUnusualValue: (field: string, valueDecimal: string) => boolean;
}

interface NormalizedMetalHoldingFormData {
  readonly name: string;
  readonly metal: "GOLD" | "SILVER";
  readonly weightGramsDecimal: string;
  readonly purity: {
    readonly code: string;
    readonly catalogVersion: "1";
    readonly factorDecimal: string;
    readonly labelKey: string;
  };
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: string | null;
  readonly notes: string | null;
}

interface MetalHoldingFormValidationResult {
  readonly isValid: boolean;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly normalized: NormalizedMetalHoldingFormData | null;
  readonly requiresUnusualValueAcknowledgment: boolean;
}

interface MetalHoldingLivePreviewInput {
  readonly holding: NormalizedMetalHoldingFormData;
  readonly valuation:
    | { readonly available: true; readonly valueDecimal: string }
    | { readonly available: false; readonly reason: "missing_rate" };
}

interface MetalHoldingFormValidationModule {
  validateMetalHoldingForm(
    data: MetalHoldingFormData,
    context: MetalHoldingFormValidationContext
  ): MetalHoldingFormValidationResult;
  createMetalHoldingLivePreview(
    input: MetalHoldingLivePreviewInput
  ): MetalHoldingLivePreviewInput;
}

function loadValidationModule(): MetalHoldingFormValidationModule {
  return jest.requireActual(
    "../../validation/metal-holding-form-validation"
  ) as MetalHoldingFormValidationModule;
}

const baseForm: MetalHoldingFormData = {
  name: "Wedding coin",
  metal: "GOLD",
  weightGrams: "10.125",
  purityCode: "gold-999",
  purchasePrice: "47800.00",
  purchaseCurrency: "EGP",
  purchaseDate: "2024-03-14",
  physicalForm: "COIN",
  notes: "هدية 🎁",
  unusualValueAcknowledged: false,
};

const validationContext: MetalHoldingFormValidationContext = {
  locale: "en" as const,
  today: "2026-09-01",
  currencyMinorUnits: 2,
  safeRange: {
    maximumWeightGramsDecimal: "1000",
    maximumPurchasePriceDecimal: "1000000",
  },
  isUnusualValue: (): boolean => false,
};

function validate(
  overrides: Partial<MetalHoldingFormData> = {},
  context: Partial<MetalHoldingFormValidationContext> = {}
): MetalHoldingFormValidationResult {
  return loadValidationModule().validateMetalHoldingForm(
    { ...baseForm, ...overrides },
    { ...validationContext, ...context }
  );
}

describe("validateMetalHoldingForm", () => {
  it("normalizes English, Arabic-Indic, and decimal-comma entries to canonical exact facts", () => {
    const english = validate({
      weightGrams: "1,250.125",
      purchasePrice: "47,800.00",
    });
    const arabic = validate(
      {
        weightGrams: "١٠٫١٢٥",
        purchasePrice: "٤٧٬٨٠٠٫٠٠",
      },
      { locale: "ar" }
    );
    const decimalComma = validate(
      {
        weightGrams: "10,125",
        purchasePrice: "47800,00",
      },
      { decimalSeparator: "," }
    );

    expect(english).toMatchObject({
      isValid: false,
      normalized: {
        weightGramsDecimal: "1250.125",
        purchasePriceDecimal: "47800",
      },
    });
    expect(arabic).toMatchObject({
      isValid: true,
      normalized: {
        weightGramsDecimal: "10.125",
        purchasePriceDecimal: "47800",
      },
    });
    expect(decimalComma).toMatchObject({
      isValid: true,
      normalized: {
        weightGramsDecimal: "10.125",
        purchasePriceDecimal: "47800",
      },
    });
  });

  it("requires every Add fact while representing an unselected purity with null, never an empty ID sentinel", () => {
    const result = validate({
      name: "   ",
      metal: null,
      weightGrams: "",
      purityCode: null,
      purchasePrice: "",
      purchaseCurrency: null,
      purchaseDate: null,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.objectContaining({
        name: "required",
        metal: "required",
        weightGrams: "required",
        purityCode: "required",
        purchasePrice: "required",
        purchaseCurrency: "required",
        purchaseDate: "required",
      })
    );
    expect(validate({ purityCode: "" }).errors.purityCode).toBe("invalid");
  });

  it("rejects unsupported metals, wrong-metal purity, and invalid physical form", () => {
    expect(validate({ metal: "PLATINUM" }).errors.metal).toBe(
      "unsupported_metal"
    );
    expect(validate({ purityCode: "silver-925" }).errors.purityCode).toBe(
      "unknown_purity"
    );
    expect(validate({ physicalForm: "RING" }).errors.physicalForm).toBe(
      "invalid"
    );
  });

  it("persists the catalog-v1 24K · 999 identity as stable code, version, and exact factor", () => {
    const result = validate({ purityCode: "gold-999" });

    expect(result).toMatchObject({
      isValid: true,
      normalized: {
        purity: {
          code: "gold-999",
          catalogVersion: "1",
          factorDecimal: "0.999",
          labelKey: "purity_gold_999",
        },
      },
    });
  });

  it("rejects non-finite, non-positive, over-precision, over-range, invalid-currency-scale, and future-date facts", () => {
    expect(validate({ weightGrams: "Infinity" }).errors.weightGrams).toBe(
      "invalid"
    );
    expect(validate({ weightGrams: "0" }).errors.weightGrams).toBe(
      "non_positive"
    );
    expect(validate({ weightGrams: "1.0001" }).errors.weightGrams).toBe(
      "precision"
    );
    expect(validate({ weightGrams: "1000.001" }).errors.weightGrams).toBe(
      "out_of_range"
    );
    expect(validate({ purchasePrice: "1.001" }).errors.purchasePrice).toBe(
      "currency_precision"
    );
    expect(validate({ purchasePrice: "1000000.01" }).errors.purchasePrice).toBe(
      "out_of_range"
    );
    expect(validate({ purchaseDate: "2026-09-02" }).errors.purchaseDate).toBe(
      "future_date"
    );
  });

  it("requires deliberate acknowledgment for a supported unusual value without turning it into an invalid value", () => {
    const isUnusualWeight = (field: string): boolean => field === "weightGrams";
    const unacknowledged = validate(
      { weightGrams: "900", unusualValueAcknowledged: false },
      { isUnusualValue: isUnusualWeight }
    );
    const acknowledged = validate(
      { weightGrams: "900", unusualValueAcknowledged: true },
      { isUnusualValue: isUnusualWeight }
    );

    expect(unacknowledged).toMatchObject({
      isValid: false,
      errors: { unusualValueAcknowledged: "required" },
      requiresUnusualValueAcknowledgment: true,
      normalized: { weightGramsDecimal: "900" },
    });
    expect(acknowledged).toMatchObject({
      isValid: true,
      errors: {},
      requiresUnusualValueAcknowledgment: true,
      normalized: { weightGramsDecimal: "900" },
    });
  });
});

describe("createMetalHoldingLivePreview", () => {
  it("accepts only normalized validated facts and keeps an unavailable valuation explicit without blocking Add", () => {
    const validation = validate();

    expect(validation.isValid).toBe(true);
    if (!validation.isValid || validation.normalized === null) {
      throw new Error("Expected the base Add form to be valid");
    }
    const preview = loadValidationModule().createMetalHoldingLivePreview({
      holding: validation.normalized,
      valuation: { available: false, reason: "missing_rate" },
    });

    expect(preview).toEqual({
      holding: {
        name: "Wedding coin",
        metal: "GOLD",
        weightGramsDecimal: "10.125",
        purity: {
          code: "gold-999",
          catalogVersion: "1",
          factorDecimal: "0.999",
          labelKey: "purity_gold_999",
        },
        purchasePriceDecimal: "47800",
        purchaseCurrency: "EGP",
        purchaseDate: "2024-03-14",
        physicalForm: "COIN",
        notes: "هدية 🎁",
      },
      valuation: { available: false, reason: "missing_rate" },
    });
  });
});
