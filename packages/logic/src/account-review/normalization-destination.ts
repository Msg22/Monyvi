/**
 * I1 local destination proof is not an account choice. Caller has already
 * correlated mapped finance with the original source and validated advisory
 * source account evidence independently.
 */
import {
  accountReviewAccountEvidenceSchema,
  type AccountReviewAccountEvidence,
} from "./parser-schemas";
import type { AccountReviewCurrency } from "./review-schemas";
import type { AccountReviewNormalizationInput } from "./normalization-types";
import type { FinancialEntry } from "./normalization-financial";
import {
  candidatesOwned,
  spansMatch,
  uncertainEvidence,
} from "./normalization-evidence";

export interface NormalizedAtmDestination {
  readonly toAccountEvidence: AccountReviewAccountEvidence | null;
  readonly invalid: boolean;
}

function untrustedDestination(): NormalizedAtmDestination {
  return { toAccountEvidence: uncertainEvidence(), invalid: true };
}

function sourceIsAtm(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry
): boolean {
  if (
    input.source !== "SMS" ||
    entry.source !== "SMS" ||
    entry.mapped.isAtmWithdrawal !== true
  )
    return false;
  const id = entry.financial.messageId;
  const fingerprint = entry.mapped.smsFingerprint;
  const originalBody = entry.mapped.rawSmsBody;
  return input.submittedMessages.some(
    (sms) =>
      sms.id === id &&
      sms.smsFingerprint === fingerprint &&
      sms.body === originalBody
  );
}

/** Source bank proof/currency may remain valid when destination is invalid. */
export function normalizeAtmDestinationEvidence(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  currency: AccountReviewCurrency,
  rawProof: unknown
): NormalizedAtmDestination {
  if (!sourceIsAtm(input, entry)) {
    // Tagged v2 requires an explicit field; recovered undefined is malformed.
    // Legacy/v1 arrives as null from destinationFor and stays compatible.
    return { toAccountEvidence: null, invalid: rawProof !== null };
  }
  if (rawProof === null) return { toAccountEvidence: null, invalid: false };
  const result = accountReviewAccountEvidenceSchema.safeParse(rawProof);
  if (!result.success) return untrustedDestination();
  const proof = result.data;
  if (
    proof.state === "contextual" ||
    (proof.type !== null && proof.type !== "CASH") ||
    !spansMatch(input, entry, proof.evidenceSpans) ||
    !candidatesOwned(input, entry, proof, currency, "destination")
  ) {
    return untrustedDestination();
  }
  return { toAccountEvidence: proof, invalid: false };
}
