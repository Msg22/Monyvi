import {
  RawObservationImportSchema,
  type RawObservationImport,
  type SyntheticEvaluationCase,
} from "./types.ts";

export interface ParseRawObservationImportInput {
  readonly value: unknown;
  readonly runId: string;
  readonly expectedBatchInputs: ReadonlyMap<
    string,
    {
      readonly caseIds: readonly string[];
      readonly inputIdentity: string;
    }
  >;
  readonly cases: readonly Pick<SyntheticEvaluationCase, "caseId">[];
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function parseRawObservationImport(
  input: ParseRawObservationImportInput
): RawObservationImport {
  const parsed = RawObservationImportSchema.parse(input.value);
  if (parsed.runId !== input.runId) {
    throw new Error("sms_provider_evaluation_raw_run_mismatch");
  }

  const knownCaseIds = new Set(input.cases.map(({ caseId }) => caseId));
  const seenBatches = new Set<string>();

  for (const batch of parsed.batches) {
    if (batch.runId !== input.runId) {
      throw new Error("sms_provider_evaluation_raw_run_mismatch");
    }
    if (seenBatches.has(batch.batchId)) {
      throw new Error("sms_provider_evaluation_raw_batch_duplicate");
    }
    seenBatches.add(batch.batchId);

    const expected = input.expectedBatchInputs.get(batch.batchId);
    if (expected === undefined) {
      throw new Error("sms_provider_evaluation_raw_batch_unknown");
    }
    if (
      batch.inputIdentity !== expected.inputIdentity ||
      !sameStrings(batch.caseIds, expected.caseIds)
    ) {
      throw new Error("sms_provider_evaluation_raw_attribution_mismatch");
    }
    if (batch.caseIds.some((caseId) => !knownCaseIds.has(caseId))) {
      throw new Error("sms_provider_evaluation_raw_case_unknown");
    }
  }

  return parsed;
}
