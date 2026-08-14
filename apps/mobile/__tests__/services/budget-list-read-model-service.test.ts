/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-assignment */
import type { Budget, BudgetPeriod, Transaction } from "@monyvi/db";

const mockDatabaseGet = jest.fn((tableName: string): string => tableName);
const mockQueryOwned = jest.fn<
  MockQuery<unknown>,
  [string, string, QueryCondition]
>();
const mockGetSpendingForBudget = jest.fn<Promise<number>, [Budget]>();
const mockGetCurrentPeriodBounds = jest.fn();
const mockGetDaysElapsed = jest.fn();
const mockGetDaysLeft = jest.fn();
const mockIsPeriodExpired = jest.fn();
const mockComputeSpendingMetrics = jest.fn();

interface QueryCondition {
  readonly kind: "where" | "and";
  readonly column?: string;
  readonly value?: unknown;
  readonly conditions?: readonly QueryCondition[];
}

interface MockQuery<TRecord> {
  readonly records: readonly TRecord[];
  readonly observe: jest.Mock;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (tableName: string): string => mockDatabaseGet(tableName),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    and: (...conditions: readonly QueryCondition[]): QueryCondition => ({
      kind: "and",
      conditions,
    }),
    oneOf: (
      values: readonly unknown[]
    ): { readonly oneOf: readonly unknown[] } => ({
      oneOf: values,
    }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryOwned: (
    collection: string,
    userId: string,
    condition: QueryCondition
  ): MockQuery<unknown> => mockQueryOwned(collection, userId, condition),
}));

jest.mock("@/services/budget-service", () => ({
  getSpendingForBudget: (budget: Budget): Promise<number> =>
    mockGetSpendingForBudget(budget),
}));

jest.mock("@monyvi/logic", () => ({
  computeSpendingMetrics: (...args: readonly unknown[]): unknown =>
    mockComputeSpendingMetrics(...args),
  getCurrentPeriodBounds: (...args: readonly unknown[]): unknown =>
    mockGetCurrentPeriodBounds(...args),
  getDaysElapsed: (...args: readonly unknown[]): unknown =>
    mockGetDaysElapsed(...args),
  getDaysLeft: (...args: readonly unknown[]): unknown =>
    mockGetDaysLeft(...args),
  isPeriodExpired: (...args: readonly unknown[]): unknown =>
    mockIsPeriodExpired(...args),
  formatCurrency: ({
    amount,
    currency,
  }: {
    readonly amount: number;
    readonly currency: string;
  }): string => `${amount.toLocaleString("en-US")} ${currency}`,
}));

import {
  buildBudgetDashboardReadModel,
  buildBudgetMetrics,
  observeBudgetList,
  observeBudgetSpendingChanges,
  type BudgetDashboardFilters,
  type BudgetDashboardReadModel,
  type BudgetWithMetrics,
} from "@/services/budget-list-read-model-service";

function createBudget(
  id: string,
  overrides: Partial<{
    readonly period: BudgetPeriod;
    readonly status: "ACTIVE" | "PAUSED";
    readonly type: "GLOBAL" | "CATEGORY";
    readonly amount: number;
    readonly alertThreshold: number;
    readonly periodEnd: Date;
  }> = {}
): Budget {
  const type = overrides.type ?? "CATEGORY";

  return {
    id,
    period: overrides.period ?? "MONTHLY",
    status: overrides.status ?? "ACTIVE",
    type,
    amount: overrides.amount ?? 1000,
    alertThreshold: overrides.alertThreshold ?? 80,
    periodStart: new Date("2026-05-01T00:00:00.000Z"),
    periodEnd: overrides.periodEnd ?? new Date("2026-05-31T23:59:59.999Z"),
    isGlobal: type === "GLOBAL",
    isCategoryBudget: type === "CATEGORY",
  } as unknown as Budget;
}

function createQuery<TRecord>(records: readonly TRecord[]): MockQuery<TRecord> {
  return {
    records,
    observe: jest.fn(),
  };
}

