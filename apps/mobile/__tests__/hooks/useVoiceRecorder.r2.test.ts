/**
 * T069 / FR-045–FR-046: test-first 30 s ACTIVE-capture contract.
 *
 * Runs against the existing useVoiceRecorder hook and expo-audio doubles.
 * On the pinned pre-R2 source the cap is still 60 s; the 30 s expectations
 * are behavioral RED candidates, not missing-module or native timing evidence.
 */
import {
  actSync,
  actAsync,
  AppState,
  mockRecord,
  mockPause,
  mockStop,
  mockPrepareToRecordAsync,
  mockRelease,
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
  resetRecorderRelease,
  setMockRecorderUri,
} from "./voice-recorder-fixtures";

const ACTIVE_CAP_MS = 30_000;
const RETAINED_URI = "file:///tmp/recording.m4a";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  let rejectPromise: (error: Error) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value: T): void => resolvePromise(value),
    reject: (error: Error): void => rejectPromise(error),
  };
}

/** Fake clock advances inside real RNTL act, then flushes recorder effects. */
async function advanceActiveClock(ms: number): Promise<void> {
  await actAsync(async (): Promise<void> => {
    jest.advanceTimersByTime(ms);
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
  await actAsync(async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

type RecorderHookRef = Parameters<typeof startRecordingWithFlush>[0];

async function startAtNativeRecord(
  result: RecorderHookRef
): Promise<number> {
  await startRecordingWithFlush(result);
  expect(mockRecord).toHaveBeenCalledTimes(1);
  expect(unwrap(result).status).toBe("recording");
  // The 300 ms stabilization occurs AFTER record(), and counts as capture.
  expect(unwrap(result).durationMs).toBe(NATIVE_STABILIZATION_DELAY_MS);
  return unwrap(result).durationMs;
}

async function approachCap(result: RecorderHookRef): Promise<void> {
  const elapsed = await startAtNativeRecord(result);
  await advanceActiveClock(ACTIVE_CAP_MS - elapsed - 100);
  expect(mockStop).not.toHaveBeenCalled();
  expect(unwrap(result).status).toBe("recording");
}

beforeEach((): void => {
  jest.clearAllMocks();
  mockStop.mockReset().mockResolvedValue(undefined);
  mockPrepareToRecordAsync.mockReset().mockResolvedValue(undefined);
  mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined);
  mockGetInfoAsync.mockReset().mockResolvedValue({ exists: true });
  mockDeleteAsync.mockReset().mockResolvedValue(undefined);
  mockGetPermissions.mockReset().mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation(() => ({ remove: jest.fn() }));
  resetRecorderRelease();
  jest.useFakeTimers();
});

afterEach(async (): Promise<void> => {
  mountedUnmounts.splice(0).forEach((unmount) => unmount());
  await actAsync(async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  });
  actSync((): void => {
    jest.clearAllTimers();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useVoiceRecorder R2 active-duration cap", () => {
  it("finalizes at 30,000 ms, clamps time and retains URI", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);

    await advanceActiveClock(99);
    expect(mockStop).not.toHaveBeenCalled();

    await advanceActiveClock(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("completed");
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();

    await advanceActiveClock(5_000);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
  });


  it.each(["missing-uri", "rejected-native-stop"] as const)(
    "fails the 30-second cap with an explicit recoverable recorder state for %s",
    async (failure): Promise<void> => {
      if (failure === "missing-uri") {
        // Native exposes a partial URI before Stop, but loses it when Stop
        // resolves. Failure teardown must remember and delete that known file.
        mockStop.mockImplementationOnce((): Promise<void> => {
          setMockRecorderUri(null);
          return Promise.resolve();
        });
      } else {
        mockStop.mockRejectedValueOnce(new Error("Native stop failed"));
      }
      const { result } = renderHook(() => useVoiceRecorder());
      await approachCap(result);
      await advanceActiveClock(100);

      expect(mockStop).toHaveBeenCalledTimes(1);
      // The recorder must not leave the UI Listening indefinitely or pretend
      // it has completed/retained valid audio when native finalization failed.
      expect(unwrap(result).status).toBe("error");
      expect(unwrap(result).isRecording).toBe(false);
      expect(unwrap(result).audioUri).toBeNull();
      expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
      expect(mockRecord).toHaveBeenCalledTimes(1);
      // Native capture must release before waiting for filesystem operations.
      // The mock URI getter throws after release, so successful deletion proves
      // the URI was captured while the native recorder still owned it.
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(mockGetInfoAsync).toHaveBeenCalledWith(RETAINED_URI);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledWith(RETAINED_URI, {
        idempotent: true,
      });
      expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(
        mockGetInfoAsync.mock.invocationCallOrder[0]
      );
      expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(
        mockDeleteAsync.mock.invocationCallOrder[0]
      );
      expect(jest.getTimerCount()).toBe(0);

      await advanceActiveClock(1_500);
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(unwrap(result).status).toBe("error");
      expect(unwrap(result).audioUri).toBeNull();
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);

      // Discard after automatic failure cleanup only clears recoverable UI
      // state; it must never stop/delete/release the same native object again.
      await actAsync(async (): Promise<void> => {
        await unwrap(result).discard();
      });
      expect(unwrap(result).status).toBe("idle");
      expect(unwrap(result).audioUri).toBeNull();
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    }
  );

  it("waits for failed-cap audio deletion before starting a replacement", async (): Promise<void> => {
    const info = deferred<{ exists: boolean }>();
    mockGetInfoAsync.mockReturnValueOnce(info.promise);
    mockStop.mockRejectedValueOnce(new Error("Native stop failed"));
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);

    expect(unwrap(result).status).toBe("error");
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).toHaveBeenCalledWith(RETAINED_URI);
    expect(mockDeleteAsync).not.toHaveBeenCalled();

    let restart: Promise<void> = Promise.resolve();
    actSync((): void => {
      restart = unwrap(result).start();
    });
    await advanceActiveClock(500);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);

    await actAsync(async (): Promise<void> => {
      info.resolve({ exists: true });
      await info.promise;
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
      jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
      await restart;
    });
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    expect(unwrap(result).status).toBe("recording");
    expect(unwrap(result).audioUri).toBeNull();
  });

  it("does not publish a failed old cap stop into the replacement after Discard/start", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockReturnValueOnce(stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    expect(mockStop).toHaveBeenCalledTimes(1);

    let discarding: Promise<void> = Promise.resolve();
    let replacing: Promise<void> = Promise.resolve();
    actSync((): void => {
      discarding = unwrap(result).discard();
      replacing = unwrap(result).start();
    });
    await advanceActiveClock(100);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      stopped.reject(new Error("Superseded native stop failure"));
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }
      await discarding;
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
      await replacing;
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    expect(unwrap(result).status).toBe("recording");
    expect(unwrap(result).isRecording).toBe(true);
    expect(unwrap(result).audioUri).toBeNull();
    await advanceActiveClock(1_000);
    expect(unwrap(result).status).toBe("recording");
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("clamps elapsed after a large timer jump", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await startAtNativeRecord(result);

    await advanceActiveClock(31_375);

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("completed");
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
  });

  it("starts cap timing only after native record, not while preparing", async (): Promise<void> => {
    const prepare = deferred<void>();
    mockPrepareToRecordAsync.mockReturnValueOnce(prepare.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    let start: Promise<void> = Promise.resolve();

    actSync((): void => {
      start = unwrap(result).start();
    });
    await advanceActiveClock(5_000);

    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(unwrap(result).durationMs).toBe(0);

    await actAsync(async (): Promise<void> => {
      prepare.resolve(undefined);
      await prepare.promise;
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
      await start;
    });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const elapsed = unwrap(result).durationMs;

    await advanceActiveClock(ACTIVE_CAP_MS - elapsed);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("completed");
  });

  it("excludes long paused time and fractional boundaries", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    const initiallyActive = await startAtNativeRecord(result);

    await advanceActiveClock(12_345);
    actSync((): void => {
      expect(unwrap(result).pause()).toBe(true);
    });
    const expectedPaused = initiallyActive + 12_345;
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(unwrap(result).durationMs).toBe(expectedPaused);
    expect(unwrap(result).status).toBe("paused");

    await advanceActiveClock(40_000);
    expect(unwrap(result).durationMs).toBe(expectedPaused);
    expect(mockStop).not.toHaveBeenCalled();

    actSync((): void => {
      expect(unwrap(result).resume()).toBe(true);
    });
    expect(mockRecord).toHaveBeenCalledTimes(2);
    await advanceActiveClock(ACTIVE_CAP_MS - expectedPaused - 1);
    expect(mockStop).not.toHaveBeenCalled();
    await advanceActiveClock(1);

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).status).toBe("completed");
  });

  it("retains sub-tick time over multiple pauses", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    let active = await startAtNativeRecord(result);

    for (const capture of [2_345, 4_567, 1_234]) {
      await advanceActiveClock(capture);
      active += capture;
      actSync((): void => {
        expect(unwrap(result).pause()).toBe(true);
      });
      expect(unwrap(result).durationMs).toBe(active);
      await advanceActiveClock(30_500);
      expect(unwrap(result).durationMs).toBe(active);
      expect(mockStop).not.toHaveBeenCalled();
      actSync((): void => {
        expect(unwrap(result).resume()).toBe(true);
      });
    }

    await advanceActiveClock(ACTIVE_CAP_MS - active);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).status).toBe("completed");
  });

  it("pauses just before the cap without consuming paused time", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    const initiallyActive = await startAtNativeRecord(result);
    await advanceActiveClock(ACTIVE_CAP_MS - initiallyActive - 35);

    actSync((): void => {
      expect(unwrap(result).pause()).toBe(true);
    });
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS - 35);
    await advanceActiveClock(60_000);
    expect(mockStop).not.toHaveBeenCalled();
    expect(unwrap(result).status).toBe("paused");

    actSync((): void => {
      expect(unwrap(result).resume()).toBe(true);
    });
    await advanceActiveClock(34);
    expect(mockStop).not.toHaveBeenCalled();
    await advanceActiveClock(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
  });

  it("retains cap URI after one deferred finalization", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);

    await advanceActiveClock(100);
    const stopCallsAtCap = mockStop.mock.calls.length;
    expect(mockDeleteAsync).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();

    await advanceActiveClock(2_000);
    const stopCallsDuringFinalization = mockStop.mock.calls.length;

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
    });
    expect(stopCallsAtCap).toBe(1);
    expect(stopCallsDuringFinalization).toBe(1);
    expect(unwrap(result).status).toBe("completed");
    expect(unwrap(result).durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("makes repeated native Stop and cap overlap one finalization", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);

    let manualStop: Promise<{ uri: string; durationMs: number } | null> =
      Promise.resolve(null);
    actSync((): void => {
      manualStop = unwrap(result).stop();
    });
    await advanceActiveClock(100);
    expect(mockStop).toHaveBeenCalledTimes(1);

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      await manualStop;
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("completed");
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
  });

  it("does not resurrect completed audio after cap races Discard", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    const stopCallsAtCap = mockStop.mock.calls.length;

    let discard: Promise<void> = Promise.resolve();
    actSync((): void => {
      discard = unwrap(result).discard();
    });
    await advanceActiveClock(200);
    expect(mockDeleteAsync).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      await discard;
    });
    expect(stopCallsAtCap).toBe(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
    expect(unwrap(result).durationMs).toBe(0);

    await advanceActiveClock(5_000);
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("discards finalized capped audio without a second native Stop", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
      await unwrap(result).discard();
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(unwrap(result).audioUri).toBeNull();
    expect(unwrap(result).status).toBe("idle");
  });

  it("unmount cleans audio during a pending cap stop", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result, unmount } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    const stopCallsAtCap = mockStop.mock.calls.length;

    unmount();
    await advanceActiveClock(100);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
    });
    expect(stopCallsAtCap).toBe(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(RETAINED_URI, {
      idempotent: true,
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    actSync((): void => {
      jest.advanceTimersByTime(0);
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("reset during a pending cap stop waits before cleaning old audio", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    const stopCallsAtCap = mockStop.mock.calls.length;

    let resetting: Promise<void> = Promise.resolve();
    actSync((): void => {
      resetting = unwrap(result).reset();
    });
    expect(mockRelease).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      await resetting;
    });
    expect(stopCallsAtCap).toBe(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(RETAINED_URI, {
      idempotent: true,
    });
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
  });

  it("waits for prior cap Discard before starting a new recording", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    const stopCallsAtCap = mockStop.mock.calls.length;

    let discarding: Promise<void> = Promise.resolve();
    let restarting: Promise<void> = Promise.resolve();
    actSync((): void => {
      discarding = unwrap(result).discard();
      restarting = unwrap(result).start();
    });
    await advanceActiveClock(500);
    expect(mockRecord).toHaveBeenCalledTimes(1);

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      await discarding;
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
      await restarting;
    });
    expect(stopCallsAtCap).toBe(1);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    expect(unwrap(result).status).toBe("recording");
    expect(unwrap(result).audioUri).toBeNull();
    await advanceActiveClock(1_000);
    expect(unwrap(result).status).toBe("recording");
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("returns the in-flight cap result when Submit stops during finalization", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).audioUri).toBeNull();

    const submission = {
      settled: false,
      value: null as { uri: string; durationMs: number } | null,
    };
    actSync((): void => {
      void unwrap(result)
        .stop()
        .then((value): void => {
          submission.value = value;
          submission.settled = true;
        });
    });
    await advanceActiveClock(100);
    expect(submission.settled).toBe(false);
    expect(mockStop).toHaveBeenCalledTimes(1);

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      for (let index = 0; index < 20 && !submission.settled; index += 1) {
        await Promise.resolve();
      }
    });
    expect(submission.settled).toBe(true);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(submission.value).not.toBeNull();
    expect(submission.value?.uri).toBe(RETAINED_URI);
    expect(submission.value?.durationMs).toBe(ACTIVE_CAP_MS);
    expect(unwrap(result).status).toBe("completed");
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
  });

  it("deletes retained cap audio when reset runs after finalization", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    const stopCallsAtCap = mockStop.mock.calls.length;
    expect(stopCallsAtCap).toBe(1);
    expect(unwrap(result).audioUri).toBe(RETAINED_URI);
    expect(unwrap(result).status).toBe("completed");

    await actAsync(async (): Promise<void> => {
      await unwrap(result).reset();
    });
    expect(mockStop).toHaveBeenCalledTimes(stopCallsAtCap);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(RETAINED_URI, {
      idempotent: true,
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
    expect(unwrap(result).durationMs).toBe(0);

    await advanceActiveClock(5_000);
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
    expect(mockStop).toHaveBeenCalledTimes(stopCallsAtCap);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
  });

  it("suppresses a discarded session completion from its pending cap stop", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopped.promise);
    const cleanupGate = deferred<void>();
    mockGetInfoAsync.mockImplementationOnce(
      (): Promise<{ exists: boolean }> =>
        cleanupGate.promise.then((): { exists: boolean } => ({ exists: true }))
    );
    const { result } = renderHook(() => useVoiceRecorder());
    await approachCap(result);
    await advanceActiveClock(100);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(unwrap(result).audioUri).toBeNull();

    let discarding: Promise<void> = Promise.resolve();
    actSync((): void => {
      discarding = unwrap(result).discard();
    });
    await advanceActiveClock(100);
    expect(mockDeleteAsync).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await stopped.promise;
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    });
    expect(unwrap(result).audioUri).toBeNull();
    expect(unwrap(result).status).not.toBe("completed");

    await actAsync(async (): Promise<void> => {
      cleanupGate.resolve(undefined);
      await discarding;
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(RETAINED_URI, {
      idempotent: true,
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
    expect(unwrap(result).durationMs).toBe(0);
  });
  it("abandons a warmup Stop before native cleanup when Discard supersedes it", async (): Promise<void> => {
    const stopped = deferred<void>();
    mockStop.mockReturnValueOnce(stopped.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    let starting: Promise<void> = Promise.resolve();
    actSync((): void => {
      starting = unwrap(result).start();
    });
    await advanceActiveClock(0);
    expect(mockRecord).toHaveBeenCalledTimes(1);

    const submission = { settled: false };
    let stopping: Promise<{ uri: string; durationMs: number } | null> =
      Promise.resolve(null);
    let discarding: Promise<void> = Promise.resolve();
    actSync((): void => {
      stopping = unwrap(result).stop();
      void stopping.then((): void => {
        submission.settled = true;
      });
      discarding = unwrap(result).discard();
    });
    await advanceActiveClock(NATIVE_STABILIZATION_DELAY_MS);
    expect(submission.settled).toBe(true);
    expect(unwrap(result).status).not.toBe("completed");
    expect(mockStop).toHaveBeenCalledTimes(1);

    await actAsync(async (): Promise<void> => {
      stopped.resolve(undefined);
      await starting;
      expect(await stopping).toBeNull();
      await discarding;
    });
    expect(unwrap(result).status).toBe("idle");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("leaves superseded failed Start resources for the pending cleanup", async (): Promise<void> => {
    const prepare = deferred<void>();
    const cleanupGate = deferred<void>();
    mockPrepareToRecordAsync.mockReturnValueOnce(prepare.promise);
    mockGetInfoAsync.mockImplementationOnce(
      async (): Promise<{ exists: boolean }> => {
        await cleanupGate.promise;
        return { exists: true };
      }
    );
    const { result } = renderHook(() => useVoiceRecorder());
    const failure = new Error("Superseded preparation failed");
    let starting: Promise<void> = Promise.resolve();
    let failureResult: Promise<unknown> = Promise.resolve();
    actSync((): void => {
      starting = unwrap(result).start();
      failureResult = starting.catch((error: unknown): unknown => error);
    });
    await advanceActiveClock(0);
    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
    let discarding: Promise<void> = Promise.resolve();
    actSync((): void => {
      discarding = unwrap(result).discard();
    });
    await actAsync(async (): Promise<void> => {
      prepare.reject(failure);
      expect(await failureResult).toBe(failure);
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    });
    expect(mockGetInfoAsync).toHaveBeenCalledWith(RETAINED_URI);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      cleanupGate.resolve(undefined);
      await discarding;
    });
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
  });
});
