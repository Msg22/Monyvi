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
  readonly observerRef: { current: MockObserver<TRecord> | null };
  readonly unsubscribe: jest.Mock;
}

function createQuery<TRecord>(): MockQuery<TRecord> {
  const observerRef: { current: MockObserver<TRecord> | null } = {
    current: null,
  };
  const unsubscribe = jest.fn();

  return {
    observerRef,
    unsubscribe,
    observe: jest.fn(() => ({
      subscribe: jest.fn((observer: MockObserver<TRecord>) => {
        observerRef.current = observer;
        return { unsubscribe };
      }),
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
  overallBudgets: [],
  needsAttentionBudgets: [],
  categoryBudgets: [],
  pausedBudgets: [],
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
  useCategoryLookup: (): ReadonlyMap<string, { readonly displayName: string }> =>
    mockCategoryMap,
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
  } => ({ i18n: { resolvedLanguage: mockActiveLocale } }),
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

describe("useBudgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "user-1";
    mockIsResolvingUser = false;
    mockCategoriesLoading = false;
    mockActiveLocale = "en";
    budgetQuery.observerRef.current = null;
    mockObserveBudgetList.mockReturnValue(budgetQuery);
    mockBuildBudgetMetrics.mockResolvedValue(budgetMetrics);
    mockBuildBudgetDashboardReadModel.mockReturnValue(dashboardReadModel);
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
    expect(mockBuildBudgetMetrics).toHaveBeenCalledWith(
      rawBudgets,
      mockCategoryMap
    );
    expect(mockBuildBudgetDashboardReadModel).toHaveBeenCalledWith({
      budgets: budgetMetrics,
      categoryMap: mockCategoryMap,
      filter: "ALL",
      // Jest asymmetric matchers are intentionally dynamic at this boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      now: expect.any(Date),
      activeLocale: "en",
    });
    expect(result.current.readModel).toBe(dashboardReadModel);
    expect(result.current.categoryBudgets).toBe(
      dashboardReadModel.categoryBudgets
    );
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

  it("applies period filter through the read-model service", async () => {
    const { result } = renderHook(() => useBudgets());

    act(() => {
      budgetQuery.observerRef.current?.next(rawBudgets);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setPeriodFilter("WEEKLY");
    });

    expect(mockBuildBudgetDashboardReadModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        budgets: budgetMetrics,
        filter: "WEEKLY",
        activeLocale: "en",
      })
    );
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

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockBuildBudgetMetrics).toHaveBeenCalledTimes(
        callsBeforeRefresh + 1
      );
    });
    expect(result.current).toHaveProperty("overallBudgets");
    expect(result.current).toHaveProperty("pausedBudgets");
  });

  it("logs observation failures and clears loading", async () => {
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

    expect(mockBuildBudgetMetrics).not.toHaveBeenCalled();
    expect(mockBuildBudgetDashboardReadModel).not.toHaveBeenCalled();
    expect(result.current.isInitialLoading).toBe(true);

    mockCategoriesLoading = false;
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.hasValidData).toBe(true);
    });
    expect(mockBuildBudgetMetrics).toHaveBeenCalledWith(
      rawBudgets,
      mockCategoryMap
    );
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
