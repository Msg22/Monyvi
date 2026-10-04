import type { EvaluationCaseOutcome } from "@monyvi/logic";

export const SMS_EVALUATION_FIELD_KEYS = [
  "amount",
  "currency",
  "type",
  "date",
  "counterparty",
  "categorySystemName",
  "cardLast4",
  "isTrusted",
  "isAtmWithdrawal",
  "confidenceScore",
] as const;

export type SmsEvaluationFieldKey = (typeof SMS_EVALUATION_FIELD_KEYS)[number];

export interface SmsEvaluationBatchEvidence {
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly classification: string;
  readonly httpStatus?: number;
  readonly refusalReason?: string;
  readonly completionStatus?: string;
}

export type SmsEvaluationExpectedDisplay =
  | { readonly kind: "not_asserted" }
  | { readonly kind: "value"; readonly values: readonly unknown[] }
  | {
      readonly kind: "diagnostic";
      readonly minimum: number;
      readonly maximum: number;
      readonly rationale: string;
    };

export type SmsEvaluationParsedDisplay =
  | { readonly kind: "unavailable" }
  | { readonly kind: "not_provided" }
  | { readonly kind: "value"; readonly value: unknown };

export interface SmsEvaluationFieldViewModel {
  readonly key: SmsEvaluationFieldKey;
  readonly expected: SmsEvaluationExpectedDisplay;
  readonly parsed: SmsEvaluationParsedDisplay;
  readonly isMismatch: boolean;
}

export interface SmsEvaluationCaseViewModel {
  readonly caseId: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly sender: string;
  readonly body: string;
  readonly templateGroup: string;
  readonly outcome: EvaluationCaseOutcome;
  readonly finalClassification: string;
  readonly expectedKind: "transaction" | "no_transaction";
  readonly actualKind: "transaction" | "no_transaction" | "unavailable";
  readonly actualTransactionCount: number;
  readonly fields: readonly SmsEvaluationFieldViewModel[];
  readonly mismatchFields: readonly string[];
  readonly batch: SmsEvaluationBatchEvidence | null;
}

export interface SmsEvaluationSummaryViewModel {
  readonly matched: number;
  readonly mismatched: number;
  readonly notEvaluated: number;
  readonly returnedTransactionCount: number;
  readonly correctNonTransactions: number;
  readonly issueCount: number;
  readonly providerCount: number;
  readonly caseCount: number;
}

export type SmsEvaluationBatchTimingStatus =
  | "completed"
  | "failed"
  | "running"
  | "cancelled"
  | "not_run";

export interface SmsEvaluationBatchTimingViewModel {
  readonly batchId: string;
  readonly batchNumber: number;
  readonly messageCount: number;
  readonly status: SmsEvaluationBatchTimingStatus;
  readonly elapsedMs?: number;
}
