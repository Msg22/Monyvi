/**
 * useVoiceRecorder Hook
 *
 * Encapsulates the expo-audio recording lifecycle with state management,
 * a 30-second ACTIVE-capture cap (paused time excluded), and temp file
 * cleanup.
 *
 * Architecture & Design Rationale:
 * - Pattern: Custom Hook (Adapter Pattern)
 * - Why: Isolates native recording API behind a clean React interface.
 *   Components only see status/actions, never the raw AudioRecorder.
 * - SOLID: SRP — recording only. OCP — extends via status callbacks
 *   without modifying existing consumers.
 *
 * NOTE: We intentionally bypass `useAudioRecorder` (which uses
 * `useReleasingSharedObject`) and manage the AudioRecorder lifecycle
 * manually via refs. This avoids a known expo-audio@0.3.x bug where
 * `useReleasingSharedObject` prematurely releases the native shared
 * object on re-renders, causing "Cannot use shared object that was
 * already released" → "Integer instead of AudioRecorder" errors.
 * See: https://github.com/expo/expo/issues/35589
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
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import {
  useMicrophonePermission,
  type MicrophonePermissionStatus,
} from "./useMicrophonePermission";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum ACTIVE capture duration in milliseconds (FR-045, SC-020).
 *
 * The budget counts only time spent actively recording: paused wall time is
 * excluded, and the countdown starts only after the native `record()` call
 * succeeds. The 300 ms post-record stabilization counts as capture because it
 * happens after `record()`.
 */
const ACTIVE_CAPTURE_CAP_MS = 30_000;

/** Timer tick interval in milliseconds. */
const TIMER_TICK_MS = 100;

/**
 * Delay (ms) after calling `record()` before marking the recorder as ready.
 * Gives Android's MediaRecorder.start() time to transition on the native thread.
 *
 * Exported for test usage so tests reference the same constant.
 */
export const NATIVE_STABILIZATION_DELAY_MS = 300;

/**
 * Maximum time (ms) stop() will wait for the native recorder to become ready
 * before giving up. Prevents indefinite hangs if start() fails silently.
 */
const STOP_READINESS_TIMEOUT_MS = 2000;

/** Polling interval (ms) for readiness checks in stop(). */
const READINESS_POLL_INTERVAL_MS = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecorderStatus = "idle" | "recording" | "paused" | "completed";

