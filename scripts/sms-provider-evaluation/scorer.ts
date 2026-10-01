import type {
  EvaluationReport,
  FinalBatchObservation,
  RawObservationImport,
  SyntheticEvaluationCase,
} from "./types.ts";

export interface ScoreEvaluationInput {
  readonly runId: string;
  readonly mode: "dry-run" | "live";
  readonly cancelled?: boolean;
  readonly cases: readonly SyntheticEvaluationCase[];
  readonly finalObservations: readonly FinalBatchObservation[];
  readonly rawObservations?: RawObservationImport;
}

export function scoreSmsProviderEvaluation(
  _input: ScoreEvaluationInput
): EvaluationReport {
  throw new Error("sms_provider_evaluation_scorer_not_implemented");
}
