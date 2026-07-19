export const QA_SMS_SCHEMA_VERSION = 1 as const;
export const QA_SMS_PROVIDER_ID = "qnb-egypt" as const;
export const QA_SMS_RUNTIME_SCOPE = "candidate" as const;
export const QA_SMS_AUTO_SELECT_POLICY = "never" as const;

export const QA_SMS_MESSAGE_FAMILIES = [
  "card_purchase",
  "atm_withdrawal",
  "incoming_ipn_transfer",
  "outgoing_ipn_transfer",
  "outgoing_bank_transfer",
  "bank_to_wallet_transfer",
  "refund_or_reversal",
  "failed_transaction",
  "otp",
  "informational",
  "promotional",
] as const;

export const QA_SMS_NO_CURRENCY_FAMILIES = [
  "otp",
  "informational",
  "promotional",
] as const;

export const QA_SMS_PLACEHOLDER_TOKENS = [
  "CURRENCY",
  "AMOUNT",
  "BALANCE",
  "LAST4",
  "ACCOUNT",
  "REFERENCE",
  "MERCHANT",
  "ATM_TERMINAL",
  "PERSON",
  "PHONE",
  "DATE",
  "TIME",
  "PERCENTAGE",
  "URL",
] as const;

export const QA_SMS_SEMANTIC_ROLES = [
  "transaction_currency",
  "transaction_amount",
  "available_balance",
  "card_last4",
  "account_reference",
  "source_account_suffix",
  "transaction_reference",
  "message_code",
  "otp_code",
  "merchant_name",
  "atm_terminal",
  "counterparty_person",
  "phone_number",
  "provider_hotline",
  "transaction_date",
  "transaction_time",
  "promotional_amount",
  "promotional_rate",
  "campaign_year",
  "public_url",
  "public_reference",
] as const;

export const QA_SMS_TRANSACTION_DIRECTION_BY_FAMILY = {
  card_purchase: "expense",
  atm_withdrawal: "expense",
  incoming_ipn_transfer: "income",
  outgoing_ipn_transfer: "expense",
  outgoing_bank_transfer: "expense",
  refund_or_reversal: "income",
} as const;

export const QA_SMS_CANDIDATE_REVIEW_REASONS = [
  "candidate_pattern",
  "account_context_required",
  "transfer_accounts_required",
  "ambiguous_amount",
  "ambiguous_counterparty",
  "partial_template",
  "currency_evidence_required",
] as const;

export type QaSmsMessageFamily = (typeof QA_SMS_MESSAGE_FAMILIES)[number];
export type QaSmsPlaceholderToken = (typeof QA_SMS_PLACEHOLDER_TOKENS)[number];
export type QaSmsSemanticRole = (typeof QA_SMS_SEMANTIC_ROLES)[number];
export type QaCandidateReviewReason =
  (typeof QA_SMS_CANDIDATE_REVIEW_REASONS)[number];
export type QaSmsCurrency = "EGP" | "USD" | null;

const QA_SMS_NO_CURRENCY_FAMILY_SET = new Set<QaSmsMessageFamily>(
  QA_SMS_NO_CURRENCY_FAMILIES
);

export const QA_SMS_SEMANTIC_ROLES_BY_TOKEN = {
  CURRENCY: ["transaction_currency"],
  AMOUNT: ["transaction_amount", "promotional_amount"],
  BALANCE: ["available_balance"],
  LAST4: ["card_last4"],
  ACCOUNT: ["account_reference", "source_account_suffix"],
  REFERENCE: [
    "transaction_reference",
    "message_code",
    "otp_code",
    "public_reference",
  ],
  MERCHANT: ["merchant_name"],
  ATM_TERMINAL: ["atm_terminal"],
  PERSON: ["counterparty_person"],
  PHONE: ["phone_number", "provider_hotline"],
  DATE: ["transaction_date", "campaign_year"],
  TIME: ["transaction_time"],
  PERCENTAGE: ["promotional_rate"],
  URL: ["public_url"],
} as const satisfies Record<
  QaSmsPlaceholderToken,
  readonly QaSmsSemanticRole[]
>;

export function isQaSmsSemanticRoleAllowed(
  token: QaSmsPlaceholderToken,
  semanticRole: QaSmsSemanticRole
): boolean {
  return (QA_SMS_SEMANTIC_ROLES_BY_TOKEN[token] as readonly string[]).includes(
    semanticRole
  );
}

export function getQaSmsTransactionDirection(
  messageFamily: QaSmsMessageFamily
): "expense" | "income" | null {
  if (messageFamily in QA_SMS_TRANSACTION_DIRECTION_BY_FAMILY) {
    return QA_SMS_TRANSACTION_DIRECTION_BY_FAMILY[
      messageFamily as keyof typeof QA_SMS_TRANSACTION_DIRECTION_BY_FAMILY
    ];
  }
  return null;
}

