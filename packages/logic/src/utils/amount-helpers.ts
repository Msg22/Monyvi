import type { CurrencyType } from "@monyvi/db";
import Decimal from "decimal.js";
import { getCurrencyPrecision } from "./currency";

/**
 * Formats a raw numeric string with commas for thousands separators,
 * preserving existing decimal components.
 */
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000;
export const MAX_BUDGET_AMOUNT = 999_999_999.99;

const COMPLETE_UNGROUPED_AMOUNT_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const COMPLETE_GROUPED_AMOUNT_PATTERN =
  /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const INTERMEDIATE_UNGROUPED_AMOUNT_PATTERN = /^(?:\d*(?:\.\d*)?|\.\d*)$/;
const INTERMEDIATE_GROUPED_AMOUNT_PATTERN =
  /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const NEGATIVE_AMOUNT_PATTERN = /^-(?:\d+(?:\.\d+)?|\.\d+)$/;
const STRICT_BUDGET_AMOUNT_PATTERN = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export interface StrictAmountParseOptions {
  readonly maxAmount?: number;
  readonly maxFractionDigits?: number;
}

export type StrictAmountParseFailureReason =
  | "required"
  | "invalid-format"
  | "not-positive"
  | "exceeds-maximum"
  | "exceeds-precision";

export type StrictAmountParseResult =
  | {
      readonly success: true;
      readonly amount: number;
      readonly canonical: string;
      readonly fractionDigits: number;
    }
  | {
      readonly success: false;
      readonly reason: StrictAmountParseFailureReason;
    };

export interface AmountInputChangeResult {
  readonly accepted: boolean;
  readonly value: string;
}

export function formatAmountInput(
  val: string,
  initialValue: string = ""
): string {
  if (!val) return initialValue;
  const parts = val.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function getFractionDigits(value: string): number {
  const decimalIndex = value.indexOf(".");
  return decimalIndex === -1 ? 0 : value.length - decimalIndex - 1;
}

/**
 * Parses a complete positive amount using Monyvi's shared amount grammar.
 *
 * Thousands separators are accepted only when they form valid three-digit
 * groups. The returned canonical value never contains grouping separators.
 * Domain-specific maximums and currency precision are supplied by the caller.
 */
export function parseStrictAmountInput(
  value: string,
  options: StrictAmountParseOptions = {}
): StrictAmountParseResult {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return { success: false, reason: "required" };
  }

  if (NEGATIVE_AMOUNT_PATTERN.test(normalized)) {
    return { success: false, reason: "not-positive" };
  }

  const hasValidGrammar =
    COMPLETE_UNGROUPED_AMOUNT_PATTERN.test(normalized) ||
    COMPLETE_GROUPED_AMOUNT_PATTERN.test(normalized);

  if (!hasValidGrammar) {
    return { success: false, reason: "invalid-format" };
  }

  const canonical = normalized.replace(/,/g, "");
  const fractionDigits = getFractionDigits(canonical);

  const decimalAmount = new Decimal(canonical);
  if (
    options.maxAmount !== undefined &&
    decimalAmount.greaterThan(options.maxAmount)
  ) {
    return { success: false, reason: "exceeds-maximum" };
  }

  if (
    options.maxFractionDigits !== undefined &&
    fractionDigits > options.maxFractionDigits
  ) {
    return { success: false, reason: "exceeds-precision" };
  }

  const amount = decimalAmount.toNumber();
  if (!Number.isFinite(amount)) {
    return { success: false, reason: "invalid-format" };
  }
  if (amount <= 0) {
    return { success: false, reason: "not-positive" };
  }

  return {
    success: true,
    amount,
    canonical,
    fractionDigits,
  };
}

function isSingleTextEdit(previousValue: string, nextValue: string): boolean {
  if (Math.abs(previousValue.length - nextValue.length) > 1) {
    return false;
  }

  let prefixLength = 0;
  const maxPrefixLength = Math.min(previousValue.length, nextValue.length);
  while (
    prefixLength < maxPrefixLength &&
    previousValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let previousSuffixIndex = previousValue.length - 1;
  let nextSuffixIndex = nextValue.length - 1;
  while (
    previousSuffixIndex >= prefixLength &&
    nextSuffixIndex >= prefixLength &&
    previousValue[previousSuffixIndex] === nextValue[nextSuffixIndex]
  ) {
    previousSuffixIndex -= 1;
    nextSuffixIndex -= 1;
  }

  const replacedPreviousLength = previousSuffixIndex - prefixLength + 1;
  const replacementLength = nextSuffixIndex - prefixLength + 1;
  return replacedPreviousLength <= 1 && replacementLength <= 1;
}

/**
 * Resolves a controlled text-input change without converting malformed pasted
 * content into a different numeric value.
 */
export function resolveAmountInputChange(
  text: string,
  previousValue: string = ""
): AmountInputChangeResult {
  if (INTERMEDIATE_UNGROUPED_AMOUNT_PATTERN.test(text)) {
    return { accepted: true, value: text };
  }

  if (INTERMEDIATE_GROUPED_AMOUNT_PATTERN.test(text)) {
    return { accepted: true, value: text.replace(/,/g, "") };
  }

  const formattedPreviousValue = formatAmountInput(previousValue);
  const ungroupedCandidate = text.replace(/,/g, "");
  const isEditOfFormattedValue =
    formattedPreviousValue.includes(",") &&
    isSingleTextEdit(formattedPreviousValue, text) &&
    INTERMEDIATE_UNGROUPED_AMOUNT_PATTERN.test(ungroupedCandidate);

  if (isEditOfFormattedValue) {
    return { accepted: true, value: ungroupedCandidate };
  }

  return {
    accepted: false,
    value: previousValue.length > 0 ? previousValue : text,
  };
}

/**
 * Backward-compatible adapter for controlled amount fields.
 *
 * Pass the current canonical value as `previousValue` so invalid input can be
 * rejected in-place. Callers that omit it preserve invalid text for correction
 * rather than silently repairing it.
 */
export function parseAmountInput(
  text: string,
  previousValue: string = ""
): string {
  return resolveAmountInputChange(text, previousValue).value;
}

export function parsePositiveFiniteAmountInput(value: string): number | null {
  const result = parseStrictAmountInput(value);
  return result.success ? result.amount : null;
}

/**
 * Parses a budget limit using the product's strict money grammar.
 *
 * This intentionally rejects grouping separators and scientific notation so a
 * pasted value cannot be partially interpreted as a different amount.
 */
export function parsePositiveMoneyAmount(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replace(/٫/g, ".");

  if (!STRICT_BUDGET_AMOUNT_PATTERN.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_BUDGET_AMOUNT
    ? amount
    : null;
}

export function isValidTransactionAmount(amount: number): boolean {
  return (
    Number.isFinite(amount) && amount > 0 && amount <= MAX_TRANSACTION_AMOUNT
  );
}

/**
 * Validates a numeric amount against the shared transaction maximum and the
 * selected currency's configured decimal precision.
 */
export function isValidCurrencyAmount(
  amount: number,
  currency: CurrencyType
): boolean {
  if (!isValidTransactionAmount(amount)) {
    return false;
  }

  try {
    return (
      new Decimal(amount.toString()).decimalPlaces() <=
      getCurrencyPrecision(currency)
    );
  } catch {
    return false;
  }
}
