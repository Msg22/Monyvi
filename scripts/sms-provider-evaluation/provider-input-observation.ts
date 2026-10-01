import type {
  ProviderInputObservationImport,
  SyntheticEvaluationCase,
} from "./types.ts";

export interface ParseProviderInputObservationImportInput {
  readonly value: unknown;
  readonly runId: string;
  readonly expectedBatchInputs: ReadonlyMap<
    string,
    {
      readonly caseIds: readonly string[];
      readonly inputIdentity: string;
    }
  >;
  readonly cases: readonly Pick<SyntheticEvaluationCase, "caseId" | "message">[];
}

export async function parseProviderInputObservationImport(
  _input: ParseProviderInputObservationImportInput
): Promise<ProviderInputObservationImport> {
  throw new Error("sms_provider_evaluation_provider_input_not_implemented");
}
