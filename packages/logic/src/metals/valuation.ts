import {
  hasCanonicalDecimalPrecision,
  parseCanonicalDecimal,
  serializeDecimal,
  type ExactDecimalValue,
} from "./decimal";
import {
  resolvePuritySelection,
  type SupportedMetal,
} from "./purity-catalog";
import {
  validateAndNormalizeRateReference,
  type ExactRateReference,
} from "./rate-reference";

export type { ExactRateReference } from "./rate-reference";

export type Availability<T, Reason extends string> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false; readonly reason: Reason };

export type ExactValueUnavailableReason =
  | "invalid_weight"
  | "invalid_purity"
  | "invalid_metal_rate"
  | "invalid_currency_rate";

export type RateNormalizationUnavailableReason = "invalid_rate";

export type ExactValueAvailability =
  | { readonly available: true; readonly valueDecimal: string }
  | {
      readonly available: false;
      readonly reason: ExactValueUnavailableReason;
    };

export interface PureGramInput {
  readonly weightGramsDecimal: string;
  readonly purityFactorDecimal: string;
}

export interface MetalReferenceValueInput extends PureGramInput {
  readonly metalUsdPerPureGramDecimal: string;
  readonly currencyUsdPerUnitDecimal: string;
}

export interface CurrentQuotedMetalReferenceValueInput
  extends MetalReferenceValueInput {
  readonly metal: SupportedMetal;
  readonly purityCode: string;
}

export function calculatePureGrams(
  input: PureGramInput
): ExactValueAvailability {
  const weight = weightDecimal(input.weightGramsDecimal);
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
  const weight = weightDecimal(input.weightGramsDecimal);
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

/**
 * Applies the approved current selected-quote basis without changing persisted
 * purity evidence. Gold `gold-999` keeps its recorded 0.999 factor, but the
 * selected quoted 24K gram rate is not multiplied by 0.999 a second time.
 */
export function calculateCurrentQuotedMetalReferenceValue(
  input: CurrentQuotedMetalReferenceValueInput
): ExactValueAvailability {
  const purity = resolvePuritySelection(input.metal, input.purityCode);
  if (
    !purity.available ||
    purity.entry.factorDecimal !== input.purityFactorDecimal
  ) {
    return { available: false, reason: "invalid_purity" };
  }

  return calculateMetalReferenceValue({
    weightGramsDecimal: input.weightGramsDecimal,
    purityFactorDecimal:
      input.metal === "GOLD" && input.purityCode === "gold-999"
        ? "1"
        : input.purityFactorDecimal,
    metalUsdPerPureGramDecimal: input.metalUsdPerPureGramDecimal,
    currencyUsdPerUnitDecimal: input.currencyUsdPerUnitDecimal,
  });
}

export function calculatePurityGramPriceDecimal(input: {
  readonly purityFactorDecimal: string;
  readonly metalUsdPerPureGramDecimal: string;
  readonly currencyUsdPerUnitDecimal: string;
}): string | null {
  const result = calculateMetalReferenceValue({
    weightGramsDecimal: "1",
    purityFactorDecimal: input.purityFactorDecimal,
    metalUsdPerPureGramDecimal: input.metalUsdPerPureGramDecimal,
    currencyUsdPerUnitDecimal: input.currencyUsdPerUnitDecimal,
  });
  return result.available ? result.valueDecimal : null;
}

export function calculateCurrentQuotedPurityGramPriceDecimal(input: {
  readonly metal: SupportedMetal;
  readonly purityCode: string;
  readonly purityFactorDecimal: string;
  readonly metalUsdPerPureGramDecimal: string;
  readonly currencyUsdPerUnitDecimal: string;
}): string | null {
  const result = calculateCurrentQuotedMetalReferenceValue({
    metal: input.metal,
    purityCode: input.purityCode,
    weightGramsDecimal: "1",
    purityFactorDecimal: input.purityFactorDecimal,
    metalUsdPerPureGramDecimal: input.metalUsdPerPureGramDecimal,
    currencyUsdPerUnitDecimal: input.currencyUsdPerUnitDecimal,
  });
  return result.available ? result.valueDecimal : null;
}

/**
 * Converts a USD-per-pure-gram metal rate into a per-pure-gram price in the
 * display currency. Returns null when conversion would require fabricating an
 * FX input: missing metal rate, missing/unsupported display currency, or a
 * missing non-USD currency rate. USD display needs no FX lookup because USD is
 * the exact identity rate.
 */
export function calculateDisplayPerPureGramPrice(input: {
  readonly metalUsdPerPureGramDecimal: string | null;
  readonly currencyUsdPerUnitDecimal: string | null;
  readonly displayCurrency: string | undefined;
}): string | null {
  const metalRate = input.metalUsdPerPureGramDecimal;
  const displayCurrency = input.displayCurrency;
  if (metalRate === null || displayCurrency === undefined) return null;
  if (positiveDecimal(metalRate) === null) return null;
  if (displayCurrency === "USD") return metalRate;
  const currencyRate = input.currencyUsdPerUnitDecimal;
  if (currencyRate === null) return null;
  const result = calculateMetalReferenceValue({
    weightGramsDecimal: "1",
    purityFactorDecimal: "1",
    metalUsdPerPureGramDecimal: metalRate,
    currencyUsdPerUnitDecimal: currencyRate,
  });
  return result.available ? result.valueDecimal : null;
}

export function normalizeUsdPerUnitRate(
  reference: ExactRateReference
): Availability<string, RateNormalizationUnavailableReason> {
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

function weightDecimal(value: string): ExactDecimalValue | null {
  return hasCanonicalDecimalPrecision(value)
    ? positiveDecimal(value, 3)
    : null;
}

function normalizedPurity(value: string): ExactDecimalValue | null {
  const purity = positiveDecimal(value, 6);
  return purity !== null && purity.lessThanOrEqualTo("1") ? purity : null;
}

function hasAtMostDecimalPlaces(value: string, maximum: number): boolean {
  const decimalPart = value.split(".")[1];
  return decimalPart === undefined || decimalPart.length <= maximum;
}
