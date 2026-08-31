import {
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type CurrencyRateRole,
  type ExactRateReference,
  type MetalInstrumentCode,
  type MetalRateRole,
  type RateReferenceExpectation,
} from "@monyvi/logic";

interface MetalRateReferenceCaptureIdentity {
  readonly id: string;
}

export type MetalRateReferenceCapture = MetalRateReferenceCaptureIdentity &
  ExactRateReference;

export interface MetalRateReferenceService {
  readonly capture: (reference: MetalRateReferenceCapture) => MetalRateReferenceCapture;
}

export function createMetalRateReferenceService(): MetalRateReferenceService {
  function capture(reference: MetalRateReferenceCapture): MetalRateReferenceCapture {
    const expectation: RateReferenceExpectation =
      reference.kind === "metal"
        ? {
            role: reference.role as MetalRateRole,
            instrumentCode: reference.instrumentCode as MetalInstrumentCode,
          }
        : {
            role: reference.role as CurrencyRateRole,
            instrumentCode: reference.instrumentCode as CurrencyInstrumentCode,
          };
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
