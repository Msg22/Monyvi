import type { EvaluationCaseReport } from "./types";

export type EvaluationCaseOutcome =
  | "matched"
  | "mismatched"
  | "not_evaluated";

export interface EvaluationCaseOutcomeSummary {
  readonly matched: number;
  readonly mismatched: number;
  readonly notEvaluated: number;
  readonly matchedTransactions: number;
  readonly correctNonTransactions: number;
}

export function getEvaluationCaseOutcome(
  report: EvaluationCaseReport
): EvaluationCaseOutcome {
  if (report.finalClassification !== "observed") {
    return "not_evaluated";
  }

  if (report.mismatches.length > 0) {
    return "mismatched";
  }

  if (report.expected.kind === "no_transaction") {
    return report.actual.length === 0 ? "matched" : "mismatched";
  }

  return report.actual.length === 1 ? "matched" : "mismatched";
}

export function summarizeEvaluationCaseOutcomes(
  reports: readonly EvaluationCaseReport[]
): EvaluationCaseOutcomeSummary {
  let matched = 0;
  let mismatched = 0;
  let notEvaluated = 0;
  let matchedTransactions = 0;
  let correctNonTransactions = 0;

  for (const report of reports) {
    const outcome = getEvaluationCaseOutcome(report);
    if (outcome === "matched") {
      matched++;
      if (report.expected.kind === "no_transaction") {
        correctNonTransactions++;
      } else {
        matchedTransactions++;
      }
    } else if (outcome === "mismatched") {
      mismatched++;
    } else {
      notEvaluated++;
    }
  }

  return {
    matched,
    mismatched,
    notEvaluated,
    matchedTransactions,
    correctNonTransactions,
  };
}
