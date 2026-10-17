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
import { hasSourceCardSuffixSpan } from "./normalization-card-grounding";

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

/** Only a matching original owner-scoped source may supply card proof. */
function cardSpanOriginalSource(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  span: AccountReviewEvidenceSpan
): string | null {
  if (!spanMatches(input, entry, span)) return null;
  if (input.source === "VOICE") return input.originalTranscript;
  if (entry.source !== "SMS") return null;
  const submitted = input.submittedMessages.find(
    (item) =>
      item.id === entry.financial.messageId &&
      item.smsFingerprint === entry.mapped.smsFingerprint
  );
  if (!submitted) return null;
  return span.field === "body"
    ? submitted.body
    : span.field === "sender"
      ? submitted.sender
      : null;
}

/** Account metadata agreement does not independently ground a card claim. */
function claimedCardSuffixGrounded(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  evidence: AccountReviewAccountEvidence
): boolean {
  const claimedSuffix = evidence.cardLast4;
  if (claimedSuffix === null) return true;
  return evidence.evidenceSpans.some((span) => {
    const original = cardSpanOriginalSource(input, entry, span);
    return (
      original !== null &&
      hasSourceCardSuffixSpan(original, span, claimedSuffix)
    );
  });
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

/**
 * Ground SMS source identity before consulting optional model candidate IDs.
 * In particular, [] cannot bypass the original sender/provider check.
 *
 * If the evidence points to an owned provider/name, only an original sender
 * compatible with that owned account can support it. Genuinely unmatched
 * named evidence may still form a pending draft when its *own* claimed name
 * or provider is actually present in an original source span.
 */
function originalSmsSourceIdentityGrounded(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  evidence: AccountReviewAccountEvidence,
  currency: AccountReviewCurrency
): boolean {
  if (
    input.source !== "SMS" ||
    entry.source !== "SMS" ||
    evidence.state !== "explicit"
  ) {
    return true;
  }
  const submitted = input.submittedMessages.find(
    (item) =>
      item.id === entry.financial.messageId &&
      item.smsFingerprint === entry.mapped.smsFingerprint
  );
  if (!submitted || !submitted.sender.trim()) return false;

  const claimedOwned = input.reviewAccountSnapshots.accounts.filter(
    (account) =>
      ownedSmsRoleCompatible(entry, "source", account.type) &&
      candidateIdentityMatches(input, entry, evidence, account)
  );
  if (claimedOwned.length > 0) {
    // Every owned account which the FINAL automatic resolver can select must
    // have its OWN original sender witness. A USD/WALLET/different-card BankX
    // cannot authorize a separate EGP/BANK/card BankX merely because both
    // share a display name. This check never uses provider-supplied candidate
    // IDs as independent source authority.
    const eligible = claimedOwned.filter(
      (account) =>
        (evidence.type === null || evidence.type === account.type) &&
        (currency.state !== "known" || currency.code === account.currency) &&
        (evidence.institutionId === null ||
          evidence.institutionId === account.institutionId) &&
        (evidence.cardLast4 === null ||
          evidence.cardLast4 === account.cardLast4)
    );
    return (
      eligible.length > 0 &&
      eligible.every((account) =>
        originalSmsSenderMatchesOwned(input, entry, account)
      )
    );
  }

  // For an unmatched named draft, a stated provider takes precedence:
  // an unrelated nickname/source span cannot ground a different provider.
  // This still permits a new issuer when its own original message names it.
  const assertedIdentity = evidence.providerDisplayName ?? evidence.name;
  return (
    assertedIdentity !== null &&
    (sameGroundedName(submitted.sender, assertedIdentity) ||
      evidence.evidenceSpans.some(
        (span) =>
          (span.field === "body" || span.field === "sender") &&
          sameGroundedName(span.text, assertedIdentity)
      ))
  );
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
  // Always validate source/sender provenance, even for candidate IDs [].
  if (
    role === "source" &&
    !originalSmsSourceIdentityGrounded(input, entry, evidence, currency)
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
    claimedCardSuffixGrounded(input, entry, original) &&
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