export function getQaSmsCoverageCurrencies(
  messageFamily: QaSmsMessageFamily
): readonly QaSmsCurrency[] {
  if (QA_SMS_NO_CURRENCY_FAMILY_SET.has(messageFamily)) {
    return [null];
  }
  if (messageFamily === "bank_to_wallet_transfer") return ["EGP"];
  return ["EGP", "USD"];
}

export interface QaFixedSegment {
  readonly kind: "fixed";
  readonly text: string;
}

export interface QaPlaceholderSegment {
  readonly kind: "placeholder";
  readonly token: QaSmsPlaceholderToken;
  readonly semanticRole: QaSmsSemanticRole;
  readonly wasOperatorCorrected: boolean;
}

export type QaSanitizedSegment = QaFixedSegment | QaPlaceholderSegment;

export interface QaTransactionExpectedOutcome {
  readonly kind: "transaction";
  readonly direction: "expense" | "income";
  readonly requiredPlaceholderRoles: readonly QaSmsSemanticRole[];
  readonly confidenceCeiling: number;
  readonly reviewStatus: "needs_review";
  readonly reviewReasons: readonly QaCandidateReviewReason[];
}

export interface QaRejectionExpectedOutcome {
  readonly kind: "rejection";
  readonly reason:
    | "failed_transaction"
    | "otp"
    | "informational"
    | "promotional";
}

export interface QaTransferExpectedOutcome {
  readonly kind: "transfer";
  readonly direction: "bank_to_wallet";
  readonly requiredPlaceholderRoles: readonly QaSmsSemanticRole[];
  readonly confidenceCeiling: number;
  readonly reviewStatus: "needs_review";
  readonly reviewReasons: readonly QaCandidateReviewReason[];
}

export type QaExpectedOutcome =
  | QaTransactionExpectedOutcome
  | QaTransferExpectedOutcome
  | QaRejectionExpectedOutcome;

export interface QaSafeAuthorizationSummary {
  readonly version: 1;
  readonly authorizationClass: "qa_operator_explicit";
  readonly authorizedAt: string;
  readonly providerScope: "qnb-egypt";
}

export interface QaCandidateArtifact {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly evidenceDigest: string;
  readonly providerId: "qnb-egypt";
  readonly verifiedSenderAlias: string;
  readonly messageFamily: QaSmsMessageFamily;
  readonly currency: QaSmsCurrency;
  readonly expectedOutcome: QaExpectedOutcome;
  readonly segments: readonly QaSanitizedSegment[];
  readonly sanitizedShape: string;
  readonly sourceType: "qa-real-sms";
  readonly runtimeScope: "candidate";
  readonly autoSelectPolicy: "never";
  readonly authorization: QaSafeAuthorizationSummary;
  readonly createdAt: string;
}

export type QaCoverageStatus =
  | "candidate_collected"
  | "unavailable_in_qa_dataset"
  | "pending";

export interface QaCoverageDeclaration {
  readonly providerId: "qnb-egypt";
  readonly messageFamily: QaSmsMessageFamily;
  readonly currency: QaSmsCurrency;
  readonly status: QaCoverageStatus;
  readonly candidateIds: readonly string[];
  readonly recordedAt: string;
}

export interface QaCandidateBundle {
  readonly schemaVersion: 1;
  readonly exportId: string;
  readonly exportedAt: string;
  readonly evidenceDomainStatus:
    | "stable"
    | "reset_requires_manual_duplicate_review";
  readonly candidates: readonly QaCandidateArtifact[];
  readonly coverageDeclarations: readonly QaCoverageDeclaration[];
  readonly integrity: {
    readonly candidateCount: number;
    readonly candidateIds: readonly string[];
    readonly contentDigest: string;
  };
}

export interface QaFamilyReviewRecord {
  readonly decision: "approved" | "rejected";
  readonly reasonCode: string;
  readonly reviewerRole: "qa_owner";
  readonly reviewedAt: string;
  readonly testedArtifactVersion: number;
}

export interface QaValidationCaseCoverage {
  readonly positive: "pending" | "passed" | "failed";
  readonly nearMatch: "pending" | "passed" | "failed";
  readonly negative: "pending" | "passed" | "failed";
}

export interface QaFamilyValidationCoverage extends QaValidationCaseCoverage {
  readonly currencies: Readonly<
    Partial<Record<Exclude<QaSmsCurrency, null>, QaValidationCaseCoverage>>
  >;
}

export interface QaFamilyVersionHistoryEntry {
  readonly version: number;
  readonly structuralSignature: string;
  readonly providerId: "qnb-egypt";
  readonly verifiedSenderAliases: readonly string[];
  readonly messageFamily: QaSmsMessageFamily;
  readonly supportedCurrencies: ReadonlyArray<Exclude<QaSmsCurrency, null>>;
  readonly evidenceDigestsByCurrency: Readonly<
    Partial<Record<"EGP" | "USD" | "N/A", readonly string[]>>
  >;
  readonly expectedOutcome: QaExpectedOutcome;
  readonly reviewState: "candidate" | "review_ready";
  readonly humanReview: QaFamilyReviewRecord | null;
  readonly validationCoverage: QaFamilyValidationCoverage;
  readonly runtimeScope: "candidate";
  readonly autoSelectPolicy: "never";
  readonly evidenceCount: number;
  readonly invalidatedAt: string;
  readonly compatibility: "incompatible_structural_revision";
  readonly supersededByVersion: number;
}