function createBudgetMetric(budget: Budget): BudgetWithMetrics {
  const budgetMetric: BudgetWithMetrics = {
    budget,
    metrics: {
      spent: 250,
      limit: 1000,
      remaining: 750,
      percentage: 25,
      dailyAverage: 16.67,
      status: "safe",
    },
    daysLeft: 16,
    daysElapsed: 15,
  };

  return budgetMetric;
}

describe("budget-list-read-model-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentPeriodBounds.mockReturnValue({
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z"),
    });
    mockGetDaysElapsed.mockReturnValue(15);
    mockGetDaysLeft.mockReturnValue(16);
    mockIsPeriodExpired.mockReset();
    mockIsPeriodExpired.mockImplementation(
      (periodEnd: Date | null | undefined, referenceDate: Date): boolean => {
        if (!periodEnd) return false;
        const endOfDay = new Date(periodEnd);
        endOfDay.setHours(23, 59, 59, 999);
        return referenceDate.getTime() > endOfDay.getTime();
      }
    );
    mockComputeSpendingMetrics.mockReturnValue({
      spent: 250,
      limit: 1000,
      remaining: 750,
      percentage: 25,
      dailyAverage: 16.67,
      status: "safe",
    });
    mockGetSpendingForBudget.mockResolvedValue(250);
  });

  it("builds the scoped active and paused budget observation query", () => {
    const query = createQuery<Budget>([]);
    mockQueryOwned.mockReturnValue(query);

    const result = observeBudgetList("user-1");

    expect(result).toBe(query);
    expect(mockDatabaseGet).toHaveBeenCalledWith("budgets");
    expect(mockQueryOwned).toHaveBeenCalledWith(
      "budgets",
      "user-1",
      expect.any(Object)
    );
    const condition = mockQueryOwned.mock.calls[0]?.[2];
    expect(condition).toMatchObject({ kind: "and" });
    expect(condition?.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "where",
          column: "deleted",
          value: false,
        }),
        expect.objectContaining({
          kind: "where",
          column: "status",
          value: { oneOf: ["ACTIVE", "PAUSED"] },
        }),
      ])
    );
  });

  it("builds a scoped expense transaction observation for metric invalidation", () => {
    const query = createQuery<Transaction>([]);
    mockQueryOwned.mockReturnValue(query);

    const result = observeBudgetSpendingChanges("user-1");

    expect(result).toBe(query);
    expect(mockDatabaseGet).toHaveBeenCalledWith("transactions");
    expect(mockQueryOwned).toHaveBeenCalledWith(
      "transactions",
      "user-1",
      expect.objectContaining({ kind: "and" })
    );
    const condition = mockQueryOwned.mock.calls[0]?.[2];
    expect(condition?.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "where",
          column: "deleted",
          value: false,
        }),
        expect.objectContaining({
          kind: "where",
          column: "type",
          value: "EXPENSE",
        }),
      ])
    );
  });

  it("builds budget metrics with existing spending and budget logic helpers", async () => {
    const monthlyBudget = createBudget("budget-monthly", {
      amount: 1200,
      alertThreshold: 75,
    });
    const weeklyBudget = createBudget("budget-weekly", { period: "WEEKLY" });
    mockGetSpendingForBudget
      .mockResolvedValueOnce(300)
      .mockResolvedValueOnce(125);

    const result = await buildBudgetMetrics([monthlyBudget, weeklyBudget]);

    expect(result).toHaveLength(2);
    expect(mockGetCurrentPeriodBounds).toHaveBeenCalledWith(
      "MONTHLY",
      monthlyBudget.periodStart,
      monthlyBudget.periodEnd
    );
    expect(mockGetSpendingForBudget).toHaveBeenCalledWith(monthlyBudget);
    expect(mockComputeSpendingMetrics).toHaveBeenCalledWith(300, 1200, 15, 75);
    expect(result[0]).toEqual({
      budget: monthlyBudget,
      metrics: {
        spent: 250,
        limit: 1000,
        remaining: 750,
        percentage: 25,
        dailyAverage: 16.67,
        status: "safe",
      },
      daysLeft: 16,
      daysElapsed: 15,
    });
  });

  it("starts every eligible spending read before waiting for any result", async () => {
    const firstBudget = createBudget("first");
    const secondBudget = createBudget("second");
    const startedBudgetIds: string[] = [];
    let resolveFirst: (value: number) => void = () => undefined;
    let resolveSecond: (value: number) => void = () => undefined;

    mockGetSpendingForBudget.mockImplementation((budget) => {
      startedBudgetIds.push(budget.id);
      return new Promise<number>((resolve) => {
        if (budget.id === "first") {
          resolveFirst = resolve;
        } else {
          resolveSecond = resolve;
        }
      });
    });

    const resultPromise = buildBudgetMetrics([firstBudget, secondBudget]);

    expect(startedBudgetIds).toEqual(["first", "second"]);

    resolveSecond(125);
    resolveFirst(300);

    await expect(resultPromise).resolves.toHaveLength(2);
  });

  it("propagates a rejected eligible spending read", async () => {
    const error = new Error("spending read failed");
    mockGetSpendingForBudget.mockRejectedValueOnce(error);

    await expect(buildBudgetMetrics([createBudget("budget-1")])).rejects.toBe(
      error
    );
  });

  it("preserves historical spending when a category budget references a deleted category", async () => {
    const deletedCategoryBudget = {
      ...createBudget("deleted-category-budget"),
      categoryId: "deleted-category",
    } as Budget;

    mockGetSpendingForBudget.mockResolvedValueOnce(420);

    const result = await buildBudgetMetrics([deletedCategoryBudget]);

    expect(mockGetSpendingForBudget).toHaveBeenCalledWith(
      deletedCategoryBudget
    );
    expect(mockComputeSpendingMetrics).toHaveBeenCalledWith(420, 1000, 15, 80);
    expect(result).toHaveLength(1);
  });

  it("still propagates spending failures for accessible category budgets", async () => {
    const error = new Error("spending read failed");
    const accessibleCategoryBudget = {
      ...createBudget("accessible-category-budget"),
      categoryId: "food",
    } as Budget;
    mockGetSpendingForBudget.mockRejectedValueOnce(error);

    await expect(buildBudgetMetrics([accessibleCategoryBudget])).rejects.toBe(
      error
    );
  });

  it("retains expired active custom budgets while computing existing metrics", async () => {
    const expiredCustomBudget = createBudget("expired-custom", {
      period: "CUSTOM",
      status: "ACTIVE",
      periodEnd: new Date("2026-04-30T23:59:59.999Z"),
    });
    const result = await buildBudgetMetrics([expiredCustomBudget]);

    expect(result).toHaveLength(1);
    expect(result[0]?.budget).toBe(expiredCustomBudget);
    expect(mockGetSpendingForBudget).toHaveBeenCalledWith(expiredCustomBudget);
  });

  function buildReadModel(
    budgets: readonly BudgetWithMetrics[],
    filters: BudgetDashboardFilters = {
      scope: "ALL",
      period: "ALL",
      status: "ALL",
    },
    activeLocale: "en" | "ar" = "en"
  ): BudgetDashboardReadModel {
    return buildBudgetDashboardReadModel({
      budgets,
      categoryMap: new Map([
        [
          "food",
          {
            displayName: "Food & Drinks",
            icon: "restaurant-outline",
            iconLibrary: "Ionicons",
            color: "#10B981",
            isExpense: true,
          },
        ],
      ]),
      filters,
      now: new Date("2026-05-15T00:00:00.000Z"),
      activeLocale,
      fallbackName: "Unnamed budget",
      preferredCurrency: "EGP",
      presentationCopy: {
        periodLabels: {
          WEEKLY: "Weekly",
          MONTHLY: "Monthly",
          CUSTOM: "Custom",
        },
        scopeLabels: { GLOBAL: "Global", CATEGORY: "Category" },
        statusLabels: {
          HEALTHY: "Safe to spend",
          NEAR_LIMIT: "Near limit",
          OVER_BUDGET: "Over budget",
          PAUSED: "Paused",
          EXPIRED: "Expired",
        },
        deletedCategoryLabel: "Deleted category",
        resumeActionLabel: "Resume",
        renewActionLabel: "Renew",
        formatSpentOfLimit: (spent, limit) => `${spent} of ${limit}`,
        formatViewBudget: (name) => `View Budget: ${name}`,
      },
    });
  }

  function namedMetric(
    id: string,
    name: string,
    overrides: Parameters<typeof createBudget>[1] = {},
    metricStatus: "safe" | "warning" | "danger" = "safe"
  ): BudgetWithMetrics {
    const budget = {
      ...createBudget(id, overrides),
      name,
      categoryId: overrides.type === "GLOBAL" ? null : id,
      currency: "EGP",
    } as Budget;
    const base = createBudgetMetric(budget);
    return {
      ...base,
      metrics: {
        ...base.metrics,
        spent:
          metricStatus === "safe" ? 0 : metricStatus === "warning" ? 850 : 1200,
        percentage:
          metricStatus === "safe" ? 0 : metricStatus === "warning" ? 85 : 120,
        status: metricStatus,
      },
    };
  }

  it("returns immutable unified items with expiry-first state and progress visibility", () => {
    const expiredPaused = namedMetric(
      "expired",
      "Expired",
      {
        period: "CUSTOM",
        status: "PAUSED",
        periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      },
      "danger"
    );
    const paused = namedMetric(
      "paused",
      "Paused",
      { status: "PAUSED" },
      "danger"
    );
    const active = namedMetric("active", "Active", {}, "warning");

    const result = buildReadModel([active, paused, expiredPaused]);

    expect(
      result.items.map(({ id, lifecycle, showsProgress }) => ({
        id,
        lifecycle,
        showsProgress,
      }))
    ).toEqual([
      { id: "expired", lifecycle: "EXPIRED", showsProgress: false },
      { id: "active", lifecycle: "NEAR_LIMIT", showsProgress: true },
      { id: "paused", lifecycle: "PAUSED", showsProgress: false },
    ]);
    expect(result.filters).toEqual({
      scope: "ALL",
      period: "ALL",
      status: "ALL",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.items[0])).toBe(true);
    expect(result.items[0]?.presentation.accessibilityLabel).toContain(
      "Expired May 1"
    );
    expect(result.items[0]?.presentation.actionAccessibilityLabel).toBe(
      "Renew: Expired"
    );
  });

  it("shapes display-only DTOs and deleted-category history without exposing models", () => {
    const global = namedMetric("global", "  Overall  ", { type: "GLOBAL" });
    const deleted = namedMetric("deleted", "Historic Education");

    const result = buildReadModel([global, deleted]);

    expect(result.items.find((item) => item.id === "global")).toMatchObject({
      displayName: "Overall",
      scope: "GLOBAL",
      categoryLabel: { kind: "not-applicable" },
      availableAction: null,
    });
    expect(result.items.find((item) => item.id === "deleted")).toMatchObject({
      categoryLabel: { kind: "deleted", categoryId: "deleted" },
      presentation: {
        periodAndScopeLabel: "Monthly • Category",
        spentOfLimitLabel: "0 EGP of 1,000 EGP",
        percentageLabel: "0%",
        progressWidth: "0%",
        statusLabel: "Safe to spend",
        deletedCategoryLabel: "Deleted category",
        expiryLabel: null,
        actionLabel: null,
        actionAccessibilityLabel: null,
        accessibilityLabel:
          "Historic Education, Deleted category, Monthly, Category, 0 EGP of 1,000 EGP, 0%, Safe to spend",
      },
    });
    expect(result.items[0]).not.toHaveProperty("budget");
  });

  it("keeps the compact category scope while announcing the resolved category name", () => {
    const categoryBudget = {
      ...createBudget("food-budget"),
      name: "Dining plan",
      categoryId: "food",
      currency: "EGP",
    } as Budget;

    const result = buildReadModel([createBudgetMetric(categoryBudget)]);
    const presentation = result.items[0]?.presentation;

    expect(presentation?.periodAndScopeLabel).toBe("Monthly • Category");
    expect(presentation?.accessibilityLabel).toContain("Food & Drinks");
  });

  it("falls back from blank persisted names to category then generic name", () => {
    const categoryBudget = {
      ...createBudget("blank-category"),
      name: "   ",
      categoryId: "food",
    } as Budget;
    const globalBudget = {
      ...createBudget("blank-global", { type: "GLOBAL" }),
      name: "\t ",
    } as Budget;

    const result = buildReadModel([
      createBudgetMetric(categoryBudget),
      createBudgetMetric(globalBudget),
    ]);

    expect(
      result.items.find((item) => item.id === "blank-category")?.displayName
    ).toBe("Food & Drinks");
    expect(
      result.items.find((item) => item.id === "blank-global")?.displayName
    ).toBe("Unnamed budget");
  });

  it("orders every match exactly once by lifecycle priority, name, then ID", () => {
    const input = [
      namedMetric("healthy", "Zulu"),
      namedMetric("warning-b", "beta", {}, "warning"),
      namedMetric("warning-a", "Beta", {}, "warning"),
      namedMetric("danger", "Alpha", {}, "danger"),
      namedMetric("paused", "Paused", { status: "PAUSED" }),
      namedMetric("expired", "Expired", {
        period: "CUSTOM",
        periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ];

    const result = buildReadModel(input);

    expect(result.items.map((item) => item.id)).toEqual([
      "expired",
      "danger",
      "warning-a",
      "warning-b",
      "paused",
      "healthy",
    ]);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(
      input.length
    );
    expect(result.totalCount).toBe(input.length);
    expect(result.matchingCount).toBe(input.length);
  });

  it.each(["en", "ar"] as const)(
    "uses %s collation and stable ID tie-break without mutating input",
    (activeLocale) => {
      const input = [
        namedMetric("z-id", "Budget 10"),
        namedMetric("b-id", " budget 2 "),
        namedMetric("a-id", "BUDGET 2"),
      ];
      const snapshot = input.map((item) => ({
        id: item.budget.id,
        spent: item.metrics.spent,
      }));

      const result = buildReadModel(
        input,
        { scope: "ALL", period: "ALL", status: "ALL" },
        activeLocale
      );

      expect(result.items.map((item) => item.id)).toEqual([
        "a-id",
        "b-id",
        "z-id",
      ]);
      expect(
        input.map((item) => ({ id: item.budget.id, spent: item.metrics.spent }))
      ).toEqual(snapshot);
    }
  );

  it("applies all 48 scope, period, and status combinations with AND semantics", () => {
    const expiredEnd = new Date("2026-05-01T00:00:00.000Z");
    const input = [
      namedMetric("global-weekly-active", "A", {
        type: "GLOBAL",
        period: "WEEKLY",
      }),
      namedMetric("category-monthly-paused", "B", { status: "PAUSED" }),
      namedMetric("category-custom-expired", "C", {
        period: "CUSTOM",
        periodEnd: expiredEnd,
      }),
      namedMetric("category-monthly-active", "D"),
    ];
    const scopes = ["ALL", "CATEGORY", "GLOBAL"] as const;
    const periods = ["ALL", "WEEKLY", "MONTHLY", "CUSTOM"] as const;
    const statuses = ["ALL", "ACTIVE", "PAUSED", "EXPIRED"] as const;

    for (const scope of scopes) {
      for (const period of periods) {
        for (const status of statuses) {
          const result = buildReadModel(input, { scope, period, status });
          const expected = input.filter(({ budget }) => {
            const isExpired =
              budget.period === "CUSTOM" &&
              budget.periodEnd?.getTime() === expiredEnd.getTime();
            const lifecycleStatus = isExpired
              ? "EXPIRED"
              : budget.status === "PAUSED"
                ? "PAUSED"
                : "ACTIVE";
            return (
              (scope === "ALL" || budget.type === scope) &&
              (period === "ALL" || budget.period === period) &&
              (status === "ALL" || lifecycleStatus === status)
            );
          });

          expect(result.items.map((item) => item.id).sort()).toEqual(
            expected.map(({ budget }) => budget.id).sort()
          );
          expect(result.matchingCount).toBe(expected.length);
        }
      }
    }
  });
});
