/**
 * Shared localization helpers for currency display names.
 *
 * Currency names are presentation-only. ISO currency codes remain the stable
 * domain and persistence values, and `SUPPORTED_CURRENCIES` in
 * `@monyvi/logic` remains the authoritative source for membership, symbols,
 * and flags. The friendly names live in the mobile i18n catalogue under
 * `currency_names.<ISO_CODE>` (namespace `common`).
 *
 * Every UI surface that shows a full currency name MUST read it through
 * `getCurrencyName` so English and Arabic stay consistent. Surfaces that
 * intentionally show only the ISO code are not a localization target.
 *
 * @module currency-localization
 */

import { t } from "i18next";

import type { CurrencyType } from "@monyvi/db";

const CURRENCY_NAMES_NAMESPACE = "common";
const CURRENCY_NAMES_KEY_PREFIX = "currency_names";
const ENGLISH_LANGUAGE = "en";

/**
 * Resolve the localized, user-facing name for a currency code.
 *
 * Missing catalogue entries fall back to the ISO code so the UI never renders
 * an unrelated language's name. The ISO code is also the guaranteed fallback
 * when i18n has not finished initializing.
 *
 * @param currencyCode - ISO 4217 code (e.g. "EGP", "USD")
 * @param language - Optional explicit language override ("en" | "ar");
 *   defaults to the current i18n language
 * @returns The localized currency name, or the ISO code when unavailable
 */
export function getCurrencyName(
  currencyCode: CurrencyType,
  language?: string
): string {
  const key = `${CURRENCY_NAMES_KEY_PREFIX}.${currencyCode}`;
  const translated = language
    ? t(key, { ns: CURRENCY_NAMES_NAMESPACE, lng: language })
    : t(key, { ns: CURRENCY_NAMES_NAMESPACE });

  return translated === key ? currencyCode : translated;
}

/**
 * Decide whether a currency matches a user search query.
 *
 * A currency is discoverable by its ISO code, its localized name, and its
 * canonical English name (so "Egyptian Pound" still finds EGP while Arabic is
 * selected). Matching is case-insensitive and trims surrounding whitespace.
 *
 * @param currencyCode - ISO 4217 code to test
 * @param rawQuery - Raw search input
 * @returns True when the currency should be included in the results
 */
export function currencyMatchesQuery(
  currencyCode: CurrencyType,
  rawQuery: string
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return true;

  return (
    currencyCode.toLowerCase().includes(query) ||
    getCurrencyName(currencyCode, ENGLISH_LANGUAGE)
      .toLowerCase()
      .includes(query) ||
    getCurrencyName(currencyCode).toLowerCase().includes(query)
  );
}
