export const VOICE_AI_USAGE_TELEMETRY_EVENT = "voice_ai_gemini_usage" as const;
export const VOICE_AI_USAGE_TELEMETRY_MODEL = "gemini-2.5-flash-lite" as const;

/**
 * Validated, privacy-minimized telemetry event structure.
 * Guaranteed to contain no user IDs, request keys, transcripts, or prompts.
 */
export interface VoiceAiUsageTelemetryEvent {
  readonly event: typeof VOICE_AI_USAGE_TELEMETRY_EVENT;
  readonly model: typeof VOICE_AI_USAGE_TELEMETRY_MODEL;
  readonly attempt: number;
  readonly promptTokenCount: number | null;
  readonly cachedContentTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly totalTokenCount: number | null;
  readonly cacheObservedHit: boolean | null;
  readonly cachedInputRatio: number | null;
}

/**
 * Dependency-injected sink for telemetry events.
 */
export type VoiceAiUsageTelemetrySink = (
  event: VoiceAiUsageTelemetryEvent
) => void;

/**
 * Lazy reader returning usage metadata or throwing on getter access.
 */
export type VoiceAiUsageMetadataReader = () => unknown;

/**
 * Validates and extracts a non-negative integer token count.
 */
function parseValidCount(val: unknown): number | null {
  if (
    typeof val === "number" &&
    Number.isFinite(val) &&
    Number.isInteger(val) &&
    val >= 0 &&
    Number.isSafeInteger(val)
  ) {
    return val;
  }
  return null;
}

/**
 * Safely reads a property from an unknown candidate without throwing on getter errors.
 */
function safeReadField(obj: unknown, field: string): unknown {
  try {
    if (typeof obj === "object" && obj !== null) {
      return (obj as Record<string, unknown>)[field];
    }
  } catch {
    // Getter throw is safely caught and treated as undefined
  }
  return undefined;
}

/**
 * Pure helper for validated pair hit and ratio computation.
 */
function computeHitAndRatio(
  prompt: number | null,
  cached: number | null
): {
  readonly hit: boolean | null;
  readonly ratio: number | null;
} {
  if (prompt !== null && cached !== null && cached <= prompt) {
    const hit = cached > 0;
    const ratio = prompt > 0 ? cached / prompt : null;
    return { hit, ratio };
  }
  return { hit: null, ratio: null };
}

/**
 * Normalizes attempt to a non-negative safe integer.
 */
function normalizeAttempt(attempt: number): number {
  if (typeof attempt === "number" && Number.isFinite(attempt) && attempt >= 0) {
    return Math.floor(attempt);
  }
  return 0;
}

/**
 * Pure function to extract and sanitize usage telemetry.
 *
 * Rules:
 * - Missing or invalid counts become null, never 0 by default.
 * - Negative, fractional, NaN, infinite, or unsafe integers are nullified.
 * - Hit determination:
 *   - Requires valid prompt and valid cached count where cached <= prompt.
 *   - If cached > prompt (contradictory), cacheObservedHit is null and ratio is null.
 *   - If prompt is missing/null, cacheObservedHit is null and ratio is null even if cached count is present.
 *   - If cached is missing/null, cacheObservedHit is null and ratio is null.
 *   - If cached === 0 and prompt >= 0, cacheObservedHit is false (observed miss).
 *   - If cached > 0 and cached <= prompt, cacheObservedHit is true (observed hit).
 * - Ratio calculation:
 *   - Only when prompt > 0 and 0 <= cached <= prompt: cached / prompt.
 *   - If prompt === 0 and cached === 0: ratio is null (cannot divide by zero).
 *   - Otherwise null.
 * - Attempt is 0-indexed non-negative integer.
 */
export function extractVoiceAiUsageTelemetry(
  usageMetadata: unknown,
  attempt: number
): VoiceAiUsageTelemetryEvent {
  const safeAttempt = normalizeAttempt(attempt);

  const promptTokenCount = parseValidCount(
    safeReadField(usageMetadata, "promptTokenCount")
  );
  const cachedContentTokenCount = parseValidCount(
    safeReadField(usageMetadata, "cachedContentTokenCount")
  );
  const candidatesTokenCount = parseValidCount(
    safeReadField(usageMetadata, "candidatesTokenCount")
  );
  const totalTokenCount = parseValidCount(
    safeReadField(usageMetadata, "totalTokenCount")
  );

  const { hit: cacheObservedHit, ratio: cachedInputRatio } = computeHitAndRatio(
    promptTokenCount,
    cachedContentTokenCount
  );

  return {
    event: VOICE_AI_USAGE_TELEMETRY_EVENT,
    model: VOICE_AI_USAGE_TELEMETRY_MODEL,
    attempt: safeAttempt,
    promptTokenCount,
    cachedContentTokenCount,
    candidatesTokenCount,
    totalTokenCount,
    cacheObservedHit,
    cachedInputRatio,
  };
}

/**
 * Default telemetry sink: structured JSON output via console.info.
 */
export const defaultVoiceAiUsageTelemetrySink: VoiceAiUsageTelemetrySink = (
  event: VoiceAiUsageTelemetryEvent
): void => {
  console.info(JSON.stringify(event));
};

/**
 * Non-throwing observability boundary for logging Gemini usage metadata.
 * Accepts either usage metadata or a lazy reader function (e.g. () => response.usageMetadata).
 * Every returned attempt emits an observation event unless the sink itself fails.
 * If reading usageMetadata throws, safe fallback reads undefined, emitting an event with null counts.
 */
export function logVoiceAiUsageTelemetry(
  usageMetadataOrReader: unknown | VoiceAiUsageMetadataReader,
  attempt: number,
  sink: VoiceAiUsageTelemetrySink = defaultVoiceAiUsageTelemetrySink
): void {
  let raw: unknown = undefined;
  try {
    raw =
      typeof usageMetadataOrReader === "function"
        ? (usageMetadataOrReader as VoiceAiUsageMetadataReader)()
        : usageMetadataOrReader;
  } catch {
    // Reader or getter throw caught safely; raw stays undefined to emit null counts event
    raw = undefined;
  }

  try {
    const event = extractVoiceAiUsageTelemetry(raw, attempt);
    sink(event);
  } catch {
    // Sink error is swallowed cleanly so telemetry failure never disrupts server execution
  }
}
