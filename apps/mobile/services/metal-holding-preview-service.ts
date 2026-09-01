import { calculateMetalReferenceValue, roundDecimal } from "@monyvi/logic";

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
