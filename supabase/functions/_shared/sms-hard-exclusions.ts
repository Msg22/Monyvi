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

const PRE_PARSER_SECURITY_CODE_PATTERNS = [
  /\bone[-\s]?time\s+password\b/i,
  /\b(?:verification|security)\s+code\b/i,
  /\botp(?:\s+(?:code|password))?\s*(?:(?:is|:|=|-)\s*)?\d{4,8}\b/i,
  /\bpin(?:\s+(?:code|number|reset))?\s*(?:(?:is|:|=|-)\s*)?\d{4,8}\b/i,
  /كلم[هة]\s*(?:المرور|السر)\s*لمر[هة]\s*واحد[هة]/u,
  /رمز\s*(?:التحقق|التاكيد|الامان)/u,
  /الرقم\s*(?:السري|الموقت|للتحقق)/u,
] as const;

const COMPLETED_FINANCIAL_MOVEMENT_PATTERNS = [
  /\b(?:payment|purchase|transaction|transfer|withdrawal|deposit|refund)\b[^.!?\n؟]{0,120}\b(?:completed|reversed|refunded)\b/i,
  /\b(?:card|account)\b[^.!?\n؟]{0,120}\b(?:was|has\s+been)\s+(?:used|charged|debited|credited)\b/i,
  /(?:^|\s)(?:تم|تمت)\s+(?:عملي[هة]\s+)?(?:خصم|دفع|تحويل|استلام|سحب|ايداع|شراء|استرداد)(?:\s|$)/u,
] as const;

const NON_TERMINAL_COMPLETION_PATTERN =
  /\b(?:(?:will|can|could|may|might|must|should)\s+be|to\s+be|(?:is|are)\s+being)\s+(?:completed|reversed|refunded)\b/i;

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

function findFirstSecurityCodeMarkerIndex(value: string): number {
  let firstMarkerIndex = -1;

  for (const pattern of PRE_PARSER_SECURITY_CODE_PATTERNS) {
    const markerIndex = value.search(pattern);
    if (
      markerIndex >= 0 &&
      (firstMarkerIndex < 0 || markerIndex < firstMarkerIndex)
    ) {
      firstMarkerIndex = markerIndex;
    }
  }

  return firstMarkerIndex;
}

function hasClearCompletedFinancialMovement(value: string): boolean {
  if (NON_TERMINAL_COMPLETION_PATTERN.test(value)) return false;

  return COMPLETED_FINANCIAL_MOVEMENT_PATTERNS.some((pattern) =>
    pattern.test(value)
  );
}

/**
 * Edge-runtime copy of the mobile hard-exclusion guard. Supabase local
 * development mounts only the supabase tree, so it cannot import packages/logic.
 */
export function isExcludedBeforeSmsParsingAtEdge(body: string): boolean {
  const normalizedBody = normalizeArabicForFiltering(body);
  if (
    PRE_PARSER_EXCLUDED_ARABIC_PHRASES.some((phrase) =>
      normalizedBody.includes(phrase)
    )
  ) {
    return true;
  }

  const securityCodeMarkerIndex =
    findFirstSecurityCodeMarkerIndex(normalizedBody);
  if (securityCodeMarkerIndex < 0) return false;

  return !hasClearCompletedFinancialMovement(
    normalizedBody.slice(0, securityCodeMarkerIndex)
  );
}
