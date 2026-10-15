import type {
  AccountReviewAccountEvidence, AccountReviewEvidenceSpan,
  AccountReviewCurrencyEvidence,
} from "./parser-schemas";
import type {
  AccountReviewCurrency, AccountReviewReason,
} from "./review-schemas";
import type { AccountReviewNormalizationInput } from "./normalization-types";
import type { FinancialEntry } from "./normalization-financial";
import { currencyCode } from "./schema-primitives";

export interface NormalizedRowEvidence {
  readonly accountEvidence: AccountReviewAccountEvidence;
  readonly currency: AccountReviewCurrency;
  readonly isAccountEvidenceValid: boolean;
  readonly reasons: readonly AccountReviewReason[];
  readonly sourceRef: string;
  readonly suggestionRef: string | null;
}

export interface RowAdvisory {
  readonly transactionRef: string;
  readonly suggestionRef: string | null;
  readonly accountEvidence: AccountReviewAccountEvidence;
  readonly toAccountEvidence: AccountReviewAccountEvidence | null;
  readonly currencyEvidence: AccountReviewCurrencyEvidence;
}

function uncertainEvidence(): AccountReviewAccountEvidence {
  return {
    state: "uncertain", name: null, type: null, institutionId: null,
    providerDisplayName: null, cardLast4: null,
    evidenceSpans: [], candidateAccountIds: [],
  };
}

function spanMatches(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  span: AccountReviewEvidenceSpan
): boolean {
  if (input.source === "VOICE") {
    return span.sourceRef === input.requestKey && span.field === "transcript" &&
      input.originalTranscript.slice(span.start, span.end) === span.text;
  }
  if (entry.source !== "SMS" || span.sourceRef !== entry.financial.messageId) {
    return false;
  }
  const original = input.submittedMessages.find(
    (item) => item.id === entry.financial.messageId
  );
  if (!original || span.field === "transcript") return false;
  const sourceText = span.field === "body" ? original.body : original.sender;
  return sourceText.slice(span.start, span.end) === span.text;
}

function spansMatch(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  spans: readonly AccountReviewEvidenceSpan[]
): boolean {
  return spans.every((span) => spanMatches(input, entry, span));
}

function candidatesOwned(
  input: AccountReviewNormalizationInput,
  evidence: AccountReviewAccountEvidence,
  currency: AccountReviewCurrency
): boolean {
  return evidence.candidateAccountIds.every((id) => {
    const account = input.reviewAccountSnapshots.accounts.find(
      (candidate) => candidate.id === id
    );
    if (!account) return false;
    if (evidence.type !== null && evidence.type !== account.type) return false;
    if (currency.state === "known" && currency.code !== account.currency) {
      return false;
    }
    return (evidence.institutionId === null ||
      evidence.institutionId === account.institutionId) &&
      (evidence.cardLast4 === null || evidence.cardLast4 === account.cardLast4);
  });
}

function unresolvedCurrency(
  reason: Extract<AccountReviewCurrency, {state:"unconfirmed"}>["reason"],
  evidence: AccountReviewCurrencyEvidence | null
): AccountReviewCurrency {
  return {
    state: "unconfirmed", reason,
    candidateCodes: evidence?.candidateCodes ?? [],
    statedCode: evidence?.statedCode ?? null,
    evidenceSpans: evidence?.evidenceSpans ?? [],
  };
}

export function normalizeEvidenceCurrency(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  evidence: AccountReviewCurrencyEvidence | null
): AccountReviewCurrency {
  if (!evidence || !spansMatch(input, entry, evidence.evidenceSpans)) {
    return unresolvedCurrency("legacy_unknown", null);
  }
  if (evidence.state === "omitted") {
    return {
      state: "known",
      code: input.reviewAccountSnapshots.preferredCurrency,
      origin: "preferred_omission",
    };
  }
  if (evidence.state === "explicit" &&
      evidence.statedCode !== null &&
      currencyCode.safeParse(evidence.statedCode).success &&
      (entry.financial.currency === null ||
        entry.financial.currency === evidence.statedCode)) {
    return { state: "known", code: currencyCode.parse(evidence.statedCode), origin: "explicit" };
  }
  if (evidence.state === "ambiguous" || evidence.state === "conflicting" ||
      evidence.state === "unsupported") {
    return unresolvedCurrency(evidence.state, evidence);
  }
  return unresolvedCurrency("legacy_unknown", evidence);
}

export function normalizeRowEvidence(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  advisory: RowAdvisory | null
): NormalizedRowEvidence {
  const currency = normalizeEvidenceCurrency(input, entry, advisory?.currencyEvidence ?? null);
  const sourceRef = advisory?.transactionRef ??
    (entry.source === "SMS" ? entry.financial.messageId : input.requestKey);
  const original = advisory?.accountEvidence ?? uncertainEvidence();
  const destination = advisory?.toAccountEvidence;
  const validDestination = destination === null ||
    (destination !== undefined &&
      spansMatch(input, entry, destination.evidenceSpans) &&
      candidatesOwned(input, destination, currency));
  const isAccountEvidenceValid = advisory !== null && validDestination &&
    spansMatch(input, entry, original.evidenceSpans) &&
    candidatesOwned(input, original, currency) &&
    !(input.source === "SMS" && original.state === "contextual");
  const accountEvidence: AccountReviewAccountEvidence = isAccountEvidenceValid
    ? original : { ...original, state: "uncertain", candidateAccountIds: [] };
  const reasons: AccountReviewReason[] = [];
  if (advisory !== null && !isAccountEvidenceValid) {
    reasons.push("account_evidence_invalid");
  }
  if (currency.state === "unconfirmed") {
    reasons.push("currency_confirmation_needed");
  }
  return {
    accountEvidence, currency, isAccountEvidenceValid,
    reasons, sourceRef, suggestionRef: isAccountEvidenceValid
      ? advisory?.suggestionRef ?? null : null,
  };
}
