import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { Budget } from "@monyvi/db";
import type { BudgetDetailReadModel } from "@/contracts/budget-detail-presentation";
import type {
  BudgetDetailObservation,
  BudgetDetailObservationOptions,
} from "@/services/budget-detail-observation-service";

const mockObserveBudgetDetailReadModels = jest.fn<
  Promise<BudgetDetailObservation>,
  [BudgetDetailObservationOptions]
>();
const mockLoggerError = jest.fn<
  void,
  [string, unknown, Readonly<Record<string, unknown>>?]
>();
let mockCurrentUser: { userId: string | null; isResolvingUser: boolean } = {
  userId: "user-1",
  isResolvingUser: false,
};
let focusCallback: (() => void | (() => void)) | null = null;

interface Observer<T> {
  readonly next: (value: T) => void;
  readonly error?: (error: unknown) => void;
}

function createObservation<T>(): {
  readonly observable: {
    readonly subscribe: jest.Mock<{ unsubscribe: jest.Mock }, [Observer<T>]>;
  };
  readonly emit: (value: T) => void;
  readonly fail: (error: unknown) => void;
  readonly unsubscribe: jest.Mock;
} {
  let observer: Observer<T> | null = null;
  const unsubscribe = jest.fn();
  const subscribe = jest.fn(
    (nextObserver: Observer<T>): { unsubscribe: jest.Mock } => {
      observer = nextObserver;
      return { unsubscribe };
    }
  );
  return {
    observable: { subscribe },
    emit: (value): void => observer?.next(value),
    fail: (error): void => observer?.error?.(error),
    unsubscribe,
  };
}

const budget = {
  id: "budget-1",
  userId: "user-1",
} as unknown as Budget;

const detailReadModel = {
  identity: {
    budgetId: "budget-1",
    name: "Budget",
    type: "GLOBAL",
    lifecycle: "ACTIVE",
    period: "MONTHLY",
    periodStart: new Date(2026, 4, 1),
    periodEnd: new Date(2026, 4, 31, 23, 59, 59, 999),
    icon: { kind: "GLOBAL" },
    availableLifecycleAction: "PAUSE",
  },
  currency: "EGP",
  metrics: {
    spent: 250,
    limit: 1000,
    remaining: 750,
    percentage: 25,
    dailyAverage: 25,
    status: "safe",
  },
  daysLeft: 10,
  daysElapsed: 5,
  paceState: "BELOW",
  weeklySpending: [],
  categoryBreakdown: null,
  recentTransactions: [],
  hasCompletedPauseExclusion: false,
} as const satisfies BudgetDetailReadModel;

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)): void => {
    const ReactModule = jest.requireActual<typeof import("react")>("react");
    focusCallback = callback;
    ReactModule.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("@/services/budget-detail-observation-service", () => ({
  observeBudgetDetailReadModels: (
    options: BudgetDetailObservationOptions
  ): Promise<BudgetDetailObservation> =>
    mockObserveBudgetDetailReadModels(options),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (
      message: string,
      error: unknown,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerError(message, error, context),
  },
}));

jest.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: (): typeof mockCurrentUser => mockCurrentUser,
  runUserScopedEffect: ({
    userId,
    isResolvingUser,
    onResolving,
    onSignedOut,
    onAuthenticated,
  }: {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
    readonly onResolving: () => void;
    readonly onSignedOut: () => void;
    readonly onAuthenticated: (userId: string) => void | (() => void);
  }): void | (() => void) => {
    if (isResolvingUser) return onResolving();
    if (!userId) return onSignedOut();
    return onAuthenticated(userId);
  },
}));

import { useBudgetDetail } from "@/hooks/useBudgetDetail";

