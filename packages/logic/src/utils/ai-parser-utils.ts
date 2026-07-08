/**
 * AI Parser Utilities
 *
 * Shared pure functions used by both AI Voice and AI SMS parser services.
 * Extracted to eliminate code duplication and improve testability.
 *
 * Architecture & Design Rationale:
 * - Pattern: Utility Module (shared pure functions)
 * - Why: Eliminates 5 duplicated functions across 2 services; pure functions
 *   with no side effects are easily testable.
 * - SOLID: SRP (each function has one concern), DIP (both services depend on
 *   abstractions, not each other)
 * - Algorithm: O(1) Set.has() for type validation, O(1) Map.get() for category lookup
 *
 * @module ai-parser-utils
 */

import type { Category, CurrencyType, TransactionType } from "@monyvi/db";
import { SUPPORTED_CURRENCIES } from "./currency-data";

// Constants
// ---------------------------------------------------------------------------

// Derived from SUPPORTED_CURRENCIES so it stays in sync with CurrencyType
// automatically. No manual list to maintain.
const VALID_CURRENCIES: ReadonlySet<string> = new Set<CurrencyType>(
  SUPPORTED_CURRENCIES.map((c) => c.code)
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Map from category systemName to its display info.
 * Built once from the user's Category[] and passed into parseCategory.
 */
export type CategoryMap = Map<
  Category["systemName"],
  { readonly name: Category["displayName"]; readonly id: Category["id"] }
>;

export interface CategoryMapSource {
  readonly id: Category["id"];
  readonly systemName: Category["systemName"];
  readonly displayName: Category["displayName"];
}

/**
 * Result of resolving an AI-returned category against the user's CategoryMap.
 */
export interface ResolvedCategory {
  readonly id: Category["id"];
  readonly displayName: Category["displayName"];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid transaction types for AI parsing. */
export const VALID_TYPES: ReadonlySet<string> = new Set<TransactionType>([
  "EXPENSE",
  "INCOME",
]);

/** Regex to detect date-only strings (YYYY-MM-DD) without time component. */
export const DATE_ONLY_REGEX: RegExp = /^\d{4}-\d{2}-\d{2}$/;

/** Default category system name when AI returns an unknown category. */
const FALLBACK_CATEGORY_SYSTEM_NAME = "other";

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Normalize an AI-returned transaction type string.
 * Uppercases the input and validates against VALID_TYPES.
 *
 * @param raw - Raw type string from AI response
 * @returns Normalized TransactionType
 */
export function normalizeType(raw: string): TransactionType {
  const upper = raw.toUpperCase();
  if (VALID_TYPES.has(upper)) {
    return upper as TransactionType;
  }

  throw new Error(
    `[normalizeType] Invalid transaction type: "${raw}". Expected one of: ${Array.from(
      VALID_TYPES
    ).join(", ")}`
  );
}

/**
 * Parse an AI-returned date string into a Date object.
 *
 * Bare YYYY-MM-DD strings are treated as **local dates** (not UTC) to avoid
 * off-by-one day errors in positive UTC offset timezones (e.g., Egypt UTC+2).
 * Falls back to current timestamp if empty or unparseable.
 *
 * @param raw - Date string from AI response (ISO 8601 or YYYY-MM-DD)
 * @returns Parsed Date object
 */
export function parseAiDate(raw: string): Date {
  // Date-only strings: create in local timezone to avoid UTC midnight shift
  if (DATE_ONLY_REGEX.test(raw.trim())) {
    const [yearStr, monthStr, dayStr] = raw.trim().split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1; // JS months are 0-indexed
    const day = Number(dayStr);
    const localDate = new Date(year, month, day);

    // Guard against silent date rollover (e.g., Feb 31 → March 3).
    // new Date(2025, 1, 31) is "valid" (non-NaN) but silently becomes March 3.
    const isValidCalendarDate =
      !isNaN(localDate.getTime()) &&
      localDate.getFullYear() === year &&
      localDate.getMonth() === month &&
      localDate.getDate() === day;

    if (isValidCalendarDate) {
      return localDate;
    }
    return new Date();
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

/**
 * Clamp a confidence score to the [0, 1] range.
 *
 * @param score - Raw confidence score from AI response
 * @returns Clamped score between 0 and 1
 */
export function clampConfidence(score: number): number {
  return Math.min(1, Math.max(0, score));
}

export function normalizeCurrency(raw: string): CurrencyType {
  const upper = raw.toUpperCase();
  if (VALID_CURRENCIES.has(upper)) {
    return upper as CurrencyType;
  }

  throw new Error(
    `[normalizeCurrency] Invalid currency: "${raw}". Expected one of: ${Array.from(
      VALID_CURRENCIES
    ).join(", ")}`
  );
}

/**
 * Lenient currency normalization for AI-detected currencies.
 *
 * Unlike `normalizeCurrency`, this variant returns a fallback value
 * instead of throwing when the input is invalid or unrecognised.
 * This is critical for voice parsing where the AI may return
 * free-form currency names (e.g., "Egyptian Pounds") rather than
 * ISO 4217 codes.
 *
 * @param raw - Raw currency string from AI response
 * @param fallback - Default currency to return on invalid input
 * @returns Validated CurrencyType or fallback
 */
export function normalizeCurrencySafe(
  raw: string,
  fallback: CurrencyType
): CurrencyType {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const upper = raw.trim().toUpperCase();
  if (VALID_CURRENCIES.has(upper)) {
    return upper as CurrencyType;
  }
  return fallback;
}

/**
 * Validate and normalize an AI-returned category system_name.
 *
 * Looks up the category in the user's CategoryMap. Falls back to "other"
 * if the AI returned an unknown category. Throws if the "other" fallback
 * category is missing from the map — this indicates a corrupt database.
 *
 * @param systemName - Category system_name from AI response
 * @param categoryMap - User's CategoryMap built from their Category[]
 * @returns Resolved category with id and displayName
 * @throws Error if the "other" fallback category is not in the map
 */
export function parseCategory(
  systemName: string,
  categoryMap: CategoryMap
): ResolvedCategory {
  const directMatch = categoryMap.get(systemName);
  if (directMatch) {
    return { id: directMatch.id, displayName: directMatch.name };
  }

  const fallback = categoryMap.get(FALLBACK_CATEGORY_SYSTEM_NAME);
  if (fallback) {
    return { id: fallback.id, displayName: fallback.name };
  }

  throw new Error(
    `[parseCategory] Fallback category "${FALLBACK_CATEGORY_SYSTEM_NAME}" not found in CategoryMap. ` +
      "This likely indicates a corrupted or incomplete database — the 'other' category must always exist."
  );
}

/**
 * Build a CategoryMap from a readonly array of Category objects.
 * Used to create the lookup map once before processing a batch of transactions.
 *
 * @param categories - User's categories from the database
 * @returns CategoryMap for O(1) category lookups
 */
export function buildCategoryMap(
  categories: readonly CategoryMapSource[]
): CategoryMap {
  const map: CategoryMap = new Map();
  for (const cat of categories) {
    map.set(cat.systemName, { name: cat.displayName, id: cat.id });
  }
  return map;
}
