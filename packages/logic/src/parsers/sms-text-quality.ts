const UNICODE_REPLACEMENT_CHARACTER = "\uFFFD";
const MINIMUM_REPLACEMENT_QUESTION_MARKS = 6;
const MINIMUM_REPLACEMENT_QUESTION_MARK_RATIO = 0.15;

/**
 * Detects SMS text that was likely damaged while crossing a platform boundary.
 *
 * Android emulator-console SMS injection can replace unsupported Unicode
 * characters with literal question marks. The conservative threshold keeps
 * ordinary punctuation and legitimate question-heavy messages valid.
 */
export function isLikelyCorruptedSmsText(body: string): boolean {
  if (body.includes(UNICODE_REPLACEMENT_CHARACTER)) return true;

  const nonWhitespaceCharacters = Array.from(body).filter(
    (character) => !/\s/u.test(character)
  );
  if (nonWhitespaceCharacters.length === 0) return false;

  const questionMarkCount = nonWhitespaceCharacters.filter(
    (character) => character === "?"
  ).length;

  return (
    questionMarkCount >= MINIMUM_REPLACEMENT_QUESTION_MARKS &&
    questionMarkCount / nonWhitespaceCharacters.length >=
      MINIMUM_REPLACEMENT_QUESTION_MARK_RATIO
  );
}
