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

export type EvaluationConfidenceExpectation =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "range";
      readonly minimum: number;
      readonly maximum: number;
      readonly rationale: string;
      readonly basis?: "policy_heuristic";
    };

export interface EvaluationTransactionExpectation {
  readonly amount: EvaluationFieldExpectation<number>;
  readonly currency: EvaluationFieldExpectation<string>;
  readonly type: EvaluationFieldExpectation<"EXPENSE" | "INCOME">;
  readonly date: EvaluationFieldExpectation<string>;
  readonly counterparty: EvaluationFieldExpectation<string>;
  readonly categorySystemName: EvaluationFieldExpectation<string>;
  readonly cardLast4: EvaluationFieldExpectation<string | undefined>;
  readonly isTrusted: EvaluationFieldExpectation<boolean>;
  readonly isAtmWithdrawal: EvaluationFieldExpectation<boolean>;
  readonly confidenceScore: EvaluationConfidenceExpectation;
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
  | "response_invalid"
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
  readonly negativeFingerprints?: readonly string[];
  readonly terminalFingerprints?: readonly string[];
  readonly unresolvedFingerprints?: readonly string[];
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

export interface ProviderInputLogMessage {
  readonly sender: string;
  readonly body: string;
  readonly date: string;
}

export interface ProviderInputBatchObservation {
  readonly runId: string;
  readonly batchId: string;
  readonly requestInputIdentity: string;
  readonly providerInputIdentity: string;
  readonly caseIds: readonly string[];
}

export interface ProviderInputObservationImport {
  readonly runId: string;
  readonly batches: readonly ProviderInputBatchObservation[];
}

export const ProviderInputObservationWireSchema = z
  .object({
    runId: z.string().min(1),
    batches: z.array(
      z
        .object({
          runId: z.string().min(1),
          batchId: z.string().min(1),
          requestInputIdentity: z.string().min(1),
          smsMessages: z.array(
            z
              .object({
                sender: z.string(),
                body: z.string(),
                date: z.string().min(1),
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict();

export type ProviderInputObservationWire = z.infer<
  typeof ProviderInputObservationWireSchema
>;

export interface RawAttributionManifestEntry {
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly inputIdentity: string;
}

export const RawObservationImportSchema = z
  .object({
    runId: z.string().min(1),
    batches: z.array(
      z
        .object({
          runId: z.string().min(1),
          batchId: z.string().min(1),
          caseIds: z.array(z.string().min(1)),
          inputIdentity: z.string().min(1),
          responseContent: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export const ParseSmsEvaluationTransactionSchema = z
  .object({
    messageId: z.string().min(1),
    amount: z.number().finite().positive(),
    currency: z.string().min(1),
    type: z.enum(["EXPENSE", "INCOME"]),
    counterparty: z.string(),
    date: z
      .string()
      .min(1)
      .refine((value) => Number.isFinite(Date.parse(value)), "invalid_date"),
    categorySystemName: z.string().min(1),
    isAtmWithdrawal: z.boolean().optional(),
    cardLast4: z.string().regex(/^\d{4}$/).optional(),
    confidenceScore: z.number().finite().min(0).max(1),
    isTrusted: z.boolean(),
  })
  .strict();

export const ParseSmsEvaluationResponseSchema = z
  .object({
    transactions: z.array(ParseSmsEvaluationTransactionSchema),
    completionStatus: z.string().min(1),
    negativeFingerprints: z.array(z.string()),
    terminalFingerprints: z.array(z.string()),
    unresolvedFingerprints: z.array(z.string()),
    reason: z.string().optional(),
  })
  .passthrough();

export type ParseSmsEvaluationResponse = z.infer<
  typeof ParseSmsEvaluationResponseSchema
>;

export interface CaseFieldMismatch {
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export type RawObservedTransaction = Readonly<Record<string, unknown>>;

export interface EvaluationCaseReport {
  readonly caseId: string;
  readonly providerId: string;
  readonly source: "synthetic";
  readonly templateGroup: string;
  readonly provenance: string;
  readonly holdout: boolean;
  readonly tags: readonly string[];
  readonly sender: string;
  readonly body: string;
  readonly receivedDate: string;
  readonly smsFingerprint: string;
  readonly expected: SyntheticEvaluationCase["expected"];
  readonly finalClassification: FinalObservationClassification;
  readonly replayProvenance: "confirmed_provider_call" | "unknown";
  readonly actual: readonly ParseSmsProviderTransaction[];
  readonly mismatches: readonly CaseFieldMismatch[];
  readonly raw:
    | { readonly status: "not_observed" }
    | {
        readonly status: "observed";
        readonly validity: "valid" | "invalid";
        readonly transactions: readonly RawObservedTransaction[];
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

export interface EvaluationGroupSummary {
  readonly key: string;
  readonly aggregate: EvaluationAggregate;
  readonly classifications: Readonly<
    Partial<Record<FinalObservationClassification, number>>
  >;
}

export interface EvaluationBatchSummary {
  readonly batchId: string;
  readonly classification: FinalObservationClassification;
  readonly caseCount: number;
  readonly httpStatus?: number;
  readonly refusalReason?: string;
  readonly latencyMs?: number;
  readonly replayProvenance: "confirmed_provider_call" | "unknown";
  readonly completionStatus?: string;
}

export interface EvaluationLatencySummary {
  readonly observedCount: number;
  readonly minimumMs: number | null;
  readonly maximumMs: number | null;
  readonly averageMs: number | null;
}

export interface EvaluationReport {
  readonly runId: string;
  readonly mode: "dry-run" | "live";
  readonly cancelled: boolean;
  readonly cases: readonly EvaluationCaseReport[];
  readonly aggregate: EvaluationAggregate;
  readonly rawAggregate: EvaluationAggregate;
  readonly rawCoverage: {
    readonly observedBatches: number;
    readonly totalBatches: number;
  };
  readonly rawAttributionManifest: readonly RawAttributionManifestEntry[];
  readonly providerSummaries: readonly EvaluationGroupSummary[];
  readonly scenarioSummaries: readonly EvaluationGroupSummary[];
  readonly classificationSummary: Readonly<
    Partial<Record<FinalObservationClassification, number>>
  >;
  readonly batchSummaries: readonly EvaluationBatchSummary[];
  readonly provenanceSummary: {
    readonly confirmedProviderCall: number;
    readonly unknown: number;
  };
  readonly latencySummary: EvaluationLatencySummary;
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
  readonly rawObservationValue?: unknown;
  readonly providerInputObservationValue?: unknown;
}

export interface EvaluationRunnerDependencies {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

export interface ParsedCliOptions extends EvaluationRunOptions {
  readonly rawObservationPath?: string;
  readonly providerInputObservationPath?: string;
  readonly finalReportPath?: string;
  readonly outputPath?: string;
}

const FinalObservationClassificationSchema = z.enum([
  "observed",
  "response_invalid",
  "transport_failure",
  "admission_failure",
  "unresolved",
  "suppressed",
  "unattempted",
]);

function fieldExpectationSchema<T extends z.ZodType>(
  valueSchema: T
): z.ZodType<
  | { readonly kind: "exact"; readonly value: z.output<T> }
  | { readonly kind: "one_of"; readonly values: readonly z.output<T>[] }
  | { readonly kind: "unknown" }
> {
  return z.union([
    z
      .object({
        kind: z.literal("exact"),
        value: valueSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("one_of"),
        values: z.array(valueSchema).min(1),
      })
      .strict(),
    z.object({ kind: z.literal("unknown") }).strict(),
  ]);
}

const OptionalStringExpectationSchema: z.ZodType<
  EvaluationFieldExpectation<string | undefined>
> = z.union([
  z
    .object({
      kind: z.literal("exact"),
      value: z.string().optional(),
    })
    .strict()
    .transform((value) => ({
      kind: "exact" as const,
      value: value.value,
    })),
  z
    .object({
      kind: z.literal("one_of"),
      values: z.array(z.string().optional()).min(1),
    })
    .strict(),
  z.object({ kind: z.literal("unknown") }).strict(),
]);

const ConfidenceExpectationSchema = z.union([
  z.object({ kind: z.literal("unknown") }).strict(),
  z
    .object({
      kind: z.literal("range"),
      minimum: z.number().finite().min(0).max(1),
      maximum: z.number().finite().min(0).max(1),
      rationale: z.string().min(1),
      basis: z.literal("policy_heuristic").optional(),
    })
    .strict()
    .refine((value) => value.minimum <= value.maximum),
]);

const TransactionExpectationSchema = z
  .object({
    amount: fieldExpectationSchema(z.number().finite()),
    currency: fieldExpectationSchema(z.string()),
    type: fieldExpectationSchema(z.enum(["EXPENSE", "INCOME"])),
    date: fieldExpectationSchema(z.string()),
    counterparty: fieldExpectationSchema(z.string()),
    categorySystemName: fieldExpectationSchema(z.string()),
    cardLast4: OptionalStringExpectationSchema,
    isTrusted: fieldExpectationSchema(z.boolean()),
    isAtmWithdrawal: fieldExpectationSchema(z.boolean()),
    confidenceScore: ConfidenceExpectationSchema,
  })
  .strict();

const CaseExpectationSchema = z.union([
  z.object({ kind: z.literal("no_transaction") }).strict(),
  z
    .object({
      kind: z.literal("transaction"),
      fields: TransactionExpectationSchema,
    })
    .strict(),
]);

const CaseFieldMismatchSchema = z
  .object({
    field: z.string().min(1),
    expected: z.unknown(),
    actual: z.unknown(),
  })
  .strict();

const RawCaseObservationSchema = z.union([
  z.object({ status: z.literal("not_observed") }).strict(),
  z
    .object({
      status: z.literal("observed"),
      validity: z.enum(["valid", "invalid"]),
      transactions: z.array(z.record(z.string(), z.unknown())),
      mismatches: z.array(CaseFieldMismatchSchema),
    })
    .strict(),
]);

const CaseReportImportSchema = z
  .object({
    caseId: z.string().min(1),
    providerId: z.string().min(1),
    source: z.literal("synthetic"),
    templateGroup: z.string().min(1),
    provenance: z.string().min(1),
    holdout: z.boolean(),
    tags: z.array(z.string()),
    sender: z.string(),
    body: z.string(),
    receivedDate: z.string().min(1),
    smsFingerprint: z.string().min(1),
    expected: CaseExpectationSchema,
    finalClassification: FinalObservationClassificationSchema,
    replayProvenance: z.enum(["confirmed_provider_call", "unknown"]),
    actual: z.array(ParseSmsEvaluationTransactionSchema),
    mismatches: z.array(CaseFieldMismatchSchema),
    raw: RawCaseObservationSchema,
  })
  .strict();

const EvaluationAggregateSchema = z
  .object({
    truePositive: z.number().int().nonnegative(),
    falsePositive: z.number().int().nonnegative(),
    falseNegative: z.number().int().nonnegative(),
    trueNegative: z.number().int().nonnegative(),
    precision: z.number().finite().min(0).max(1).nullable(),
    recall: z.number().finite().min(0).max(1).nullable(),
    fieldDenominators: z.record(z.string(), z.number().int().nonnegative()),
    fieldCorrect: z.record(z.string(), z.number().int().nonnegative()),
    duplicateOutputs: z.number().int().nonnegative(),
    unknownMessageIds: z.number().int().nonnegative(),
  })
  .strict();

const ClassificationSummarySchema = z.record(
  z.string(),
  z.number().int().nonnegative()
);

const GroupSummarySchema = z
  .object({
    key: z.string().min(1),
    aggregate: EvaluationAggregateSchema,
    classifications: ClassificationSummarySchema,
  })
  .strict();

const BatchSummarySchema = z
  .object({
    batchId: z.string().min(1),
    classification: FinalObservationClassificationSchema,
    caseCount: z.number().int().nonnegative(),
    httpStatus: z.number().int().min(100).max(599).optional(),
    refusalReason: z.string().min(1).optional(),
    latencyMs: z.number().finite().nonnegative().optional(),
    replayProvenance: z.enum(["confirmed_provider_call", "unknown"]),
    completionStatus: z.string().min(1).optional(),
  })
  .strict();

const RawAttributionManifestEntrySchema = z
  .object({
    batchId: z.string().min(1),
    caseIds: z.array(z.string().min(1)),
    inputIdentity: z.string().min(1),
  })
  .strict();

export const EvaluationReportImportSchema = z
  .object({
    runId: z.string().min(1),
    mode: z.enum(["dry-run", "live"]),
    cancelled: z.boolean(),
    cases: z.array(CaseReportImportSchema),
    aggregate: EvaluationAggregateSchema,
    rawAggregate: EvaluationAggregateSchema,
    rawCoverage: z
      .object({
        observedBatches: z.number().int().nonnegative(),
        totalBatches: z.number().int().nonnegative(),
      })
      .strict(),
    rawAttributionManifest: z.array(RawAttributionManifestEntrySchema),
    providerSummaries: z.array(GroupSummarySchema),
    scenarioSummaries: z.array(GroupSummarySchema),
    classificationSummary: ClassificationSummarySchema,
    batchSummaries: z.array(BatchSummarySchema),
    provenanceSummary: z
      .object({
        confirmedProviderCall: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
      })
      .strict(),
    latencySummary: z
      .object({
        observedCount: z.number().int().nonnegative(),
        minimumMs: z.number().finite().nonnegative().nullable(),
        maximumMs: z.number().finite().nonnegative().nullable(),
        averageMs: z.number().finite().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export type EvaluationReportImport = z.infer<
  typeof EvaluationReportImportSchema
>;
