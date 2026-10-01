import { z } from "zod";

import type { ParseSmsProviderTransaction } from "../../supabase/functions/_shared/sms-ai/sms-ai-provider.ts";

export const STAGING_PROJECT_REF = "yulbcndyssdjicbpmlrk";
export const STAGING_PARSE_SMS_ENDPOINT =
  "https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms";
export const DEFAULT_EVALUATION_BATCH_SIZE = 5;

export type EvaluationFieldExpectation<T> =
  | { readonly kind: "exact"; readonly value: T }
  | { readonly kind: "one_of"; readonly values: readonly T[] }
  | { readonly kind: "unknown" };

export interface EvaluationTransactionExpectation {
  readonly amount: EvaluationFieldExpectation<number>;
  readonly currency: EvaluationFieldExpectation<string>;
  readonly type: EvaluationFieldExpectation<"EXPENSE" | "INCOME">;
  readonly date: EvaluationFieldExpectation<string>;
  readonly counterparty: EvaluationFieldExpectation<string>;
  readonly categorySystemName: EvaluationFieldExpectation<string>;
  readonly cardLast4: EvaluationFieldExpectation<string | undefined>;
  readonly confidenceScore: EvaluationFieldExpectation<number>;
}

export interface SyntheticEvaluationCase {
  readonly caseId: string;
  readonly providerId: string;
  readonly templateGroup: string;
  readonly source: "synthetic";
  readonly provenance: string;
  readonly holdout: boolean;
  readonly tags: readonly string[];
  readonly message: {
    readonly id: string;
    readonly sender: string;
    readonly body: string;
    readonly date: string;
    readonly smsFingerprint: string;
  };
  readonly expected:
    | { readonly kind: "no_transaction" }
    | {
        readonly kind: "transaction";
        readonly fields: EvaluationTransactionExpectation;
      };
}

export type FinalObservationClassification =
  | "observed"
  | "transport_failure"
  | "admission_failure"
  | "unresolved"
  | "suppressed"
  | "unattempted";

export interface FinalBatchObservation {
  readonly runId: string;
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly classification: FinalObservationClassification;
  readonly httpStatus?: number;
  readonly refusalReason?: string;
  readonly latencyMs?: number;
  readonly transactions?: readonly ParseSmsProviderTransaction[];
  readonly completionStatus?: string;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly replayProvenance?: "confirmed_provider_call" | "unknown";
}

export interface RawBatchObservation {
  readonly runId: string;
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly inputIdentity: string;
  readonly responseContent: string;
}

export interface RawObservationImport {
  readonly runId: string;
  readonly batches: readonly RawBatchObservation[];
}

export const RawObservationImportSchema = z.object({
  runId: z.string().min(1),
  batches: z.array(
    z.object({
      runId: z.string().min(1),
      batchId: z.string().min(1),
      caseIds: z.array(z.string().min(1)),
      inputIdentity: z.string().min(1),
      responseContent: z.string(),
    })
  ),
});

export interface CaseFieldMismatch {
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export interface EvaluationCaseReport {
  readonly caseId: string;
  readonly providerId: string;
  readonly sender: string;
  readonly body: string;
  readonly expected: SyntheticEvaluationCase["expected"];
  readonly finalClassification: FinalObservationClassification;
  readonly actual: readonly ParseSmsProviderTransaction[];
  readonly mismatches: readonly CaseFieldMismatch[];
  readonly raw:
    | { readonly status: "not_observed" }
    | {
        readonly status: "observed";
        readonly transactions: readonly ParseSmsProviderTransaction[];
        readonly mismatches: readonly CaseFieldMismatch[];
      };
}

export interface EvaluationAggregate {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegative: number;
  readonly trueNegative: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly fieldDenominators: Readonly<Record<string, number>>;
  readonly fieldCorrect: Readonly<Record<string, number>>;
  readonly duplicateOutputs: number;
  readonly unknownMessageIds: number;
}

export interface EvaluationReport {
  readonly runId: string;
  readonly mode: "dry-run" | "live";
  readonly cancelled: boolean;
  readonly cases: readonly EvaluationCaseReport[];
  readonly aggregate: EvaluationAggregate;
  readonly rawCoverage: {
    readonly observedBatches: number;
    readonly totalBatches: number;
  };
}

export interface EvaluationRunOptions {
  readonly mode: "dry-run" | "live";
  readonly runId: string;
  readonly anchorMs: number;
  readonly maxCases: number;
  readonly maxRequests: number;
  readonly endpoint?: string;
  readonly projectRef?: string;
  readonly accessToken?: string;
  readonly publicApiKey?: string;
  readonly signal?: AbortSignal;
}

export interface EvaluationRunnerDependencies {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

export interface ParsedCliOptions extends EvaluationRunOptions {
  readonly rawObservationPath?: string;
}
