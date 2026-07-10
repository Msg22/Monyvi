import type { CurrencyType, TransactionType } from "@monyvi/db";
import type { CategoryMapSource } from "../utils/ai-parser-utils";
import type {
  TransactionReviewReason,
  TransactionReviewStatus,
} from "../types";

export type PatternRuntimeScope =
  | "dev_test"
  | "candidate"
  | "trusted_production";

export type PatternSourceType =
  | "fixture"
  | "synthetic"
  | "internet_or_unknown"
  | "qa-real-sms"
  | "consented-user-real-sms"
  | "provider-published-example"
  | "controlled-real-transaction";

export type PatternSourceConfidence = "unknown" | "low" | "medium" | "verified";

export type PatternAutoSelectPolicy =
  | "dev_only"
  | "never"
  | "production_allowed";

export type PatternPromotionEligibility =
  | "blocked_dev_fixture"
  | "needs_trusted_provenance"
  | "ready_for_phase2_review";

export type LocalReviewReason = TransactionReviewReason;

export type LocalReviewStatus = TransactionReviewStatus;

export type LocalSmsParserErrorKind =
  | "invalid_categories"
  | "invalid_supported_currencies"
  | "catalog_configuration"
  | "unknown";

export interface LocalSmsParserError {
  readonly kind: LocalSmsParserErrorKind;
  readonly message: string;
}

export interface LocalSmsCandidate {
  readonly messageId: string;
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
  readonly smsFingerprint: string;
}

export interface LocalSmsParserRequest {
  readonly candidates: readonly LocalSmsCandidate[];
  readonly categories: readonly CategoryMapSource[];
  readonly supportedCurrencies: readonly string[];
}

export interface LocalParsedSmsTransaction {
  readonly messageId: string;
  readonly smsFingerprint: string;
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
  readonly counterparty: string;
  readonly date: Date;
  readonly categorySystemName: string;
  readonly confidence: number;
  readonly reviewStatus: LocalReviewStatus;
  readonly reviewReasons: readonly LocalReviewReason[];
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
  readonly parserSource: "local";
  readonly patternId: string;
  readonly patternRuntimeScope: PatternRuntimeScope;
}

export interface LocalSmsParserResult {
  readonly transactions: readonly LocalParsedSmsTransaction[];
  readonly unsupportedCount: number;
  readonly matchedPatternIds: readonly string[];
  readonly error?: LocalSmsParserError;
}

export interface LocalSmsMatchInput {
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
}

export interface LocalSmsExpectedOutcome {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
  readonly counterparty: string;
  readonly categorySystemName: string;
  readonly confidence: number;
  readonly reviewStatus: LocalReviewStatus;
  readonly reviewReasons: readonly LocalReviewReason[];
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
}

export interface LocalSmsPatternMatch {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
  readonly counterparty: string;
  readonly categorySystemName: string;
  readonly date: Date;
  readonly cardLast4?: string;
  readonly isAtmWithdrawal?: boolean;
  readonly reviewReasons?: readonly LocalReviewReason[];
}

export interface LocalSmsMatchRules {
  readonly description: string;
  readonly match: (input: LocalSmsMatchInput) => LocalSmsPatternMatch | null;
}

export interface LocalSmsPattern {
  readonly id: string;
  readonly provider: string;
  readonly runtimeScope: PatternRuntimeScope;
  readonly sourceType: PatternSourceType;
  readonly sourceConfidence: PatternSourceConfidence;
  readonly autoSelectPolicy: PatternAutoSelectPolicy;
  readonly promotionEligibility: PatternPromotionEligibility;
  readonly sanitizedExampleShape: string;
  readonly acceptanceExamples: readonly string[];
  readonly matchRules: LocalSmsMatchRules;
  readonly expectedOutcome: LocalSmsExpectedOutcome;
  readonly confidence: number;
  readonly reviewExpectation: LocalReviewStatus;
  readonly reviewReasons: readonly LocalReviewReason[];
  readonly edgeCases: readonly string[];
}

export type LocalSmsFixtureScenario =
  | "bank_purchase"
  | "bank_atm_withdrawal"
  | "bank_transfer_in"
  | "bank_transfer_out"
  | "wallet_transfer_in"
  | "wallet_transfer_out"
  | "wallet_cash_in"
  | "wallet_cash_out"
  | "wallet_bill_payment"
  | "wallet_merchant_payment"
  | "payment_reference"
  | "non_transactional";

export interface LocalSmsFixtureExpectedOutcome extends LocalSmsExpectedOutcome {
  readonly patternId: string;
}

export interface LocalSmsFixture {
  readonly id: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
  readonly sourceType: PatternSourceType;
  readonly sourceConfidence: PatternSourceConfidence;
  readonly scenario: LocalSmsFixtureScenario;
  readonly isFinancialTransaction: boolean;
  readonly expectedOutcome?: LocalSmsFixtureExpectedOutcome;
  readonly notes: string;
}
