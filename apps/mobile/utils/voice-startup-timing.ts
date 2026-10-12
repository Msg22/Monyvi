/**
 * Privacy-safe startup diagnostics. Measuring/logging is strictly best effort:
 * absence of a monotonic clock or failure of the diagnostic sink must never
 * change recording admission, native readiness, or captured audio.
 */
import { logger } from "@/utils/logger";

export type VoiceStartupStage =
  | "consent"
  | "availability"
  | "permission"
  | "availability_permission"
  | "native_start";

export function voiceStartupClock(): number | null {
  try {
    const value = performance.now();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function finishVoiceStartupStage(
  stage: VoiceStartupStage,
  startedAt: number | null
): void {
  if (startedAt === null) return;
  const now = voiceStartupClock();
  if (now === null) return;
  const durationMs = Math.max(0, now - startedAt);
  if (!Number.isFinite(durationMs)) return;
  try {
    logger.info("voice.startupTiming", { stage, durationMs });
  } catch {
    // Optional diagnostics must never fail or delay Voice admission.
  }
}

export async function timeVoiceStartupStage<T>(
  stage: VoiceStartupStage,
  operation: () => Promise<T> | T
): Promise<T> {
  const startedAt = voiceStartupClock();
  try {
    return await operation();
  } finally {
    finishVoiceStartupStage(stage, startedAt);
  }
}

/** Launch both safe preflight reads before awaiting either one. */
export async function runVoiceStartupPreflight<TAvailability, TPermission>(
  readAvailability: () => Promise<TAvailability> | TAvailability,
  readPermission: () => Promise<TPermission> | TPermission
): Promise<readonly [TAvailability, TPermission]> {
  const startedAt = voiceStartupClock();
  try {
    return await Promise.all([
      timeVoiceStartupStage("availability", readAvailability),
      timeVoiceStartupStage("permission", readPermission),
    ]);
  } finally {
    finishVoiceStartupStage("availability_permission", startedAt);
  }
}
