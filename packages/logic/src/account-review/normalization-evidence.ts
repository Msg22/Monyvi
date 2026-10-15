import type {
  AccountReviewAccountEvidence,
  AccountReviewEvidenceSpan,
  AccountReviewCurrencyEvidence,
} from "./parser-schemas";
import type {
  AccountReviewCurrency,
  AccountReviewReason,
} from "./review-schemas";
import type { AccountReviewNormalizationInput } from "./normalization-types";
import type { FinancialEntry } from "./normalization-financial";
import { currencyCode } from "./schema-primitives";
import { normalizeGroundedIdentity } from "./identity";

export interface NormalizedRowEvidence {
  readonly accountEvidence: AccountReviewAccountEvidence;
  readonly currency: AccountReviewCurrency;
  readonly isAccountEvidenceValid: boolean;
  readonly reasons: readonly AccountReviewReason[];
  readonly sourceRef: string;
  /** Original submitted SMS ID, never a response-local model transactionRef. */
  readonly sourceMessageId: string | null;
  readonly suggestionRef: string | null;
}

export interface RowAdvisory {
  readonly transactionRef: string;
  readonly suggestionRef: string | null;
  readonly accountEvidence: AccountReviewAccountEvidence;
  readonly toAccountEvidence: AccountReviewAccountEvidence | null;
  readonly currencyEvidence: AccountReviewCurrencyEvidence;
}

export function uncertainEvidence(): AccountReviewAccountEvidence {
  return {
    state: "uncertain",
    name: null,
    type: null,
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    evidenceSpans: [],
    candidateAccountIds: [],
  };
}

