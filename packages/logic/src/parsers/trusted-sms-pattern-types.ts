export const TRUSTED_SMS_CATALOG_SCHEMA_VERSION = 1 as const;

export const TRUSTED_SMS_PLACEHOLDER_ROLES = [
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

export type TrustedSmsPlaceholderRole =
  (typeof TRUSTED_SMS_PLACEHOLDER_ROLES)[number];

export const TRUSTED_SMS_ELIGIBLE_FAMILIES = [
  "card_purchase",
  "atm_withdrawal",
  "incoming_ipn_transfer",
  "outgoing_ipn_transfer",
  "refund_or_reversal",
  "failed_transaction",
  "otp",
  "informational",
  "promotional",
] as const;

export type TrustedSmsEligibleFamily =
  (typeof TRUSTED_SMS_ELIGIBLE_FAMILIES)[number];
export type TrustedSmsCurrency = "EGP" | "USD" | null;

export interface TrustedSmsFixedSegment {
  readonly kind: "fixed";
  readonly text: string;
}

export interface TrustedSmsPlaceholderSegment {
  readonly kind: "placeholder";
  readonly token: string;
  readonly semanticRole: TrustedSmsPlaceholderRole;
}

export type TrustedSmsSegment =
  | TrustedSmsFixedSegment
  | TrustedSmsPlaceholderSegment;

export interface TrustedSmsValidationStatus {
  readonly schema: "passed";
  readonly privacy: "passed";
  readonly exactPositive: "passed";
  readonly nearMatch: "passed";
  readonly intentionalNegative: "passed";
  readonly ambiguity: "passed";
  readonly integrity: "passed";
}

export interface TrustedSmsTransactionOutcome {
  readonly kind: "transaction";
  readonly direction: "expense" | "income";
  readonly reviewStatus: "needs_review";
  readonly reviewReasons: ReadonlyArray<
    "low_confidence" | "cash_transfer_review"
  >;
  readonly confidenceCeiling: number;
}

export interface TrustedSmsRejectionOutcome {
  readonly kind: "rejection";
  readonly reason:
    | "failed_transaction"
    | "otp"
    | "informational"
    | "promotional";
}

export type TrustedSmsExpectedOutcome =
  | TrustedSmsTransactionOutcome
  | TrustedSmsRejectionOutcome;

export interface TrustedSmsPattern {
  readonly schemaVersion: 1;
  readonly patternId: string;
  readonly patternVersion: number;
  readonly catalogVersion: number;
  readonly providerId: string;
  readonly verifiedSenderAliases: readonly string[];
  readonly messageFamily: TrustedSmsEligibleFamily;
  readonly currency: TrustedSmsCurrency;
  readonly enabled: boolean;
  readonly runtimeScope: "trusted_production";
  readonly sourceType: "qa-real-sms";
  readonly autoSelectPolicy: "never";
  readonly provenanceCode: "qa_operator_promoted";
  readonly promotionId: string;
  readonly segments: readonly TrustedSmsSegment[];
  readonly expectedOutcome: TrustedSmsExpectedOutcome;
  readonly validationStatus: TrustedSmsValidationStatus;
  readonly integrityDigest: string;
}

export interface TrustedSmsCatalog {
  readonly schemaVersion: 1;
  readonly catalogVersion: number;
  readonly patterns: readonly TrustedSmsPattern[];
  readonly integrityDigest: string;
}

export interface TrustedSmsCatalogValidationIssue {
  readonly code: string;
  readonly patternId?: string;
}

export interface TrustedSmsCatalogValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly TrustedSmsCatalogValidationIssue[];
}

export interface TrustedSmsCatalogActivation {
  readonly status: "active" | "invalid" | "incompatible";
  readonly catalogVersion: number | null;
  readonly patterns: readonly TrustedSmsPattern[];
  readonly issues: readonly TrustedSmsCatalogValidationIssue[];
}

export interface TrustedSmsCatalogProvider {
  getActivation(): TrustedSmsCatalogActivation;
}

export interface TrustedSmsTemplateCandidate {
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
}

export interface TrustedSmsParserCandidate extends TrustedSmsTemplateCandidate {
  readonly candidateId: string;
  readonly smsFingerprint: string;
}

