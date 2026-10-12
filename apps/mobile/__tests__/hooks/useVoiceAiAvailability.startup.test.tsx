import { act, renderHook } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import type { VoiceAvailabilitySnapshot } from "@monyvi/logic";

import { useVoiceAiAvailability } from "@/hooks/useVoiceAiAvailability";

type AvailabilityService =
  typeof import("@/services/voice-ai-availability-service").getVoiceAiAvailability;

const mockGetVoiceAiAvailability = jest.fn<
  ReturnType<AvailabilityService>,
  Parameters<AvailabilityService>
>();
const mockLoggerWarn = jest.fn();
let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;
let mockTimeZone: string | null = "Africa/Cairo";
let mockFocusEffect:
  | (() => void | (() => void))
  | null = null;
let mockAppStateListener: ((state: AppStateStatus) => void) | null = null;
const mockAppStateRemove = jest.fn();

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
  } => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));

jest.mock("@/utils/device-time-zone", () => ({
  getDeviceTimeZone: (): string | null => mockTimeZone,
}));

jest.mock("@/services/voice-ai-availability-service", () => ({
  getVoiceAiAvailability: (
    ...args: Parameters<AvailabilityService>
  ): ReturnType<AvailabilityService> => mockGetVoiceAiAvailability(...args),
  isVoiceAiAvailabilityError: (): boolean => false,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    warn: (...args: readonly unknown[]): void => {
      mockLoggerWarn(...args);
    },
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)): void => {
    mockFocusEffect = callback;
  },
}));

