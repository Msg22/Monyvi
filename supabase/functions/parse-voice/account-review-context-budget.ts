/**
 * #395 T012 — opt-in Voice v2 rendered text admission only.
 * Audio/base64 never contributes to this TEXT estimate. These numbers mirror
 * the existing SMS safety envelope but do not import or mutate SMS policy.
 */
const MAX_VOICE_V2_TEXT_BYTES = 128 * 1024;
const MAX_VOICE_V2_ESTIMATED_TEXT_TOKENS = 32_000;
const CONSERVATIVE_UTF8_BYTES_PER_TOKEN = 3;

interface VoiceV2RenderedText {
  readonly systemInstruction: string;
  readonly userText: string;
  readonly responseJsonSchema: unknown;
}

/** Measure exactly the three text components handed to Gemini, once each. */
export function fitsVoiceReviewV2ContextBudget(
  input: VoiceV2RenderedText
): boolean {
  const schemaText = JSON.stringify(input.responseJsonSchema);
  if (typeof schemaText !== "string") return false;
  const encoder = new TextEncoder();
  const lengths = [input.systemInstruction, input.userText, schemaText].map(
    (part) => encoder.encode(part).length
  );
  const totalBytes = lengths.reduce((sum, count) => sum + count, 0);
  const estimatedTokens = lengths.reduce(
    (sum, count) => sum + Math.ceil(count / CONSERVATIVE_UTF8_BYTES_PER_TOKEN),
    0
  );
  return (
    totalBytes <= MAX_VOICE_V2_TEXT_BYTES &&
    estimatedTokens <= MAX_VOICE_V2_ESTIMATED_TEXT_TOKENS
  );
}
