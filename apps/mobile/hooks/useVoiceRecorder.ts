/**
 * useVoiceRecorder Hook
 *
 * Encapsulates expo-audio recording lifecycle with state management,
 * 30s ACTIVE-capture cap (paused time excluded), and temp file cleanup.
 *
 * Pattern: Custom Hook (Adapter Pattern)
 * Note: Bypasses useAudioRecorder to manage AudioRecorder lifecycle manually
 * via refs, avoiding expo-audio@0.3.x shared object bug (expo/expo#35589).
 *
 * @module useVoiceRecorder
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  createAudioMeteringAccumulator,
  type AudioMeteringSummary,
} from "@monyvi/logic";
import { sampleRecorderMetering } from "@/services/voice-metering-service";
import {
  useMicrophonePermission,
  type MicrophonePermissionStatus,
} from "./useMicrophonePermission";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum ACTIVE capture duration in milliseconds (FR-045, SC-020). */
const ACTIVE_CAPTURE_CAP_MS = 30_000;

/** Timer tick interval in milliseconds. */
const TIMER_TICK_MS = 100;

/** Delay (ms) after calling record() before marking recorder ready (Android stabilization). */
export const NATIVE_STABILIZATION_DELAY_MS = 300;

/** Maximum time (ms) stop() waits for native recorder to become ready. */
const STOP_READINESS_TIMEOUT_MS = 2000;

/** Polling interval (ms) for readiness checks in stop(). */
const READINESS_POLL_INTERVAL_MS = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecorderStatus = "idle" | "recording" | "paused" | "completed" | "error";

export interface VoiceRecorderStopResult {
  readonly uri: string;
  readonly durationMs: number;
  readonly metering: AudioMeteringSummary | null;
}

export interface VoiceRecorderResult {
  /** Current recording status */
  readonly status: RecorderStatus;
  /** Elapsed recording time in milliseconds (excludes paused time) */
  readonly durationMs: number;
  /** Whether the recorder is currently recording (convenience) */
  readonly isRecording: boolean;
  /** Audio URI after recording completes */
  readonly audioUri: string | null;
  /** Finalized audio metering snapshot (null while active or unmetered) */
  readonly meteringSnapshot: AudioMeteringSummary | null;
  /** Whether microphone permission is granted */
  readonly hasPermission: boolean;
  readonly permissionStatus: MicrophonePermissionStatus;
  readonly refreshPermission: () => Promise<MicrophonePermissionStatus>;
  readonly requestPermissionStatus: () => Promise<MicrophonePermissionStatus>;
  /** Start a new recording */
  readonly start: (options?: {
    readonly signal?: AbortSignal;
    readonly onStarted?: () => void;
  }) => Promise<void>;
  /** Pause the current recording */
  readonly pause: () => boolean;
  /** Resume a paused recording */
  readonly resume: () => boolean;
  /** Stop the recording and finalize the audio file and metering summary */
  readonly stop: () => Promise<VoiceRecorderStopResult | null>;
  /** Discard the recording and clean up temp files (FR-021) */
  readonly discard: () => Promise<void>;
  /** Request microphone permission */
  readonly requestPermission: () => Promise<boolean>;
  /** Reset recorder back to idle state (delegates to discard if active) */
  readonly reset: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Polls until `conditionFn` returns true or `timeoutMs` elapses.
 * Resolves `true` if the condition was met, `false` on timeout or abort.
 *
 * Accepts an optional AbortSignal so callers can cancel the poll
 * (e.g. on component unmount) to prevent leaked intervals.
 */
function waitForCondition(
  conditionFn: () => boolean,
  timeoutMs: number,
  pollMs: number,
  signal?: AbortSignal
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    if (conditionFn()) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(interval);
        resolve(false);
      } else if (conditionFn()) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, pollMs);

    // Also listen for abort to clear immediately
    signal?.addEventListener(
      "abort",
      () => {
        clearInterval(interval);
        resolve(false);
      },
      { once: true }
    );
  });
}

/**
 * Flattens a RecordingOptions preset into platform-specific options
 * for the native AudioRecorder constructor.
 *
 * Mirrors the logic of expo-audio's internal `createRecordingOptions()`
 * without importing from the library's private source paths.
 */
