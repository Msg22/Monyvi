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

  return PRE_PARSER_SECURITY_CODE_PATTERNS.some((pattern) =>
    pattern.test(normalizedBody)
  );
}
