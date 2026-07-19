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

/**
 * Edge-runtime copy of the mobile hard-exclusion guard. Supabase local
 * development mounts only the supabase tree, so it cannot import packages/logic.
 */
export function isExcludedBeforeSmsParsingAtEdge(body: string): boolean {
  const normalizedBody = normalizeArabicForFiltering(body);
  return PRE_PARSER_EXCLUDED_ARABIC_PHRASES.some((phrase) =>
    normalizedBody.includes(phrase)
  );
}
