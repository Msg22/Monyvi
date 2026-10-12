/**
 * Voice Metering Service
 *
 * Platform adapter that queries and normalizes native AudioRecorder status,
 * handling platform-specific characteristics (Android vs iOS mediaServicesDidReset)
 * and feeding uncorrupted readings to the O(1) AudioMeteringAccumulator.
 *
 * Architecture & Design Rationale:
 * - Pattern: Adapter Pattern
 * - Why: Keeps useVoiceRecorder hook under the 900-line budget and decouples
 *   platform-specific status idiosyncrasies from React lifecycle.
 * - Invariant: Android AudioRecorder.kt omits mediaServicesDidReset; iOS supplies it.
 *   Status query exceptions or invalid readings fail open (poison generation).
 *
 * @module voice-metering-service
 */

import { Platform } from "react-native";
import type { AudioRecorder } from "expo-audio";
import type { AudioMeteringAccumulator } from "@monyvi/logic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusValidationResult {
  /** Whether native recorder reported a valid recording state. */
  readonly isValid: boolean;
  /** Extracted metering reading in dBFS, or null if missing/sparse. */
  readonly meteringLevel: number | null;
  /** Whether an error, reset, or sentinel poisoned the generation to fail open. */
  readonly shouldPoison: boolean;
}

// ---------------------------------------------------------------------------
// Status Normalization
// ---------------------------------------------------------------------------

/**
 * Validates a native recorder status bundle according to platform contracts.
 *
 * Requirements:
 * - Platform must be 'android' or 'ios' (unsupported platforms always fail open / poison).
 * - `canRecord === true`
 * - `isRecording === true`
 * - `durationMillis > 0` and finite
 * - Android: accepts normal omission (undefined) of mediaServicesDidReset;
 *   rejects if explicitly true or non-boolean.
 * - iOS: requires mediaServicesDidReset === false.
 * - Missing or non-finite metering reading poisons the generation to fail open.
 */
export function validateRecorderStatus(
  status: unknown,
  targetPlatform: string = Platform.OS
): StatusValidationResult {
  if (typeof status !== "object" || status === null) {
    return { isValid: false, meteringLevel: null, shouldPoison: true };
  }

  // Unsupported Platform.OS must always fail open (poison), even if status looks valid
  if (targetPlatform !== "android" && targetPlatform !== "ios") {
    return { isValid: false, meteringLevel: null, shouldPoison: true };
  }

  const s = status as Record<string, unknown>;

  // Basic native recording state preconditions
  if (s.canRecord !== true || s.isRecording !== true) {
    return { isValid: false, meteringLevel: null, shouldPoison: true };
  }

  if (
    typeof s.durationMillis !== "number" ||
    !Number.isFinite(s.durationMillis) ||
    s.durationMillis <= 0
  ) {
    return { isValid: false, meteringLevel: null, shouldPoison: true };
  }

  // Platform-specific mediaServicesDidReset contract
  if (targetPlatform === "android") {
    // Android AudioRecorder.kt omits mediaServicesDidReset.
    // Accept undefined or false; reject if explicitly true or malformed.
    if (s.mediaServicesDidReset === true) {
      return { isValid: false, meteringLevel: null, shouldPoison: true };
    }
    if (
      s.mediaServicesDidReset !== undefined &&
      typeof s.mediaServicesDidReset !== "boolean"
    ) {
      return { isValid: false, meteringLevel: null, shouldPoison: true };
    }
  } else if (targetPlatform === "ios") {
    // iOS AudioRecorder.swift supplies mediaServicesDidReset; must be false.
    if (s.mediaServicesDidReset !== false) {
      return { isValid: false, meteringLevel: null, shouldPoison: true };
    }
  }

  // Extract metering level: must be a valid finite number.
  // Any missing or non-finite metering level is uncertain and poisons the generation.
  if (typeof s.metering === "number" && Number.isFinite(s.metering)) {
    return { isValid: true, meteringLevel: s.metering, shouldPoison: false };
  }

  return { isValid: false, meteringLevel: null, shouldPoison: true };
}

// ---------------------------------------------------------------------------
// Metering Polling
// ---------------------------------------------------------------------------

/**
 * Queries the native recorder once per active timer tick, feeding the sample
 * into the accumulator. Non-throwing; catches native errors and records poison
 * so the recording safely fails open to the server without log spam.
 */
export function sampleRecorderMetering(
  recorder: AudioRecorder | null,
  accumulator: AudioMeteringAccumulator,
  activeDurationMs: number,
  targetPlatform?: string
): void {
  try {
    if (recorder === null) {
      accumulator.recordPoison();
      return;
    }

    // Access to getStatus property is inside the non-throwing try block
    const queryFn = (recorder as unknown as { getStatus?: () => unknown })
      .getStatus;
    if (typeof queryFn !== "function") {
      accumulator.recordPoison();
      return;
    }

    const rawStatus = queryFn.call(recorder);
    const result = validateRecorderStatus(rawStatus, targetPlatform);

    if (
      result.shouldPoison ||
      !result.isValid ||
      result.meteringLevel === null
    ) {
      accumulator.recordPoison();
      return;
    }

    accumulator.addSample(result.meteringLevel, activeDurationMs);
  } catch {
    // Do not log raw native error object each 100ms (privacy/performance) -- poison locally
    accumulator.recordPoison();
  }
}
