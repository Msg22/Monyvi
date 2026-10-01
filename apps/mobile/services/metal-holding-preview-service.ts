import {
  calculateCurrentQuotedMetalReferenceValue,
  compareDecimal,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  roundDecimal,
  serializeDecimal,
  type ExactDecimalValue,
} from "@monyvi/logic";

import {
  getPurityCatalogEntry,
  type MetalPhysicalForm,
  type NormalizedMetalHoldingFormData,
} from "../validation/metal-holding-form-validation";

export type MetalHoldingPreviewValuation =
  | { readonly available: true; readonly valueDecimal: string }
  | { readonly available: false; readonly reason: "missing_rate" };

export interface MetalHoldingLivePreviewInput {
  readonly holding: NormalizedMetalHoldingFormData;
  readonly valuation: MetalHoldingPreviewValuation;
}

export function createMetalHoldingLivePreview(
  input: MetalHoldingLivePreviewInput
): MetalHoldingLivePreviewInput {
  return Object.freeze({
    holding: input.holding,
    valuation: Object.freeze({ ...input.valuation }),
  });
}

export interface MetalHoldingPreviewRates {
  readonly metalUsdPerPureGramDecimal: string | null;
  readonly currencyUsdPerUnitDecimal: string | null;
  readonly egpUsdPerUnitDecimal?: string | null;
  readonly currencyMinorUnits: number;
  readonly rateFreshness?: "fresh" | "stale" | "unknown" | "unavailable";
  readonly rateSources?: readonly string[];
  readonly providerObservedAt?: Date | null;
}

export interface MetalHoldingPreviewDetails {
  readonly resultSincePurchaseDecimal: string | null;
  readonly resultDirection: "positive" | "negative" | "zero" | "unavailable";
  readonly purityPercentDecimal: string;
}

export function calculateMetalHoldingPreviewValuation(
  holding: NormalizedMetalHoldingFormData,
  rates: MetalHoldingPreviewRates
): MetalHoldingPreviewValuation {
  if (
    rates.metalUsdPerPureGramDecimal === null ||
    rates.currencyUsdPerUnitDecimal === null
  ) {
    return { available: false, reason: "missing_rate" };
  }

  const valuation = calculateCurrentQuotedMetalReferenceValue({
    metal: holding.metal,
    purityCode: holding.purity.code,
    weightGramsDecimal: holding.weightGramsDecimal,
    purityFactorDecimal: holding.purity.factorDecimal,
    metalUsdPerPureGramDecimal: rates.metalUsdPerPureGramDecimal,
    currencyUsdPerUnitDecimal: rates.currencyUsdPerUnitDecimal,
  });
  if (!valuation.available) {
    return { available: false, reason: "missing_rate" };
  }
  return {
    available: true,
    valueDecimal: valuation.valueDecimal,
  };
}

export function calculateMetalHoldingPreviewDetails(
  holding: NormalizedMetalHoldingFormData,
  valuation: MetalHoldingPreviewValuation,
  currencyMinorUnits: number
): MetalHoldingPreviewDetails {
  const purityPercentDecimal = roundDecimal(
    parseCanonicalDecimal(holding.purity.factorDecimal).times("100"),
    1
  );
  if (!valuation.available) {
    return {
      resultSincePurchaseDecimal: null,
      resultDirection: "unavailable",
      purityPercentDecimal,
    };
  }

  const resultSincePurchaseDecimal = roundDecimal(
    parseCanonicalDecimal(valuation.valueDecimal).minus(
      holding.purchasePriceDecimal
    ),
    currencyMinorUnits
  );
  const comparison = compareDecimal(resultSincePurchaseDecimal, "0");
  return {
    resultSincePurchaseDecimal,
    resultDirection:
      comparison > 0 ? "positive" : comparison < 0 ? "negative" : "zero",
    purityPercentDecimal,
  };
}

export interface ResolveMetalCalculationHoldingInput {
  readonly metal: string | null;
  readonly weightGrams: string;
  readonly purityCode: string | null;
  readonly purchasePrice?: string | null;
  readonly purchaseCurrency?: string | null;
  readonly preferredCurrency: string;
  readonly physicalForm?: string | null;
  readonly name?: string | null;
  readonly safeRange?: {
    readonly maximumWeightGramsDecimal: string;
    readonly maximumPurchasePriceDecimal: string;
  };
  readonly currencyMinorUnits?: number;
}

export function resolveMetalCalculationHolding(
  input: ResolveMetalCalculationHoldingInput
): NormalizedMetalHoldingFormData | null {
  const metal =
    input.metal === "GOLD" || input.metal === "SILVER" ? input.metal : null;
  if (!metal) return null;

  const purityEntry = input.purityCode
    ? getPurityCatalogEntry(input.purityCode)
    : null;
  if (!purityEntry || purityEntry.metal !== metal) return null;

  const rawWeight = input.weightGrams.trim();
  if (!rawWeight) return null;

  let weightDecimal: ExactDecimalValue;
  try {
    weightDecimal = parseCanonicalDecimal(rawWeight);
  } catch {
    return null;
  }
  if (weightDecimal.isZero() || !weightDecimal.greaterThan("0")) {
    return null;
  }

  const weightParts = rawWeight.split(".");
  if (weightParts.length > 2 || (weightParts[1] && weightParts[1].length > 3)) {
    return null;
  }
  const maxWeight = input.safeRange?.maximumWeightGramsDecimal ?? "100000";
  if (weightDecimal.greaterThan(maxWeight)) {
    return null;
  }
  const weightGramsDecimal = serializeDecimal(weightDecimal);

  const rawCurrency =
    input.purchaseCurrency?.trim() || input.preferredCurrency.trim();
  if (!isSupportedMetalsIsoCurrencyCode(rawCurrency)) {
    return null;
  }
  const purchaseCurrency = rawCurrency;

  const rawPrice = input.purchasePrice?.trim();
  let purchasePriceDecimal = "0";
  if (rawPrice && rawPrice.length > 0) {
    let priceDecimal: ExactDecimalValue;
    try {
      priceDecimal = parseCanonicalDecimal(rawPrice);
    } catch {
      return null;
    }
    if (!priceDecimal.greaterThanOrEqualTo("0")) {
      return null;
    }
    const maxMinorUnits = input.currencyMinorUnits ?? 2;
    const priceParts = rawPrice.split(".");
    if (
      priceParts.length > 2 ||
      (priceParts[1] && priceParts[1].length > maxMinorUnits)
    ) {
      return null;
    }
    const maxPrice =
      input.safeRange?.maximumPurchasePriceDecimal ?? "1000000000";
    if (priceDecimal.greaterThan(maxPrice)) {
      return null;
    }
    purchasePriceDecimal = serializeDecimal(priceDecimal);
  }

  const physicalForm: MetalPhysicalForm | null =
    input.physicalForm === "COIN" ||
    input.physicalForm === "BAR" ||
    input.physicalForm === "JEWELRY"
      ? input.physicalForm
      : null;

  return Object.freeze({
    name: input.name?.trim() ?? "",
    metal,
    weightGramsDecimal,
    purity: {
      code: purityEntry.code,
      catalogVersion: "1" as const,
      factorDecimal: purityEntry.factorDecimal,
      labelKey: purityEntry.labelKey,
    },
    purchasePriceDecimal,
    purchaseCurrency,
    purchaseDate: "",
    physicalForm,
    notes: null,
  });
}
