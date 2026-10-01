import type {
  RawObservationImport,
  SyntheticEvaluationCase,
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
  readonly cases: readonly SyntheticEvaluationCase[];
}

export function parseRawObservationImport(
  _input: ParseRawObservationImportInput
): RawObservationImport {
  throw new Error("sms_provider_evaluation_raw_import_not_implemented");
}