export interface TrustedSmsParsedTransaction {
  readonly messageId: string;
  readonly smsFingerprint: string;
  readonly amount: number;
  readonly currency: "EGP" | "USD";
  readonly type: "EXPENSE" | "INCOME";
  readonly counterparty: string;
  readonly date: Date;
  readonly categorySystemName: "other" | "income_other";
  readonly confidence: number;
  readonly reviewStatus: "needs_review";
  readonly reviewReasons: ReadonlyArray<
    "low_confidence" | "cash_transfer_review"
  >;
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
  readonly parserSource: "trusted_local";
  readonly patternId: string;
  readonly patternVersion: number;
}

interface TrustedSmsCandidateIdentity {
  readonly candidateId: string;
  readonly smsFingerprint: string;
}

export type TrustedSmsParserOutcome = TrustedSmsCandidateIdentity &
  (
    | {
        readonly status: "matched";
        readonly transaction: TrustedSmsParsedTransaction;
      }
    | {
        readonly status: "rejected";
        readonly patternId: string;
        readonly reason: TrustedSmsRejectionOutcome["reason"];
      }
    | {
        readonly status: "unresolved";
        readonly reason:
          | "no_match"
          | "malformed_value"
          | "unsupported_currency";
        readonly patternIds: readonly string[];
      }
    | {
        readonly status: "ambiguous";
        readonly patternIds: readonly string[];
      }
    | {
        readonly status: "catalog_error";
        readonly reason: "catalog_inactive";
      }
  );

export interface TrustedSmsParserRequest {
  readonly candidates: readonly TrustedSmsParserCandidate[];
  readonly activation: TrustedSmsCatalogActivation;
  readonly supportedCurrencies: readonly string[];
}

export interface TrustedSmsParserResult {
  readonly outcomes: readonly TrustedSmsParserOutcome[];
}

export interface TrustedSmsExtractedValue {
  readonly token: string;
  readonly semanticRole: TrustedSmsPlaceholderRole;
  readonly value: string;
}

export interface TrustedSmsTemplateMatched {
  readonly status: "matched";
  readonly pattern: TrustedSmsPattern;
  readonly extractedValues: readonly TrustedSmsExtractedValue[];
}

export interface TrustedSmsTemplateRejected {
  readonly status: "rejected";
  readonly patternId: string;
  readonly reason: TrustedSmsRejectionOutcome["reason"];
}

export interface TrustedSmsTemplateUnresolved {
  readonly status: "unresolved";
  readonly reason: "no_match" | "malformed_value" | "unsupported_currency";
  readonly patternIds: readonly string[];
}

export interface TrustedSmsTemplateAmbiguous {
  readonly status: "ambiguous";
  readonly patternIds: readonly string[];
}

export interface TrustedSmsTemplateCatalogError {
  readonly status: "catalog_error";
  readonly reason: "catalog_inactive";
}

export type TrustedSmsTemplateResult =
  | TrustedSmsTemplateMatched
  | TrustedSmsTemplateRejected
  | TrustedSmsTemplateUnresolved
  | TrustedSmsTemplateAmbiguous
  | TrustedSmsTemplateCatalogError;

export interface TrustedSmsPromotionValidation {
  readonly schema: "passed" | "failed";
  readonly privacy: "passed" | "failed";
  readonly exactPositive: "passed" | "failed";
  readonly nearMatch: "passed" | "failed";
  readonly intentionalNegative: "passed" | "failed";
  readonly ambiguity: "passed" | "failed";
  readonly integrity: "passed" | "failed";
}

export interface TrustedSmsPromotionValidationEvidence {
  readonly exactPositive: "rendered_candidate";
  readonly nearMatch: "mutate_each_fixed_segment";
  readonly intentionalNegative: "unverified_sender";
}

export interface TrustedSmsPromotionRecord {
  readonly schemaVersion: 1;
  readonly promotionId: string;
  readonly candidateId: string;
  readonly evidenceDigest: string;
  readonly patternId: string;
  readonly patternVersion: number;
  readonly catalogVersion: number;
  readonly reviewerId: string;
  readonly approvedAt: string;
  readonly decision: "promote" | "reject";
  readonly validation: TrustedSmsPromotionValidation;
  readonly validationEvidence: TrustedSmsPromotionValidationEvidence;
}

export type TrustedSmsPlaceholderPolicy = Readonly<
  Record<
    TrustedSmsPlaceholderRole,
    "extract" | "validate_ignore" | "rejection_only"
  >
>;
