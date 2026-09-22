/**
 * Centralized money display policy.
 *
 * Architecture & Design Rationale:
 * - Pattern: Single authoritative formatter for user-facing money amounts.
 * - Why: Money values must render consistently across the whole app. The
 *   contract is:
 *     1. If every displayed fractional digit is zero, omit the fraction
 *        (`35,500.00` -> `35,500`).
 *     2. If any fractional digit is non-zero, retain the currency's normal
 *        precision (`35,500.01` -> `35,500.01`, `35,500.10` -> `35,500.10`).
 * - Canonical financial decimal strings never pass through binary floating
 *   point; they are rounded and formatted with `decimal.js`.
 * - SOLID: SRP — this module owns display formatting only. Persisted values,
 *   calculations, sync payloads, and editable form values are untouched.
 *
 * Retained fixed-precision exceptions (intentionally outside this policy):
 * - Exchange rates (`formatExchangeRate`, `formatRate`) keep their rate contract.
 * - Cross-currency conversion previews (`formatConversionPreview`) stay anchored
 *   to the rate's fixed 2-decimal precision.
 * - Percentages use their own formatting.
 * - Editable form inputs and budget-form previews keep their input grammar.
 * - Budget pace projection rounding is a calculation, not a display policy.
 * - Value/validation precision stays on `getCurrencyPrecision`; this module owns
 *   display precision only.
 *
 * @module money-display
 */

import type { CurrencyType } from "@monyvi/db";
import Decimal from "decimal.js";

/** Canonical plain base-10 decimal string, matching the metals exact-decimal grammar. */
const CANONICAL_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** High-precision, half-even decimal so display rounding cannot drift. */
const DisplayDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_EVEN,
});

const DEFAULT_LOCALE = "en-US";
const DEFAULT_PRECISION = 2;
const BTC_PRECISION = 8;

/** Zero-decimal currencies (ISO 4217 exponent 0). */
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<CurrencyType> = new Set([
  "ISK",
  "JPY",
  "KRW",
  "KPW",
]);

/** Three-decimal currencies (ISO 4217 exponent 3). */
const THREE_DECIMAL_CURRENCIES: ReadonlySet<CurrencyType> = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

export type MoneyDisplaySignDisplay =
  | "always"
  | "exceptZero"
  | "negative"
  | "never"
  | "auto";

export interface FormatMoneyAmountOptions {
  readonly currency: CurrencyType;
  readonly locale?: string;
  readonly signDisplay?: MoneyDisplaySignDisplay;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

interface LocaleNumberParts {
  readonly groupSeparator: string;
  readonly decimalSeparator: string;
  readonly minusSign: string;
  readonly digits: readonly string[];
  readonly primaryGroupSize: number;
  readonly secondaryGroupSize: number;
}

const localeNumberPartsCache = new Map<string, LocaleNumberParts>();

/**
 * Resolves the authoritative user-facing decimal precision for a currency.
 * This is the display precision only; value/validation precision stays on
 * `getCurrencyPrecision`.
 */
export function getCurrencyDisplayPrecision(currency: CurrencyType): number {
  if (currency === "BTC") return BTC_PRECISION;
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return DEFAULT_PRECISION;
}

/**
 * Formats a money amount for display using the centralized policy.
 *
 * Accepts either a numeric value or a canonical plain decimal string. Canonical
 * strings are never coerced through `Number`, so high-precision evidence keeps
 * every significant digit.
 *
 * @returns The localized number (grouping, digits, sign) without a currency
 *   symbol or code. Callers apply currency placement via the currency helpers.
 */
export function formatMoneyAmount(
  value: number | string,
  options: FormatMoneyAmountOptions
): string {
  if (typeof value === "number") {
    return formatNumericAmount(value, options);
  }
  return formatCanonicalAmount(value, options);
}

function formatNumericAmount(
  value: number,
  options: FormatMoneyAmountOptions
): string {
  const precision = getCurrencyDisplayPrecision(options.currency);
  const amount = value || 0;
  const digits = resolveFractionDigits(
    hasNonZeroFractionAtPrecision(amount, precision),
    precision,
    options
  );

  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    minimumFractionDigits: digits.minimum,
    maximumFractionDigits: digits.maximum,
    signDisplay: options.signDisplay ?? "auto",
  }).format(amount);
}

