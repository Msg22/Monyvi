import type { AccountReviewEvidenceSpan } from "./parser-schemas";

/**
 * A card suffix requires an actual account/card-identifying phrase with a
 * correlated evidence span. Merely seeing four matching digits (amount, phone,
 * reference), or agreeing with owned/model metadata, is not a proof.
 *
 * Constrain the lexical grammar to immediate card labels and masked/ending
 * formats, not arbitrary nearby text or a general language classifier.
 */
const SOURCE_CARD_ENDING =
  /(?:\bcard\b|(?:^|[\s(،])(?:بطاقة|البطاقة|بطاقتك|بطاقتي|كارت|الكارت|كارتك|رقم\s+(?:البطاقة|الكارت)))\s*(?:(?:ending(?:\s+in)?|ends?(?:\s+in)?|last\s*4(?:\s+digits)?|no\.?|number|رقم|المنتهية(?:\s*ب[ـ]?)?|المنتهي(?:\s*ب[ـ]?)?|آخر\s*4|اخر\s*4)\s*)?[#:*xX•.\-\s]{0,12}([0-9\u0660-\u0669\u06f0-\u06f9]{4})(?![0-9\u0660-\u0669\u06f0-\u06f9])/giu;

// Read past the claimed suffix in the ORIGINAL text, not the clipped span.
// Any next Unicode numeric token, whether directly adjacent (even in another
// digit script) or following punctuation/formatting/x/X masks, invalidates last4.
// Only an intervening word can break this numeric continuation.
const CONTINUED_CARD_NUMBER = /^(?:[^\p{L}\p{N}]|[xX])*\p{N}/u;

function asciiSuffix(raw: string): string {
  return raw.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const value = digit.charCodeAt(0);
    return String.fromCharCode(
      48 + (value <= 0x0669 ? value - 0x0660 : value - 0x06f0)
    );
  });
}

/** Private source-proof guard: indices are UTF-16 code units, as on the wire. */
export function hasSourceCardSuffixSpan(
  sourceText: string,
  span: AccountReviewEvidenceSpan,
  claimedSuffix: string
): boolean {
  if (sourceText.slice(span.start, span.end) !== span.text) return false;
  for (const match of sourceText.matchAll(SOURCE_CARD_ENDING)) {
    const digits = match[1];
    if (
      match.index === undefined ||
      !digits ||
      asciiSuffix(digits) !== claimedSuffix
    )
      continue;
    const index = match.index + match[0].lastIndexOf(digits);
    const suffixEnd = index + digits.length;
    if (
      index >= span.start &&
      suffixEnd <= span.end &&
      !CONTINUED_CARD_NUMBER.test(sourceText.slice(suffixEnd))
    )
      return true;
  }
  return false;
}