export interface QaTemplateFamily {
  readonly familyId: string;
  readonly version: number;
  readonly providerId: "qnb-egypt";
  readonly verifiedSenderAliases: readonly string[];
  readonly messageFamily: QaSmsMessageFamily;
  readonly structuralSignature: string;
  readonly supportedCurrencies: ReadonlyArray<Exclude<QaSmsCurrency, null>>;
  readonly evidenceDigestsByCurrency: Readonly<
    Partial<Record<"EGP" | "USD" | "N/A", readonly string[]>>
  >;
  readonly expectedOutcome: QaExpectedOutcome;
  readonly reviewState: "candidate" | "review_ready";
  readonly humanReview: QaFamilyReviewRecord | null;
  readonly validationCoverage: QaFamilyValidationCoverage;
  readonly versionHistory: readonly QaFamilyVersionHistoryEntry[];
  readonly runtimeScope: "candidate";
  readonly autoSelectPolicy: "never";
}

export interface QaEvaluationResult {
  readonly status: "matched" | "rejected" | "unsupported";
  readonly familyId: string | null;
  readonly expectedOutcomeKind: "transaction" | "transfer" | "rejection" | null;
  readonly validationCodes: readonly string[];
}

export interface QaValidationCase {
  readonly caseId: string;
  readonly kind: "positive" | "near_match" | "negative";
  readonly targetFamilyId: string;
  readonly candidate: QaCandidateArtifact;
  readonly expectedStatus: QaEvaluationResult["status"];
}

export interface QaValidationCaseResult {
  readonly caseId: string;
  readonly kind: QaValidationCase["kind"];
  readonly targetFamilyId: string;
  readonly expectedStatus: QaEvaluationResult["status"];
  readonly actualStatus: QaEvaluationResult["status"];
  readonly expectedOutcomeKind: QaEvaluationResult["expectedOutcomeKind"];
  readonly validationCodes: readonly string[];
  readonly didPass: boolean;
}

export type QaPrivacyFindingCode =
  | "raw_numeric_value"
  | "raw_identifier_value"
  | "raw_counterparty_value"
  | "raw_email_value"
  | "raw_phone_value"
  | "raw_date_value"
  | "raw_time_value"
  | "unverified_sender"
  | "unknown_token";

export type QaDraftValidationCode =
  | QaPrivacyFindingCode
  | "ambiguous_dynamic_value"
  | "unknown_dynamic_value"
  | "classification_required"
  | "expected_outcome_required"
  | "required_placeholder_missing";

export interface QaPrivacyValidationFinding {
  readonly code: QaPrivacyFindingCode;
  readonly severity: "blocking";
  readonly segmentIndex: number | null;
  readonly messageKey: string;
}

export interface QaPrivacyValidationResult {
  readonly isValid: boolean;
  readonly findings: readonly QaPrivacyValidationFinding[];
}

export interface QaIntakeAuthorization {
  readonly version: 1;
  readonly authorizationClass: "qa_operator_explicit";
  readonly authorizedAt: string;
  readonly providerScope: "qnb-egypt";
  readonly currencyScope: ReadonlyArray<Exclude<QaSmsCurrency, null>>;
  readonly messageFamilyScope: readonly QaSmsMessageFamily[];
}

export interface QaDraftValidationFinding {
  readonly code: QaDraftValidationCode;
  readonly severity: "blocking";
  readonly segmentIndex: number | null;
  readonly messageKey: string;
  readonly semanticRole: QaSmsSemanticRole | null;
}

export type QaCandidateDraftStatus =
  | "draft"
  | "blocked"
  | "validated"
  | "approved"
  | "exported";

export interface QaSanitizedCandidateDraft {
  readonly draftId: string;
  readonly verifiedSenderAlias: string | null;
  readonly providerId: "qnb-egypt";
  readonly messageFamily: QaSmsMessageFamily | null;
  readonly currency: QaSmsCurrency;
  readonly expectedOutcome: QaExpectedOutcome | null;
  readonly classificationStatus: "pending" | "confirmed";
  readonly segments: readonly QaSanitizedSegment[];
  readonly evidenceDigest: string;
  readonly authorization: QaIntakeAuthorization;
  readonly validationFindings: readonly QaDraftValidationFinding[];
  readonly status: QaCandidateDraftStatus;
}

export interface QaInboxMessage {
  readonly localSelectionId: string;
  readonly nativeMessageId: string;
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
  readonly smsFingerprint: string;
  readonly isSelected: boolean;
}

export function buildQaSanitizedShape(
  segments: readonly QaSanitizedSegment[]
): string {
  return segments
    .map((segment) =>
      segment.kind === "fixed" ? segment.text : `<${segment.token}>`
    )
    .join("");
}
