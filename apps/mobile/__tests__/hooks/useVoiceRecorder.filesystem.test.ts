/**
 * #391 US1 RED — Expo SDK 55 deprecated root versus supported async /legacy.
 *
 * This test intentionally fails against the current useVoiceRecorder.ts root
 * import. An in-memory temp-file store proves actual deletion semantics, not
 * merely that a mocked delete function was invoked. No native audio/provider.
 */
import { logger } from "@/utils/logger";
import {
  actSync,
  actAsync,
  AppState,
  mockRecord,
  mockStop,
  mockPrepareToRecordAsync,
  mockSetAudioModeAsync,
  mockGetPermissions,
  mockRelease,
  mockGetInfoAsync,
  mockDeleteAsync,
  mockRootGetInfoAsync,
  mockRootDeleteAsync,
  mountedUnmounts,
  renderHook,
  unwrap,
  startRecordingWithFlush,
  useVoiceRecorder,
  NATIVE_STABILIZATION_DELAY_MS,
  resetRecorderRelease,
  setMockRecorderUri,
  setMockSdk55RootAsyncMethodsThrow,
} from "./voice-recorder-fixtures";

const KNOWN_URI = "file:///tmp/recording.m4a";
let existingFiles = new Set<string>();

interface FileInfo {
  readonly exists: boolean;
}
interface SupportedAsyncFileSystem {
  readonly getInfoAsync: (uri: string) => Promise<FileInfo>;
  readonly deleteAsync: (
    uri: string,
    options?: { readonly idempotent?: boolean }
  ) => Promise<void>;
}
interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolver: (value: T) => void = () => {
    throw new Error("Deferred was never initialized");
  };
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolve: (value: T): void => resolver(value) };
}
async function flushMicrotasks(): Promise<void> {
  await actAsync(async (): Promise<void> => {
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }
  });
}
function assertSupportedAdapterUsed(): void {
  expect(mockRootGetInfoAsync).not.toHaveBeenCalled();
  expect(mockRootDeleteAsync).not.toHaveBeenCalled();
}

