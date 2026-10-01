import {
  ParseSmsEvaluationTransactionSchema,
  type CaseFieldMismatch,
  type EvaluationAggregate,
  type EvaluationCaseReport,
  type EvaluationFieldExpectation,
  type EvaluationGroupSummary,
  type EvaluationReport,
  type FinalBatchObservation,
  type FinalObservationClassification,
  type RawObservationImport,
  type RawObservedTransaction,
  type SyntheticEvaluationCase,
} from "./types.ts";
import type { ParseSmsProviderTransaction } from "../../supabase/functions/_shared/sms-ai/sms-ai-provider.ts";

export interface ScoreEvaluationInput {
  readonly runId: string;
  readonly mode: "dry-run" | "live";
  readonly cancelled?: boolean;
  readonly cases: readonly SyntheticEvaluationCase[];
  readonly finalObservations: readonly FinalBatchObservation[];
  readonly rawObservations?: RawObservationImport;
}

const FIELD_NAMES = [
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

type FieldName = (typeof FIELD_NAMES)[number];

interface MutableAggregate {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  fieldDenominators: Record<FieldName, number>;
  fieldCorrect: Record<FieldName, number>;
  duplicateOutputs: number;
  unknownMessageIds: number;
}

interface RawParsedBatch {
  readonly structurallyObserved: boolean;
  readonly validity: "valid" | "invalid";
  readonly transactions: readonly RawObservedTransaction[];
}

function emptyFieldCounts(): Record<FieldName, number> {
  return {
    amount: 0,
    currency: 0,
    type: 0,
    date: 0,
    counterparty: 0,
    categorySystemName: 0,
    cardLast4: 0,
    isTrusted: 0,
    isAtmWithdrawal: 0,
    confidenceScore: 0,
  };
}

function createMutableAggregate(): MutableAggregate {
  return {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    fieldDenominators: emptyFieldCounts(),
    fieldCorrect: emptyFieldCounts(),
    duplicateOutputs: 0,
    unknownMessageIds: 0,
  };
}

function finalizeAggregate(value: MutableAggregate): EvaluationAggregate {
  const precisionDenominator = value.truePositive + value.falsePositive;
  const recallDenominator = value.truePositive + value.falseNegative;
  return {
    truePositive: value.truePositive,
    falsePositive: value.falsePositive,
    falseNegative: value.falseNegative,
    trueNegative: value.trueNegative,
    precision:
      precisionDenominator === 0
        ? null
        : value.truePositive / precisionDenominator,
    recall:
      recallDenominator === 0 ? null : value.truePositive / recallDenominator,
    fieldDenominators: { ...value.fieldDenominators },
    fieldCorrect: { ...value.fieldCorrect },
    duplicateOutputs: value.duplicateOutputs,
    unknownMessageIds: value.unknownMessageIds,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function actualField(
  transaction: Readonly<Record<string, unknown>>,
  field: FieldName
): unknown {
  if (field === "isAtmWithdrawal") {
    return transaction.isAtmWithdrawal ?? false;
  }
  return transaction[field];
}

function matchesExpectation<T>(
  expectation: EvaluationFieldExpectation<T>,
  actual: unknown
): boolean | null {
  if (expectation.kind === "unknown") return null;
  if (expectation.kind === "exact") {
    return Object.is(actual, expectation.value);
  }
  return expectation.values.some((value) => Object.is(actual, value));
}

function compareExpectedFields(
  expected: Extract<
    SyntheticEvaluationCase["expected"],
    { readonly kind: "transaction" }
  >["fields"],
  actual: Readonly<Record<string, unknown>>,
  aggregate: MutableAggregate
): readonly CaseFieldMismatch[] {
  const mismatches: CaseFieldMismatch[] = [];

  for (const field of FIELD_NAMES) {
    if (field === "confidenceScore") {
      const expectation = expected.confidenceScore;
      if (expectation.kind === "unknown") continue;
      aggregate.fieldDenominators.confidenceScore++;
      const actualValue = actual.confidenceScore;
      const isCorrect =
        typeof actualValue === "number" &&
        Number.isFinite(actualValue) &&
        actualValue >= expectation.minimum &&
        actualValue <= expectation.maximum;
      if (isCorrect) {
        aggregate.fieldCorrect.confidenceScore++;
      } else {
        mismatches.push({
          field,
          expected: expectation,
          actual: actualValue,
        });
      }
      continue;
    }

    const expectation = expected[field];
    const actualValue = actualField(actual, field);
    const isCorrect = matchesExpectation(expectation, actualValue);
    if (isCorrect === null) continue;
    aggregate.fieldDenominators[field]++;
    if (isCorrect) {
      aggregate.fieldCorrect[field]++;
    } else {
      mismatches.push({
        field,
        expected: expectation,
        actual: actualValue,
      });
    }
  }

  return mismatches;
}

function scoreCase(
  item: SyntheticEvaluationCase,
  classification: FinalObservationClassification,
  actual: readonly Readonly<Record<string, unknown>>[],
  aggregate: MutableAggregate
): readonly CaseFieldMismatch[] {
  if (classification !== "observed") return [];

  if (item.expected.kind === "no_transaction") {
    if (actual.length === 0) {
      aggregate.trueNegative++;
      return [];
    }
    aggregate.falsePositive++;
    return [
      {
        field: "transaction",
        expected: "none",
        actual: actual[0],
      },
    ];
  }

  const first = actual[0];
  if (first === undefined) {
    aggregate.falseNegative++;
    return [
      {
        field: "transaction",
        expected: "present",
        actual: undefined,
      },
    ];
  }

  aggregate.truePositive++;
  return compareExpectedFields(item.expected.fields, first, aggregate);
}

function deriveCaseClassification(
  item: SyntheticEvaluationCase,
  observation: FinalBatchObservation | undefined
): FinalObservationClassification {
  if (observation === undefined) return "unattempted";
  if (observation.classification !== "observed") {
    return observation.classification;
  }
  if (
    observation.completionStatus !== undefined &&
    observation.completionStatus !== "complete"
  ) {
    return "unresolved";
  }
  if (
    observation.unresolvedFingerprints?.includes(item.message.smsFingerprint) ===
    true
  ) {
    return "unresolved";
  }
  if (
    observation.terminalFingerprints?.includes(item.message.smsFingerprint) ===
    true
  ) {
    return "suppressed";
  }
  return "observed";
}

function observationByCaseId(
  observations: readonly FinalBatchObservation[]
): ReadonlyMap<string, FinalBatchObservation> {
  const output = new Map<string, FinalBatchObservation>();
  for (const observation of observations) {
    for (const caseId of observation.caseIds) {
      if (!output.has(caseId)) output.set(caseId, observation);
    }
  }
  return output;
}

function finalTransactionsForCase(
  observation: FinalBatchObservation | undefined,
  caseId: string
): readonly ParseSmsProviderTransaction[] {
  return (
    observation?.transactions?.filter(
      (transaction) => transaction.messageId === caseId
    ) ?? []
  );
}

function countOutputIdentityIssues(
  observations: readonly FinalBatchObservation[],
  knownCases: ReadonlySet<string>
): Pick<MutableAggregate, "duplicateOutputs" | "unknownMessageIds"> {
  let duplicateOutputs = 0;
  let unknownMessageIds = 0;

  for (const observation of observations) {
    const batchCases = new Set(observation.caseIds);
    const seen = new Set<string>();
    for (const transaction of observation.transactions ?? []) {
      if (
        !knownCases.has(transaction.messageId) ||
        !batchCases.has(transaction.messageId)
      ) {
        unknownMessageIds++;
        continue;
      }
      if (seen.has(transaction.messageId)) {
        duplicateOutputs++;
      } else {
        seen.add(transaction.messageId);
      }
    }
  }

  return { duplicateOutputs, unknownMessageIds };
}

function parseRawBatch(content: string): RawParsedBatch {
  try {
    const value = JSON.parse(content) as unknown;
    if (!isRecord(value) || !Array.isArray(value.transactions)) {
      return {
        structurallyObserved: false,
        validity: "invalid",
        transactions: [],
      };
    }

    const transactions = value.transactions.filter(isRecord);
    const validity =
      transactions.length === value.transactions.length &&
      transactions.every(
        (transaction) =>
          ParseSmsEvaluationTransactionSchema.safeParse(transaction).success
      )
        ? "valid"
        : "invalid";

    return {
      structurallyObserved: true,
      validity,
      transactions,
    };
  } catch {
    return {
      structurallyObserved: false,
      validity: "invalid",
      transactions: [],
    };
  }
}

function rawTransactionsForCase(
  parsed: RawParsedBatch,
  caseId: string
): readonly RawObservedTransaction[] {
  return parsed.transactions.filter(
    (transaction) => transaction.messageId === caseId
  );
}

function countRawIdentityIssues(
  rawBatches: readonly RawObservationImport["batches"][number][],
  parsedByBatch: ReadonlyMap<string, RawParsedBatch>,
  knownCases: ReadonlySet<string>
): Pick<MutableAggregate, "duplicateOutputs" | "unknownMessageIds"> {
  let duplicateOutputs = 0;
  let unknownMessageIds = 0;

  for (const batch of rawBatches) {
    const parsed = parsedByBatch.get(batch.batchId);
    if (parsed === undefined || !parsed.structurallyObserved) continue;
    const batchCases = new Set(batch.caseIds);
    const seen = new Set<string>();
    for (const transaction of parsed.transactions) {
      const messageId = transaction.messageId;
      if (
        typeof messageId !== "string" ||
        !knownCases.has(messageId) ||
        !batchCases.has(messageId)
      ) {
        unknownMessageIds++;
        continue;
      }
      if (seen.has(messageId)) {
        duplicateOutputs++;
      } else {
        seen.add(messageId);
      }
    }
  }

  return { duplicateOutputs, unknownMessageIds };
}

function buildRawLayer(
  cases: readonly SyntheticEvaluationCase[],
  rawObservations: RawObservationImport | undefined,
  totalBatchIds: ReadonlySet<string>
): {
  readonly rawByCase: ReadonlyMap<
    string,
    Exclude<EvaluationCaseReport["raw"], { readonly status: "not_observed" }>
  >;
  readonly aggregate: EvaluationAggregate;
  readonly observedBatches: number;
} {
  const rawByCase = new Map<
    string,
    Exclude<EvaluationCaseReport["raw"], { readonly status: "not_observed" }>
  >();
  const aggregate = createMutableAggregate();

  if (rawObservations === undefined) {
    return {
      rawByCase,
      aggregate: finalizeAggregate(aggregate),
      observedBatches: 0,
    };
  }

  const knownCases = new Set(cases.map(({ caseId }) => caseId));
  const parsedByBatch = new Map<string, RawParsedBatch>();
  let observedBatches = 0;

  for (const batch of rawObservations.batches) {
    if (batch.runId !== rawObservations.runId || !totalBatchIds.has(batch.batchId)) {
      continue;
    }
    const parsed = parseRawBatch(batch.responseContent);
    parsedByBatch.set(batch.batchId, parsed);
    observedBatches++;

    for (const caseId of batch.caseIds) {
      const item = cases.find((candidate) => candidate.caseId === caseId);
      if (item === undefined) continue;
      const actual = rawTransactionsForCase(parsed, caseId);
      const scratch = createMutableAggregate();
      const mismatches = parsed.structurallyObserved
        ? scoreCase(item, "observed", actual, scratch)
        : [];
      rawByCase.set(caseId, {
        status: "observed",
        validity: parsed.validity,
        transactions: actual,
        mismatches,
      });
    }
  }

  const identity = countRawIdentityIssues(
    rawObservations.batches,
    parsedByBatch,
    knownCases
  );
  aggregate.duplicateOutputs = identity.duplicateOutputs;
  aggregate.unknownMessageIds = identity.unknownMessageIds;

  for (const batch of rawObservations.batches) {
    const parsed = parsedByBatch.get(batch.batchId);
    if (parsed === undefined || !parsed.structurallyObserved) continue;
    for (const caseId of batch.caseIds) {
      const item = cases.find((candidate) => candidate.caseId === caseId);
      if (item === undefined) continue;
      scoreCase(item, "observed", rawTransactionsForCase(parsed, caseId), aggregate);
    }
  }

  return {
    rawByCase,
    aggregate: finalizeAggregate(aggregate),
    observedBatches,
  };
}

function classificationCounts(
  reports: readonly EvaluationCaseReport[]
): Partial<Record<FinalObservationClassification, number>> {
  const output: Partial<Record<FinalObservationClassification, number>> = {};
  for (const report of reports) {
    output[report.finalClassification] =
      (output[report.finalClassification] ?? 0) + 1;
  }
  return output;
}

function aggregateReports(
  cases: readonly SyntheticEvaluationCase[],
  reports: readonly EvaluationCaseReport[]
): EvaluationAggregate {
  const aggregate = createMutableAggregate();
  const reportsById = new Map(reports.map((report) => [report.caseId, report]));
  for (const item of cases) {
    const report = reportsById.get(item.caseId);
    if (report === undefined) continue;
    scoreCase(item, report.finalClassification, report.actual, aggregate);
  }
  return finalizeAggregate(aggregate);
}

function groupSummaries(
  cases: readonly SyntheticEvaluationCase[],
  reports: readonly EvaluationCaseReport[],
  keysFor: (item: SyntheticEvaluationCase) => readonly string[]
): readonly EvaluationGroupSummary[] {
  const keys = new Set<string>();
  for (const item of cases) {
    for (const key of keysFor(item)) keys.add(key);
  }

  return [...keys]
    .sort()
    .map((key) => {
      const groupCases = cases.filter((item) => keysFor(item).includes(key));
      const ids = new Set(groupCases.map(({ caseId }) => caseId));
      const groupReports = reports.filter(({ caseId }) => ids.has(caseId));
      return {
        key,
        aggregate: aggregateReports(groupCases, groupReports),
        classifications: classificationCounts(groupReports),
      };
    });
}

function uniqueBatchObservations(
  observations: readonly FinalBatchObservation[]
): readonly FinalBatchObservation[] {
  const output: FinalBatchObservation[] = [];
  const seen = new Set<string>();
  for (const observation of observations) {
    if (seen.has(observation.batchId)) continue;
    seen.add(observation.batchId);
    output.push(observation);
  }
  return output;
}

function batchClassification(
  observation: FinalBatchObservation
): FinalObservationClassification {
  if (
    observation.classification === "observed" &&
    observation.completionStatus !== undefined &&
    observation.completionStatus !== "complete"
  ) {
    return "unresolved";
  }
  return observation.classification;
}

function latencySummary(
  observations: readonly FinalBatchObservation[]
): EvaluationReport["latencySummary"] {
  const values = observations.flatMap(({ latencyMs }) =>
    typeof latencyMs === "number" && Number.isFinite(latencyMs) ? [latencyMs] : []
  );
  if (values.length === 0) {
    return {
      observedCount: 0,
      minimumMs: null,
      maximumMs: null,
      averageMs: null,
    };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    observedCount: values.length,
    minimumMs: Math.min(...values),
    maximumMs: Math.max(...values),
    averageMs: total / values.length,
  };
}

export function scoreSmsProviderEvaluation(
  input: ScoreEvaluationInput
): EvaluationReport {
  const observationsByCase = observationByCaseId(input.finalObservations);
  const aggregate = createMutableAggregate();
  const knownCases = new Set(input.cases.map(({ caseId }) => caseId));
  const identity = countOutputIdentityIssues(input.finalObservations, knownCases);
  aggregate.duplicateOutputs = identity.duplicateOutputs;
  aggregate.unknownMessageIds = identity.unknownMessageIds;

  const uniqueBatches = uniqueBatchObservations(input.finalObservations);
  const totalBatchIds = new Set(uniqueBatches.map(({ batchId }) => batchId));
  const rawLayer = buildRawLayer(
    input.cases,
    input.rawObservations,
    totalBatchIds
  );

  const reports: EvaluationCaseReport[] = input.cases.map((item) => {
    const observation = observationsByCase.get(item.caseId);
    const classification = deriveCaseClassification(item, observation);
    const actual = finalTransactionsForCase(observation, item.caseId);
    const mismatches = scoreCase(item, classification, actual, aggregate);
    return {
      caseId: item.caseId,
      providerId: item.providerId,
      sender: item.message.sender,
      body: item.message.body,
      expected: item.expected,
      finalClassification: classification,
      replayProvenance: observation?.replayProvenance ?? "unknown",
      actual,
      mismatches,
      raw: rawLayer.rawByCase.get(item.caseId) ?? {
        status: "not_observed",
      },
    };
  });

  let confirmedProviderCall = 0;
  let unknownProvenance = 0;
  for (const observation of uniqueBatches) {
    if (observation.replayProvenance === "confirmed_provider_call") {
      confirmedProviderCall++;
    } else {
      unknownProvenance++;
    }
  }

  return {
    runId: input.runId,
    mode: input.mode,
    cancelled: input.cancelled ?? false,
    cases: reports,
    aggregate: finalizeAggregate(aggregate),
    rawAggregate: rawLayer.aggregate,
    rawCoverage: {
      observedBatches: rawLayer.observedBatches,
      totalBatches: totalBatchIds.size,
    },
    rawAttributionManifest: [],
    providerSummaries: groupSummaries(input.cases, reports, (item) => [
      item.providerId,
    ]),
    scenarioSummaries: groupSummaries(input.cases, reports, (item) => item.tags),
    classificationSummary: classificationCounts(reports),
    batchSummaries: uniqueBatches.map((observation) => ({
      batchId: observation.batchId,
      classification: batchClassification(observation),
      caseCount: observation.caseIds.length,
      ...(observation.latencyMs === undefined
        ? {}
        : { latencyMs: observation.latencyMs }),
      replayProvenance: observation.replayProvenance ?? "unknown",
      ...(observation.completionStatus === undefined
        ? {}
        : { completionStatus: observation.completionStatus }),
    })),
    provenanceSummary: {
      confirmedProviderCall,
      unknown: unknownProvenance,
    },
    latencySummary: latencySummary(uniqueBatches),
  };
}

function pseudoCasesFromReport(
  report: EvaluationReport
): readonly SyntheticEvaluationCase[] {
  return report.cases.map((item) => ({
    caseId: item.caseId,
    providerId: item.providerId,
    templateGroup: "stored-report",
    source: "synthetic",
    provenance: "stored-evaluation-report",
    holdout: false,
    tags: [],
    message: {
      id: item.caseId,
      sender: item.sender,
      body: item.body,
      date: "",
      smsFingerprint: "",
    },
    expected: item.expected,
  }));
}

export function attachRawObservationsToEvaluationReport(
  report: EvaluationReport,
  rawObservations: RawObservationImport
): EvaluationReport {
  if (rawObservations.runId !== report.runId) {
    throw new Error("sms_provider_evaluation_raw_run_mismatch");
  }

  const cases = pseudoCasesFromReport(report);
  const batchIds = new Set(
    report.rawAttributionManifest.map(({ batchId }) => batchId)
  );
  const rawLayer = buildRawLayer(cases, rawObservations, batchIds);

  const casesById = new Map(cases.map((item) => [item.caseId, item]));
  const nextCases = report.cases.map((item) => {
    const source = casesById.get(item.caseId);
    if (source === undefined) return item;
    return {
      ...item,
      raw: rawLayer.rawByCase.get(item.caseId) ?? { status: "not_observed" as const },
    };
  });

  return {
    ...report,
    cases: nextCases,
    rawAggregate: rawLayer.aggregate,
    rawCoverage: {
      observedBatches: rawLayer.observedBatches,
      totalBatches: batchIds.size,
    },
  };
}
