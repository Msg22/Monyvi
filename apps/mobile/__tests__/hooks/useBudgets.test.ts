import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { Budget } from "@monyvi/db";

const mockLoggerError = jest.fn();
const mockObserveBudgetList = jest.fn();
const mockBuildBudgetMetrics = jest.fn();
const mockBuildBudgetDashboardReadModel = jest.fn();
const mockCategoryMap = new Map<string, { readonly displayName: string }>();

let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;
let mockCategoriesLoading = false;
let mockActiveLocale: "en" | "ar" = "en";

interface MockObserver<TRecord> {
  readonly next: (records: TRecord[]) => void;
  readonly error: (error: unknown) => void;
}

interface MockQuery<TRecord> {
  readonly observe: jest.Mock<{
    readonly subscribe: jest.Mock<
      { readonly unsubscribe: jest.Mock },
      [MockObserver<TRecord>]
    >;
  }>;
  readonly observeWithColumns: jest.Mock<
    {
      readonly subscribe: jest.Mock<
        { readonly unsubscribe: jest.Mock },
        [MockObserver<TRecord>]
      >;
    },
    [readonly string[]]
  >;
  readonly observerRef: { current: MockObserver<TRecord> | null };
  readonly unsubscribe: jest.Mock;
}

function createQuery<TRecord>(): MockQuery<TRecord> {
  const observerRef: { current: MockObserver<TRecord> | null } = {
    current: null,
  };
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((observer: MockObserver<TRecord>) => {
    observerRef.current = observer;
    return { unsubscribe };
  });

  return {
    observerRef,
    unsubscribe,
    observe: jest.fn(() => ({
      subscribe,
    })),
    observeWithColumns: jest.fn((_columns: readonly string[]) => ({
      subscribe,
    })),
  };
}

const budgetQuery = createQuery<Budget>();
const rawBudgets = [{ id: "budget-1" } as unknown as Budget];
const budgetMetrics = [
  {
    budget: rawBudgets[0],
    metrics: { spent: 100 },
    daysLeft: 10,
    daysElapsed: 5,
  },
];
const dashboardReadModel = {
  filters: { scope: "ALL", period: "ALL", status: "ACTIVE" },
  items: [],
  totalCount: 1,
  matchingCount: 1,
};

