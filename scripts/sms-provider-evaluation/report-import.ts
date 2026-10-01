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

  const summaryBatchIds = new Set<string>();
  for (const summary of parsed.data.batchSummaries) {
    if (summaryBatchIds.has(summary.batchId)) {
      throw new Error("sms_provider_evaluation_saved_report_invalid");
    }
    summaryBatchIds.add(summary.batchId);
  }

  const manifestBatchIds = new Set<string>();
  for (const entry of parsed.data.rawAttributionManifest) {
    if (
      manifestBatchIds.has(entry.batchId) ||
      !summaryBatchIds.has(entry.batchId)
    ) {
      throw new Error("sms_provider_evaluation_saved_report_invalid");
    }
    manifestBatchIds.add(entry.batchId);

    const entryCaseIds = new Set(entry.caseIds);
    if (
      entryCaseIds.size !== entry.caseIds.length ||
      entry.caseIds.some((caseId) => !caseIds.has(caseId))
    ) {
      throw new Error("sms_provider_evaluation_saved_report_invalid");
    }
  }

  return parsed.data;
}