interface VoiceRecorderResult {
  /** Current recording status */
  readonly status: RecorderStatus;
  /** Elapsed recording time in milliseconds (excludes paused time) */
  readonly durationMs: number;
  /** Whether the recorder is currently recording (convenience) */
  readonly isRecording: boolean;
  /** Audio URI after recording completes */
  readonly audioUri: string | null;
  /** Whether microphone permission is granted */
  readonly hasPermission: boolean;
  readonly permissionStatus: MicrophonePermissionStatus;
  readonly refreshPermission: () => Promise<MicrophonePermissionStatus>;
  /** Start a new recording */
  readonly start: (options?: {
    readonly signal?: AbortSignal;
    readonly onStarted?: () => void;
  }) => Promise<void>;
  /** Pause the current recording */
  readonly pause: () => boolean;
  /** Resume a paused recording */
  readonly resume: () => boolean;
  /** Stop the recording and finalize the audio file */
  readonly stop: () => Promise<{ uri: string; durationMs: number } | null>;
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
    isMeteringEnabled: options.isMeteringEnabled ?? false,
  };

  if (Platform.OS === "ios" && options.ios) {
    return { ...common, ...options.ios };
  }
  if (Platform.OS === "android" && options.android) {
    return { ...common, ...options.android };
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
  const {
    hasPermission,
    permissionStatus,
    refreshPermission,
    requestPermission,
  } = useMicrophonePermission();
  const startGenerationRef = useRef(0);
  const activeStartGenerationRef = useRef<number | null>(null);
  const pendingPauseGenerationRef = useRef<number | null>(null);
  const audioUriRef = useRef<string | null>(null);
  audioUriRef.current = audioUri;

  /**
   * Updates the retained audio URI in both React state and the synchronous
   * ref, so cleanup paths that run before the next render (discard/reset/
   * unmount racing a cap finalization) observe the authoritative value.
   */
  const applyAudioUri = useCallback((uri: string | null): void => {
    audioUriRef.current = uri;
    setAudioUri(uri);
  }, []);

  // Refs for timer management
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);

  /**
   * Holds the latest active-cap finalizer so the one-shot cap timeout always
   * invokes the current render's closure. Declared as a ref because the cap
   * timeout is scheduled by `startTimer`, which is created before `stop`.
   */
  const capFinalizeRef = useRef<() => void>(() => undefined);

  /**
   * Tracks whether the native MediaRecorder is in a state that accepts
   * pause/stop. Set to `true` after `record()` + stabilization delay,
   * and `false` after `stop()` or on error recovery.
   */
  const nativeReadyRef = useRef(false);

  /**
   * Ref to track the current status synchronously (avoids stale closure
   * issues in callbacks where React state hasn't re-rendered yet).
   */
  const statusRef = useRef<RecorderStatus>("idle");

  /**
   * Tracks the in-flight start promise so discard() can await it
   * before attempting cleanup. Prevents race conditions where discard()
   * clears state while start()'s stabilization delay is still pending.
   */
  const nativeStartPromiseRef = useRef<Promise<void> | null>(null);
  const nativeStopPromiseRef = useRef<Promise<string | null> | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const discardPromiseRef = useRef<Promise<void> | null>(null);

  /**
   * The single in-flight public `stop()` finalization, shared so a second
   * Stop/Submit during a deferred native stop awaits the same result instead
   * of observing `completed` and returning null.
   */
  const stopResultRef = useRef<Promise<{
    uri: string;
    durationMs: number;
  } | null> | null>(null);

  /**
   * AbortController aborted on unmount to cancel any in-flight
   * waitForCondition polling in stop(), preventing leaked intervals
   * that reference stale refs.
   */
  const unmountAbortRef = useRef(new AbortController());

  // ---------------------------------------------------------------------------
  // Permission
  // ---------------------------------------------------------------------------

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
      flushElapsed();
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
          setDurationMs(0);
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
    [applyAudioUri, pauseSafely, releaseRecorder, startTimer]
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

  const stop = useCallback(async (): Promise<{
    uri: string;
    durationMs: number;
  } | null> => {
    // A cap/manual Stop is already finalizing: Submit must await that same
    // result instead of observing `completed` and losing the finalized audio.
    const inFlightStop = stopResultRef.current;
    if (inFlightStop !== null) {
      return inFlightStop;
    }

    pendingPauseGenerationRef.current = null;
    if (statusRef.current !== "recording" && statusRef.current !== "paused") {
      return null;
    }

    // Captured before any await so Discard/Reset/unmount/new session, which
    // bump the generation, can suppress publishing state for this capture.
    const sessionGeneration = startGenerationRef.current;
    const recorder = recorderRef.current;
    if (!recorder) return null;
    const isCurrentSession = (): boolean =>
      sessionGeneration === startGenerationRef.current &&
      recorderRef.current === recorder &&
      !unmountAbortRef.current.signal.aborted;
    const stopPromise = (async (): Promise<{
      uri: string;
      durationMs: number;
    } | null> => {
      // If native recorder isn't ready yet (user tapped stop during warmup),
      // wait for readiness rather than silently returning null.
      if (!nativeReadyRef.current) {
        // First, await any in-flight start promise
        if (nativeStartPromiseRef.current) {
          try {
            await nativeStartPromiseRef.current;
          } catch {
            // Start failed — nothing to stop
            return null;
          }
          if (!isCurrentSession()) return null;
        }

        // Poll until nativeReadyRef becomes true or timeout
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
        const uri = await stopNativeRecorder(recorder);
        if (!uri) return null;
        if (!isCurrentSession()) return null;

        applyAudioUri(uri);
        setStatus("completed");
        return { uri, durationMs: accumulatedMsRef.current };
      } catch (err: unknown) {
        logger.error("voice.recorder.stopFailed", err);
        // A failure from a superseded session must not overwrite its
        // replacement, which owns status and native readiness.
        if (!isCurrentSession()) return null;
        nativeReadyRef.current = false;
        statusRef.current = "idle";
        setStatus("idle");
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

  const cleanupRecorderResources = useCallback((): Promise<void> => {
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

      // Setup may have started the duration timer while cleanup awaited it.
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

      const uri = stoppedUri ?? audioUriRef.current ?? recorder?.uri ?? null;
      if (uri) {
        await deleteAudioFile(uri);
      }

      releaseRecorder();
      accumulatedMsRef.current = 0;
      nativeReadyRef.current = false;
    })();

    cleanupPromiseRef.current = cleanupPromise;

    return cleanupPromise.finally((): void => {
      if (cleanupPromiseRef.current === cleanupPromise) {
        cleanupPromiseRef.current = null;
      }
    });
  }, [deleteAudioFile, releaseRecorder, stopNativeRecorder, stopTimer]);

  const cleanupRecorderResourcesRef = useRef(cleanupRecorderResources);
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
        statusRef.current = "idle";
        setDurationMs(0);
        applyAudioUri(null);
        setStatus("idle");
      } catch (err: unknown) {
        logger.error("voice.recorder.discardFailed", err);
        releaseRecorder();
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
  }, [applyAudioUri, cleanupRecorderResources, releaseRecorder]);

  /**
   * Reset recorder back to idle. If the recorder is in an active state
   * (recording/paused), delegates to discard() for proper native cleanup
   * and temp file deletion.
   */
  const reset = useCallback(async (): Promise<void> => {
    const currentStatus = statusRef.current;

    if (currentStatus === "recording" || currentStatus === "paused") {
      // Active state — must do proper native teardown + file cleanup
      await discard();
      return;
    }

    // A cap/manual Stop may still be finalizing. Waiting avoids releasing the
    // recorder under an in-flight stop and lets cleanup delete the retained URI.
    if (nativeStopPromiseRef.current !== null) {
      await discard();
      return;
    }

    // A completed capture still owns a temp file. Discard deletes it before
    // the reference is dropped (FR-021) instead of releasing and forgetting it.
    if (statusRef.current === "completed" || audioUriRef.current !== null) {
      await discard();
      return;
    }

    // Idle — just clear JS state and release recorder
    stopTimer();
    releaseRecorder();
    accumulatedMsRef.current = 0;
    nativeReadyRef.current = false;
    statusRef.current = "idle";
    setDurationMs(0);
    applyAudioUri(null);
    setStatus("idle");
  }, [applyAudioUri, stopTimer, discard, releaseRecorder]);

  return {
    status,
    durationMs,
    isRecording: status === "recording",
    audioUri,
    hasPermission,
    permissionStatus,
    refreshPermission,
    start,
    pause,
    resume,
    stop,
    discard,
    requestPermission,
    reset,
  };
}
