import {
  getEvaluationCaseOutcome,
  getInstitutionById,
  summarizeEvaluationCaseOutcomes,
  type EvaluationCaseReport,
  type EvaluationFieldExpectation,
  type EvaluationReport,
} from "@monyvi/logic";

import {
  SMS_EVALUATION_FIELD_KEYS,
  type SmsEvaluationBatchEvidence,
  type SmsEvaluationCaseViewModel,
  type SmsEvaluationExpectedDisplay,
  type SmsEvaluationFieldKey,
  type SmsEvaluationFieldViewModel,
  type SmsEvaluationParsedDisplay,
  type SmsEvaluationSummaryViewModel,
} from "@/components/sms-provider-evaluation/presentation";

function expectedField(
  expectation: EvaluationFieldExpectation<unknown>
): SmsEvaluationExpectedDisplay {
  if (expectation.kind === "unknown") return { kind: "not_asserted" };
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
  if (transaction === undefined) return { kind: "unavailable" };
  const value =
    key === "isAtmWithdrawal"
      ? transaction.isAtmWithdrawal ?? false
      : transaction[key];
  return value === undefined
    ? { kind: "not_provided" }
    : { kind: "value", value };
}

function expectedConfidence(
  report: EvaluationCaseReport
): SmsEvaluationExpectedDisplay {
  if (report.expected.kind === "no_transaction") {
    return { kind: "not_asserted" };
  }
  const expectation = report.expected.fields.confidenceScore;
  if (expectation.kind === "unknown") return { kind: "not_asserted" };
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

function actualConfidence(
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

function fieldViewModel(
  report: EvaluationCaseReport,
  key: SmsEvaluationFieldKey,
  mismatchFields: ReadonlySet<string>
): SmsEvaluationFieldViewModel {
  if (key === "confidenceScore") {
    return {
      key,
      expected: expectedConfidence(report),
      parsed: actualConfidence(report),
      isMismatch: mismatchFields.has(key),
    };
  }
  return {
    key,
    expected:
      report.expected.kind === "transaction"
        ? expectedField(report.expected.fields[key])
        : { kind: "not_asserted" },
    parsed: actualField(report, key),
    isMismatch: mismatchFields.has(key),
  };
}

function fieldViewModels(
  report: EvaluationCaseReport
): readonly SmsEvaluationFieldViewModel[] {
  if (report.expected.kind === "no_transaction" && report.actual.length === 0) {
    return [];
  }
  const mismatches = new Set(report.mismatches.map(({ field }) => field));
  return SMS_EVALUATION_FIELD_KEYS.map((key) =>
    fieldViewModel(report, key, mismatches)
  );
}

function batchForCase(
  caseId: string,
  batches: readonly SmsEvaluationBatchEvidence[]
): SmsEvaluationBatchEvidence | null {
  return batches.find(({ caseIds }) => caseIds.includes(caseId)) ?? null;
}

function mismatchFieldsFor(
  report: EvaluationCaseReport,
  outcome: SmsEvaluationCaseViewModel["outcome"]
): readonly string[] {
  const mismatches = report.mismatches.map(({ field }) => field);
  if (
    outcome === "mismatched" &&
    report.expected.kind === "transaction" &&
    report.actual.length !== 1 &&
    !mismatches.includes("transaction")
  ) {
    mismatches.push("transaction_count");
  }
  return mismatches;
}

export function createSmsEvaluationCaseViewModel(
  report: EvaluationCaseReport,
  batches: readonly SmsEvaluationBatchEvidence[]
): SmsEvaluationCaseViewModel {
  const outcome = getEvaluationCaseOutcome(report);
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
    actualKind: getActualKind(report),
    actualTransactionCount: report.actual.length,
    fields: fieldViewModels(report),
    mismatchFields: mismatchFieldsFor(report, outcome),
    batch: batchForCase(report.caseId, batches),
  };
}

function getActualKind(
  report: EvaluationCaseReport
): SmsEvaluationCaseViewModel["actualKind"] {
  if (report.finalClassification !== "observed") return "unavailable";
  return report.actual.length === 0 ? "no_transaction" : "transaction";
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