beforeEach((): void => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  resetRecorderRelease();
  setMockSdk55RootAsyncMethodsThrow(true);
  existingFiles = new Set([KNOWN_URI]);
  mockStop.mockReset().mockResolvedValue(undefined);
  mockPrepareToRecordAsync.mockReset().mockResolvedValue(undefined);
  mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined);
  mockGetPermissions.mockReset().mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  mockGetInfoAsync.mockReset().mockImplementation(
    async (uri: string): Promise<FileInfo> => ({
      exists: existingFiles.has(uri),
    })
  );
  mockDeleteAsync.mockReset().mockImplementation(
    async (
      uri: string,
      options?: { readonly idempotent?: boolean }
    ): Promise<void> => {
      if (!existingFiles.has(uri) && options?.idempotent !== true) {
        throw new Error("File is missing");
      }
      existingFiles.delete(uri);
    }
  );
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(async (): Promise<void> => {
  mountedUnmounts.splice(0).forEach((unmount) => unmount());
  await flushMicrotasks();
  actSync((): void => {
    jest.clearAllTimers();
  });
  setMockSdk55RootAsyncMethodsThrow(false);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("#391 SDK55 temporary recording filesystem adapter", () => {
  it("distinguishes throwing root APIs from working legacy file operations", async (): Promise<void> => {
    const root = jest.requireMock<SupportedAsyncFileSystem>("expo-file-system");
    const legacy = jest.requireMock<SupportedAsyncFileSystem>(
      "expo-file-system/legacy"
    );

    await expect(root.getInfoAsync(KNOWN_URI)).rejects.toThrow(/deprecated/i);
    await expect(
      root.deleteAsync(KNOWN_URI, { idempotent: true })
    ).rejects.toThrow(/deprecated/i);
    expect(await legacy.getInfoAsync(KNOWN_URI)).toEqual({ exists: true });
    await legacy.deleteAsync(KNOWN_URI, { idempotent: true });
    expect(existingFiles.has(KNOWN_URI)).toBe(false);
  });

  it("deletes a completed recording through supported async legacy cleanup, after release", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);
    await actAsync(async (): Promise<void> => {
      expect(await unwrap(result).stop()).toEqual({
        uri: KNOWN_URI,
        durationMs: expect.any(Number),
      });
    });
    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });

    expect(existingFiles.has(KNOWN_URI)).toBe(false);
    assertSupportedAdapterUsed();
    expect(mockGetInfoAsync).toHaveBeenCalledWith(KNOWN_URI);
    expect(mockDeleteAsync).toHaveBeenCalledWith(KNOWN_URI, {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetInfoAsync.mock.invocationCallOrder[0]
    );
    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).audioUri).toBeNull();
  });

  it("treats a missing file and repeated Discard as idempotent", async (): Promise<void> => {
    existingFiles.clear();
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);
    await actAsync(async (): Promise<void> => {
      await unwrap(result).stop();
      await unwrap(result).discard();
      await unwrap(result).discard();
    });

    assertSupportedAdapterUsed();
    expect(existingFiles.size).toBe(0);
    expect(mockGetInfoAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("retains a real deletion failure and warns without pretending that the file disappeared", async (): Promise<void> => {
    const ioError = new Error("Simulated filesystem I/O failure");
    mockDeleteAsync.mockImplementationOnce(
      async (): Promise<void> => {
        throw ioError;
      }
    );
    const warn = jest.spyOn(logger, "warn").mockImplementation((): void => {});
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);
    await actAsync(async (): Promise<void> => {
      await unwrap(result).stop();
      await unwrap(result).discard();
    });

    assertSupportedAdapterUsed();
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(existingFiles.has(KNOWN_URI)).toBe(true);
    expect(warn).toHaveBeenCalledWith("voice.recorder.tempAudioDeleteFailed", {
      error: ioError,
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("idle");
  });

  it.each(["failed-native-stop", "lost-uri-after-stop"] as const)(
    "deletes the pre-release partial URI after %s without a second Stop",
    async (failure): Promise<void> => {
      if (failure === "failed-native-stop") {
        mockStop.mockRejectedValueOnce(new Error("Simulated native Stop failure"));
      } else {
        mockStop.mockImplementationOnce((): Promise<void> => {
          setMockRecorderUri(null);
          return Promise.resolve();
        });
      }
      const { result } = renderHook(() => useVoiceRecorder());
      await startRecordingWithFlush(result);
      await actAsync(async (): Promise<void> => {
        expect(await unwrap(result).stop()).toBeNull();
        for (let index = 0; index < 12; index += 1) {
          await Promise.resolve();
        }
      });

      expect(unwrap(result).status).toBe("error");
      expect(unwrap(result).audioUri).toBeNull();
      expect(existingFiles.has(KNOWN_URI)).toBe(false);
      assertSupportedAdapterUsed();
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(mockGetInfoAsync).toHaveBeenCalledWith(KNOWN_URI);
      expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(
        mockGetInfoAsync.mock.invocationCallOrder[0]
      );
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockStop).toHaveBeenCalledTimes(1);

      await actAsync(async (): Promise<void> => {
        await unwrap(result).discard();
      });
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    }
  );

  it("releases failed capture before slow file inspection and blocks replacement until deletion", async (): Promise<void> => {
    const fileInfoGate = deferred<FileInfo>();
    mockGetInfoAsync.mockImplementationOnce(
      (): Promise<FileInfo> => fileInfoGate.promise
    );
    mockStop.mockRejectedValueOnce(new Error("Native Stop rejected"));
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);
    await actAsync(async (): Promise<void> => {
      expect(await unwrap(result).stop()).toBeNull();
      await Promise.resolve();
    });

    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).toHaveBeenCalledWith(KNOWN_URI);
    expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetInfoAsync.mock.invocationCallOrder[0]
    );
    expect(mockDeleteAsync).not.toHaveBeenCalled();
    expect(existingFiles.has(KNOWN_URI)).toBe(true);

    let replacement: Promise<void> = Promise.resolve();
    actSync((): void => {
      replacement = unwrap(result).start();
    });
    await actAsync(async (): Promise<void> => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);

    await actAsync(async (): Promise<void> => {
      fileInfoGate.resolve({ exists: true });
      await fileInfoGate.promise;
      for (let index = 0; index < 12; index += 1) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
      await replacement;
    });
    expect(existingFiles.has(KNOWN_URI)).toBe(false);
    assertSupportedAdapterUsed();
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    expect(unwrap(result).status).toBe("recording");
  });

  it("serializes concurrent Discards and removes only the old recording", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    let firstDiscard: Promise<void> = Promise.resolve();
    let secondDiscard: Promise<void> = Promise.resolve();
    actSync((): void => {
      firstDiscard = unwrap(result).discard();
      secondDiscard = unwrap(result).discard();
    });
    await actAsync(async (): Promise<void> => {
      await Promise.all([firstDiscard, secondDiscard]);
    });

    expect(existingFiles.has(KNOWN_URI)).toBe(false);
    assertSupportedAdapterUsed();
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(unwrap(result).status).toBe("idle");
  });

  it.each(["unmount", "discard"] as const)(
    "cleans partial prepare resources after %s cancellation without a native Stop",
    async (method): Promise<void> => {
      const prepareGate = deferred<void>();
      mockPrepareToRecordAsync.mockImplementationOnce(
        (): Promise<void> => prepareGate.promise
      );
      const { result, unmount } = renderHook(() => useVoiceRecorder());
      let starting: Promise<void> = Promise.resolve();
      actSync((): void => {
        starting = unwrap(result).start();
      });
      await flushMicrotasks();
      expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect(mockRecord).not.toHaveBeenCalled();

      let discard: Promise<void> = Promise.resolve();
      actSync((): void => {
        if (method === "unmount") unmount();
        else discard = unwrap(result).discard();
      });
      expect(existingFiles.has(KNOWN_URI)).toBe(true);

      await actAsync(async (): Promise<void> => {
        prepareGate.resolve(undefined);
        await starting;
        await discard;
        for (let index = 0; index < 12; index += 1) {
          await Promise.resolve();
        }
      });
      expect(existingFiles.has(KNOWN_URI)).toBe(false);
      assertSupportedAdapterUsed();
      expect(mockRecord).not.toHaveBeenCalled();
      expect(mockStop).not.toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    }
  );

  it("a stale old native Stop cannot release a replacement after Discard/start", async (): Promise<void> => {
    const stopGate = deferred<void>();
    mockStop.mockImplementationOnce((): Promise<void> => stopGate.promise);
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);
    let discard: Promise<void> = Promise.resolve();
    let replacement: Promise<void> = Promise.resolve();
    actSync((): void => {
      discard = unwrap(result).discard();
      replacement = unwrap(result).start();
    });
    await flushMicrotasks();
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      stopGate.resolve(undefined);
      await stopGate.promise;
      await discard;
      for (let index = 0; index < 12; index += 1) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(NATIVE_STABILIZATION_DELAY_MS);
      await replacement;
    });
    expect(existingFiles.has(KNOWN_URI)).toBe(false);
    assertSupportedAdapterUsed();
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    expect(unwrap(result).status).toBe("recording");
  });
});
