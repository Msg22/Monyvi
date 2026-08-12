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
  buildBudgetListReadModel,
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
    mockIsPeriodExpired.mockReturnValue(false);
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

  it("skips expired active custom budgets before computing metrics", async () => {
    const expiredCustomBudget = createBudget("expired-custom", {
      period: "CUSTOM",
      status: "ACTIVE",
      periodEnd: new Date("2026-04-30T23:59:59.999Z"),
    });
    mockIsPeriodExpired.mockReturnValueOnce(true);

    const result = await buildBudgetMetrics([expiredCustomBudget]);

    expect(result).toEqual([]);
    expect(mockIsPeriodExpired).toHaveBeenCalledWith(
      expiredCustomBudget.periodEnd
    );
    expect(mockGetSpendingForBudget).not.toHaveBeenCalled();
  });

  it("selects filtered budget sections from computed metrics", () => {
    const global = createBudgetMetric(
      createBudget("global", { type: "GLOBAL" })
    );
    const category = createBudgetMetric(
      createBudget("category", { type: "CATEGORY" })
    );
    const paused = createBudgetMetric(
      createBudget("paused", {
        period: "WEEKLY",
        status: "PAUSED",
      })
    );

    const result = buildBudgetListReadModel(
      [global, category, paused],
      "MONTHLY"
    );

    expect(result.budgets).toEqual([global, category]);
    expect(result.globalBudget).toBe(global);
    expect(result.categoryBudgets).toEqual([category]);
    expect(result.pausedBudgets).toEqual([]);
    expect(result.totalCount).toBe(3);
  });

  it("keeps paused budgets in their own section for the all filter", () => {
    const paused = createBudgetMetric(
      createBudget("paused", {
        period: "WEEKLY",
        status: "PAUSED",
      })
    );

    const result = buildBudgetListReadModel([paused], "ALL");

    expect(result.budgets).toEqual([paused]);
    expect(result.globalBudget).toBeUndefined();
    expect(result.categoryBudgets).toEqual([]);
    expect(result.pausedBudgets).toEqual([paused]);
    expect(result.totalCount).toBe(1);
  });
});
