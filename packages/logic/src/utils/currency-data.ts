/**
 * Currency metadata for the 35 supported currencies.
 * Used by the currency picker component for display.
 */

import type { CurrencyType } from "@monyvi/db";

export interface CurrencyInfo {
  readonly code: CurrencyType;
  readonly name: string;
  readonly symbol: string;
  /** ISO 3166-1 emoji flag (for countries) or icon name */
  readonly flag: string;
}

/**
 * All 35 supported currencies with display metadata.
 */
export const SUPPORTED_CURRENCIES: readonly CurrencyInfo[] = [
  // Middle East & North Africa (target users)
  { code: "EGP", name: "Egyptian Pound", symbol: "EGP", flag: "🇪🇬" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", flag: "🇸🇦" },
  { code: "AED", name: "UAE Dirham", symbol: "AED", flag: "🇦🇪" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KWD", flag: "🇰🇼" },
  { code: "QAR", name: "Qatari Riyal", symbol: "QAR", flag: "🇶🇦" },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BHD", flag: "🇧🇭" },
  { code: "OMR", name: "Omani Rial", symbol: "OMR", flag: "🇴🇲" },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JOD", flag: "🇯🇴" },
  { code: "IQD", name: "Iraqi Dinar", symbol: "IQD", flag: "🇮🇶" },
  { code: "LYD", name: "Libyan Dinar", symbol: "LYD", flag: "🇱🇾" },
  { code: "TND", name: "Tunisian Dinar", symbol: "TND", flag: "🇹🇳" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", flag: "🇲🇦" },
  { code: "DZD", name: "Algerian Dinar", symbol: "DZD", flag: "🇩🇿" },

  // Major global currencies
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },

  // Asia-Pacific
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { code: "KRW", name: "South Korean Won", symbol: "₩", flag: "🇰🇷" },
  { code: "KPW", name: "North Korean Won", symbol: "₩", flag: "🇰🇵" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", flag: "🇭🇰" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "MYR", flag: "🇲🇾" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿" },

  // Americas
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },

  // Europe (non-EUR)
  { code: "SEK", name: "Swedish Krona", symbol: "SEK", flag: "🇸🇪" },
  { code: "NOK", name: "Norwegian Krone", symbol: "NOK", flag: "🇳🇴" },
  { code: "DKK", name: "Danish Krone", symbol: "DKK", flag: "🇩🇰" },
  { code: "ISK", name: "Icelandic Króna", symbol: "ISK", flag: "🇮🇸" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", flag: "🇹🇷" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", flag: "🇷🇺" },

  // Africa
  { code: "ZAR", name: "South African Rand", symbol: "ZAR", flag: "🇿🇦" },
] as const;

/**
 * Union of the ISO codes that Monyvi actually supports and that have display
 * metadata / localized catalogue entries. `CurrencyType` (the persisted,
 * Supabase-generated union) also carries codes such as `BTC` that are handled
 * outside the supported fiat list, so they are excluded here.
 *
 * Invariant: every `SUPPORTED_CURRENCIES` code is a `SupportedCurrencyCode`.
 * The currency catalogue completeness test guards the reverse direction.
 */
export type SupportedCurrencyCode = Exclude<CurrencyType, "BTC">;

export const SORTED_SUPPORTED_CURRENCIES = [...SUPPORTED_CURRENCIES].sort(
  (a, b) => a.code.localeCompare(b.code)
);

/**
 * Lookup map for quick access by currency code.
 */
export const CURRENCY_INFO_MAP: Readonly<
  Record<CurrencyType, CurrencyInfo | undefined>
> = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, c])) as Record<
  CurrencyType,
  CurrencyInfo | undefined
>;

// ---------------------------------------------------------------------------
// Timezone → Currency lookup (IANA timezone → ISO 4217)
// ---------------------------------------------------------------------------

/**
 * Maps IANA timezone identifiers to their primary ISO 4217 currency code.
 *
 * Used to **suggest** (sort to top, pre-select) the most likely currency
 * in the onboarding picker. Not used for auto-detection or account creation.
 *
 * Only includes timezones whose countries have currencies in SUPPORTED_CURRENCIES.
 */
export const TIMEZONE_TO_CURRENCY: Readonly<Record<string, CurrencyType>> = {
  // Middle East & North Africa (target market)
  "Africa/Cairo": "EGP",
  "Asia/Riyadh": "SAR",
  "Asia/Dubai": "AED",
  "Asia/Kuwait": "KWD",
  "Asia/Qatar": "QAR",
  "Asia/Bahrain": "BHD",
  "Asia/Muscat": "OMR",
  "Asia/Amman": "JOD",
  "Asia/Baghdad": "IQD",
  "Africa/Tripoli": "LYD",
  "Africa/Tunis": "TND",
  "Africa/Casablanca": "MAD",
  "Africa/Algiers": "DZD",

  // Major global
  "America/New_York": "USD",
  "America/Chicago": "USD",
  "America/Denver": "USD",
  "America/Los_Angeles": "USD",
  "America/Anchorage": "USD",
  "Pacific/Honolulu": "USD",
  "Europe/London": "GBP",
  "Asia/Tokyo": "JPY",
  "Europe/Zurich": "CHF",

  // Eurozone
  "Europe/Berlin": "EUR",
  "Europe/Paris": "EUR",
  "Europe/Rome": "EUR",
  "Europe/Madrid": "EUR",
  "Europe/Amsterdam": "EUR",
  "Europe/Brussels": "EUR",
  "Europe/Vienna": "EUR",
  "Europe/Lisbon": "EUR",
  "Europe/Helsinki": "EUR",
  "Europe/Dublin": "EUR",
  "Europe/Athens": "EUR",
  "Europe/Luxembourg": "EUR",

  // Asia-Pacific
  "Asia/Shanghai": "CNY",
  "Asia/Kolkata": "INR",
  "Asia/Seoul": "KRW",
  "Asia/Pyongyang": "KPW",
  "Asia/Singapore": "SGD",
  "Asia/Hong_Kong": "HKD",
  "Asia/Kuala_Lumpur": "MYR",
  "Australia/Sydney": "AUD",
  "Australia/Melbourne": "AUD",
  "Australia/Perth": "AUD",
  "Pacific/Auckland": "NZD",

  // Americas
  "America/Toronto": "CAD",
  "America/Vancouver": "CAD",

  // Europe (non-EUR)
  "Europe/Stockholm": "SEK",
  "Europe/Oslo": "NOK",
  "Europe/Copenhagen": "DKK",
  "Atlantic/Reykjavik": "ISK",
  "Europe/Istanbul": "TRY",
  "Europe/Moscow": "RUB",

  // Africa
  "Africa/Johannesburg": "ZAR",
};