jest.mock("react-native/Libraries/AppState/AppState", () => {
  const appState = {
    currentState: "active",
    addEventListener: (
      _event: string,
      listener: (state: AppStateStatus) => void
    ): { readonly remove: () => void } => {
      mockAppStateListener = listener;
      return { remove: mockAppStateRemove };
    },
  };

  return {
    __esModule: true,
    default: appState,
    ...appState,
  };
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = (): void => {};
  let reject: (reason: unknown) => void = (): void => {};
  const promise = new Promise<T>((promiseResolve, promiseReject): void => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function snapshot(
  timeZone = mockTimeZone ?? "Africa/Cairo",
  remaining = 5
): VoiceAvailabilitySnapshot {
  return {
    serverNow: "2026-10-12T00:00:00.000Z",
    timeZone,
    dailyLimit: 5,
    remaining,
    resetAt: "2026-10-12T21:00:00.000Z",
    reason: null,
    availableAt: null,
    burstAvailableAt: null,
    policyVersion: "startup-test",
  };
}

function serviceSignal(index: number): AbortSignal | undefined {
  return mockGetVoiceAiAvailability.mock.calls[index]?.[1]?.signal;
}

async function flush(): Promise<void> {
  await act(async (): Promise<void> => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach((): void => {
  jest.clearAllMocks();
  mockGetVoiceAiAvailability.mockReset();
  mockUserId = "user-1";
  mockIsResolvingUser = false;
  mockTimeZone = "Africa/Cairo";
  mockFocusEffect = null;
  mockAppStateListener = null;
});

describe("useVoiceAiAvailability startup coalescing", () => {
  it("joins two same-context unresolved refreshes into one service call and one result", async (): Promise<void> => {
    const pending = createDeferred<VoiceAvailabilitySnapshot>();
    mockGetVoiceAiAvailability.mockReturnValue(pending.promise);
    const hook = renderHook(() => useVoiceAiAvailability(true));

    let first: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    let second: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      first = hook.result.current.refresh();
      second = hook.result.current.refresh();
    });

    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(1);

    const allowed = snapshot();
    pending.resolve(allowed);
    let firstResult: VoiceAvailabilitySnapshot | null | undefined;
    let secondResult: VoiceAvailabilitySnapshot | null | undefined;
    await act(async (): Promise<void> => {
      firstResult = await first;
      secondResult = await second;
    });

    expect(firstResult).toEqual(allowed);
    expect(secondResult).toEqual(allowed);
    expect(hook.result.current.availability).toEqual(allowed);
  });

  it("coalesces focused automatic refresh with a foreground refresh", async (): Promise<void> => {
    const pending = createDeferred<VoiceAvailabilitySnapshot>();
    mockGetVoiceAiAvailability.mockReturnValue(pending.promise);
    const hook = renderHook(() => useVoiceAiAvailability(true));

    let blur: void | (() => void);
    await act(async (): Promise<void> => {
      blur = mockFocusEffect?.();
      await Promise.resolve();
    });
    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      mockAppStateListener?.("active");
      await Promise.resolve();
    });
    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(1);

    pending.resolve(snapshot());
    await flush();
    act((): void => {
      if (typeof blur === "function") blur();
    });
    hook.unmount();
  });

  it("starts a new service call after a shared request settles successfully", async (): Promise<void> => {
    mockGetVoiceAiAvailability
      .mockResolvedValueOnce(snapshot("Africa/Cairo", 5))
      .mockResolvedValueOnce(snapshot("Africa/Cairo", 4));
    const hook = renderHook(() => useVoiceAiAvailability(true));

    await act(async (): Promise<void> => {
      await hook.result.current.refresh();
      await hook.result.current.refresh();
    });

    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(2);
    expect(hook.result.current.availability?.remaining).toBe(4);
  });

  it("clears a failed coalescing slot so the next valid refresh starts a new call", async (): Promise<void> => {
    mockGetVoiceAiAvailability
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(snapshot());
    const hook = renderHook(() => useVoiceAiAvailability(true));

    await act(async (): Promise<void> => {
      expect(await hook.result.current.refresh()).toBeNull();
      expect(await hook.result.current.refresh()).toEqual(snapshot());
    });

    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("explicit post-consent supersede aborts matching pre-consent work and ignores its late result", async (): Promise<void> => {
    const preConsent = createDeferred<VoiceAvailabilitySnapshot>();
    const postConsent = createDeferred<VoiceAvailabilitySnapshot>();
    mockGetVoiceAiAvailability
      .mockReturnValueOnce(preConsent.promise)
      .mockReturnValueOnce(postConsent.promise);
    const hook = renderHook(() => useVoiceAiAvailability(true));

    let initial: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      initial = hook.result.current.refresh();
    });
    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(1);
    expect(serviceSignal(0)?.aborted).toBe(false);

    let superseding: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      superseding = hook.result.current.refresh({ supersedePending: true });
    });
    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(2);
    expect(serviceSignal(0)?.aborted).toBe(true);
    expect(serviceSignal(1)?.aborted).toBe(false);

    const fresh = snapshot("Africa/Cairo", 3);
    let freshResult: VoiceAvailabilitySnapshot | null | undefined;
    await act(async (): Promise<void> => {
      postConsent.resolve(fresh);
      freshResult = await superseding;
    });
    expect(freshResult).toEqual(fresh);
    expect(hook.result.current.availability).toEqual(fresh);

    let oldResult: VoiceAvailabilitySnapshot | null | undefined;
    await act(async (): Promise<void> => {
      preConsent.resolve(snapshot("Africa/Cairo", 5));
      oldResult = await initial;
    });
    expect(oldResult).toBeNull();
    expect(hook.result.current.availability).toEqual(fresh);
    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(2);
  });

  it("does not join across a timezone freshness boundary and aborts the older request", async (): Promise<void> => {
    const cairo = createDeferred<VoiceAvailabilitySnapshot>();
    const utc = createDeferred<VoiceAvailabilitySnapshot>();
    mockGetVoiceAiAvailability
      .mockReturnValueOnce(cairo.promise)
      .mockReturnValueOnce(utc.promise);
    const hook = renderHook(() => useVoiceAiAvailability(true));

    let first: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      first = hook.result.current.refresh();
    });
    expect(serviceSignal(0)?.aborted).toBe(false);

    mockTimeZone = "UTC";
    let second: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      second = hook.result.current.refresh();
    });

    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(2);
    expect(serviceSignal(0)?.aborted).toBe(true);

    cairo.resolve(snapshot("Africa/Cairo"));
    utc.resolve(snapshot("UTC"));
    let firstResult: VoiceAvailabilitySnapshot | null | undefined;
    let secondResult: VoiceAvailabilitySnapshot | null | undefined;
    await act(async (): Promise<void> => {
      firstResult = await first;
      secondResult = await second;
    });

    expect(firstResult).toBeNull();
    expect(secondResult?.timeZone).toBe("UTC");
    expect(hook.result.current.availability?.timeZone).toBe("UTC");
  });

  it("invalidates a pending request on actor change and isolates the next actor", async (): Promise<void> => {
    const oldActor = createDeferred<VoiceAvailabilitySnapshot>();
    const newActor = createDeferred<VoiceAvailabilitySnapshot>();
    mockGetVoiceAiAvailability
      .mockReturnValueOnce(oldActor.promise)
      .mockReturnValueOnce(newActor.promise);
    const hook = renderHook(() => useVoiceAiAvailability(true));

    let first: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      first = hook.result.current.refresh();
    });

    mockUserId = "user-2";
    hook.rerender(undefined);
    await flush();
    expect(serviceSignal(0)?.aborted).toBe(true);

    let second: Promise<VoiceAvailabilitySnapshot | null> | undefined;
    act((): void => {
      second = hook.result.current.refresh();
    });
    expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(2);

    oldActor.resolve(snapshot());
    newActor.resolve(snapshot("Africa/Cairo", 3));
    let firstResult: VoiceAvailabilitySnapshot | null | undefined;
    await act(async (): Promise<void> => {
      firstResult = await first;
      await second;
    });

    expect(firstResult).toBeNull();
    expect(hook.result.current.availability?.remaining).toBe(3);
  });

  it.each(["blur", "background", "unmount"] as const)(
    "aborts both joined startup callers on %s without publishing a late result",
    async (boundary): Promise<void> => {
      const pending = createDeferred<VoiceAvailabilitySnapshot>();
      mockGetVoiceAiAvailability.mockReturnValue(pending.promise);
      const hook = renderHook(() => useVoiceAiAvailability(true));

      let blur: void | (() => void);
      await act(async (): Promise<void> => {
        blur = mockFocusEffect?.();
        await Promise.resolve();
      });
      expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(1);

      let firstJoined: Promise<VoiceAvailabilitySnapshot | null> | undefined;
      let secondJoined: Promise<VoiceAvailabilitySnapshot | null> | undefined;
      act((): void => {
        firstJoined = hook.result.current.refresh();
        secondJoined = hook.result.current.refresh();
      });
      // The focused automatic request and both explicit callers share one
      // unresolved service operation, including its abort lifecycle.
      expect(mockGetVoiceAiAvailability).toHaveBeenCalledTimes(1);
      expect(serviceSignal(0)?.aborted).toBe(false);

      act((): void => {
        if (boundary === "blur" && typeof blur === "function") blur();
        if (boundary === "background") mockAppStateListener?.("background");
        if (boundary === "unmount") hook.unmount();
      });

      expect(serviceSignal(0)?.aborted).toBe(true);
      let firstResult: VoiceAvailabilitySnapshot | null | undefined;
      let secondResult: VoiceAvailabilitySnapshot | null | undefined;
      await act(async (): Promise<void> => {
        pending.resolve(snapshot("Africa/Cairo", 4));
        firstResult = await firstJoined;
        secondResult = await secondJoined;
      });
      expect(firstResult).toBeNull();
      expect(secondResult).toBeNull();
      if (boundary !== "unmount") {
        expect(hook.result.current.availability).toBeNull();
        hook.unmount();
      }
    }
  );

  it("lets authoritative reconciliation cancel pending network work and remain visible", async (): Promise<void> => {
    const pending = createDeferred<VoiceAvailabilitySnapshot>();
    mockGetVoiceAiAvailability.mockReturnValue(pending.promise);
    const hook = renderHook(() => useVoiceAiAvailability(true));

    act((): void => {
      void hook.result.current.refresh();
    });

    const reconciled = snapshot("Africa/Cairo", 2);
    act((): void => {
      hook.result.current.reconcileAuthoritativeSnapshot(reconciled);
    });
    expect(serviceSignal(0)?.aborted).toBe(true);
    expect(hook.result.current.availability).toEqual(reconciled);

    pending.resolve(snapshot("Africa/Cairo", 5));
    await flush();
    expect(hook.result.current.availability).toEqual(reconciled);
  });
});
