/**
 * Voice Silence Guard (Issue #391)
 *
 * Pure domain logic for conservative on-device audio metering classification.
 * Evaluates candidate silence thresholds and unbroken capture coverage over
 * running O(1) summary counters.
 *
 * Architecture & Design Rationale:
 * - Pattern: Strategy / Specification Pattern (pure rule evaluation)
 * - Why: Zero React or WatermelonDB dependencies; decoupled pure calculation in @monyvi/logic.
 * - Invariant: High-recall for speech over silence rejection. Fails open on any uncertainty,
 *   sentinel floor (<= -160.0 dBFS), status error, sparse gap, or boundary uncovered span.
 *
 * @module voice-silence-guard
 */

// ---------------------------------------------------------------------------
// Constants (Approved Contracts)
// ---------------------------------------------------------------------------

/**
 * Strict silence threshold in dBFS.
 * Evaluated strictly as `sample < -70.0 dBFS`.
 * Any sample at or above `-70.0 dBFS` (including exact equality at `-70.0 dBFS`)
 * is considered potentially audible and fails open to the server.
 */
export const METERING_SILENCE_THRESHOLD_DBFS = -70.0;

/**
 * Minimum active recording duration in milliseconds (paused time excluded).
 */
export const METERING_MIN_ACTIVE_DURATION_MS = 1500;

/**
 * Minimum count of uncorrupted valid metering samples in (-160.0, 0.0].
 */
export const METERING_MIN_VALID_SAMPLES = 10;

/**
 * Maximum allowed active time gap between consecutive valid metering samples (ms).
 */
export const METERING_MAX_ACTIVE_GAP_MS = 250;

/**
 * Maximum allowed active duration before the first valid metering sample (ms).
 */
export const METERING_MAX_LEADING_UNCOVERED_MS = 200;

/**
 * Maximum allowed active duration after the last valid metering sample (ms).
 */
export const METERING_MAX_TRAILING_UNCOVERED_MS = 200;

/**
 * Android sentinel floor value in dBFS.
 * Android native getStatus maps maxAmplitude == 0 and caught native exceptions
 * to -160.0 dBFS. Any observation <= -160.0 dBFS poisons the generation and fails open.
 */
export const METERING_SENTINEL_FLOOR_DBFS = -160.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Summary metrics of audio metering accumulated in O(1) over an active recording session.
 */
export interface AudioMeteringSummary {
  /** Count of valid metering samples received in (-160.0, 0.0]. */
  readonly validSampleCount: number;
  /** Whether any sample >= -70.0 dBFS was observed (including exact equality at -70.0). */
  readonly hasAudibleSample: boolean;
  /** Whether a sentinel/floor level (<= -160.0 dBFS), non-finite value, or native error was observed. */
  readonly hasSentinelOrPoison: boolean;
  /** Active capture elapsed time (ms) when the first valid sample was recorded. */
  readonly firstSampleActiveMs: number | null;
  /** Active capture elapsed time (ms) when the most recent valid sample was recorded. */
  readonly lastSampleActiveMs: number | null;
  /** Maximum active gap (ms) between consecutive valid samples. */
  readonly maxActiveGapMs: number;
  /** Total active capture duration (ms) at finalization (excluding paused time). */
  readonly activeDurationMs: number;
}

export type VoiceSilenceReason =
  | "silence_confirmed"
  | "audible_sample_detected"
  | "sentinel_or_poison"
  | "duration_too_short"
  | "insufficient_samples"
  | "leading_span_uncovered"
  | "trailing_span_uncovered"
  | "gap_too_large"
  | "missing_data";

export interface VoiceSilenceClassification {
  readonly isSilent: boolean;
  readonly reason: VoiceSilenceReason;
}

