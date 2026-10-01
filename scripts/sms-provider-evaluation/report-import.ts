import type { EvaluationReport } from "./types.ts";

export function parseStoredEvaluationReport(
  _value: unknown
): EvaluationReport {
  throw new Error("sms_provider_evaluation_saved_report_not_implemented");
}
