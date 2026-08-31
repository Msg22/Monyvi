import Decimal from "decimal.js";

const CANONICAL_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/;
const ENGLISH_GROUPED_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d{0,2})(?:,\d{3})+(?:\.\d+)?$/;
const ARABIC_GROUPED_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d{0,2})(?:٬\d{3})+(?:٫\d+)?$/;
const AMBIGUOUS_SINGLE_COMMA_PATTERN = /^-?\d+,\d{3}$/;
const ARABIC_INDIC_ZERO = "٠".charCodeAt(0);
const InternalDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_EVEN,
});
const exactDecimalBrand: unique symbol = Symbol("ExactDecimalValue");

export const EXACT_DECIMAL_CONFIG = Object.freeze({
  precision: 50,
  rounding: "ROUND_HALF_EVEN",
} as const);

export type ExactDecimalInput = string | ExactDecimalValue;

export interface LocalizedDecimalContext {
  readonly decimalSeparator?: "." | ",";
}

export interface ExactDecimalValue {
  readonly [exactDecimalBrand]: true;
  plus(value: ExactDecimalInput): ExactDecimalValue;
  minus(value: ExactDecimalInput): ExactDecimalValue;
  times(value: ExactDecimalInput): ExactDecimalValue;
  dividedBy(value: ExactDecimalInput): ExactDecimalValue;
  negated(): ExactDecimalValue;
  absoluteValue(): ExactDecimalValue;
  isZero(): boolean;
  greaterThan(value: ExactDecimalInput): boolean;
  greaterThanOrEqualTo(value: ExactDecimalInput): boolean;
  lessThanOrEqualTo(value: ExactDecimalInput): boolean;
}

const decimalValues = new WeakMap<ExactDecimalValue, Decimal>();

class ImmutableExactDecimalValue implements ExactDecimalValue {
  public constructor(value: Decimal) {
    decimalValues.set(this, value);
    Object.freeze(this);
  }

  public readonly [exactDecimalBrand] = true as const;

  public plus(value: ExactDecimalInput): ExactDecimalValue {
    return wrapDecimal(readDecimal(this).plus(readInput(value)));
  }

  public minus(value: ExactDecimalInput): ExactDecimalValue {
    return wrapDecimal(readDecimal(this).minus(readInput(value)));
  }

  public times(value: ExactDecimalInput): ExactDecimalValue {
    return wrapDecimal(readDecimal(this).times(readInput(value)));
  }

  public dividedBy(value: ExactDecimalInput): ExactDecimalValue {
    return wrapDecimal(readDecimal(this).dividedBy(readInput(value)));
  }

  public negated(): ExactDecimalValue {
    return wrapDecimal(readDecimal(this).negated());
  }

  public absoluteValue(): ExactDecimalValue {
    return wrapDecimal(readDecimal(this).absoluteValue());
  }

  public isZero(): boolean {
    return readDecimal(this).isZero();
  }

  public greaterThan(value: ExactDecimalInput): boolean {
    return readDecimal(this).greaterThan(readInput(value));
  }

  public greaterThanOrEqualTo(value: ExactDecimalInput): boolean {
    return readDecimal(this).greaterThanOrEqualTo(readInput(value));
  }

  public lessThanOrEqualTo(value: ExactDecimalInput): boolean {
    return readDecimal(this).lessThanOrEqualTo(readInput(value));
  }
}

export function parseCanonicalDecimal(value: string): ExactDecimalValue {
  return wrapDecimal(parseCanonicalInternal(value));
}

export function parseLocalizedDecimal(
  value: string,
  context: LocalizedDecimalContext = {}
): ExactDecimalValue {
  if (typeof value !== "string") {
    throw new Error("Expected a localized decimal string");
  }

  const normalizedDigits = Array.from(value, normalizeLocalizedCharacter).join("");
  const withoutArabicGrouping = normalizeArabicGrouping(normalizedDigits);
  const withStandardDecimal = withoutArabicGrouping.replace("٫", ".");
  return parseCanonicalDecimal(
    normalizeEnglishSeparators(withStandardDecimal, context.decimalSeparator)
  );
}

export function serializeDecimal(value: ExactDecimalInput): string {
  return serializeInternal(readInput(value));
}