export interface AudioMeteringAccumulator {
  /** Ingests one metering level reading at the given active elapsed time in milliseconds. */
  addSample(level: number, activeMs: number): void;
  /** Marks the generation poisoned (e.g. native getStatus error or unrecoverable reset). */
  recordPoison(): void;
  /** Freezes the summary snapshot at the final active capture duration. */
  finalize(finalActiveMs: number): AudioMeteringSummary;
  /** Reads current summary without finalizing. */
  getSummary(currentActiveMs?: number): AudioMeteringSummary;
  /** Clears all counters for a new recording generation. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Accumulator Factory
// ---------------------------------------------------------------------------

/**
 * Creates an O(1) running accumulator for audio metering samples.
 * Does not retain raw sample arrays or allocate per-tick collections.
 */
export function createAudioMeteringAccumulator(): AudioMeteringAccumulator {
  let validSampleCount = 0;
  let hasAudibleSample = false;
  let hasSentinelOrPoison = false;
  let firstSampleActiveMs: number | null = null;
  let lastSampleActiveMs: number | null = null;
  let maxActiveGapMs = 0;

  return {
    addSample(level: number, activeMs: number): void {
      if (!Number.isFinite(level)) {
        hasSentinelOrPoison = true;
        return;
      }
      if (level <= METERING_SENTINEL_FLOOR_DBFS) {
        hasSentinelOrPoison = true;
        return;
      }
      if (level > 0.0) {
        hasSentinelOrPoison = true;
        return;
      }

      if (!Number.isFinite(activeMs) || activeMs < 0) {
        hasSentinelOrPoison = true;
        return;
      }
      if (lastSampleActiveMs !== null && activeMs <= lastSampleActiveMs) {
        hasSentinelOrPoison = true;
        return;
      }

      validSampleCount += 1;
      if (level >= METERING_SILENCE_THRESHOLD_DBFS) {
        hasAudibleSample = true;
      }

      if (firstSampleActiveMs === null) {
        firstSampleActiveMs = activeMs;
      } else if (lastSampleActiveMs !== null) {
        const gap = activeMs - lastSampleActiveMs;
        if (gap > maxActiveGapMs) {
          maxActiveGapMs = gap;
        }
      }
      lastSampleActiveMs = activeMs;
    },

    recordPoison(): void {
      hasSentinelOrPoison = true;
    },

    finalize(finalActiveMs: number): AudioMeteringSummary {
      let poison = hasSentinelOrPoison;
      if (!Number.isFinite(finalActiveMs) || finalActiveMs < 0) {
        poison = true;
      }
      if (lastSampleActiveMs !== null && finalActiveMs < lastSampleActiveMs) {
        poison = true;
      }
      if (firstSampleActiveMs !== null && finalActiveMs < firstSampleActiveMs) {
        poison = true;
      }
      if (
        firstSampleActiveMs !== null &&
        lastSampleActiveMs !== null &&
        firstSampleActiveMs > lastSampleActiveMs
      ) {
        poison = true;
      }
      hasSentinelOrPoison = poison;
      return {
        validSampleCount,
        hasAudibleSample,
        hasSentinelOrPoison: poison,
        firstSampleActiveMs,
        lastSampleActiveMs,
        maxActiveGapMs,
        activeDurationMs: finalActiveMs,
      };
    },

    getSummary(currentActiveMs = 0): AudioMeteringSummary {
      const isCurrentValid =
        Number.isFinite(currentActiveMs) && currentActiveMs >= 0;
      const poison = hasSentinelOrPoison || !isCurrentValid;
      return {
        validSampleCount,
        hasAudibleSample,
        hasSentinelOrPoison: poison,
        firstSampleActiveMs,
        lastSampleActiveMs,
        maxActiveGapMs,
        activeDurationMs: currentActiveMs,
      };
    },

    reset(): void {
      validSampleCount = 0;
      hasAudibleSample = false;
      hasSentinelOrPoison = false;
      firstSampleActiveMs = null;
      lastSampleActiveMs = null;
      maxActiveGapMs = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Pure Classifier
// ---------------------------------------------------------------------------

/**
 * Validates numeric integrity and chronological consistency of summary metrics.
 * Returns true if summary is corrupted or physically impossible.
 */
function isCorruptedOrInconsistentSummary(
  summary: AudioMeteringSummary
): boolean {
  if (
    !Number.isFinite(summary.validSampleCount) ||
    summary.validSampleCount < 0 ||
    !Number.isFinite(summary.activeDurationMs) ||
    summary.activeDurationMs < 0 ||
    !Number.isFinite(summary.maxActiveGapMs) ||
    summary.maxActiveGapMs < 0
  ) {
    return true;
  }

  const { firstSampleActiveMs, lastSampleActiveMs, activeDurationMs } = summary;

  if (firstSampleActiveMs !== null) {
    if (!Number.isFinite(firstSampleActiveMs) || firstSampleActiveMs < 0) {
      return true;
    }
    if (activeDurationMs < firstSampleActiveMs) {
      return true;
    }
  }

  if (lastSampleActiveMs !== null) {
    if (!Number.isFinite(lastSampleActiveMs) || lastSampleActiveMs < 0) {
      return true;
    }
    if (activeDurationMs < lastSampleActiveMs) {
      return true;
    }
  }

  if (
    firstSampleActiveMs !== null &&
    lastSampleActiveMs !== null &&
    firstSampleActiveMs > lastSampleActiveMs
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies an AudioMeteringSummary against the approved silence policy.
 * Evaluates candidate silence thresholds and unbroken capture coverage.
 * Fails open (isSilent = false) on any missing, sparse, or sentinel sample.
 */
export function classifyVoiceSilence(
  summary: AudioMeteringSummary | null | undefined
): VoiceSilenceClassification {
  if (!summary) {
    return { isSilent: false, reason: "missing_data" };
  }

  if (
    summary.hasSentinelOrPoison ||
    isCorruptedOrInconsistentSummary(summary)
  ) {
    return { isSilent: false, reason: "sentinel_or_poison" };
  }

  if (summary.hasAudibleSample) {
    return { isSilent: false, reason: "audible_sample_detected" };
  }

  if (summary.activeDurationMs < METERING_MIN_ACTIVE_DURATION_MS) {
    return { isSilent: false, reason: "duration_too_short" };
  }

  if (summary.validSampleCount < METERING_MIN_VALID_SAMPLES) {
    return { isSilent: false, reason: "insufficient_samples" };
  }

  if (
    summary.firstSampleActiveMs === null ||
    summary.firstSampleActiveMs > METERING_MAX_LEADING_UNCOVERED_MS
  ) {
    return { isSilent: false, reason: "leading_span_uncovered" };
  }

  if (
    summary.lastSampleActiveMs === null ||
    summary.activeDurationMs - summary.lastSampleActiveMs >
      METERING_MAX_TRAILING_UNCOVERED_MS
  ) {
    return { isSilent: false, reason: "trailing_span_uncovered" };
  }

  if (summary.maxActiveGapMs > METERING_MAX_ACTIVE_GAP_MS) {
    return { isSilent: false, reason: "gap_too_large" };
  }

  return { isSilent: true, reason: "silence_confirmed" };
}

/**
 * Convenience helper returning boolean rejection decision.
 */
export function isVoiceSilenceRejected(
  summary: AudioMeteringSummary | null | undefined
): boolean {
  return classifyVoiceSilence(summary).isSilent;
}
