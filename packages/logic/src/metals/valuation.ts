import {
  parseCanonicalDecimal,
  serializeDecimal,
  type ExactDecimalValue,
} from "./decimal";
import {
  validateAndNormalizeRateReference,
  type ExactRateReference,
} from "./rate-reference";

export type { ExactRateReference } from "./rate-reference";

export type Availability<T> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false; readonly reason: string };

export type ExactValueAvailability =
  | { readonly available: true; readonly valueDecimal: string }
  | { readonly available: false; readonly reason: string };

export interface PureGramInput {
  readonly weightGramsDecimal: string;
  readonly purityFactorDecimal: string;
}

export interface MetalReferenceValueInput extends PureGramInput {
  readonly metalUsdPerPureGramDecimal: string;
  readonly currencyUsdPerUnitDecimal: string;
}

export function calculatePureGrams(
  input: PureGramInput
): ExactValueAvailability {
  const weight = positiveDecimal(input.weightGramsDecimal, 3);
  if (weight === null) {
    return { available: false, reason: "invalid_weight" };
  }
  const purity = normalizedPurity(input.purityFactorDecimal);
  if (purity === null) {
    return { available: false, reason: "invalid_purity" };
  }

  return {
    available: true,
    valueDecimal: serializeDecimal(weight.times(purity)),
  };
}

export function calculateMetalReferenceValue(
  input: MetalReferenceValueInput
): ExactValueAvailability {
  const weight = positiveDecimal(input.weightGramsDecimal, 3);
  if (weight === null) {
    return { available: false, reason: "invalid_weight" };
  }
  const purity = normalizedPurity(input.purityFactorDecimal);
  if (purity === null) {
    return { available: false, reason: "invalid_purity" };
  }
  const metalRate = positiveDecimal(input.metalUsdPerPureGramDecimal);
  if (metalRate === null) {
    return { available: false, reason: "invalid_metal_rate" };
  }
  const currencyRate = positiveDecimal(input.currencyUsdPerUnitDecimal);
  if (currencyRate === null) {
    return { available: false, reason: "invalid_currency_rate" };
  }

  const value = weight.times(purity).times(metalRate).dividedBy(currencyRate);
  return { available: true, valueDecimal: serializeDecimal(value) };
}

export function normalizeUsdPerUnitRate(
  reference: ExactRateReference
): Availability<string> {
  const normalized = reference.kind === "metal"
    ? validateAndNormalizeRateReference(reference, {
        role: reference.role,
        instrumentCode: reference.instrumentCode,
      })
    : validateAndNormalizeRateReference(reference, {
        role: reference.role,
        instrumentCode: reference.instrumentCode,
      });
  if (!normalized.available) {
    return { available: false, reason: "invalid_rate" };
  }
  return {
    available: true,
    value: normalized.value.normalizedUsdPerBaseDecimal,
  };
}

function positiveDecimal(
  value: string,
  maximumDecimalPlaces?: number
): ExactDecimalValue | null {
  try {
    if (
      maximumDecimalPlaces !== undefined &&
      !hasAtMostDecimalPlaces(value, maximumDecimalPlaces)
    ) {
      return null;
    }
    const decimal = parseCanonicalDecimal(value);
    return decimal.greaterThan("0") ? decimal : null;
  } catch {
    return null;
  }
}

function normalizedPurity(value: string): ExactDecimalValue | null {
  const purity = positiveDecimal(value, 6);
  return purity !== null && purity.lessThanOrEqualTo("1") ? purity : null;
}

function hasAtMostDecimalPlaces(value: string, maximum: number): boolean {
  const decimalPart = value.split(".")[1];
  return decimalPart === undefined || decimalPart.length <= maximum;
}