jest.mock("@/services/budget-list-read-model-service", () => ({
  buildBudgetDashboardReadModel: (...args: readonly unknown[]): unknown =>
    mockBuildBudgetDashboardReadModel(...args),
  buildBudgetMetrics: (...args: readonly unknown[]): unknown =>
    mockBuildBudgetMetrics(...args),
  observeBudgetList: (...args: readonly unknown[]): unknown =>
    mockObserveBudgetList(...args),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: (): {
    readonly categories: readonly unknown[];
    readonly isLoading: boolean;
  } => ({ categories: [], isLoading: mockCategoriesLoading }),
  useCategoryLookup: (): ReadonlyMap<
    string,
    { readonly displayName: string }
  > => mockCategoryMap,
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string) => string;
  } => ({
    i18n: { resolvedLanguage: mockActiveLocale },
    t: (key: string): string =>
      key === "unnamed_budget" ? "Unnamed budget" : key,
  }),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

jest.mock("../../hooks/useCurrentUser", () => ({
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
    if (isResolvingUser) {
      onResolving();
      return;
    }
    if (!userId) {
      onSignedOut();
      return;
    }
    return onAuthenticated(userId);
  },
  useCurrentUser: (): { userId: string | null; isResolvingUser: boolean } => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));

import { useBudgets } from "@/hooks/useBudgets";
import { clearBudgetDashboardFilterSession } from "@/hooks/budget-dashboard-filter-session";

describe("useBudgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "user-1";
    mockIsResolvingUser = false;
    mockCategoriesLoading = false;
    mockActiveLocale = "en";
    clearBudgetDashboardFilterSession();
    budgetQuery.observerRef.current = null;
    mockObserveBudgetList.mockReturnValue(budgetQuery);
    mockBuildBudgetMetrics.mockResolvedValue(budgetMetrics);
    mockBuildBudgetDashboardReadModel.mockReturnValue(dashboardReadModel);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("observes budgets and delegates metric/read-model shaping to the service", async () => {
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockObserveBudgetList).toHaveBeenCalledWith("user-1");
    expect(budgetQuery.observeWithColumns).toHaveBeenCalledWith([
      "name",
      "type",
      "category_id",
      "amount",
      "currency",
      "period",
      "period_start",
      "period_end",
      "alert_threshold",
      "status",
      "pause_intervals",
      "paused_at",
    ]);
    expect(mockBuildBudgetMetrics).toHaveBeenCalledWith(rawBudgets);
    expect(mockBuildBudgetDashboardReadModel).toHaveBeenCalledWith({
      budgets: budgetMetrics,
      categoryMap: mockCategoryMap,
      filters: { scope: "ALL", period: "ALL", status: "ACTIVE" },
      // Jest asymmetric matchers are intentionally dynamic at this boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      now: expect.any(Date),
      activeLocale: "en",
      fallbackName: "Unnamed budget",
    });
    expect(result.current.readModel).toBe(dashboardReadModel);
    expect(result.current.budgets).toBe(dashboardReadModel.items);
    expect(result.current.filters).toEqual({
      scope: "ALL",
      period: "ALL",
      status: "ACTIVE",
    });
    expect(result.current.totalCount).toBe(1);
  });

  it("keeps reads disabled while resolving or signed out", async () => {
    mockIsResolvingUser = true;

    const { result, rerender } = renderHook(() => useBudgets());

    expect(result.current.isLoading).toBe(true);
    expect(mockObserveBudgetList).not.toHaveBeenCalled();

    mockIsResolvingUser = false;
    mockUserId = null;
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockObserveBudgetList).not.toHaveBeenCalled();
  });

  it("applies three filters atomically and resets them to defaults", async () => {
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setScopeFilter("CATEGORY");
      result.current.setPeriodFilter("WEEKLY");
      result.current.setStatusFilter("PAUSED");
    });

    expect(mockBuildBudgetDashboardReadModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        budgets: budgetMetrics,
        filters: {
          scope: "CATEGORY",
          period: "WEEKLY",
          status: "PAUSED",
        },
        activeLocale: "en",
      })
    );

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filters).toEqual({
      scope: "ALL",
      period: "ALL",
      status: "ACTIVE",
    });
  });

  it("restores filters for same-user remount and resets on user change", async () => {
    const first = renderHook(() => useBudgets());
    act(() => {
      first.result.current.setScopeFilter("GLOBAL");
      first.result.current.setPeriodFilter("CUSTOM");
      first.result.current.setStatusFilter("EXPIRED");
    });
    expect(first.result.current.filters).toEqual({
      scope: "GLOBAL",
      period: "CUSTOM",
      status: "EXPIRED",
    });
    first.unmount();

    const sameUser = renderHook(() => useBudgets());
    expect(sameUser.result.current.filters).toEqual({
      scope: "GLOBAL",
      period: "CUSTOM",
      status: "EXPIRED",
    });

    mockUserId = "user-2";
    sameUser.rerender(undefined);
    await waitFor(() => {
      expect(sameUser.result.current.filters).toEqual({
        scope: "ALL",
        period: "ALL",
        status: "ACTIVE",
      });
    });
    expect(sameUser.result.current.readModel.matchingCount).toBe(0);
  });

  it("refreshes budget metrics without replacing the public return shape", async () => {
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const callsBeforeRefresh = mockBuildBudgetMetrics.mock.calls.length;
    const readModelCallsBeforeRefresh =
      mockBuildBudgetDashboardReadModel.mock.calls.length;
    let resolveRefresh: (value: typeof budgetMetrics) => void = () => undefined;
    const refreshPromise = new Promise<typeof budgetMetrics>((resolve) => {
      resolveRefresh = resolve;
    });
    mockBuildBudgetMetrics.mockReturnValueOnce(refreshPromise);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockBuildBudgetMetrics).toHaveBeenCalledTimes(
        callsBeforeRefresh + 1
      );
    });
    await act(async () => {
      resolveRefresh(budgetMetrics);
      await refreshPromise;
    });
    await waitFor(() => {
      expect(
        mockBuildBudgetDashboardReadModel.mock.calls.length
      ).toBeGreaterThan(readModelCallsBeforeRefresh);
      expect(result.current.isRefreshing).toBe(false);
    });
    expect(result.current).toHaveProperty("budgets");
    expect(result.current).toHaveProperty("filters");
  });

  it("re-subscribes after an observation failure when retry is requested", async () => {
    const error = new Error("observe failed");
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.error(error);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockLoggerError).toHaveBeenCalledWith(
      "budgets.observe.failed",
      error
    );

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(mockObserveBudgetList).toHaveBeenCalledTimes(2);
    });
    expect(budgetQuery.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockBuildBudgetMetrics).not.toHaveBeenCalled();

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });
    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });
  });

  it("reports an initial metric failure without claiming valid data", async () => {
    const error = new Error("metrics failed");
    mockBuildBudgetMetrics.mockRejectedValue(error);

    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      "budgets.readModel.failed",
      error
    );
    expect(result.current.hasValidData).toBe(false);
    expect(result.current.errorKey).toBe("dashboard_load_error");
    expect(result.current.readModel.matchingCount).toBe(0);
  });

  it("waits for accessible categories before shaping dashboard data", async () => {
    mockCategoriesLoading = true;
    const { result, rerender } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });

    await waitFor(() => {
      expect(mockBuildBudgetMetrics).toHaveBeenCalledWith(rawBudgets);
    });
    expect(mockBuildBudgetDashboardReadModel).not.toHaveBeenCalled();
    expect(result.current.isInitialLoading).toBe(true);

    mockCategoriesLoading = false;
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });
    expect(mockBuildBudgetMetrics).toHaveBeenCalledWith(rawBudgets);
  });

  it("retains the last valid dashboard after a recoverable refresh failure", async () => {
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });
    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });

    mockBuildBudgetMetrics.mockRejectedValueOnce(new Error("refresh failed"));
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.errorKey).toBe("dashboard_load_error");
    });
    expect(result.current.readModel).toBe(dashboardReadModel);
    expect(result.current.hasValidData).toBe(true);
    expect(result.current.isRefreshing).toBe(false);

    act(() => {
      result.current.setPeriodFilter("WEEKLY");
    });

    expect(result.current.errorKey).toBe("dashboard_load_error");
  });

  it("rebuilds lifecycle state when a visible custom budget crosses expiry", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 14, 23, 59, 59, 900));
    const expiringBudgets = [
      {
        id: "expiring",
        period: "CUSTOM",
        periodEnd: new Date(2026, 7, 14),
      } as unknown as Budget,
    ];
    const { result, unmount } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(expiringBudgets);
    });
    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });
    const autoPauseCheckKeyBeforeExpiry = result.current.autoPauseCheckKey;
    const callsBeforeExpiry =
      mockBuildBudgetDashboardReadModel.mock.calls.length;

    act(() => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(
        mockBuildBudgetDashboardReadModel.mock.calls.length
      ).toBeGreaterThan(callsBeforeExpiry);
    });
    expect(result.current.autoPauseCheckKey).not.toBe(
      autoPauseCheckKeyBeforeExpiry
    );
    unmount();
  });

  it("ignores a stale metric completion after newer observed data wins", async () => {
    let resolveFirst: (value: typeof budgetMetrics) => void = () => undefined;
    const firstPromise = new Promise<typeof budgetMetrics>((resolve) => {
      resolveFirst = resolve;
    });
    const newerBudgets = [{ id: "budget-2" } as unknown as Budget];
    const newerMetrics = [
      {
        ...budgetMetrics[0],
        budget: newerBudgets[0],
      },
    ];
    mockBuildBudgetMetrics
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(newerMetrics);
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });
    await waitFor(() => {
      expect(mockBuildBudgetMetrics).toHaveBeenCalledTimes(1);
    });

    act(() => {
      budgetQuery.observerRef.current?.next(newerBudgets);
    });

    await waitFor(() => {
      expect(mockBuildBudgetDashboardReadModel).toHaveBeenCalledWith(
        expect.objectContaining({ budgets: newerMetrics })
      );
    });
    act(() => {
      resolveFirst(budgetMetrics);
    });

    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });
    expect(mockBuildBudgetDashboardReadModel).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ budgets: budgetMetrics })
    );
  });

  it("clears scoped dashboard data after sign-out and unsubscribes on unmount", async () => {
    const { result, rerender, unmount } = renderHook(() => useBudgets());
    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });
    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });

    mockUserId = null;
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.hasValidData).toBe(false);
    });
    expect(result.current.readModel.matchingCount).toBe(0);
    expect(budgetQuery.unsubscribe).toHaveBeenCalledTimes(1);

    mockUserId = "user-1";
    rerender(undefined);
    unmount();
    expect(budgetQuery.unsubscribe).toHaveBeenCalledTimes(2);
  });
});
