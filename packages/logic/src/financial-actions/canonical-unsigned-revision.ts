/**
 * Shared dependency-free canonical unsigned financial revision grammar.
 * Never import the financial registry or envelope from this primitive.
 */
declare const canonicalUnsignedIntegerStringBrand: unique symbol;

export type CanonicalUnsignedIntegerString = string & {
  readonly [canonicalUnsignedIntegerStringBrand]: true;
};

export const MAX_CANONICAL_UNSIGNED_INTEGER_STRING = "9223372036854775807";
export const FINANCIAL_ACTION_INVALID_REVISION_CODE =
  "financial_action_invalid_revision";
const CANONICAL_UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/;

function isCanonicalUnsignedIntegerString(
  value: unknown
): value is CanonicalUnsignedIntegerString {
  return (
    typeof value === "string" &&
    CANONICAL_UNSIGNED_INTEGER_PATTERN.test(value) &&
    (value.length < MAX_CANONICAL_UNSIGNED_INTEGER_STRING.length ||
      (value.length === MAX_CANONICAL_UNSIGNED_INTEGER_STRING.length &&
        value <= MAX_CANONICAL_UNSIGNED_INTEGER_STRING))
  );
}

export function parseCanonicalUnsignedIntegerString(
  value: unknown
): CanonicalUnsignedIntegerString {
  if (!isCanonicalUnsignedIntegerString(value))
    throw new Error(FINANCIAL_ACTION_INVALID_REVISION_CODE);
  return value;
}
