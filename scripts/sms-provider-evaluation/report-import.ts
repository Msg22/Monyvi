import {
  EvaluationReportImportSchema,
  type EvaluationReport,
} from "./types.ts";

export function parseStoredEvaluationReport(
  value: unknown
): EvaluationReport {
  const parsed = EvaluationReportImportSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("sms_provider_evaluation_saved_report_invalid");
  }

  return parsed.data;
}
