export interface SmsInputTokenEstimate {
  readonly promptTokens: number;
  readonly categoryTokens: number;
  readonly schemaTokens: number;
  readonly candidateTokens: number;
  readonly totalTokens: number;
}

interface EstimateSmsRequestInput {
  readonly prompt: string;
  readonly categories: string;
  readonly schema: string;
  readonly messages: readonly string[];
}

interface CanFitSmsCandidateInput {
  readonly candidatePayload: string;
  readonly fixedPayloadBytes: number;
  readonly fixedInputTokens: number;
  readonly maxPayloadBytes: number;
  readonly maxInputTokens: number;
}

export type SmsCandidateFitDecision =
  | { readonly fits: true }
  | { readonly fits: false; readonly reason: "candidate_too_large" };

const CONSERVATIVE_BYTES_PER_TOKEN = 3;

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function estimateTokens(value: string): number {
  return Math.ceil(getUtf8ByteLength(value) / CONSERVATIVE_BYTES_PER_TOKEN);
}

export function estimateSmsRequestInputTokens(
  input: EstimateSmsRequestInput
): SmsInputTokenEstimate {
  const promptTokens = estimateTokens(input.prompt);
  const categoryTokens = estimateTokens(input.categories);
  const schemaTokens = estimateTokens(input.schema);
  const candidateTokens = input.messages.reduce(
    (total, message) => total + estimateTokens(message),
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

export function canFitSmsCandidate(
  input: CanFitSmsCandidateInput
): SmsCandidateFitDecision {
  const candidateBytes = getUtf8ByteLength(input.candidatePayload);
  const candidateTokens = estimateTokens(input.candidatePayload);
  const fits =
    input.fixedPayloadBytes + candidateBytes <= input.maxPayloadBytes &&
    input.fixedInputTokens + candidateTokens <= input.maxInputTokens;

  return fits ? { fits: true } : { fits: false, reason: "candidate_too_large" };
}
