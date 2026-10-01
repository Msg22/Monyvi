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
  /\botp\b/i,
  /\bone[-\s]?time\s+password\b/i,
  /\bverification\s+code\b/i,
  /\bsecurity\s+code\b/i,
  /\bpin\b/i,
  /كلمه\s*(?:المرور|السر)\s*لمره\s*واحده/u,
  /رمز\s*(?:التحقق|التاكيد|الامان)/u,
  /الرقم\s*(?:السري|الموقت|للتحقق)/u,
] as const;

const COMPLETED_FINANCIAL_MOVEMENT_PATTERNS = [
  /\b(?:payment|purchase|transaction|transfer|withdrawal|deposit|refund)\b[\s\S]{0,80}\b(?:completed|successful|successfully)\b/i,
  /\b(?:completed|successful)\s+(?:payment|purchase|transaction|transfer|withdrawal|deposit|refund)\b/i,
  /\b(?:debited|credited|paid|received|withdrew|withdrawn|transferred)\b[\s\S]{0,80}\b(?:EGP|USD|EUR|GBP|SAR|AED|KWD|LE|L\.E)\b/i,
  /\b(?:EGP|USD|EUR|GBP|SAR|AED|KWD|LE|L\.E)\b[\s\S]{0,80}\b(?:debited|credited|paid|received|withdrew|withdrawn|transferred)\b/i,
  /تم\s*(?:خصم|دفع|تحويل|استلام|سحب|ايداع)/u,
  /تمت\s*(?:عمليه)\s*(?:خصم|دفع|تحويل|استلام|سحب|ايداع|شراء)/u,
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

  const hasSecurityCodeMarker = PRE_PARSER_SECURITY_CODE_PATTERNS.some(
    (pattern) => pattern.test(normalizedBody)
  );
  if (!hasSecurityCodeMarker) return false;

  return !COMPLETED_FINANCIAL_MOVEMENT_PATTERNS.some((pattern) =>
    pattern.test(normalizedBody)
  );
}
