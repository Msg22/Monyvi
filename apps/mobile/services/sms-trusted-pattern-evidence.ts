import {
  matchTrustedSmsTemplate,
  type TrustedSmsParserOutcome,
} from "@monyvi/logic";

export function hasTrustedPatternEvidence(
  result: TrustedSmsParserOutcome | ReturnType<typeof matchTrustedSmsTemplate>
): boolean {
  return (
    result.status === "matched" ||
    result.status === "rejected" ||
    result.status === "ambiguous" ||
    (result.status === "unresolved" && result.patternIds.length > 0)
  );
}
