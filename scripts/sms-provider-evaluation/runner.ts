import type {
  EvaluationReport,
  EvaluationRunOptions,
  EvaluationRunnerDependencies,
} from "./types.ts";

export interface PreparedEvaluationRequest {
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly inputIdentity: string;
  readonly url: string;
  readonly init: RequestInit;
}

export function validateEvaluationRunOptions(
  _options: EvaluationRunOptions
): EvaluationRunOptions {
  throw new Error("sms_provider_evaluation_live_guard_not_implemented");
}

export async function runSmsProviderEvaluation(
  _options: EvaluationRunOptions,
  _dependencies: EvaluationRunnerDependencies
): Promise<EvaluationReport> {
  throw new Error("sms_provider_evaluation_runner_not_implemented");
}
