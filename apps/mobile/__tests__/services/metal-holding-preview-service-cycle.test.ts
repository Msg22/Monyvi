import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createMetalHoldingLivePreview } from "@/services/metal-holding-preview-service";
import {
  validateMetalHoldingForm,
  type MetalHoldingFormData,
  type MetalHoldingFormValidationContext,
  type NormalizedMetalHoldingFormData,
} from "@/validation/metal-holding-form-validation";

type ValidationModule =
  typeof import("../../validation/metal-holding-form-validation");
type PreviewServiceModule =
  typeof import("../../services/metal-holding-preview-service");

const VALIDATION_SOURCE = resolve(
  __dirname,
  "../../validation/metal-holding-form-validation.ts"
);
const PREVIEW_SERVICE_SOURCE = resolve(
  __dirname,
  "../../services/metal-holding-preview-service.ts"
);

interface LoadedModulePair {
  readonly validation: ValidationModule;
  readonly preview: PreviewServiceModule;
}

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function loadModulesInOrder(
  order: ReadonlyArray<"validation" | "preview">
): LoadedModulePair {
  let validation: ValidationModule | null = null;
  let preview: PreviewServiceModule | null = null;
  jest.isolateModules(() => {
    for (const entry of order) {
      if (entry === "validation") {
        validation = jest.requireActual<ValidationModule>(
          "../../validation/metal-holding-form-validation"
        );
      } else {
        preview = jest.requireActual<PreviewServiceModule>(
          "../../services/metal-holding-preview-service"
        );
      }
    }
  });
  if (validation === null || preview === null) {
    throw new Error(
      `Expected both modules to load in order: ${order.join(" then ")}`
    );
  }
  return { validation, preview };
}

const VALID_FORM: MetalHoldingFormData = {
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

const VALIDATION_CONTEXT: MetalHoldingFormValidationContext = {
  locale: "en",
  today: "2026-09-01",
  currencyMinorUnits: 2,
  safeRange: {
    maximumWeightGramsDecimal: "1000",
    maximumPurchasePriceDecimal: "1000000",
  },
  isUnusualValue: (): boolean => false,
};

const VALIDATED_HOLDING: NormalizedMetalHoldingFormData = {
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
};

describe("validation and preview service module boundary", () => {
  it("keeps the validation module free of any runtime dependency on the preview service", () => {
    const validationSource = readSource(VALIDATION_SOURCE);
    const previewServiceSource = readSource(PREVIEW_SERVICE_SOURCE);

    expect(validationSource).not.toContain("metal-holding-preview-service");
    expect(validationSource).not.toContain("createMetalHoldingLivePreview");
    expect(previewServiceSource).toContain(
      "../validation/metal-holding-form-validation"
    );
    expect(previewServiceSource).toContain("getPurityCatalogEntry");
  });

  it("loads validation first without a partially initialized purity catalog", () => {
    const { validation, preview } = loadModulesInOrder([
      "validation",
      "preview",
    ]);

    expect(validation.getPurityCatalogEntry("gold-999")).toEqual({
      code: "gold-999",
      catalogVersion: "1",
      factorDecimal: "0.999",
      labelKey: "purity_gold_999",
      displayLabel: "24K · 999",
      metal: "GOLD",
    });
    const validationResult = validation.validateMetalHoldingForm(
      VALID_FORM,
      VALIDATION_CONTEXT
    );
    expect(validationResult.normalized?.weightGramsDecimal).toBe("10.125");
    expect(
      preview.resolveMetalCalculationHolding({
        metal: "GOLD",
        weightGrams: "10.125",
        purityCode: "gold-999",
        preferredCurrency: "EGP",
      })?.weightGramsDecimal
    ).toBe("10.125");
    expect("createMetalHoldingLivePreview" in validation).toBe(false);
  });

  it("loads the preview service first without a partially initialized catalog", () => {
    const { validation, preview } = loadModulesInOrder([
      "preview",
      "validation",
    ]);

    expect(
      preview.createMetalHoldingLivePreview({
        holding: VALIDATED_HOLDING,
        valuation: { available: false, reason: "missing_rate" },
      })
    ).toEqual({
      holding: VALIDATED_HOLDING,
      valuation: { available: false, reason: "missing_rate" },
    });
    expect(validation.getPurityCatalogEntry("silver-925")).toEqual({
      code: "silver-925",
      catalogVersion: "1",
      factorDecimal: "0.925",
      labelKey: "purity_silver_925",
      displayLabel: "925",
      metal: "SILVER",
    });
    expect(validation.getSupportedMetalPurities("GOLD")).toHaveLength(10);
    expect("createMetalHoldingLivePreview" in validation).toBe(false);
  });
});

describe("createMetalHoldingLivePreview", () => {
  it("accepts only normalized validated facts and keeps an unavailable valuation explicit without blocking Add", () => {
    const validation = validateMetalHoldingForm(VALID_FORM, VALIDATION_CONTEXT);

    expect(validation.isValid).toBe(true);
    if (!validation.isValid || validation.normalized === null) {
      throw new Error("Expected the base Add form to be valid");
    }
    const preview = createMetalHoldingLivePreview({
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