function spanMatches(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  span: AccountReviewEvidenceSpan
): boolean {
  if (input.source === "VOICE") {
    return (
      span.sourceRef === input.requestKey &&
      span.field === "transcript" &&
      input.originalTranscript.slice(span.start, span.end) === span.text
    );
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

export function spansMatch(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  spans: readonly AccountReviewEvidenceSpan[]
): boolean {
  return spans.every((span) => spanMatches(input, entry, span));
}

function sameGroundedName(left: string | null, right: string | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.trim().length > 0 &&
    right.trim().length > 0 &&
    normalizeGroundedIdentity(left) === normalizeGroundedIdentity(right)
  );
}

type OwnedCandidate =
  AccountReviewNormalizationInput["reviewAccountSnapshots"]["accounts"][number];

function candidateIdentityMatches(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  evidence: AccountReviewAccountEvidence,
  account: OwnedCandidate
): boolean {
  const name = evidence.name;
  const provider = evidence.providerDisplayName;
  if (
    provider !== null &&
    !sameGroundedName(provider, account.providerDisplayName)
  ) {
    return false;
  }
  if (name !== null) {
    return [
      account.name,
      account.providerDisplayName,
      ...account.senderNames,
    ].some((value) => sameGroundedName(name, value));
  }
  if (provider !== null) return true;
  if (entry.source !== "SMS" || input.source !== "SMS") return false;
  const originalMessageId = entry.financial.messageId;
  const originalFingerprint = entry.mapped.smsFingerprint;
  const submitted = input.submittedMessages.find(
    (candidate) =>
      candidate.id === originalMessageId &&
      candidate.smsFingerprint === originalFingerprint
  );
  const sender = submitted?.sender ?? null;
  return (
    sender !== null &&
    account.senderNames.some((alias) => sameGroundedName(alias, sender))
  );
}

function originalSmsSenderMatchesOwned(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  account: OwnedCandidate
): boolean {
  if (input.source !== "SMS" || entry.source !== "SMS") return true;
  const messageId = entry.financial.messageId;
  const fingerprint = entry.mapped.smsFingerprint;
  const submitted = input.submittedMessages.find(
    (candidate) =>
      candidate.id === messageId && candidate.smsFingerprint === fingerprint
  );
  const sender = submitted?.sender ?? null;
  return (
    sender !== null &&
    sender.trim().length > 0 &&
    [account.name, account.providerDisplayName, ...account.senderNames].some(
      (name) => sameGroundedName(name, sender)
    )
  );
}

function ownedSmsRoleCompatible(
  entry: FinancialEntry,
  role: "source" | "destination",
  actualType: OwnedCandidate["type"]
): boolean {
  if (entry.source !== "SMS") return true;
  return role === "destination"
    ? actualType === "CASH"
    : actualType === "BANK" || actualType === "DIGITAL_WALLET";
}

export function candidatesOwned(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  evidence: AccountReviewAccountEvidence,
  currency: AccountReviewCurrency,
  role: "source" | "destination"
): boolean {
  // Only actual Bank/Wallet accounts may be ordinary SMS sources.
  // Explicit Cash source proof is invalid even without candidate IDs.
  if (
    role === "source" &&
    entry.source === "SMS" &&
    evidence.state === "explicit" &&
    evidence.type === "CASH"
  )
    return false;
  if (
    evidence.candidateAccountIds.length > 0 &&
    evidence.state !== "explicit" &&
    evidence.state !== "contextual"
  )
    return false;
  return evidence.candidateAccountIds.every((id) => {
    const account = input.reviewAccountSnapshots.accounts.find(
      (candidate) => candidate.id === id
    );
    if (!account) return false;
    if (!ownedSmsRoleCompatible(entry, role, account.type)) return false;
    if (evidence.type !== null && evidence.type !== account.type) return false;
    if (currency.state === "known" && currency.code !== account.currency) {
      return false;
    }
    return (
      (evidence.institutionId === null ||
        evidence.institutionId === account.institutionId) &&
      (evidence.cardLast4 === null ||
        evidence.cardLast4 === account.cardLast4) &&
      candidateIdentityMatches(input, entry, evidence, account) &&
      (role === "destination" ||
        originalSmsSenderMatchesOwned(input, entry, account))
    );
  });
}

function unresolvedCurrency(
  reason: Extract<AccountReviewCurrency, { state: "unconfirmed" }>["reason"],
  evidence: AccountReviewCurrencyEvidence | null
): AccountReviewCurrency {
  return {
    state: "unconfirmed",
    reason,
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
    const preferred = input.reviewAccountSnapshots.preferredCurrency;
    if (
      entry.financial.currency !== null &&
      entry.financial.currency !== preferred
    ) {
      return {
        state: "unconfirmed",
        reason: "conflicting",
        candidateCodes: [entry.mapped.currency, preferred],
        statedCode: entry.financial.currency,
        evidenceSpans: [],
      };
    }
    return { state: "known", code: preferred, origin: "preferred_omission" };
  }
  if (
    evidence.state === "explicit" &&
    evidence.statedCode !== null &&
    currencyCode.safeParse(evidence.statedCode).success &&
    (entry.financial.currency === null ||
      entry.financial.currency === evidence.statedCode)
  ) {
    return {
      state: "known",
      code: currencyCode.parse(evidence.statedCode),
      origin: "explicit",
    };
  }
  if (
    evidence.state === "ambiguous" ||
    evidence.state === "conflicting" ||
    evidence.state === "unsupported"
  ) {
    return unresolvedCurrency(evidence.state, evidence);
  }
  return unresolvedCurrency("legacy_unknown", evidence);
}

export function normalizeRowEvidence(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  advisory: RowAdvisory | null
): NormalizedRowEvidence {
  const currency = normalizeEvidenceCurrency(
    input,
    entry,
    advisory?.currencyEvidence ?? null
  );
  const sourceRef =
    advisory?.transactionRef ??
    (entry.source === "SMS" ? entry.financial.messageId : input.requestKey);
  const original = advisory?.accountEvidence ?? uncertainEvidence();
  // Source BANK evidence is independent of any ATM Cash destination proof.
  const isAccountEvidenceValid =
    advisory !== null &&
    spansMatch(input, entry, original.evidenceSpans) &&
    candidatesOwned(input, entry, original, currency, "source") &&
    !(input.source === "SMS" && original.state === "contextual");
  const accountEvidence: AccountReviewAccountEvidence = isAccountEvidenceValid
    ? original
    : { ...original, state: "uncertain", candidateAccountIds: [] };
  const reasons: AccountReviewReason[] = [];
  if (advisory !== null && !isAccountEvidenceValid) {
    reasons.push("account_evidence_invalid");
  }
  if (currency.state === "unconfirmed") {
    reasons.push("currency_confirmation_needed");
  }
  return {
    accountEvidence,
    currency,
    isAccountEvidenceValid,
    reasons,
    sourceRef,
    sourceMessageId: entry.source === "SMS" ? entry.financial.messageId : null,
    suggestionRef: isAccountEvidenceValid
      ? (advisory?.suggestionRef ?? null)
      : null,
  };
}