function formatCanonicalAmount(
  value: string,
  options: FormatMoneyAmountOptions
): string {
  if (!CANONICAL_DECIMAL_PATTERN.test(value)) {
    throw new Error("Expected a canonical plain decimal string");
  }

  const decimal = new DisplayDecimal(value);
  if (!decimal.isFinite()) {
    throw new Error("Expected a finite decimal value");
  }

  const precision = getCurrencyDisplayPrecision(options.currency);
  const digits = resolveFractionDigits(
    hasNonZeroDecimalFractionAtPrecision(decimal, precision),
    precision,
    options
  );

  const fixed = decimal.toDecimalPlaces(digits.maximum, Decimal.ROUND_HALF_EVEN);
  const isNegative = fixed.isNegative() && !fixed.isZero();
  const fixedString = fixed.absoluteValue().toFixed(digits.maximum);
  const [integerDigits, rawFraction = ""] = fixedString.split(".");
  const fractionDigits = trimFractionToMinimum(rawFraction, digits.minimum);

  const parts = resolveLocaleNumberParts(options.locale ?? DEFAULT_LOCALE);
  const groupedInteger = groupIntegerDigits(integerDigits, parts);
  const localizedInteger = localizeDigits(groupedInteger, parts.digits);
  const localizedFraction = localizeDigits(fractionDigits, parts.digits);

  const sign = resolveSign(isNegative, fixed.isZero(), options.signDisplay);
  const fractionSuffix =
    localizedFraction.length === 0
      ? ""
      : `${parts.decimalSeparator}${localizedFraction}`;

  return `${sign}${localizedInteger}${fractionSuffix}`;
}

function resolveFractionDigits(
  hasNonZeroFraction: boolean,
  precision: number,
  options: FormatMoneyAmountOptions
): { readonly minimum: number; readonly maximum: number } {
  const maximum = options.maximumFractionDigits ?? precision;
  const inferredMinimum = hasNonZeroFraction ? precision : 0;
  const minimum =
    options.minimumFractionDigits ?? Math.min(inferredMinimum, maximum);
  return { minimum, maximum };
}

function resolveSign(
  isNegative: boolean,
  isZero: boolean,
  signDisplay: MoneyDisplaySignDisplay | undefined
): string {
  const display = signDisplay ?? "auto";
  if (isNegative) {
    return display === "never" ? "" : "-";
  }
  if (display === "always") {
    return "+";
  }
  if (display === "exceptZero" && !isZero) {
    return "+";
  }
  return "";
}

function hasNonZeroFractionAtPrecision(
  amount: number,
  precision: number
): boolean {
  const factor = 10 ** precision;
  const roundedMinorUnits = Math.round(Math.abs(amount) * factor);
  return roundedMinorUnits % factor !== 0;
}

function hasNonZeroDecimalFractionAtPrecision(
  value: Decimal,
  precision: number
): boolean {
  const rounded = value.absoluteValue().toDecimalPlaces(
    precision,
    Decimal.ROUND_HALF_EVEN
  );
  return !rounded.minus(rounded.floor()).isZero();
}

function trimFractionToMinimum(
  fraction: string,
  minimumFractionDigits: number
): string {
  if (fraction.length <= minimumFractionDigits) {
    return fraction;
  }

  let end = fraction.length;
  while (end > minimumFractionDigits && fraction[end - 1] === "0") {
    end -= 1;
  }
  return fraction.slice(0, end);
}

function resolveLocaleNumberParts(locale: string): LocaleNumberParts {
  const cached = localeNumberPartsCache.get(locale);
  if (cached) {
    return cached;
  }

  const parts = new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).formatToParts(1234567890123);
  const integerRuns = parts
    .filter((part) => part.type === "integer")
    .map((part) => part.value);

  const primaryGroupSize = integerRuns.at(-1)?.length ?? 3;
  const secondaryGroupSize =
    integerRuns.length >= 2 ? (integerRuns.at(-2)?.length ?? 3) : primaryGroupSize;

  const digitFormatter = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 0,
  });
  const digits = Array.from({ length: 10 }, (_, digit) =>
    digitFormatter.format(digit)
  );

  const groupSeparator =
    parts.find((part) => part.type === "group")?.value ?? ",";
  const decimalSeparator =
    new Intl.NumberFormat(locale).formatToParts(1.1).find(
      (part) => part.type === "decimal"
    )?.value ?? ".";
  const minusSign =
    new Intl.NumberFormat(locale).formatToParts(-1).find(
      (part) => part.type === "minusSign"
    )?.value ?? "-";

  const resolved: LocaleNumberParts = {
    groupSeparator,
    decimalSeparator,
    minusSign,
    digits,
    primaryGroupSize,
    secondaryGroupSize,
  };
  localeNumberPartsCache.set(locale, resolved);
  return resolved;
}

function groupIntegerDigits(
  integerDigits: string,
  parts: LocaleNumberParts
): string {
  if (integerDigits.length <= parts.primaryGroupSize) {
    return integerDigits;
  }

  const groups: string[] = [];
  let end = integerDigits.length;
  let size = parts.primaryGroupSize;
  while (end > 0) {
    const start = Math.max(0, end - size);
    groups.unshift(integerDigits.slice(start, end));
    end = start;
    size = parts.secondaryGroupSize;
  }
  return groups.join(parts.groupSeparator);
}

function localizeDigits(value: string, digits: readonly string[]): string {
  return Array.from(value, (character) => {
    const digit = character.charCodeAt(0) - 48;
    return digit >= 0 && digit <= 9 ? (digits[digit] ?? character) : character;
  }).join("");
}
