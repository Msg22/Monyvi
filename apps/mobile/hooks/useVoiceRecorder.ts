/**
 * useVoiceRecorder Hook
 *
 * Encapsulates the expo-audio recording lifecycle with state management,
 * auto-stop at 60 seconds, and temp file cleanup.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum recording duration in seconds (FR-004). */
const MAX_RECORDING_DURATION_S = 60;

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
  /** Start a new recording */
  readonly start: () => Promise<void>;
  /** Pause the current recording */
  readonly pause: () => void;
  /** Resume a paused recording */
  readonly resume: () => void;
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
  const [hasPermission, setHasPermission] = useState(false);
  const audioUriRef = useRef<string | null>(null);
  audioUriRef.current = audioUri;

  // Refs for timer management
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);

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
   * AbortController aborted on unmount to cancel any in-flight
   * waitForCondition polling in stop(), preventing leaked intervals
   * that reference stale refs.
   */
  const unmountAbortRef = useRef(new AbortController());

  // ---------------------------------------------------------------------------
  // Permission
  // ---------------------------------------------------------------------------

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await AudioModule.requestRecordingPermissionsAsync();
      setHasPermission(result.granted);
      return result.granted;
    } catch (err: unknown) {
      console.error("[useVoiceRecorder] Permission request failed:", err);
      return false;
    }
  }, []);

  // Check permission on mount
  useEffect(() => {
    void AudioModule.getRecordingPermissionsAsync().then(
      (result: { granted: boolean }) => {
        setHasPermission(result.granted);
      }
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Timer helpers
  // ---------------------------------------------------------------------------

  const startTimer = useCallback((): void => {
    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      accumulatedMsRef.current += delta;
      setDurationMs(accumulatedMsRef.current);
    }, TIMER_TICK_MS);
  }, []);

  const stopTimer = useCallback((): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
        console.warn(
          "[useVoiceRecorder] Failed to release recorder:",
          releaseErr
        );
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
      stopTimer();
      abortController.abort();
    };
  }, [stopTimer]);

  // ---------------------------------------------------------------------------
  // Auto-stop at 60 seconds (FR-004: does NOT auto-submit)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (
      status === "recording" &&
      durationMs >= MAX_RECORDING_DURATION_S * 1000
    ) {
      // Auto-stop but stay in overlay — user must choose Done or Discard
      void (async () => {
        if (!nativeReadyRef.current) return;
        const recorder = recorderRef.current;
        if (!recorder) return;

        try {
          stopTimer();
          statusRef.current = "completed";
          const uri = await stopNativeRecorder(recorder);
          setAudioUri(uri);
          setStatus("completed");
        } catch (err: unknown) {
          console.error("[useVoiceRecorder] Auto-stop failed:", err);
          // Recover: mark as completed anyway since we hit the limit
          nativeReadyRef.current = false;
          setAudioUri(null);
          setStatus("completed");
        }
      })();
    }
  }, [durationMs, status, stopNativeRecorder, stopTimer]);

  // ---------------------------------------------------------------------------
  // Recording controls
  // ---------------------------------------------------------------------------

  const start = useCallback(async (): Promise<void> => {
    const startPromise = (async (): Promise<void> => {
      try {
        const pendingDiscard = discardPromiseRef.current;
        if (pendingDiscard !== null) {
          await pendingDiscard;
        }

        const pendingCleanup = cleanupPromiseRef.current;
        if (pendingCleanup !== null) {
          await pendingCleanup;
        }

        // Set audio mode for recording
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });

        // Release any previous recorder before creating a new one
        releaseRecorder();

        // Create a fresh AudioRecorder for this recording session
        const recorder = createRecorder();
        recorderRef.current = recorder;

        // Reset state
        accumulatedMsRef.current = 0;
        nativeReadyRef.current = false;
        setDurationMs(0);
        setAudioUri(null);

        // Prepare and start recording
        await recorder.prepareToRecordAsync();
        recorder.record();

        setStatus("recording");
        statusRef.current = "recording";
        startTimer();

        // Allow the native MediaRecorder time to transition before
        // accepting pause/stop commands. This prevents the
        // IllegalStateException on Android when the user taps quickly.
        await new Promise<void>((resolve) =>
          setTimeout(resolve, NATIVE_STABILIZATION_DELAY_MS)
        );

        // Only set ready if we haven't been cancelled (discard during warmup)
        if (
          statusRef.current === "recording" ||
          statusRef.current === "paused"
        ) {
          nativeReadyRef.current = true;
        }
      } catch (err: unknown) {
        console.error("[useVoiceRecorder] Start failed:", err);
        releaseRecorder();
        nativeReadyRef.current = false;
        statusRef.current = "idle";
        setStatus("idle");
      }
    })();

    nativeStartPromiseRef.current = startPromise;
    try {
      await startPromise;
    } finally {
      nativeStartPromiseRef.current = null;
    }
  }, [releaseRecorder, startTimer]);

  const pause = useCallback((): void => {
    if (statusRef.current !== "recording") return;

    if (!nativeReadyRef.current) {
      console.warn(
        "[useVoiceRecorder] Ignoring pause — native recorder still initializing"
      );
      return;
    }

    const recorder = recorderRef.current;
    if (!recorder) return;

    try {
      stopTimer();
      recorder.pause();
      statusRef.current = "paused";
      setStatus("paused");
    } catch (err: unknown) {
      console.error("[useVoiceRecorder] Pause failed:", err);
      // Don't change status — the recording may still be active natively
    }
  }, [stopTimer]);

  const resume = useCallback((): void => {
    if (statusRef.current !== "paused") return;

    const recorder = recorderRef.current;
    if (!recorder) return;

    try {
      recorder.record();
      statusRef.current = "recording";
      setStatus("recording");
      startTimer();
      // No stabilization delay needed for resume — MediaRecorder.resume()
      // transitions synchronously on Android
    } catch (err: unknown) {
      console.error("[useVoiceRecorder] Resume failed:", err);
    }
  }, [startTimer]);

  const stop = useCallback(async (): Promise<{
    uri: string;
    durationMs: number;
  } | null> => {
    if (statusRef.current !== "recording" && statusRef.current !== "paused") {
      return null;
    }

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
      }

      // Poll until nativeReadyRef becomes true or timeout
      const ready = await waitForCondition(
        () => nativeReadyRef.current,
        STOP_READINESS_TIMEOUT_MS,
        READINESS_POLL_INTERVAL_MS,
        unmountAbortRef.current.signal
      );

      if (!ready) {
        console.warn(
          "[useVoiceRecorder] Stop timed out waiting for native readiness"
        );
        return null;
      }
    }

    const recorder = recorderRef.current;
    if (!recorder) return null;

    try {
      stopTimer();
      statusRef.current = "completed";
      const uri = await stopNativeRecorder(recorder);
      if (!uri) return null;

      setAudioUri(uri);
      setStatus("completed");
      return { uri, durationMs: accumulatedMsRef.current };
    } catch (err: unknown) {
      console.error("[useVoiceRecorder] Stop failed:", err);
      nativeReadyRef.current = false;
      statusRef.current = "idle";
      setStatus("idle");
      return null;
    }
  }, [stopNativeRecorder, stopTimer]);

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
      console.warn("[useVoiceRecorder] Failed to delete temp audio:", err);
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
        console.warn("[useVoiceRecorder] Stop during cleanup failed:", stopErr);
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
    const existingDiscard = discardPromiseRef.current;
    if (existingDiscard !== null) {
      return existingDiscard;
    }

    const discardPromise = (async (): Promise<void> => {
      try {
        await cleanupRecorderResources();
        statusRef.current = "idle";
        setDurationMs(0);
        setAudioUri(null);
        setStatus("idle");
      } catch (err: unknown) {
        console.error("[useVoiceRecorder] Discard failed:", err);
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
  }, [cleanupRecorderResources, releaseRecorder]);

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

    // Idle or completed — just clear JS state and release recorder
    stopTimer();
    releaseRecorder();
    accumulatedMsRef.current = 0;
    nativeReadyRef.current = false;
    statusRef.current = "idle";
    setDurationMs(0);
    setAudioUri(null);
    setStatus("idle");
  }, [stopTimer, discard, releaseRecorder]);

  return {
    status,
    durationMs,
    isRecording: status === "recording",
    audioUri,
    hasPermission,
    start,
    pause,
    resume,
    stop,
    discard,
    requestPermission,
    reset,
  };
}