function flattenPlatformOptions(
  options: RecordingOptions
): Record<string, unknown> {
  const common: Record<string, unknown> = {
    extension: options.extension,
    sampleRate: options.sampleRate,
    numberOfChannels: options.numberOfChannels,
    bitRate: options.bitRate,
    isMeteringEnabled: true,
  };

  if (Platform.OS === "ios" && options.ios) {
    return { ...common, ...options.ios, isMeteringEnabled: true };
  }
  if (Platform.OS === "android" && options.android) {
    return { ...common, ...options.android, isMeteringEnabled: true };
  }
  return common;
}

/**
 * Creates a fresh AudioRecorder shared object with HIGH_QUALITY preset.
 * This is called on-demand (once per recording session) instead of keeping
 * a long-lived instance, to avoid the SharedObject lifecycle issues.
 */
function createRecorder(): AudioRecorder {
  const platformOptions = flattenPlatformOptions(RecordingPresets.HIGH_QUALITY);
  // Cast: the flattened options match the native RecordingOptions structure
  // (with android/ios fields merged to top-level), which differs from the
  // TypeScript RecordingOptions type (nested android/ios sub-objects).
  return new AudioModule.AudioRecorder(platformOptions);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceRecorder(): VoiceRecorderResult {
  /**
   * Manually managed AudioRecorder ref. We create a fresh instance for each
   * recording session and release it on cleanup. This avoids the
   * `useReleasingSharedObject` lifecycle bug in expo-audio@0.3.x.
   */
  const recorderRef = useRef<AudioRecorder | null>(null);

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [meteringSnapshot, setMeteringSnapshot] =
    useState<AudioMeteringSummary | null>(null);
  const {
    hasPermission,
    permissionStatus,
    refreshPermission,
    requestPermissionStatus,
    requestPermission,
  } = useMicrophonePermission();
  const startGenerationRef = useRef(0);
  const activeStartGenerationRef = useRef<number | null>(null);
  const pendingPauseGenerationRef = useRef<number | null>(null);
  const audioUriRef = useRef<string | null>(null);
  const stopAttemptUriRef = useRef<string | null>(null);
  audioUriRef.current = audioUri;

  const applyAudioUri = useCallback((uri: string | null): void => {
    audioUriRef.current = uri;
    setAudioUri(uri);
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const accumulatorRef = useRef(createAudioMeteringAccumulator());
  const finalizedMeteringSnapshotRef = useRef<AudioMeteringSummary | null>(
    null
  );
  const capFinalizeRef = useRef<() => void>(() => undefined);
  const nativeReadyRef = useRef(false);
  const statusRef = useRef<RecorderStatus>("idle");

  const nativeStartPromiseRef = useRef<Promise<void> | null>(null);
  const nativeStopPromiseRef = useRef<Promise<string | null> | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const cleanupRecorderResourcesRef = useRef<
    (knownUri?: string | null) => Promise<void>
  >(() => Promise.resolve());
  const discardPromiseRef = useRef<Promise<void> | null>(null);

  const stopResultRef = useRef<Promise<VoiceRecorderStopResult | null> | null>(
    null
  );

  /**
   * AbortController aborted on unmount to cancel any in-flight
   * waitForCondition polling in stop(), preventing leaked intervals
   * that reference stale refs.
   */
  const unmountAbortRef = useRef(new AbortController());

  const resetMeteringState = useCallback((): void => {
    accumulatorRef.current.reset();
    finalizedMeteringSnapshotRef.current = null;
    setMeteringSnapshot(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Timer helpers
  // ---------------------------------------------------------------------------

  /**
   * Adds the exact wall time elapsed since the last accounting point and
   * clamps the running total to the active-capture cap. Pause, Stop and cap
   * finalization MUST call this so sub-tick remainders are not lost to the
   * 100 ms display cadence.
   */
  const flushElapsed = useCallback((): number => {
    const now = Date.now();
    const delta = now - lastTickRef.current;
    if (delta > 0) {
      accumulatedMsRef.current = Math.min(
        accumulatedMsRef.current + delta,
        ACTIVE_CAPTURE_CAP_MS
      );
      lastTickRef.current = now;
      setDurationMs(accumulatedMsRef.current);
    }
    return accumulatedMsRef.current;
  }, []);

  const startTimer = useCallback((): void => {
    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = flushElapsed();
      sampleRecorderMetering(
        recorderRef.current,
        accumulatorRef.current,
        elapsed
      );
    }, TIMER_TICK_MS);

    // One-shot wall-clock deadline for the remaining ACTIVE budget. Recomputed
    // on every resume so paused time never consumes cap budget, and finalized
    // exactly at the remaining cap instead of on the next 100 ms tick.
    const remainingMs = Math.max(
      ACTIVE_CAPTURE_CAP_MS - accumulatedMsRef.current,
      0
    );
    capTimeoutRef.current = setTimeout(() => {
      capTimeoutRef.current = null;
      capFinalizeRef.current();
    }, remainingMs);
  }, [flushElapsed]);

  const stopTimer = useCallback((): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (capTimeoutRef.current !== null) {
      clearTimeout(capTimeoutRef.current);
      capTimeoutRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Recorder lifecycle helpers
  // ---------------------------------------------------------------------------

  /**
   * Safely releases the current AudioRecorder shared object and clears the ref.
   * Swallows errors to prevent cascading failures during cleanup.
   */
  const releaseRecorder = useCallback((): void => {
    if (recorderRef.current) {
      try {
        recorderRef.current.release();
      } catch (releaseErr: unknown) {
        logger.warn("voice.recorder.releaseFailed", { error: releaseErr });
      }
      recorderRef.current = null;
    }
  }, []);

  const stopNativeRecorder = useCallback(
    async (recorder: AudioRecorder): Promise<string | null> => {
      const existingStop = nativeStopPromiseRef.current;
      if (existingStop !== null) {
        return existingStop;
      }

      nativeReadyRef.current = false;
      const stopPromise = (async (): Promise<string | null> => {
        await recorder.stop();
        return recorder.uri ?? null;
      })();
      nativeStopPromiseRef.current = stopPromise;

      try {
        return await stopPromise;
      } finally {
        if (nativeStopPromiseRef.current === stopPromise) {
          nativeStopPromiseRef.current = null;
        }
      }
    },
    []
  );

  // Stop timers and pending readiness polls before native teardown runs.
  useEffect(() => {
    const abortController = unmountAbortRef.current;
    return () => {
      startGenerationRef.current += 1;
      pendingPauseGenerationRef.current = null;
      stopTimer();
      abortController.abort();
    };
  }, [stopTimer]);

  // ---------------------------------------------------------------------------
  // Recording controls
  // ---------------------------------------------------------------------------

  const pauseSafely = useCallback((): boolean => {
    const recorder = recorderRef.current;
    if (
      statusRef.current !== "recording" ||
      !nativeReadyRef.current ||
      recorder === null
    )
      return false;
    try {
      recorder.pause();
      // Bank the exact sub-tick remainder before the interval stops so the
      // paused clock never loses time and never borrows paused wall time.
      flushElapsed();
      stopTimer();
      statusRef.current = "paused";
      setStatus("paused");
      return true;
    } catch (error: unknown) {
      logger.error("voice.recorder.pauseFailed", error);
      return false;
    }
  }, [flushElapsed, stopTimer]);

  const start = useCallback(
    async (options?: {
      readonly signal?: AbortSignal;
      readonly onStarted?: () => void;
    }): Promise<void> => {
      if (
        nativeStartPromiseRef.current !== null &&
        activeStartGenerationRef.current === startGenerationRef.current
      )
        return nativeStartPromiseRef.current;
      const generation = ++startGenerationRef.current;
      pendingPauseGenerationRef.current = null;
      activeStartGenerationRef.current = generation;
      const isCurrent = (): boolean =>
        generation === startGenerationRef.current &&
        !unmountAbortRef.current.signal.aborted &&
        !options?.signal?.aborted;
      let recorder: AudioRecorder | null = null;
      const ownsRecorder = (): boolean =>
        generation === startGenerationRef.current &&
        !unmountAbortRef.current.signal.aborted &&
        (recorder === null || recorderRef.current === recorder);
      const startPromise = (async (): Promise<void> => {
        try {
          // A cap/manual Stop may still be finalizing the previous session.
          // Await it before disposing anything so the old recorder is never
          // released mid-stop and its URI cannot land on this new session.
          const pendingNativeStop = nativeStopPromiseRef.current;
          if (pendingNativeStop !== null) {
            try {
              await pendingNativeStop;
            } catch (err: unknown) {
              // Previous session failed to stop; start fresh below.
              logger.warn("voice.recorder.startPendingStopFailed", {
                error: err,
              });
            }
            if (!isCurrent()) return;
          }

          const pendingDiscard = discardPromiseRef.current;
          if (pendingDiscard !== null) {
            await pendingDiscard;
            if (!isCurrent()) return;
          }

          const pendingCleanup = cleanupPromiseRef.current;
          if (pendingCleanup !== null) {
            await pendingCleanup;
          }
          if (!isCurrent()) return;

          // Set audio mode for recording
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
          });
          if (!isCurrent()) return;

          // Release any previous recorder before creating a new one
          releaseRecorder();

          // Create a fresh AudioRecorder for this recording session
          recorder = createRecorder();
          recorderRef.current = recorder;

          // Reset state
          accumulatedMsRef.current = 0;
          nativeReadyRef.current = false;
          resetMeteringState();
          setDurationMs(0);
          stopAttemptUriRef.current = null;
          applyAudioUri(null);

          // Prepare and start recording
          await recorder.prepareToRecordAsync();
          if (!isCurrent() || !ownsRecorder()) return;
          recorder.record();

          setStatus("recording");
          statusRef.current = "recording";
          startTimer();
          options?.onStarted?.();

          // Allow the native MediaRecorder time to transition before
          // accepting pause/stop commands. This prevents the
          // IllegalStateException on Android when the user taps quickly.
          await new Promise<void>((resolve) =>
            setTimeout(resolve, NATIVE_STABILIZATION_DELAY_MS)
          );
          if (!ownsRecorder()) return;

          // Only set ready if we haven't been cancelled (discard during warmup)
          if (
            statusRef.current === "recording" ||
            statusRef.current === "paused"
          ) {
            nativeReadyRef.current = true;
          }
          if (isCurrent() && pendingPauseGenerationRef.current === generation) {
            pendingPauseGenerationRef.current = null;
            pauseSafely();
          }
        } catch (err: unknown) {
          logger.error("voice.recorderStart.failed", err);
          if (ownsRecorder()) {
            releaseRecorder();
            nativeReadyRef.current = false;
            statusRef.current = "idle";
            setStatus("idle");
          }
          throw err;
        }
      })();

      nativeStartPromiseRef.current = startPromise;
      try {
        await startPromise;
      } finally {
        if (nativeStartPromiseRef.current === startPromise)
          nativeStartPromiseRef.current = null;
      }
    },
    [
      applyAudioUri,
      pauseSafely,
      releaseRecorder,
      resetMeteringState,
      startTimer,
    ]
  );

  const pause = useCallback((): boolean => {
    if (statusRef.current !== "recording") return false;
    if (!nativeReadyRef.current) {
      pendingPauseGenerationRef.current = startGenerationRef.current;
      return false;
    }
    return pauseSafely();
  }, [pauseSafely]);

  const resume = useCallback((): boolean => {
    if (statusRef.current !== "paused") return false;

    const recorder = recorderRef.current;
    if (!recorder) return false;

    try {
      recorder.record();
      statusRef.current = "recording";
      setStatus("recording");
      startTimer();
      return true;
      // No stabilization delay needed for resume — MediaRecorder.resume()
      // transitions synchronously on Android
    } catch (err: unknown) {
      logger.error("voice.recorder.resumeFailed", err);
      return false;
    }
  }, [startTimer]);

  const stop =
    useCallback(async (): Promise<VoiceRecorderStopResult | null> => {
      // Cap and Submit share one in-flight native stop.
      const inFlightStop = stopResultRef.current;
      if (inFlightStop !== null) {
        return inFlightStop;
      }

      pendingPauseGenerationRef.current = null;
      if (statusRef.current !== "recording" && statusRef.current !== "paused") {
        return null;
      }

      // Guard against Discard, unmount and replacement generations.
      const sessionGeneration = startGenerationRef.current;
      const recorder = recorderRef.current;
      if (!recorder) return null;
      const isCurrentSession = (): boolean =>
        sessionGeneration === startGenerationRef.current &&
        recorderRef.current === recorder &&
        !unmountAbortRef.current.signal.aborted;
      const failFinalization = (): void => {
        if (!isCurrentSession()) return;
        nativeReadyRef.current = false;
        statusRef.current = "error";
        setStatus("error");
        void cleanupRecorderResourcesRef.current(stopAttemptUriRef.current);
      };
      const stopPromise =
        (async (): Promise<VoiceRecorderStopResult | null> => {
          // Early Stop waits for native stabilization.
          if (!nativeReadyRef.current) {
            if (nativeStartPromiseRef.current) {
              try {
                await nativeStartPromiseRef.current;
              } catch {
                return null;
              }
              if (!isCurrentSession()) return null;
            }

            const ready = await waitForCondition(
              () => isCurrentSession() && nativeReadyRef.current,
              STOP_READINESS_TIMEOUT_MS,
              READINESS_POLL_INTERVAL_MS,
              unmountAbortRef.current.signal
            );
            if (!isCurrentSession()) return null;

            if (!ready) {
              logger.warn("voice.recorder.stopReadinessTimeout");
              return null;
            }
          }

          if (!isCurrentSession()) return null;

          try {
            if (statusRef.current === "recording") {
              flushElapsed();
            }
            stopTimer();
            statusRef.current = "completed";
            try {
              stopAttemptUriRef.current = recorder.uri ?? audioUriRef.current;
            } catch (error: unknown) {
              logger.warn("voice.recorder.captureUriFailed", { error });
            }
            const snapshot = accumulatorRef.current.finalize(
              accumulatedMsRef.current
            );
            finalizedMeteringSnapshotRef.current = snapshot;
            setMeteringSnapshot(snapshot);
            const uri = await stopNativeRecorder(recorder);
            if (!isCurrentSession()) return null;
            if (!uri) {
              failFinalization();
              return null;
            }

            applyAudioUri(uri);
            setStatus("completed");
            return {
              uri,
              durationMs: accumulatedMsRef.current,
              metering: snapshot,
            };
          } catch (err: unknown) {
            logger.error("voice.recorder.stopFailed", err);
            failFinalization();
            return null;
          }
        })();

      stopResultRef.current = stopPromise;
      try {
        return await stopPromise;
      } finally {
        if (stopResultRef.current === stopPromise) {
          stopResultRef.current = null;
        }
      }
    }, [applyAudioUri, flushElapsed, stopNativeRecorder, stopTimer]);

  // ---------------------------------------------------------------------------
  // Active-capture cap (FR-045 / FR-046 / SC-020 / SC-021)
  // ---------------------------------------------------------------------------

  /**
   * Fired exactly once by the one-shot cap deadline created in `startTimer`.
   *
   * Stops both timers, banks the exact elapsed remainder, clamps the visible
   * clock to 30,000 ms and delegates to `stop()` so the cap shares the same
   * native-stop deduplication, readiness handling and URI retention as a manual
   * Stop. It never releases or deletes the file: Submit/Discard owns that
   * lifecycle, and it consumes no provider, review or quota work.
   */
  const finalizeAtCap = useCallback((): void => {
    if (statusRef.current !== "recording") {
      return;
    }
    stopTimer();
    flushElapsed();
    accumulatedMsRef.current = ACTIVE_CAPTURE_CAP_MS;
    setDurationMs(ACTIVE_CAPTURE_CAP_MS);
    void stop();
  }, [flushElapsed, stop, stopTimer]);

  capFinalizeRef.current = finalizeAtCap;

  // ---------------------------------------------------------------------------
  // Cleanup (FR-021: temp file MUST be deleted)
  // ---------------------------------------------------------------------------

  const deleteAudioFile = useCallback(async (uri: string): Promise<void> => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (err: unknown) {
      logger.warn("voice.recorder.tempAudioDeleteFailed", { error: err });
    }
  }, []);

  const cleanupRecorderResources = useCallback(
    (knownUri: string | null = null): Promise<void> => {
      const existingCleanup = cleanupPromiseRef.current;
      if (existingCleanup !== null) {
        return existingCleanup;
      }

      const cleanupPromise = (async (): Promise<void> => {
        stopTimer();

        if (nativeStartPromiseRef.current !== null) {
          try {
            await nativeStartPromiseRef.current;
          } catch {
            // Start failed; continue releasing any partial native resources.
          }
        }

        stopTimer();

        const recorder = recorderRef.current;
        let stoppedUri: string | null = null;

        try {
          if (nativeStopPromiseRef.current !== null) {
            stoppedUri = await nativeStopPromiseRef.current;
          } else if (
            recorder !== null &&
            (nativeReadyRef.current ||
              statusRef.current === "recording" ||
              statusRef.current === "paused")
          ) {
            stoppedUri = await stopNativeRecorder(recorder);
          }
        } catch (stopErr: unknown) {
          logger.warn("voice.recorder.cleanupStopFailed", { error: stopErr });
        }

        const uri =
          stoppedUri ??
          knownUri ??
          audioUriRef.current ??
          stopAttemptUriRef.current ??
          recorder?.uri ??
          null;
        releaseRecorder();
        if (uri) await deleteAudioFile(uri);
        stopAttemptUriRef.current = null;
        accumulatedMsRef.current = 0;
        nativeReadyRef.current = false;
        resetMeteringState();
      })();

      cleanupPromiseRef.current = cleanupPromise;

      return cleanupPromise.finally((): void => {
        if (cleanupPromiseRef.current === cleanupPromise) {
          cleanupPromiseRef.current = null;
        }
      });
    },
    [
      deleteAudioFile,
      releaseRecorder,
      resetMeteringState,
      stopNativeRecorder,
      stopTimer,
    ]
  );

  cleanupRecorderResourcesRef.current = cleanupRecorderResources;

  useEffect(() => {
    return () => {
      void cleanupRecorderResourcesRef.current();
    };
  }, []);

  const discard = useCallback((): Promise<void> => {
    pendingPauseGenerationRef.current = null;
    startGenerationRef.current += 1;
    const existingDiscard = discardPromiseRef.current;
    if (existingDiscard !== null) {
      return existingDiscard;
    }

    const discardPromise = (async (): Promise<void> => {
      try {
        await cleanupRecorderResources();
        resetMeteringState();
        statusRef.current = "idle";
        setDurationMs(0);
        applyAudioUri(null);
        setStatus("idle");
      } catch (err: unknown) {
        logger.error("voice.recorder.discardFailed", err);
        releaseRecorder();
        resetMeteringState();
        statusRef.current = "idle";
        setStatus("idle");
      }
    })();

    discardPromiseRef.current = discardPromise;

    return discardPromise.finally((): void => {
      if (discardPromiseRef.current === discardPromise) {
        discardPromiseRef.current = null;
      }
    });
  }, [
    applyAudioUri,
    cleanupRecorderResources,
    releaseRecorder,
    resetMeteringState,
  ]);

  const reset = useCallback(async (): Promise<void> => {
    const currentStatus = statusRef.current;
    if (
      currentStatus === "recording" ||
      currentStatus === "paused" ||
      currentStatus === "error"
    ) {
      await discard();
      return;
    }

    if (nativeStopPromiseRef.current !== null) {
      await discard();
      return;
    }

    if (statusRef.current === "completed" || audioUriRef.current !== null) {
      await discard();
      return;
    }

    stopTimer();
    releaseRecorder();
    accumulatedMsRef.current = 0;
    nativeReadyRef.current = false;
    resetMeteringState();
    statusRef.current = "idle";
    setDurationMs(0);
    applyAudioUri(null);
    setStatus("idle");
  }, [applyAudioUri, discard, releaseRecorder, resetMeteringState, stopTimer]);

  return {
    status,
    durationMs,
    isRecording: status === "recording",
    audioUri,
    meteringSnapshot,
    hasPermission,
    permissionStatus,
    refreshPermission,
    requestPermissionStatus,
    start,
    pause,
    resume,
    stop,
    discard,
    requestPermission,
    reset,
  };
}
