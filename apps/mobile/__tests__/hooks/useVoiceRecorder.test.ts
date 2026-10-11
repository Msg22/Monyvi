import type { AppStateStatus } from "react-native";
import {
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
  mountedUnmounts,
  unwrap,
  renderHook,
  startRecordingWithFlush,
  useVoiceRecorder,
  NATIVE_STABILIZATION_DELAY_MS,
  resetRecorderRelease,
} from "./voice-recorder-fixtures";

type MicrophoneStatus = "granted" | "denied" | "blocked" | "unknown";

interface TypedPermissionRequest {
  readonly requestPermissionStatus: () => Promise<MicrophoneStatus>;
}

function supportsTypedPermissionRequest(
  value: unknown
): value is TypedPermissionRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "requestPermissionStatus" in value &&
    typeof value.requestPermissionStatus === "function"
  );
}

describe("useVoiceRecorder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStop.mockReset().mockResolvedValue(undefined);
    mockGetPermissions
      .mockReset()
      .mockResolvedValue({ granted: false, canAskAgain: true });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(() => ({ remove: jest.fn() }));
    jest.useFakeTimers();
    resetRecorderRelease();
  });

  afterEach(async (): Promise<void> => {
    await actAsync(async (): Promise<void> => {
      await Promise.resolve();
      await Promise.resolve();
    });
    mountedUnmounts.splice(0).forEach((fn) => fn());
    actSync((): void => {
      jest.runOnlyPendingTimers();
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  // =========================================================================
  // Initial state
  // =========================================================================
  describe("initial state", () => {
    it("keeps permission unknown until the actual native check resolves", async (): Promise<void> => {
      const permission = createDeferred<{
        granted: boolean;
        canAskAgain: boolean;
      }>();
      mockGetPermissions.mockReturnValueOnce(permission.promise);
      const { result } = renderHook(() => useVoiceRecorder());
      expect(unwrap(result).permissionStatus).toBe("unknown");
      expect(mockRequestPermissions).not.toHaveBeenCalled();
      await actAsync(async (): Promise<void> => {
        permission.resolve({ granted: true, canAskAgain: true });
        await permission.promise;
      });
      expect(unwrap(result).permissionStatus).toBe("granted");
      expect(unwrap(result).hasPermission).toBe(true);
    });

    it.each([
      [false, true, "denied"],
      [false, false, "blocked"],
      [true, false, "granted"],
    ] as const)(
      "classifies native grant=%s canAskAgain=%s as %s",
      async (granted, canAskAgain, expected): Promise<void> => {
        mockGetPermissions.mockResolvedValueOnce({ granted, canAskAgain });
        const { result } = renderHook(() => useVoiceRecorder());
        await actAsync(async (): Promise<void> => {
          await Promise.resolve();
        });
        expect(unwrap(result).permissionStatus).toBe(expected);
        expect(mockRequestPermissions).not.toHaveBeenCalled();
      }
    );

    it("refreshes revoked permission on app resume and removes its subscription", async (): Promise<void> => {
      const subscription = { remove: jest.fn() };
      let onChange: ((state: AppStateStatus) => void) | undefined;
      const listener = jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((_event, callback) => {
          onChange = callback;
          return subscription;
        });
      mockGetPermissions
        .mockResolvedValueOnce({ granted: true, canAskAgain: true })
        .mockResolvedValueOnce({ granted: false, canAskAgain: false });
      const { result, unmount } = renderHook(() => useVoiceRecorder());
      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
      });
      expect(unwrap(result).hasPermission).toBe(true);
      await actAsync(async (): Promise<void> => {
        onChange?.("active");
        await Promise.resolve();
      });
      expect(unwrap(result).hasPermission).toBe(false);
      expect(unwrap(result).permissionStatus).toBe("blocked");
      unmount();
      expect(subscription.remove).toHaveBeenCalledTimes(1);
      listener.mockRestore();
    });

    it("should start with idle status", () => {
      const { result } = renderHook(() => useVoiceRecorder());
      const hook = unwrap(result);
      expect(hook.status).toBe("idle");
      expect(hook.isRecording).toBe(false);
      expect(hook.durationMs).toBe(0);
      expect(hook.audioUri).toBeNull();
    });
  });

  // =========================================================================
  // Permission
  // =========================================================================
  describe("requestPermission", () => {
    it("should request and grant permission", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      let granted = false;
      await actAsync(async () => {
        granted = await unwrap(result).requestPermission();
      });

      expect(granted).toBe(true);
      expect(unwrap(result).hasPermission).toBe(true);
    });

    it("should return false when permission is denied", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: false });
      const { result } = renderHook(() => useVoiceRecorder());

      let granted = true;
      await actAsync(async () => {
        granted = await unwrap(result).requestPermission();
      });

      expect(granted).toBe(false);
      expect(unwrap(result).hasPermission).toBe(false);
    });
  });

  describe("typed explicit OS permission result (same native request)", () => {
    it.each([
      [{ granted: true, canAskAgain: true }, "granted"],
      [{ granted: false, canAskAgain: true }, "denied"],
      [{ granted: false, canAskAgain: false }, "blocked"],
    ] as const)(
      "reports actual OS response %s as %s without a second native get",
      async (nativeAnswer, expected): Promise<void> => {
        mockRequestPermissions.mockResolvedValueOnce(nativeAnswer);
        const { result } = renderHook(() => useVoiceRecorder());
        await actAsync(async (): Promise<void> => {
          await Promise.resolve();
        });
        const hook = unwrap(result);
        expect(supportsTypedPermissionRequest(hook)).toBe(true);
        if (!supportsTypedPermissionRequest(hook)) {
          throw new Error("Recorder must expose typed OS request status");
        }
        const initialReadCalls = mockGetPermissions.mock.calls.length;
        let status: MicrophoneStatus = "unknown";
        await actAsync(async (): Promise<void> => {
          status = await hook.requestPermissionStatus();
        });
        expect(status).toBe(expected);
        expect(unwrap(result).permissionStatus).toBe(expected);
        expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
        expect(mockGetPermissions).toHaveBeenCalledTimes(initialReadCalls);
      }
    );

    it("reports an OS request failure as unknown without a follow-up permission get", async (): Promise<void> => {
      mockRequestPermissions.mockRejectedValueOnce(new Error("OS permission failed"));
      const { result } = renderHook(() => useVoiceRecorder());
      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
      });
      const hook = unwrap(result);
      expect(supportsTypedPermissionRequest(hook)).toBe(true);
      if (!supportsTypedPermissionRequest(hook)) {
        throw new Error("Recorder must expose typed OS request status");
      }
      const initialReadCalls = mockGetPermissions.mock.calls.length;
      let status: MicrophoneStatus = "granted";
      await actAsync(async (): Promise<void> => {
        status = await hook.requestPermissionStatus();
      });
      expect(status).toBe("unknown");
      expect(unwrap(result).permissionStatus).toBe("unknown");
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
      expect(mockGetPermissions).toHaveBeenCalledTimes(initialReadCalls);
    });
  });

  // =========================================================================
  // Start recording
  // =========================================================================
  describe("start", () => {
    it("should request permission and transition to recording", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      expect(unwrap(result).status).toBe("recording");
      expect(unwrap(result).isRecording).toBe(true);
      expect(mockPrepareToRecordAsync).toHaveBeenCalled();
      expect(mockRecord).toHaveBeenCalled();
    });

    it("rejects preparation failure so the flow can show actionable recovery", async (): Promise<void> => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      mockPrepareToRecordAsync.mockRejectedValueOnce(
        new Error("Native module error")
      );
      const { result } = renderHook(() => useVoiceRecorder());

      await actAsync(async (): Promise<void> => {
        await expect(unwrap(result).start()).rejects.toThrow(
          "Native module error"
        );
      });

      expect(unwrap(result).status).toBe("idle");
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it.each(["audio-mode", "native-preparation"] as const)(
      "does not tick or capture before %s settles",
      async (stage): Promise<void> => {
        const pending = createDeferred<void>();
        (stage === "audio-mode"
          ? mockSetAudioModeAsync
          : mockPrepareToRecordAsync
        ).mockReturnValueOnce(pending.promise);
        const { result } = renderHook(() => useVoiceRecorder());
        let start: Promise<void> | undefined;
        await actAsync(async (): Promise<void> => {
          start = unwrap(result).start();
          await Promise.resolve();
          await Promise.resolve();
          jest.advanceTimersByTime(2000);
        });
        expect(mockRecord).not.toHaveBeenCalled();
        expect(unwrap(result).durationMs).toBe(0);
        expect(unwrap(result).isRecording).toBe(false);
        await actAsync(async (): Promise<void> => {
          pending.resolve(undefined);
          for (let turn = 0; turn < 6; turn++) await Promise.resolve();
          jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
          await start;
        });
        expect(mockRecord).toHaveBeenCalledTimes(1);
        expect(unwrap(result).isRecording).toBe(true);
      }
    );

    it.each([
      ["audio-mode", "discard"],
      ["native-preparation", "discard"],
      ["audio-mode", "unmount"],
      ["native-preparation", "unmount"],
    ] as const)(
      "prevents native record itself after %s is canceled by %s",
      async (stage, cancellation): Promise<void> => {
        const pending = createDeferred<void>();
        (stage === "audio-mode"
          ? mockSetAudioModeAsync
          : mockPrepareToRecordAsync
        ).mockReturnValueOnce(pending.promise);
        const { result, unmount } = renderHook(() => useVoiceRecorder());
        let start: Promise<void> | undefined;
        let discard: Promise<void> | undefined;
        await actAsync(async (): Promise<void> => {
          start = unwrap(result)
            .start()
            .catch((): void => {});
          for (let turn = 0; turn < 4; turn++) await Promise.resolve();
        });
        actSync((): void => {
          if (cancellation === "unmount") unmount();
          else discard = unwrap(result).discard();
        });
        await actAsync(async (): Promise<void> => {
          pending.resolve(undefined);
          for (let turn = 0; turn < 8; turn++) await Promise.resolve();
          jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS + 1000);
          await start;
          await discard;
        });
        expect(mockRecord).not.toHaveBeenCalled();
      }
    );

    it("rejects audio-mode failure without creating a capture", async (): Promise<void> => {
      mockSetAudioModeAsync.mockRejectedValueOnce(
        new Error("audio unavailable")
      );
      const { result } = renderHook(() => useVoiceRecorder());
      await actAsync(async (): Promise<void> => {
        await expect(unwrap(result).start()).rejects.toThrow(
          "audio unavailable"
        );
      });
      expect(mockRecord).not.toHaveBeenCalled();
      expect(unwrap(result).status).toBe("idle");
    });
  });

  // =========================================================================
  // Pause / Resume
  // =========================================================================
  describe("pause and resume", () => {
    it("preserves Paused and its timer when native resume fails", async (): Promise<void> => {
      const { result } = renderHook(() => useVoiceRecorder());
      await startRecordingWithFlush(result);
      act((): void => {
        unwrap(result).pause();
      });
      const pausedDuration = unwrap(result).durationMs;
      mockRecord.mockImplementationOnce((): never => {
        throw new Error("Native resume failed");
      });
      act((): void => {
        expect(unwrap(result).resume()).toBe(false);
      });
      expect(unwrap(result).status).toBe("paused");
      act((): void => {
        jest.advanceTimersByTime(1000);
      });
      expect(unwrap(result).durationMs).toBe(pausedDuration);
      expect(mockRelease).not.toHaveBeenCalled();
    });

    it("queues one warmup pause until native readiness and reports actual pause only then", async (): Promise<void> => {
      const { result } = renderHook(() => useVoiceRecorder());
      let pending: Promise<void> | undefined;
      await actAsync(async (): Promise<void> => {
        pending = unwrap(result).start();
        for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      });
      expect(mockRecord).toHaveBeenCalledTimes(1);
      act((): void => {
        expect(unwrap(result).pause()).toBe(false);
      });
      expect(mockPause).not.toHaveBeenCalled();
      expect(unwrap(result).status).toBe("recording");
      await actAsync(async (): Promise<void> => {
        jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS - 1);
        await Promise.resolve();
      });
      expect(mockPause).not.toHaveBeenCalled();
      await actAsync(async (): Promise<void> => {
        jest.advanceTimersByTime(1);
        await pending;
      });
      expect(mockPause).toHaveBeenCalledTimes(1);
      expect(unwrap(result).status).toBe("paused");
      const pausedDuration = unwrap(result).durationMs;
      act((): void => {
        jest.advanceTimersByTime(1000);
      });
      expect(unwrap(result).durationMs).toBe(pausedDuration);
    });

    it("invalidates a queued warmup pause when discarded", async (): Promise<void> => {
      const { result } = renderHook(() => useVoiceRecorder());
      let pending: Promise<void> | undefined;
      let discard: Promise<void> | undefined;
      await actAsync(async (): Promise<void> => {
        pending = unwrap(result).start();
        for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      });
      act((): void => {
        unwrap(result).pause();
        discard = unwrap(result).discard();
      });
      await actAsync(async (): Promise<void> => {
        jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
        await pending;
        await discard;
      });
      expect(mockPause).not.toHaveBeenCalled();
      expect(unwrap(result).status).toBe("idle");
    });

    it("should transition to paused status on pause", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      actSync(() => {
        unwrap(result).pause();
      });

      expect(unwrap(result).status).toBe("paused");
      expect(mockPause).toHaveBeenCalled();
    });

    it("should transition back to recording on resume", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      actSync(() => {
        unwrap(result).pause();
      });

      actSync(() => {
        unwrap(result).resume();
      });

      expect(unwrap(result).status).toBe("recording");
      // start calls record once, resume calls again
      expect(mockRecord).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Stop recording
  // =========================================================================
  describe("stop", () => {
    it("should transition to completed and return audio URI", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      let stopResult: { uri: string; durationMs: number } | null = null;
      await actAsync(async () => {
        stopResult = await unwrap(result).stop();
      });

      expect(unwrap(result).status).toBe("completed");
      expect(stopResult).not.toBeNull();
      if (stopResult) {
        expect((stopResult as { uri: string }).uri).toBe(
          "file:///tmp/recording.m4a"
        );
      }
    });

    it("should wait for native readiness if stop is called during warmup (fast-tap)", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      // Kick off start but do NOT flush the stabilization delay yet
      await actAsync(async () => {
        const hook = unwrap(result);
        const startPromise = hook.start();

        // Flush microtasks so prepareToRecordAsync resolves, but NOT the timer
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Now call stop() — native is NOT ready yet, so it should poll/await
        const stopPromise = hook.stop();

        // Advance timers to fire the stabilization delay AND the readiness poll
        jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS + 100);
        await Promise.resolve();
        await Promise.resolve();

        // Let the promises settle
        await startPromise;
        const stopRes = await stopPromise;

        // stop() should have waited and returned a valid result
        expect(stopRes).not.toBeNull();
        if (stopRes) {
          expect(stopRes.uri).toBe("file:///tmp/recording.m4a");
        }
      });

      expect(unwrap(result).status).toBe("completed");
    });
  });

  // =========================================================================
  // Discard
  // =========================================================================
  describe("discard", () => {
    it("should clean up temp file and reset to idle (FR-021)", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      await actAsync(async () => {
        await unwrap(result).stop();
      });

      await actAsync(async () => {
        await unwrap(result).discard();
      });

      expect(mockDeleteAsync).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
      expect(unwrap(result).status).toBe("idle");
      expect(unwrap(result).audioUri).toBeNull();
    });

    it("should handle discard during warmup window without leaving native recorder running", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      // Kick off start but don't flush the stabilization delay
      await actAsync(async () => {
        const hook = unwrap(result);
        const startPromise = hook.start();

        // Flush microtasks so prepareToRecordAsync resolves
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Call discard during warmup — should await the start promise
        const discardPromise = hook.discard();

        // Advance timers to let stabilization delay and cleanup complete
        jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS + 100);
        await Promise.resolve();
        await Promise.resolve();

        await startPromise;
        await discardPromise;
      });

      expect(unwrap(result).status).toBe("idle");
    });

    it.each(["discard", "unmount"])(
      "clears the duration timer when %s happens before setup finishes",
      async (cleanupAction: string): Promise<void> => {
        const prepare = createDeferred<void>();
        mockPrepareToRecordAsync.mockImplementationOnce(
          (): Promise<void> => prepare.promise
        );
        const { result, unmount } = renderHook(() => useVoiceRecorder());
        const hook = unwrap(result);
        let startPromise: Promise<void> | null = null;
        let discardPromise: Promise<void> | null = null;

        actSync((): void => {
          startPromise = hook.start();
        });

        await actAsync(async (): Promise<void> => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
        expect(mockRecord).not.toHaveBeenCalled();

        if (cleanupAction === "unmount") {
          unmount();
        } else {
          actSync((): void => {
            discardPromise = hook.discard();
          });
        }

        await actAsync(async (): Promise<void> => {
          prepare.resolve(undefined);
          await prepare.promise;
          await Promise.resolve();
          await Promise.resolve();
          jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
          await startPromise;
          await discardPromise;
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(mockRecord).not.toHaveBeenCalled();
        expect(mockStop).not.toHaveBeenCalled();
        expect(mockRelease).toHaveBeenCalledTimes(1);
        expect(mockDeleteAsync).toHaveBeenCalledWith(
          "file:///tmp/recording.m4a",
          { idempotent: true }
        );
        expect(jest.getTimerCount()).toBe(0);
      }
    );

    it("waits for native stop before deleting or releasing during unmount", async () => {
      const nativeStop = createDeferred<void>();
      mockStop.mockImplementationOnce((): Promise<void> => nativeStop.promise);
      const { result, unmount } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      unmount();

      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).not.toHaveBeenCalled();
      expect(mockRelease).not.toHaveBeenCalled();

      await actAsync(async (): Promise<void> => {
        nativeStop.resolve(undefined);
        await nativeStop.promise;
        await Promise.resolve();
      });

      expect(mockDeleteAsync).toHaveBeenCalledWith(
        "file:///tmp/recording.m4a",
        { idempotent: true }
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("shares one native stop across overlapping discard cleanup", async () => {
      const nativeStop = createDeferred<void>();
      mockStop.mockImplementationOnce((): Promise<void> => nativeStop.promise);
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      let firstDiscard: Promise<void> | null = null;
      let secondDiscard: Promise<void> | null = null;

      actSync(() => {
        firstDiscard = unwrap(result).discard();
        secondDiscard = unwrap(result).discard();
      });

      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).not.toHaveBeenCalled();

      await actAsync(async (): Promise<void> => {
        nativeStop.resolve(undefined);
        await Promise.all([
          firstDiscard ?? Promise.resolve(),
          secondDiscard ?? Promise.resolve(),
        ]);
      });

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("captures the URI before cleanup releases a public stop in flight", async () => {
      const nativeStop = createDeferred<void>();
      mockStop.mockImplementationOnce((): Promise<void> => nativeStop.promise);
      const { result, unmount } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      let stopPromise: Promise<{
        uri: string;
        durationMs: number;
      } | null> | null = null;

      actSync(() => {
        stopPromise = unwrap(result).stop();
      });

      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
      });

      expect(mockStop).toHaveBeenCalledTimes(1);

      unmount();

      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
      });

      expect(mockDeleteAsync).not.toHaveBeenCalled();
      expect(mockRelease).not.toHaveBeenCalled();

      await actAsync(async (): Promise<void> => {
        nativeStop.resolve(undefined);
        await nativeStop.promise;
        await stopPromise;
        await Promise.resolve();
      });

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledWith(
        "file:///tmp/recording.m4a",
        { idempotent: true }
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("finishes an old discard before a new recording can start", async () => {
      const nativeStop = createDeferred<void>();
      mockStop.mockImplementationOnce((): Promise<void> => nativeStop.promise);
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);
      expect(mockRecord).toHaveBeenCalledTimes(1);

      let discardPromise: Promise<void> | null = null;
      let nextStartPromise: Promise<void> | null = null;

      actSync(() => {
        discardPromise = unwrap(result).discard();
        nextStartPromise = unwrap(result).start();
      });

      await actAsync(async (): Promise<void> => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockRecord).toHaveBeenCalledTimes(1);

      await actAsync(async (): Promise<void> => {
        nativeStop.resolve(undefined);
        await nativeStop.promise;
        await discardPromise;
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
        await Promise.resolve();
        await nextStartPromise;
      });

      expect(mockRecord).toHaveBeenCalledTimes(2);
      expect(unwrap(result).status).toBe("recording");
    });
  });

  // =========================================================================
  // Reset
  // =========================================================================
  describe("reset", () => {
    it("should reset all state back to idle from completed", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);

      await actAsync(async () => {
        await unwrap(result).stop();
      });

      await actAsync(async () => {
        await unwrap(result).reset();
      });

      expect(unwrap(result).status).toBe("idle");
      expect(unwrap(result).durationMs).toBe(0);
      expect(unwrap(result).audioUri).toBeNull();
    });

    it("should delegate to discard when called during recording", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      await startRecordingWithFlush(result);
      expect(unwrap(result).status).toBe("recording");

      // reset() while recording should call discard() internally
      await actAsync(async () => {
        await unwrap(result).reset();
      });

      expect(unwrap(result).status).toBe("idle");
      // discard calls stop on the native recorder
      expect(mockStop).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Active-capture cap at 30 seconds (FR-045)
  // =========================================================================
  describe("active-capture cap at 30 seconds", () => {
    it("should finalize recording when active time reaches 30s", async () => {
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      const { result } = renderHook(() => useVoiceRecorder());

      // 1. Start recording (includes stabilization delay flush)
      await startRecordingWithFlush(result);
      expect(unwrap(result).status).toBe("recording");

      // 2. Advance past the 30s active cap; the one-shot cap deadline
      //    finalizes the capture exactly once and retains the URI
      actSync(() => {
        jest.advanceTimersByTime(30_000);
      });

      // 3. Flush microtasks so the auto-stop async IIFE
      //    (audioRecorder.stop() + setStatus("completed")) settles
      await actAsync(async () => {
        await Promise.resolve();
      });

      expect(mockStop).toHaveBeenCalled();
      expect(unwrap(result).status).toBe("completed");
    });
  });
});

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: (value: T) => void = (): void => {};
  const promise = new Promise<T>((resolve): void => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}
