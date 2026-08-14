/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-assignment */
import type { Budget, BudgetPeriod } from "@monyvi/db";

const mockDatabaseGet = jest.fn((tableName: string): string => tableName);
const mockQueryOwned = jest.fn<
  MockQuery<Budget>,
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
  ): MockQuery<Budget> => mockQueryOwned(collection, userId, condition),
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
}));

import {
  buildBudgetDashboardReadModel,
  buildBudgetMetrics,
  observeBudgetList,
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

  it("uses zero spending when a category budget references a deleted category", async () => {
    const deletedCategoryBudget = {
      ...createBudget("deleted-category-budget"),
      categoryId: "deleted-category",
    } as Budget;

    const result = await buildBudgetMetrics(
      [deletedCategoryBudget],
      new Map()
    );

    expect(mockGetSpendingForBudget).not.toHaveBeenCalled();
    expect(mockComputeSpendingMetrics).toHaveBeenCalledWith(0, 1000, 15, 80);
    expect(result).toHaveLength(1);
  });

  it("still propagates spending failures for accessible category budgets", async () => {
    const error = new Error("spending read failed");
    const accessibleCategoryBudget = {
      ...createBudget("accessible-category-budget"),
      categoryId: "food",
    } as Budget;
    mockGetSpendingForBudget.mockRejectedValueOnce(error);

    await expect(
      buildBudgetMetrics(
        [accessibleCategoryBudget],
        new Map([["food", { displayName: "Food" }]])
      )
    ).rejects.toBe(error);
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

  it("shapes immutable dashboard cards from scoped metrics and accessible categories", () => {
    const globalBudget = {
      ...createBudget("global", { type: "GLOBAL" }),
      name: "Overall",
      currency: "EGP",
    } as Budget;
    const categoryBudget = {
      ...createBudget("category"),
      name: "Food",
      categoryId: "food",
      currency: "EGP",
    } as Budget;
    const result = buildBudgetDashboardReadModel({
      budgets: [createBudgetMetric(globalBudget), createBudgetMetric(categoryBudget)],
      categoryMap: new Map([["food", { displayName: "Food & Drinks" }]]),
      filter: "ALL",
      now: new Date("2026-05-15T00:00:00.000Z"),
      activeLocale: "en",
    });

    expect(result.overallBudgets[0]).toMatchObject({
      id: "global",
      displayName: "Overall",
      period: "MONTHLY",
      currency: "EGP",
      categoryLabel: { kind: "not-applicable" },
      lifecycle: "HEALTHY",
      sectionId: "OVERALL",
      metrics: expect.objectContaining({
        spent: 250,
        limit: 1000,
        percentage: 25,
        remaining: 750,
      }),
      daysLeft: 16,
    });
    expect(result.categoryBudgets[0]).toMatchObject({
      id: "category",
      categoryLabel: {
        kind: "resolved",
        categoryId: "food",
        name: "Food & Drinks",
      },
      lifecycle: "HEALTHY",
      sectionId: "CATEGORY",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.overallBudgets)).toBe(true);
    expect(Object.isFrozen(result.overallBudgets[0])).toBe(true);
  });

  it.each(["en", "ar"] as const)(
    "emits display-ready dashboard DTOs for the %s locale without exposing models",
    (activeLocale) => {
      const globalBudget = {
        ...createBudget("global", { type: "GLOBAL" }),
        name: "  Overall  ",
        currency: "EGP",
      } as Budget;
      const originalMetric = createBudgetMetric(globalBudget);

      const result = buildBudgetDashboardReadModel({
        budgets: [originalMetric],
        categoryMap: new Map(),
        filter: "ALL",
        now: new Date("2026-05-15T00:00:00.000Z"),
        activeLocale,
      });

      expect(result.overallBudgets[0]).toEqual({
        id: "global",
        displayName: "Overall",
        period: "MONTHLY",
        currency: "EGP",
        scope: "GLOBAL",
        lifecycle: "HEALTHY",
        sectionId: "OVERALL",
        metrics: originalMetric.metrics,
        daysLeft: 16,
        daysElapsed: 15,
        expiresAt: null,
        categoryLabel: { kind: "not-applicable" },
        availableAction: null,
      });
      expect(result.overallBudgets[0]).not.toHaveProperty("budget");
      expect(originalMetric.budget).toBe(globalBudget);
      expect(originalMetric.metrics.spent).toBe(250);
    }
  );

  it("retains expired custom budgets and shapes deleted category history", () => {
    const expiredBudget = {
      ...createBudget("expired", {
        period: "CUSTOM",
        status: "PAUSED",
        periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      }),
      name: "Historic Education",
      categoryId: "deleted-category",
      currency: "EGP",
    } as Budget;

    const result = buildBudgetDashboardReadModel({
      budgets: [createBudgetMetric(expiredBudget)],
      categoryMap: new Map(),
      filter: "ALL",
      now: new Date("2026-05-15T00:00:00.000Z"),
      activeLocale: "en",
    });

    expect(result.needsAttentionBudgets[0]).toMatchObject({
      id: "expired",
      lifecycle: "EXPIRED",
      sectionId: "NEEDS_ATTENTION",
      expiresAt: expiredBudget.periodEnd,
      categoryLabel: {
        kind: "deleted",
        categoryId: "deleted-category",
      },
      availableAction: "RENEW",
    });
    expect(result.pausedBudgets).toEqual([]);
  });

  it("retains every global budget exactly once with expiry taking precedence", () => {
    const healthy = {
      ...createBudget("healthy", { type: "GLOBAL" }),
      name: "Healthy",
      currency: "EGP",
    } as Budget;
    const warning = {
      ...createBudget("warning", { type: "GLOBAL" }),
      name: "Warning",
      currency: "EGP",
    } as Budget;
    const paused = {
      ...createBudget("paused", { type: "GLOBAL", status: "PAUSED" }),
      name: "Paused",
      currency: "EGP",
    } as Budget;
    const expiredPaused = {
      ...createBudget("expired-paused", {
        type: "GLOBAL",
        period: "CUSTOM",
        status: "PAUSED",
        periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      }),
      name: "Expired",
      currency: "EGP",
    } as Budget;
    const warningMetric = {
      ...createBudgetMetric(warning),
      metrics: {
        ...createBudgetMetric(warning).metrics,
        percentage: 85,
        status: "warning" as const,
      },
    };

    const result = buildBudgetDashboardReadModel({
      budgets: [
        createBudgetMetric(healthy),
        warningMetric,
        createBudgetMetric(paused),
        createBudgetMetric(expiredPaused),
      ],
      categoryMap: new Map(),
      filter: "ALL",
      now: new Date("2026-05-15T00:00:00.000Z"),
      activeLocale: "en",
    });
    const allIds = [
      ...result.overallBudgets,
      ...result.needsAttentionBudgets,
      ...result.categoryBudgets,
      ...result.pausedBudgets,
    ].map((item) => item.id);

    expect(result.overallBudgets.map((item) => item.id)).toEqual(["healthy"]);
    expect(result.needsAttentionBudgets.map((item) => item.id)).toEqual([
      "expired-paused",
      "warning",
    ]);
    expect(result.pausedBudgets.map((item) => item.id)).toEqual(["paused"]);
    expect(allIds).toHaveLength(4);
    expect(new Set(allIds).size).toBe(4);
  });

  it.each(["en", "ar"] as const)(
    "sorts trimmed display names for %s and uses ID as the final tie-break",
    (activeLocale) => {
      const makeNamedMetric = (id: string, name: string): BudgetWithMetrics =>
        createBudgetMetric({
          ...createBudget(id),
          name,
          categoryId: id,
          currency: "EGP",
        } as Budget);
      const input = [
        makeNamedMetric("z-id", "Budget 10"),
        makeNamedMetric("b-id", " budget 2 "),
        makeNamedMetric("a-id", "BUDGET 2"),
      ];

      const result = buildBudgetDashboardReadModel({
        budgets: input,
        categoryMap: new Map(
          input.map((item) => [
            item.budget.id,
            { displayName: item.budget.name },
          ])
        ),
        filter: "ALL",
        now: new Date("2026-05-15T00:00:00.000Z"),
        activeLocale,
      });

      expect(result.categoryBudgets.map((item) => item.id)).toEqual([
        "a-id",
        "b-id",
        "z-id",
      ]);
    }
  );

  it("filters every lifecycle section before exclusive classification", () => {
    const weeklyHealthy = {
      ...createBudget("weekly-healthy", { period: "WEEKLY" }),
      name: "Weekly healthy",
      categoryId: "weekly-healthy",
      currency: "EGP",
    } as Budget;
    const monthlyPaused = {
      ...createBudget("monthly-paused", { status: "PAUSED" }),
      name: "Monthly paused",
      categoryId: "monthly-paused",
      currency: "EGP",
    } as Budget;

    const result = buildBudgetDashboardReadModel({
      budgets: [
        createBudgetMetric(weeklyHealthy),
        createBudgetMetric(monthlyPaused),
      ],
      categoryMap: new Map([
        ["weekly-healthy", { displayName: "Weekly healthy" }],
        ["monthly-paused", { displayName: "Monthly paused" }],
      ]),
      filter: "WEEKLY",
      now: new Date("2026-05-15T00:00:00.000Z"),
      activeLocale: "en",
    });

    expect(result.categoryBudgets.map((item) => item.id)).toEqual([
      "weekly-healthy",
    ]);
    expect(result.pausedBudgets).toEqual([]);
    expect(result.totalCount).toBe(2);
    expect(result.matchingCount).toBe(1);
  });
});