export function compareDecimal(
  left: ExactDecimalInput,
  right: ExactDecimalInput
): -1 | 0 | 1 {
  const comparison = readInput(left).comparedTo(readInput(right));

  if (comparison === null) {
    throw new Error("Cannot compare non-finite decimal values");
  }

  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function roundDecimal(
  value: ExactDecimalInput,
  decimalPlaces: number
): string {
  assertDecimalPlaces(decimalPlaces);
  return readInput(value)
    .toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_EVEN)
    .toFixed(decimalPlaces);
}

export function toMinorUnits(
  value: ExactDecimalInput,
  decimalPlaces: number
): string {
  assertDecimalPlaces(decimalPlaces);
  const scale = new InternalDecimal("10").pow(decimalPlaces);
  return readInput(value)
    .times(scale)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toFixed(0);
}

export function fromMinorUnits(value: string, decimalPlaces: number): string {
  assertDecimalPlaces(decimalPlaces);
  if (typeof value !== "string" || !INTEGER_PATTERN.test(value)) {
    throw new Error("Expected canonical integer minor units");
  }

  const scale = new InternalDecimal("10").pow(decimalPlaces);
  return serializeInternal(new InternalDecimal(value).dividedBy(scale));
}

function parseCanonicalInternal(value: string): Decimal {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_PATTERN.test(value)) {
    throw new Error("Expected a canonical plain decimal string");
  }

  return new InternalDecimal(value);
}

function readInput(value: ExactDecimalInput): Decimal {
  if (typeof value === "string") {
    return parseCanonicalInternal(value);
  }

  const decimal = decimalValues.get(value);
  if (decimal === undefined) {
    throw new Error("Expected a canonical decimal string or exact decimal value");
  }

  return decimal;
}

function readDecimal(value: ExactDecimalValue): Decimal {
  const decimal = decimalValues.get(value);
  if (decimal === undefined) {
    throw new Error("Invalid exact decimal value");
  }

  return decimal;
}

function wrapDecimal(value: Decimal): ExactDecimalValue {
  if (!value.isFinite()) {
    throw new Error("Expected a finite decimal value");
  }

  return new ImmutableExactDecimalValue(value);
}

function serializeInternal(value: Decimal): string {
  return value.isZero() ? "0" : value.toFixed();
}

function normalizeLocalizedCharacter(character: string): string {
  const codePoint = character.charCodeAt(0);
  if (codePoint >= ARABIC_INDIC_ZERO && codePoint <= ARABIC_INDIC_ZERO + 9) {
    return String(codePoint - ARABIC_INDIC_ZERO);
  }

  return character;
}

function normalizeArabicGrouping(value: string): string {
  if (!value.includes("٬")) {
    return value;
  }
  if (!ARABIC_GROUPED_DECIMAL_PATTERN.test(value)) {
    throw new Error("Expected valid Arabic thousands grouping");
  }

  return value.replaceAll("٬", "");
}

function normalizeEnglishSeparators(
  value: string,
  decimalSeparator: "." | "," | undefined
): string {
  if (!value.includes(",")) {
    return value;
  }

  const commaCount = value.split(",").length - 1;
  if (decimalSeparator === ",") {
    if (commaCount !== 1 || value.includes(".")) {
      throw new Error("Expected valid decimal-comma notation");
    }
    return value.replace(",", ".");
  }
  if (decimalSeparator === ".") {
    if (!ENGLISH_GROUPED_DECIMAL_PATTERN.test(value)) {
      throw new Error("Expected valid English thousands grouping");
    }
    return value.replaceAll(",", "");
  }
  if (commaCount === 1 && AMBIGUOUS_SINGLE_COMMA_PATTERN.test(value)) {
    throw new Error("Ambiguous single-comma decimal notation");
  }
  const usesGrouping = value.includes(".") || commaCount > 1;
  if (!usesGrouping) {
    return value.replace(",", ".");
  }
  if (!ENGLISH_GROUPED_DECIMAL_PATTERN.test(value)) {
    throw new Error("Expected valid English thousands grouping");
  }

  return value.replaceAll(",", "");
}

function assertDecimalPlaces(decimalPlaces: number): void {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new Error("Decimal places must be a non-negative integer");
  }
}
