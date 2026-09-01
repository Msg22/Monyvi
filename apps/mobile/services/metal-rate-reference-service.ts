import {
  validateAndNormalizeRateReference,
  type ExactRateReference,
  type RateReferenceExpectation,
} from "@monyvi/logic";

interface MetalRateReferenceCaptureIdentity {
  readonly id: string;
}

export type MetalRateReferenceCapture = MetalRateReferenceCaptureIdentity &
  ExactRateReference;

export interface MetalRateReferenceService {
  readonly capture: (
    reference: MetalRateReferenceCapture,
    expectation: RateReferenceExpectation
  ) => MetalRateReferenceCapture;
}

export function createMetalRateReferenceService(): MetalRateReferenceService {
  function capture(
    reference: MetalRateReferenceCapture,
    expectation: RateReferenceExpectation
  ): MetalRateReferenceCapture {
    const result = validateAndNormalizeRateReference(reference, expectation);
    if (!result.available) throw new Error("invalid_metal_rate_reference");
    return Object.freeze({
      ...reference,
      providerObservedAt: result.value.providerObservedAt,
      source: result.value.source,
      capturedFreshness: result.value.capturedFreshness,
    });
  }

  return Object.freeze({ capture });
}
