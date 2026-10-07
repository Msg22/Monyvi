import { computeSmsFingerprintAtEdge } from "../../supabase/functions/_shared/sms-fingerprint-at-edge.ts";
import {
  buildSyntheticEvaluationCorpus as buildSharedSyntheticEvaluationCorpus,
  getSyntheticEvaluationDatasetSummary,
  type BuildSyntheticEvaluationCorpusOptions,
  type SyntheticEvaluationCase,
} from "../../packages/logic/src/sms-provider-evaluation/index.ts";

export { getSyntheticEvaluationDatasetSummary };
export type { BuildSyntheticEvaluationCorpusOptions };

export async function buildSyntheticEvaluationCorpus(
  options: BuildSyntheticEvaluationCorpusOptions
): Promise<readonly SyntheticEvaluationCase[]> {
  return buildSharedSyntheticEvaluationCorpus(options, {
    computeFingerprint: computeSmsFingerprintAtEdge,
  });
}
