const UNICODE_REPLACEMENT_CHARACTER = "\uFFFD";
const MINIMUM_REPLACEMENT_QUESTION_MARKS = 6;
const MINIMUM_REPLACEMENT_QUESTION_MARK_RATIO = 0.15;

/**
 * Edge-runtime copy of the conservative SMS corruption guard in
 * packages/logic. Supabase local development mounts only the supabase tree,
 * so Edge Functions cannot import the mobile package implementation.
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
