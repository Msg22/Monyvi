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
