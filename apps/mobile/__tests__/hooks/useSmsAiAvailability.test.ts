import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { SmsAiAvailabilitySnapshot } from "@/services/sms-ai-availability-service";

const mockGetSmsAiAvailability = jest.fn<
  Promise<SmsAiAvailabilitySnapshot>,
  []
>();
const mockLoggerWarn = jest.fn();
let appStateListener: ((state: "active" | "background") => void) | null = null;
let focusEffect: (() => void) | null = null;

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void): void => {
    focusEffect = callback;
  },
}));

jest.mock("@/services/sms-ai-availability-service", () => ({
  getSmsAiAvailability: () => mockGetSmsAiAvailability(),
}));

jest.mock("@/services/authenticated-edge-function-service", () => ({
  isEdgeFunctionAuthenticationError: (error: unknown): boolean =>
    error instanceof Error &&
    error.name === "EdgeFunctionAuthenticationRequiredError",
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    warn: (...args: readonly unknown[]): void => {
      mockLoggerWarn(...args);
    },
  },
}));

import { useSmsAiAvailability } from "@/hooks/useSmsAiAvailability";

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T): void => resolvePromise?.(value),
  };
}

describe("useSmsAiAvailability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;
    focusEffect = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return {
          remove: (): void => {
            appStateListener = null;
          },
        };
      });
    mockGetSmsAiAvailability.mockResolvedValue({
      serverNow: "2026-07-20T12:00:00.000Z",
      reason: "history_cooldown",
      availableAt: "2026-07-21T12:00:00.000Z",
      historyCooldownAvailableAt: "2026-07-21T12:00:00.000Z",
    });
  });

  it("refreshes on focus and when the app resumes", async () => {
    const { result } = renderHook(() => useSmsAiAvailability(true));

    act(() => {
      focusEffect?.();
    });

    await waitFor(() => expect(result.current.availability).not.toBeNull());
    expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(1);

    act(() => {
      appStateListener?.("active");
    });
    expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(2);
  });

  it("does not call the consent-protected endpoint while AI processing is disabled", () => {
    const { result } = renderHook(() => useSmsAiAvailability(false));

    expect(result.current.availability).toBeNull();
    expect(mockGetSmsAiAvailability).not.toHaveBeenCalled();
  });

  it("lets the auth shell recover an invalid Edge session without a warning", async () => {
    const authError = new Error("Authenticated Edge Function session required");
    authError.name = "EdgeFunctionAuthenticationRequiredError";
    mockGetSmsAiAvailability.mockRejectedValueOnce(authError);
    renderHook(() => useSmsAiAvailability(true));

    act(() => {
      focusEffect?.();
    });

    await waitFor(() =>
      expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(1)
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("ignores an older refresh that resolves after a newer response", async () => {
    const older = createDeferred<SmsAiAvailabilitySnapshot>();
    const newer = createDeferred<SmsAiAvailabilitySnapshot>();
    mockGetSmsAiAvailability
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useSmsAiAvailability(true));

    act(() => {
      focusEffect?.();
      appStateListener?.("active");
    });

    await act(async () => {
      newer.resolve({
        serverNow: "2026-07-20T13:00:00.000Z",
        reason: null,
        availableAt: null,
        historyCooldownAvailableAt: null,
      });
      await newer.promise;
    });
    await act(async () => {
      older.resolve({
        serverNow: "2026-07-20T12:00:00.000Z",
        reason: "history_cooldown",
        availableAt: "2026-07-21T12:00:00.000Z",
        historyCooldownAvailableAt: "2026-07-21T12:00:00.000Z",
      });
      await older.promise;
    });

    expect(result.current.availability).toMatchObject({
      serverNow: "2026-07-20T13:00:00.000Z",
      historyCooldownAvailableAt: null,
    });
  });

  it("refreshes and clears the history blocker when its server-relative cooldown expires", async () => {
    jest.useFakeTimers();
    mockGetSmsAiAvailability
      .mockResolvedValueOnce({
        serverNow: "2026-07-20T12:00:00.000Z",
        reason: "history_cooldown",
        availableAt: "2026-07-20T12:00:01.000Z",
        historyCooldownAvailableAt: "2026-07-20T12:00:01.000Z",
      })
      .mockResolvedValueOnce({
        serverNow: "2026-07-20T12:00:01.001Z",
        reason: null,
        availableAt: null,
        historyCooldownAvailableAt: null,
      });
    const { result } = renderHook(() => useSmsAiAvailability(true));

    act(() => {
      focusEffect?.();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1001);
    });

    expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(2);
    expect(result.current.availability?.historyCooldownAvailableAt).toBeNull();
    jest.useRealTimers();
  });
});
