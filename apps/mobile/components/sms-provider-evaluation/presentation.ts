import {
  getEvaluationCaseOutcome,
  getInstitutionById,
  summarizeEvaluationCaseOutcomes,
  type EvaluationCaseOutcome,
  type EvaluationCaseReport,
  type EvaluationFieldExpectation,
  type EvaluationReport,
} from "@monyvi/logic";

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

function expectedField(
  expectation: EvaluationFieldExpectation<unknown>
): SmsEvaluationExpectedDisplay {
  if (expectation.kind === "unknown") {
    return { kind: "not_asserted" };
  }
  if (expectation.kind === "exact") {
    return { kind: "value", values: [expectation.value] };
  }
  return { kind: "value", values: expectation.values };
}

function actualField(
  report: EvaluationCaseReport,
  key: Exclude<SmsEvaluationFieldKey, "confidenceScore">
): SmsEvaluationParsedDisplay {
  if (report.finalClassification !== "observed") {
    return { kind: "unavailable" };
  }
  const transaction = report.actual[0];
  if (transaction === undefined) {
    return { kind: "unavailable" };
  }

  const value =
    key === "isAtmWithdrawal"
      ? transaction.isAtmWithdrawal ?? false
      : transaction[key];

  return value === undefined
    ? { kind: "not_provided" }
    : { kind: "value", value };
}

function confidenceExpected(
  report: EvaluationCaseReport
): SmsEvaluationExpectedDisplay {
  if (report.expected.kind === "no_transaction") {
    return { kind: "not_asserted" };
  }

  const expectation = report.expected.fields.confidenceScore;
  if (expectation.kind === "unknown") {
    return { kind: "not_asserted" };
  }
  if (expectation.basis === "policy_heuristic") {
    return {
      kind: "diagnostic",
      minimum: expectation.minimum,
      maximum: expectation.maximum,
      rationale: expectation.rationale,
    };
  }
  return {
    kind: "value",
    values: [`${expectation.minimum}–${expectation.maximum}`],
  };
}

function confidenceActual(
  report: EvaluationCaseReport
): SmsEvaluationParsedDisplay {
  if (report.finalClassification !== "observed") {
    return { kind: "unavailable" };
  }
  const value = report.actual[0]?.confidenceScore;
  return value === undefined
    ? { kind: "not_provided" }
    : { kind: "value", value };
}

function fieldViewModels(
  report: EvaluationCaseReport
): readonly SmsEvaluationFieldViewModel[] {
  if (
    report.expected.kind === "no_transaction" &&
    report.actual.length === 0
  ) {
    return [];
  }

  const mismatchFields = new Set(report.mismatches.map(({ field }) => field));
  return SMS_EVALUATION_FIELD_KEYS.map((key) => {
    if (key === "confidenceScore") {
      return {
        key,
        expected: confidenceExpected(report),
        parsed: confidenceActual(report),
        isMismatch: mismatchFields.has(key),
      };
    }

    const expected =
      report.expected.kind === "transaction"
        ? expectedField(report.expected.fields[key])
        : { kind: "not_asserted" as const };

    return {
      key,
      expected,
      parsed: actualField(report, key),
      isMismatch: mismatchFields.has(key),
    };
  });
}

function batchForCase(
  caseId: string,
  batches: readonly SmsEvaluationBatchEvidence[]
): SmsEvaluationBatchEvidence | null {
  return batches.find(({ caseIds }) => caseIds.includes(caseId)) ?? null;
}

export function createSmsEvaluationCaseViewModel(
  report: EvaluationCaseReport,
  batches: readonly SmsEvaluationBatchEvidence[]
): SmsEvaluationCaseViewModel {
  const outcome = getEvaluationCaseOutcome(report);
  const mismatchFields = report.mismatches.map(({ field }) => field);
  if (
    outcome === "mismatched" &&
    report.expected.kind === "transaction" &&
    report.actual.length !== 1 &&
    !mismatchFields.includes("transaction")
  ) {
    mismatchFields.push("transaction_count");
  }

  return {
    caseId: report.caseId,
    providerId: report.providerId,
    providerName:
      getInstitutionById(report.providerId)?.shortName ?? report.providerId,
    sender: report.sender,
    body: report.body,
    templateGroup: report.templateGroup,
    outcome,
    finalClassification: report.finalClassification,
    expectedKind: report.expected.kind,
    actualKind:
      report.finalClassification !== "observed"
        ? "unavailable"
        : report.actual.length === 0
          ? "no_transaction"
          : "transaction",
    actualTransactionCount: report.actual.length,
    fields: fieldViewModels(report),
    mismatchFields,
    batch: batchForCase(report.caseId, batches),
  };
}

export function createSmsEvaluationSummaryViewModel(
  report: EvaluationReport
): SmsEvaluationSummaryViewModel {
  const outcome = summarizeEvaluationCaseOutcomes(report.cases);
  const returnedTransactionCount = report.cases.reduce(
    (count, item) =>
      item.finalClassification === "observed"
        ? count + item.actual.length
        : count,
    0
  );

  return {
    matched: outcome.matched,
    mismatched: outcome.mismatched,
    notEvaluated: outcome.notEvaluated,
    returnedTransactionCount,
    correctNonTransactions: outcome.correctNonTransactions,
    issueCount: outcome.mismatched + outcome.notEvaluated,
    providerCount: report.providerSummaries.length,
    caseCount: report.cases.length,
  };
}
