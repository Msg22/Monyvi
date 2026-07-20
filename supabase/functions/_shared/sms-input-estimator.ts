export interface SmsInputTokenEstimateAtEdge {
  readonly promptTokens: number;
  readonly categoryTokens: number;
  readonly schemaTokens: number;
  readonly candidateTokens: number;
  readonly totalTokens: number;
}

interface EstimateSmsRequestInputAtEdge {
  readonly prompt: string;
  readonly categories: string;
  readonly schema: string;
  readonly messages: readonly string[];
}

interface CanFitSmsCandidateAtEdgeInput {
  readonly candidatePayload: string;
  readonly fixedPayloadBytes: number;
  readonly fixedInputTokens: number;
  readonly maxPayloadBytes: number;
  readonly maxInputTokens: number;
}

export type SmsCandidateFitDecisionAtEdge =
  | { readonly fits: true }
  | { readonly fits: false; readonly reason: "candidate_too_large" };

const CONSERVATIVE_BYTES_PER_TOKEN = 3;

export function getUtf8ByteLengthAtEdge(value: string): number {
  return new TextEncoder().encode(value).length;
}

function estimateTokensAtEdge(value: string): number {
  return Math.ceil(
    getUtf8ByteLengthAtEdge(value) / CONSERVATIVE_BYTES_PER_TOKEN
  );
}

export function estimateSmsRequestInputTokensAtEdge(
  input: EstimateSmsRequestInputAtEdge
): SmsInputTokenEstimateAtEdge {
  const promptTokens = estimateTokensAtEdge(input.prompt);
  const categoryTokens = estimateTokensAtEdge(input.categories);
  const schemaTokens = estimateTokensAtEdge(input.schema);
  const candidateTokens = input.messages.reduce(
    (total, message) => total + estimateTokensAtEdge(message),
    0
  );

  return {
    promptTokens,
    categoryTokens,
    schemaTokens,
    candidateTokens,
    totalTokens: promptTokens + categoryTokens + schemaTokens + candidateTokens,
  };
}

export function canFitSmsCandidateAtEdge(
  input: CanFitSmsCandidateAtEdgeInput
): SmsCandidateFitDecisionAtEdge {
  const candidateBytes = getUtf8ByteLengthAtEdge(input.candidatePayload);
  const candidateTokens = estimateTokensAtEdge(input.candidatePayload);
  const fits =
    input.fixedPayloadBytes + candidateBytes <= input.maxPayloadBytes &&
    input.fixedInputTokens + candidateTokens <= input.maxInputTokens;

  return fits ? { fits: true } : { fits: false, reason: "candidate_too_large" };
}