describe("useBudgetDetail", () => {
  let appStateListener: ((state: string) => void) | null;
  let removeAppStateListener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 15, 12));
    mockCurrentUser = { userId: "user-1", isResolvingUser: false };
    focusCallback = null;
    appStateListener = null;
    removeAppStateListener = jest.fn();
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener): { remove: () => void } => {
        appStateListener = listener as (state: string) => void;
        return { remove: removeAppStateListener };
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("shows initial loading then exposes the observed immutable read model", async () => {
    const source = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    mockObserveBudgetDetailReadModels.mockResolvedValue(source.observable);
    const { result } = renderHook(() => useBudgetDetail("budget-1"));

    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() =>
      expect(source.observable.subscribe).toHaveBeenCalledTimes(1)
    );
    act(() => source.emit({ budget, readModel: detailReadModel }));

    expect(result.current.readModel).toBe(detailReadModel);
    expect(result.current.budget).toBe(budget);
    expect(result.current.hasValidData).toBe(true);
    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.errorKey).toBeNull();
    const observationOptions =
      mockObserveBudgetDetailReadModels.mock.calls[0]?.[0];
    expect(observationOptions?.budgetId).toBe("budget-1");
    expect(observationOptions?.userId).toBe("user-1");
    expect(typeof observationOptions?.getNow).toBe("function");
  });

  it("shows an initial stable error and Retry starts a new generation", async () => {
    const error = new Error("initial observation failed");
    const retrySource = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    mockObserveBudgetDetailReadModels
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(retrySource.observable);
    const { result } = renderHook(() => useBudgetDetail("budget-1"));

    await waitFor(() =>
      expect(result.current.errorKey).toBe("budget_detail_load_failed")
    );
    expect(result.current.readModel).toBeNull();
    expect(mockLoggerError).toHaveBeenCalledWith(
      "budgetDetail.observe.failed",
      error,
      { budgetId: "budget-1" }
    );

    act(() => result.current.retry());
    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(2)
    );
    act(() => retrySource.emit({ budget, readModel: detailReadModel }));
    expect(result.current.readModel).toBe(detailReadModel);
    expect(result.current.errorKey).toBeNull();
  });

  it("retains the last valid model and exposes a refresh error", async () => {
    const source = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    mockObserveBudgetDetailReadModels.mockResolvedValue(source.observable);
    const { result } = renderHook(() => useBudgetDetail("budget-1"));
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(1)
    );
    act(() => source.emit({ budget, readModel: detailReadModel }));

    const error = new Error("dependency observation failed");
    act(() => source.fail(error));

    expect(result.current.readModel).toBe(detailReadModel);
    expect(result.current.errorKey).toBe("budget_detail_refresh_failed");
    expect(result.current.isRefreshing).toBe(false);
  });

  it("ignores a stale async generation without subscribing to it", async () => {
    let resolveFirst: (value: BudgetDetailObservation) => void = () =>
      undefined;
    const firstPromise = new Promise<BudgetDetailObservation>((resolve) => {
      resolveFirst = resolve;
    });
    const staleSource = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    const currentSource = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    mockObserveBudgetDetailReadModels
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(currentSource.observable);
    const { result } = renderHook(() => useBudgetDetail("budget-1"));

    act(() => result.current.retry());
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(2)
    );
    resolveFirst(staleSource.observable);
    await act(async () => Promise.resolve());

    expect(staleSource.observable.subscribe).not.toHaveBeenCalled();
    act(() => currentSource.emit({ budget, readModel: detailReadModel }));
    expect(result.current.readModel).toBe(detailReadModel);
  });

  it("refreshes on later focus, foreground, and local-day rollover", async () => {
    const sources = Array.from({ length: 4 }, () =>
      createObservation<unknown>()
    );
    for (const source of sources) {
      mockObserveBudgetDetailReadModels.mockResolvedValueOnce(
        source.observable
      );
    }
    renderHook(() => useBudgetDetail("budget-1"));
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(1)
    );

    act(() => {
      void focusCallback?.();
    });
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(2)
    );
    act(() => appStateListener?.("active"));
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(3)
    );
    act(() => {
      jest.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
    });
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(4)
    );
  });

  it("clears prior-user data and subscriptions on sign-out", async () => {
    const source = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    mockObserveBudgetDetailReadModels.mockResolvedValue(source.observable);
    const { result, rerender } = renderHook(() => useBudgetDetail("budget-1"));
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(1)
    );
    act(() => source.emit({ budget, readModel: detailReadModel }));

    mockCurrentUser = { userId: null, isResolvingUser: false };
    rerender({});

    expect(source.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.readModel).toBeNull();
    expect(result.current.budget).toBeNull();
    expect(result.current.hasValidData).toBe(false);
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("clears prior-user data before observing a different authenticated user", async () => {
    const firstSource = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    const secondSource = createObservation<{
      budget: Budget;
      readModel: BudgetDetailReadModel;
    } | null>();
    mockObserveBudgetDetailReadModels
      .mockResolvedValueOnce(firstSource.observable)
      .mockResolvedValueOnce(secondSource.observable);
    const { result, rerender } = renderHook(() => useBudgetDetail("budget-1"));
    await waitFor(() =>
      expect(firstSource.observable.subscribe).toHaveBeenCalledTimes(1)
    );
    act(() => firstSource.emit({ budget, readModel: detailReadModel }));

    mockCurrentUser = { userId: "user-2", isResolvingUser: false };
    rerender({});

    expect(firstSource.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.readModel).toBeNull();
    expect(result.current.budget).toBeNull();
    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ userId: "user-2" })
      )
    );
  });

  it("cleans observation, app-state, and day timer on unmount", async () => {
    const source = createObservation<unknown>();
    mockObserveBudgetDetailReadModels.mockResolvedValue(source.observable);
    const { unmount } = renderHook(() => useBudgetDetail("budget-1"));
    await waitFor(() =>
      expect(mockObserveBudgetDetailReadModels).toHaveBeenCalledTimes(1)
    );

    unmount();

    expect(source.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("treats a missing route budget ID as not found without querying", async () => {
    const { result } = renderHook(() => useBudgetDetail(undefined));

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    expect(result.current.isNotFound).toBe(true);
    expect(result.current.readModel).toBeNull();
    expect(mockObserveBudgetDetailReadModels).not.toHaveBeenCalled();
  });
});
