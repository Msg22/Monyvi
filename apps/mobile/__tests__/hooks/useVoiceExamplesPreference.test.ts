import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock(
  "@/services/voice-examples-preference-service",
  () => ({
    readVoiceExamplesDismissed: jest.fn(),
    dismissVoiceExamples: jest.fn(),
  }),
  { virtual: true }
);
jest.mock("@/utils/logger", () => ({ logger: { error: jest.fn() } }));
const {
  readVoiceExamplesDismissed: mockReadVoiceExamplesDismissed,
  dismissVoiceExamples: mockDismissVoiceExamples,
} = jest.requireMock<{
  readonly readVoiceExamplesDismissed: jest.MockedFunction<
    (userId: string) => Promise<boolean>
  >;
  readonly dismissVoiceExamples: jest.MockedFunction<
    (userId: string) => Promise<void>
  >;
}>("@/services/voice-examples-preference-service");
const mockLoggerError = jest.requireMock<{
  readonly logger: {
    readonly error: jest.MockedFunction<
      (message: string, error?: unknown) => void
    >;
  };
}>("@/utils/logger").logger.error;

import { useVoiceExamplesPreference } from "@/hooks/useVoiceExamplesPreference";

interface HookProps {
  readonly userId: string | null;
}

interface HookResult {
  readonly isReady: boolean;
  readonly hasDismissed: boolean;
  readonly dismissExamples: () => Promise<void>;
}

interface RenderSnapshot {
  readonly isReady: boolean;
  readonly hasDismissed: boolean;
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value: T): void => resolvePromise?.(value),
    reject: (reason: unknown): void => rejectPromise?.(reason),
  };
}

function renderPreferenceHook(initialUserId: string | null): {
  readonly result: { readonly current: HookResult };
  readonly snapshots: RenderSnapshot[];
  readonly rerender: (userId: string | null) => void;
  readonly unmount: () => void;
} {
  const snapshots: RenderSnapshot[] = [];
  const {
    result,
    rerender: rawRerender,
    unmount,
  } = renderHook(
    ({ userId }: HookProps): HookResult => {
      const state = useVoiceExamplesPreference(userId);
      snapshots.push({
        isReady: state.isReady,
        hasDismissed: state.hasDismissed,
      });
      return state;
    },
    { initialProps: { userId: initialUserId } }
  );
  return {
    result,
    snapshots,
    rerender: (userId: string | null): void => {
      rawRerender({ userId });
    },
    unmount,
  };
}

