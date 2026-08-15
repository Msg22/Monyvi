import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { useBudgetPeriodExpiry } from "@/hooks/useBudgetPeriodExpiry";

describe("useBudgetPeriodExpiry", () => {
  let appStateListener: ((status: AppStateStatus) => void) | undefined;
  const removeListener = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 14, 23, 59, 59, 998));
    appStateListener = undefined;
    removeListener.mockClear();
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: removeListener };
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("becomes expired immediately after the inclusive end-of-day boundary", () => {
    const { result } = renderHook(() =>
      useBudgetPeriodExpiry(new Date(2026, 7, 14))
    );

    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(2);
    });

    expect(result.current).toBe(true);
  });

  it("refreshes expiration when the app returns to the foreground", () => {
    const { result } = renderHook(() =>
      useBudgetPeriodExpiry(new Date(2026, 7, 14))
    );

    act(() => {
      jest.setSystemTime(new Date(2026, 7, 15, 8));
      appStateListener?.("active");
    });

    expect(result.current).toBe(true);
  });

  it("removes its app-state listener and timer on unmount", () => {
    const { unmount } = renderHook(() =>
      useBudgetPeriodExpiry(new Date(2026, 7, 14))
    );

    unmount();

    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
