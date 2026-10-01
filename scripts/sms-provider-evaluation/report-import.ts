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

  const caseIds = new Set<string>();
  for (const item of parsed.data.cases) {
    if (caseIds.has(item.caseId)) {
      throw new Error("sms_provider_evaluation_saved_report_invalid");
    }
    caseIds.add(item.caseId);
  }

  const batchIds = new Set<string>();
  for (const entry of parsed.data.rawAttributionManifest) {
    if (batchIds.has(entry.batchId)) {
      throw new Error("sms_provider_evaluation_saved_report_invalid");
    }
    batchIds.add(entry.batchId);
    if (entry.caseIds.some((caseId) => !caseIds.has(caseId))) {
      throw new Error("sms_provider_evaluation_saved_report_invalid");
    }
  }

  return parsed.data;
}
