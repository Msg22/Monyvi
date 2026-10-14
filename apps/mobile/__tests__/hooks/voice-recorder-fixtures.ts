/**
 * useVoiceRecorder.test.ts — T022
 *
 * Tests the useVoiceRecorder hook's state machine, permission flow,
 * and recording lifecycle.
 *
 * Mock Strategy:
 *   - expo-audio: mocked entirely to avoid native module dependencies
 *   - expo-file-system: mocked for temp file cleanup testing
 *   - React Native Testing Library renderHook for lifecycle assertions
 */

import {
  act,
  renderHook as renderNativeHook,
} from "@testing-library/react-native";
import { AppState } from "react-native";

// ---------------------------------------------------------------------------
// React Native Testing Library act helpers
// ---------------------------------------------------------------------------

const actSync = act;
const actAsync = act;

// ---------------------------------------------------------------------------
// Mock state tracking
// ---------------------------------------------------------------------------

const mockRecord = jest.fn();
const mockPause = jest.fn();
const mockStop = jest.fn().mockResolvedValue(undefined);
const mockPrepareToRecordAsync = jest.fn().mockResolvedValue(undefined);
let mockRecorderReleased = false;
const DEFAULT_RECORDER_URI = "file:///tmp/recording.m4a";
let mockRecorderUri: string | null = DEFAULT_RECORDER_URI;

const mockRelease = jest.fn((): void => {
  mockRecorderReleased = true;
});
const mockRequestPermissions = jest.fn().mockResolvedValue({ granted: true });
const mockGetPermissions = jest
  .fn<Promise<{ granted: boolean; canAskAgain?: boolean }>, []>()
  .mockResolvedValue({ granted: false, canAskAgain: true });
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);
const mockGetInfoAsync = jest.fn().mockResolvedValue({ exists: true });

const mockRecorder = {
  record: mockRecord,
  pause: mockPause,
  stop: mockStop,
  prepareToRecordAsync: mockPrepareToRecordAsync,
  release: mockRelease,
  getUri: jest.fn((): string | null => mockRecorderUri),
  get uri(): string | null {
    if (mockRecorderReleased) {
      throw new Error("Recorder URI accessed after release");
    }
    return mockRecorderUri;
  },
};

jest.mock("expo-audio", () => ({
  AudioModule: {
    AudioRecorder: jest.fn(() => {
      mockRecorderReleased = false;
      return mockRecorder;
    }),
    requestRecordingPermissionsAsync: (...args: unknown[]): Promise<unknown> =>
      mockRequestPermissions(...args) as Promise<unknown>,
    getRecordingPermissionsAsync: (): Promise<{
      granted: boolean;
      canAskAgain?: boolean;
    }> => mockGetPermissions(),
  },
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: ".m4a",
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      android: {
        outputFormat: "mpeg4",
        audioEncoder: "aac",
      },
    },
  },
  setAudioModeAsync: (...args: unknown[]): Promise<unknown> =>
    mockSetAudioModeAsync(...args) as Promise<unknown>,
}));

jest.mock("expo-file-system", () => ({
  deleteAsync: (...args: unknown[]): Promise<unknown> =>
    mockDeleteAsync(...args) as Promise<unknown>,
  getInfoAsync: (...args: unknown[]): Promise<unknown> =>
    mockGetInfoAsync(...args) as Promise<unknown>,
}));

// ---------------------------------------------------------------------------
// Import module under test — after mocks
// ---------------------------------------------------------------------------

import {
  useVoiceRecorder,
  NATIVE_STABILIZATION_DELAY_MS,
} from "@/hooks/useVoiceRecorder";

// ---------------------------------------------------------------------------
// Typed hook access and ordered cleanup
// ---------------------------------------------------------------------------

const mountedUnmounts: Array<() => void> = [];

interface HookRef<T> {
  current: T | null;
}

function unwrap<T>(ref: HookRef<T>): T {
  if (ref.current === null) {
    throw new Error("Hook ref is null — did the component render?");
  }
  return ref.current;
}

function renderHook<T>(hookFn: () => T): {
  result: HookRef<T>;
  rerender: () => void;
  unmount: () => void;
} {
  const renderer = renderNativeHook(hookFn);
  let isMounted = true;
  const unmount = (): void => {
    if (!isMounted) return;
    isMounted = false;
    renderer.unmount();
  };

  mountedUnmounts.push(unmount);

  return {
    result: renderer.result,
    rerender: (): void => renderer.rerender(undefined),
    unmount,
  };
}

// ---------------------------------------------------------------------------
// Helper: start recording with stabilization delay flush
// When start() is called with jest.useFakeTimers(), the stabilization
// setTimeout won't resolve until we advance timers. This helper handles
// the full sequence: kick off start, advance timers, flush microtasks.
// ---------------------------------------------------------------------------

async function startRecordingWithFlush(
  result: HookRef<ReturnType<typeof useVoiceRecorder>>
): Promise<void> {
  // start() internally does:
  //   1. await setAudioModeAsync()      — async, resolves via microtask
  //   2. await prepareToRecordAsync()   — async, resolves via microtask
  //   3. record()                       — synchronous
  //   4. setStatus("recording")         — synchronous
  //   5. startTimer()                   — synchronous (schedules interval)
  //   6. await setTimeout(NATIVE_STABILIZATION_DELAY_MS) — needs fake timer advance
  //   7. nativeReadyRef.current = true  — after setTimeout resolves
  //
  // With fake timers we must:
  //   a) Kick off start() (don't await — it will hang on step 6)
  //   b) Flush microtasks so steps 1-5 complete and setTimeout is scheduled
  //   c) Advance fake timers by the stabilization delay to fire the setTimeout
  //   d) Flush microtasks again so step 7 completes

  await actAsync(async () => {
    const hook = unwrap(result);
    const startPromise = hook.start(); // kick off, don't await

    // Flush microtasks so prepareToRecordAsync + setAudioModeAsync resolve
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Now setTimeout is scheduled — advance fake timers
    jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);

    // Flush microtasks so the setTimeout callback (nativeReadyRef = true) runs
    await Promise.resolve();

    // Wait for start() to fully complete
    await startPromise;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export function resetRecorderRelease(): void {
  mockRecorderReleased = false;
  mockRecorderUri = DEFAULT_RECORDER_URI;
}
/** Deterministic native stop() success with missing output URI. */
export function setMockRecorderUri(uri: string | null): void {
  mockRecorderUri = uri;
}
export {
  act,
  actSync,
  actAsync,
  AppState,
  mockRecord,
  mockPause,
  mockStop,
  mockPrepareToRecordAsync,
  mockRelease,
  mockRequestPermissions,
  mockGetPermissions,
  mockSetAudioModeAsync,
  mockDeleteAsync,
  mockGetInfoAsync,
  mountedUnmounts,
  unwrap,
  renderHook,
  startRecordingWithFlush,
  useVoiceRecorder,
  NATIVE_STABILIZATION_DELAY_MS,
};
