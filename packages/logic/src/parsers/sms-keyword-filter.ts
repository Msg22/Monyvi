/**
 * SMS Keyword Filter
 *
 * Lightweight on-device financial SMS filter. Replaces the heavy
 * `financial-sender-registry.ts` with a simple pattern-based approach.
 *
 * Checks if an SMS body is likely a financial transaction message by
 * detecting currency codes, amount patterns, and financial keywords.
 *
 * @module sms-keyword-filter
 */

// ---------------------------------------------------------------------------
// Currency patterns — ISO codes + Arabic equivalents
// ---------------------------------------------------------------------------

const CURRENCY_CODES = [
  "EGP",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "KWD",
  "LE",
  "L\\.E",
  "جنيه",
  "دولار",
  "ريال",
  "درهم",
];

// ---------------------------------------------------------------------------
// Financial keywords — English + Arabic
// ---------------------------------------------------------------------------

const FINANCIAL_KEYWORDS_EN = [
  "balance",
  "transaction",
  "debit",
  "credit",
  "transfer",
  "withdrawal",
  "deposit",
  "purchase",
  "payment",
  "paid",
  "received",
  "refund",
  "account",
  "card",
  "atm",
  "pos",
  "salary",
];

const FINANCIAL_KEYWORDS_AR = [
  "تحويل",
  "رصيد",
  "مبلغ",
  "سحب",
  "إيداع",
  "شراء",
  "دفع",
  "مستحق",
  "حسابك",
  "بطاقة",
  "عملية",
  "راتب",
  "حوالة",
  "فودافون كاش",
  "فوري",
];

// ---------------------------------------------------------------------------
// Compiled regex patterns
// ---------------------------------------------------------------------------

const CURRENCY_PATTERN = new RegExp(CURRENCY_CODES.join("|"), "i");

/** Matches a number (with optional commas/dots) near a currency code. */
const AMOUNT_WITH_CURRENCY = new RegExp(
  `(\\d[\\d,.]*)\\s*(?:${CURRENCY_CODES.join("|")})|(?:${CURRENCY_CODES.join(
    "|"
  )})\\s*(\\d[\\d,.]*)`,
  "i"
);

const FINANCIAL_KEYWORDS_PATTERN = new RegExp(
  [...FINANCIAL_KEYWORDS_EN, ...FINANCIAL_KEYWORDS_AR].join("|"),
  "i"
);

const PRE_PARSER_EXCLUDED_ARABIC_PHRASES = [
  "اكسب",
  "حجز",
  "ادفع",
  "اتبرع",
  "كاش باك",
  "موعد",
  "كهرباء",
  "غاز",
  "مياه",
] as const;

function normalizeArabicForFiltering(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks if an SMS body is likely a financial transaction message.
 *
 * Uses a lightweight heuristic:
 * 1. Currency code + amount pattern detected, OR
 * 2. Financial keyword detected AND a number is present
 *
 * @param body - The SMS body text to check
 * @returns `true` if the SMS is likely financial
 */
export function isLikelyFinancialSms(body: string): boolean {
  // Fast path: check for amount + currency pattern
  if (AMOUNT_WITH_CURRENCY.test(body)) {
    return true;
  }

  // Secondary check: financial keyword + any number present
  const hasNumber = /\d{2,}/.test(body);
  if (hasNumber && FINANCIAL_KEYWORDS_PATTERN.test(body)) {
    return true;
  }

  // Tertiary check: currency code alone with a number
  if (hasNumber && CURRENCY_PATTERN.test(body)) {
    return true;
  }

  return false;
}

/**
 * Returns true for explicit hard exclusions that must never reach either the
 * trusted local parser or the AI parser, regardless of sender trust.
 */
export function isExcludedBeforeSmsParsing(body: string): boolean {
  const normalizedBody = normalizeArabicForFiltering(body);
  return PRE_PARSER_EXCLUDED_ARABIC_PHRASES.some((phrase) =>
    normalizedBody.includes(phrase)
  );
}