describe("useVoiceExamplesPreference", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockReadVoiceExamplesDismissed.mockResolvedValue(false);
    mockDismissVoiceExamples.mockResolvedValue();
  });

  describe("auth unknown and pending read gating", () => {
    it("stays not-ready and hidden while the user id is unknown without querying the service", (): void => {
      const { result } = renderPreferenceHook(null);

      expect(result.current.isReady).toBe(false);
      expect(result.current.hasDismissed).toBe(false);
      expect(mockReadVoiceExamplesDismissed).not.toHaveBeenCalled();
      expect(mockDismissVoiceExamples).not.toHaveBeenCalled();
    });

    it("does not write a dismissal while the user id is unknown", async (): Promise<void> => {
      const { result } = renderPreferenceHook(null);

      await act(async (): Promise<void> => {
        await result.current.dismissExamples();
      });

      expect(mockDismissVoiceExamples).not.toHaveBeenCalled();
      expect(mockLoggerError).not.toHaveBeenCalled();
      expect(result.current.hasDismissed).toBe(false);
      expect(result.current.isReady).toBe(false);
    });

    it("keeps hasDismissed false and isReady false while the current-user read is pending", async (): Promise<void> => {
      const deferred = createDeferred<boolean>();
      mockReadVoiceExamplesDismissed.mockReturnValueOnce(deferred.promise);

      const { result } = renderPreferenceHook("user-a");

      expect(result.current.isReady).toBe(false);
      expect(result.current.hasDismissed).toBe(false);

      await act(async (): Promise<void> => {
        deferred.resolve(true);
        await deferred.promise;
      });

      expect(result.current.isReady).toBe(true);
      expect(result.current.hasDismissed).toBe(true);
      expect(mockReadVoiceExamplesDismissed).toHaveBeenCalledWith("user-a");
    });

    it("resolves to visible examples when the read fails", async (): Promise<void> => {
      mockReadVoiceExamplesDismissed.mockRejectedValueOnce(
        new Error("storage unavailable")
      );

      const { result } = renderPreferenceHook("user-a");

      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(false);
    });
  });

  describe("account switch without prior-account flash", () => {
    it("gates the first render of a newly visible actor before that actor's read resolves (A visible -> B dismissed)", async (): Promise<void> => {
      const deferredB = createDeferred<boolean>();
      mockReadVoiceExamplesDismissed.mockImplementation(
        (userId: string): Promise<boolean> =>
          userId === "user-b" ? deferredB.promise : Promise.resolve(false)
      );

      const { result, snapshots, rerender } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(false);

      const switchIndex = snapshots.length;
      rerender("user-b");

      expect(snapshots[switchIndex]).toEqual({
        isReady: false,
        hasDismissed: false,
      });
      expect(result.current.isReady).toBe(false);
      expect(result.current.hasDismissed).toBe(false);

      await act(async (): Promise<void> => {
        deferredB.resolve(true);
        await deferredB.promise;
      });

      expect(result.current.isReady).toBe(true);
      expect(result.current.hasDismissed).toBe(true);
    });

    it("never flashes a prior dismissed snapshot onto the next actor (A dismissed -> B visible)", async (): Promise<void> => {
      mockReadVoiceExamplesDismissed.mockImplementation(
        (userId: string): Promise<boolean> =>
          Promise.resolve(userId === "user-a")
      );

      const { result, snapshots, rerender } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(true);

      const switchIndex = snapshots.length;
      rerender("user-b");

      expect(snapshots[switchIndex]).toEqual({
        isReady: false,
        hasDismissed: false,
      });
      expect(
        snapshots
          .slice(switchIndex)
          .some((snapshot): boolean => snapshot.hasDismissed)
      ).toBe(false);

      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(false);
    });
  });

  describe("stale read and write generations", () => {
    it("ignores a stale read that settles after the actor changed", async (): Promise<void> => {
      const staleA = createDeferred<boolean>();
      const freshB = createDeferred<boolean>();
      mockReadVoiceExamplesDismissed.mockImplementation(
        (userId: string): Promise<boolean> =>
          userId === "user-a" ? staleA.promise : freshB.promise
      );

      const { result, rerender } = renderPreferenceHook("user-a");
      rerender("user-b");

      await act(async (): Promise<void> => {
        staleA.resolve(true);
        await staleA.promise;
      });
      expect(result.current.isReady).toBe(false);
      expect(result.current.hasDismissed).toBe(false);

      await act(async (): Promise<void> => {
        freshB.resolve(false);
        await freshB.promise;
      });
      expect(result.current.isReady).toBe(true);
      expect(result.current.hasDismissed).toBe(false);
    });

    it("ignores a stale read that settles after unmount", async (): Promise<void> => {
      const deferred = createDeferred<boolean>();
      mockReadVoiceExamplesDismissed.mockReturnValueOnce(deferred.promise);

      const { unmount } = renderPreferenceHook("user-a");
      unmount();

      await act(async (): Promise<void> => {
        deferred.resolve(true);
        await deferred.promise;
      });
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it("does not let a stale dismissed write state reappear after switching actors", async (): Promise<void> => {
      const writeA = createDeferred<void>();
      mockDismissVoiceExamples.mockReturnValueOnce(writeA.promise);
      mockReadVoiceExamplesDismissed.mockImplementation(
        (): Promise<boolean> => Promise.resolve(false)
      );

      const { result, rerender } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(false);

      act((): void => {
        void result.current.dismissExamples();
      });
      expect(result.current.hasDismissed).toBe(true);

      rerender("user-b");
      expect(result.current.isReady).toBe(false);
      expect(result.current.hasDismissed).toBe(false);

      await act(async (): Promise<void> => {
        writeA.resolve();
        await writeA.promise;
      });
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(false);
    });

    it("logs a stale write failure after unmount without an unhandled rejection", async (): Promise<void> => {
      const writeA = createDeferred<void>();
      mockDismissVoiceExamples.mockReturnValueOnce(writeA.promise);

      const { result, unmount } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });

      let inFlight: Promise<void> | undefined;
      act((): void => {
        inFlight = result.current.dismissExamples();
      });
      if (inFlight === undefined) {
        throw new Error("dismissExamples did not start inside act()");
      }
      unmount();

      await act(async (): Promise<void> => {
        writeA.reject(new Error("disk full"));
        await expect(inFlight).resolves.toBeUndefined();
      });
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });
  });

  describe("optimistic dismiss and write failure", () => {
    it("hides the examples immediately while the persistence write is still pending", async (): Promise<void> => {
      const write = createDeferred<void>();
      mockDismissVoiceExamples.mockReturnValueOnce(write.promise);

      const { result } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });
      expect(result.current.hasDismissed).toBe(false);

      let dismissInFlight: Promise<void> | undefined;
      act((): void => {
        dismissInFlight = result.current.dismissExamples();
      });

      expect(result.current.hasDismissed).toBe(true);
      expect(mockDismissVoiceExamples).toHaveBeenCalledWith("user-a");
      expect(mockLoggerError).not.toHaveBeenCalled();

      await act(async (): Promise<void> => {
        write.resolve();
        await dismissInFlight;
      });
      expect(result.current.hasDismissed).toBe(true);
      expect(result.current.isReady).toBe(true);
    });

    it("logs a rejected persistence write without freezing or producing an unhandled rejection", async (): Promise<void> => {
      mockDismissVoiceExamples.mockRejectedValueOnce(new Error("disk full"));

      const { result } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async (): Promise<void> => {
        await expect(result.current.dismissExamples()).resolves.toBeUndefined();
      });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError.mock.calls[0]?.[0]).toEqual(
        expect.stringContaining("dismiss")
      );
      expect(result.current.hasDismissed).toBe(true);
      expect(result.current.isReady).toBe(true);
    });

    it("keeps repeated dismissals idempotent from the consumer perspective", async (): Promise<void> => {
      const { result } = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async (): Promise<void> => {
        await result.current.dismissExamples();
      });
      await act(async (): Promise<void> => {
        await result.current.dismissExamples();
      });

      expect(mockDismissVoiceExamples).toHaveBeenCalled();
      for (const call of mockDismissVoiceExamples.mock.calls) {
        expect(call[0]).toBe("user-a");
      }
      expect(result.current.hasDismissed).toBe(true);
      expect(result.current.isReady).toBe(true);
    });
  });

  describe("durable remount for the same account", () => {
    it("reports the stored dismissal after a full remount for the same user", async (): Promise<void> => {
      mockReadVoiceExamplesDismissed.mockResolvedValue(true);

      const first = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(first.result.current.isReady).toBe(true);
      });
      expect(first.result.current.hasDismissed).toBe(true);
      first.unmount();

      const second = renderPreferenceHook("user-a");
      await waitFor((): void => {
        expect(second.result.current.isReady).toBe(true);
      });
      expect(second.result.current.hasDismissed).toBe(true);
      expect(mockReadVoiceExamplesDismissed).toHaveBeenLastCalledWith("user-a");
    });
  });
});
