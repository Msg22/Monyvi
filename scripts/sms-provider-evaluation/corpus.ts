import type { SyntheticEvaluationCase } from "./types.ts";

export interface BuildSyntheticEvaluationCorpusOptions {
  readonly runId: string;
  readonly anchorMs: number;
}

export async function buildSyntheticEvaluationCorpus(
  _options: BuildSyntheticEvaluationCorpusOptions
): Promise<readonly SyntheticEvaluationCase[]> {
  throw new Error("sms_provider_evaluation_corpus_not_implemented");
}
