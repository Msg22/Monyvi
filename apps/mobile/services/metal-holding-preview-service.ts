import {
  calculateMetalReferenceValue,
  compareDecimal,
  parseCanonicalDecimal,
  roundDecimal,
} from "@monyvi/logic";

import type { NormalizedMetalHoldingFormData } from "../validation/metal-holding-form-validation";

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

  const valuation = calculateMetalReferenceValue({
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
    valueDecimal: roundDecimal(
      valuation.valueDecimal,
      rates.currencyMinorUnits
    ),
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
