import type { Budget, Category, Transaction } from "@monyvi/db";

const mockDatabaseGet = jest.fn((tableName: string): string => tableName);
const mockGetSpendingForBudget = jest.fn<Promise<number>, [Budget]>();
const mockGetCategoryAndSubcategoryIds = jest.fn<
  Promise<string[]>,
  [string | undefined]
>();
const mockAssertOwned = jest.fn<Budget, [Budget]>();
const mockFindAccessibleCategory = jest.fn<
  Promise<Category>,
  [string, string]
>();

interface QueryCondition {
  readonly kind: "where" | "and" | "sortBy" | "take";
  readonly column?: string;
  readonly value?: unknown;
  readonly conditions?: readonly QueryCondition[];
}

interface QueryOperator {
  readonly operator: "gte" | "lte" | "oneOf";
  readonly value: unknown;
}

interface MockUserDataScope {
  readonly assertOwned: (budget: Budget) => Budget;
  readonly findAccessibleCategory: (
    collection: string,
    categoryId: string
  ) => Promise<Category>;
  readonly queryAccessibleCategories: (
    collection: string,
    ...conditions: readonly QueryCondition[]
  ) => { fetch: () => Promise<Category[]> };
  readonly queryOwned: (
    collection: string,
    ...conditions: readonly QueryCondition[]
  ) => { fetch: () => Promise<Transaction[]> };
}

const mockGetCurrentUserDataScope = jest.fn<Promise<MockUserDataScope>, []>();

const mockQueryAccessibleCategories = jest.fn<
  { fetch: () => Promise<Category[]> },
  [collection: string, userId: string, ...conditions: QueryCondition[]]
>();
const mockQueryOwned = jest.fn<
  { fetch: () => Promise<Transaction[]> },
  [collection: string, userId: string, ...conditions: QueryCondition[]]
>();

interface MockBudgetOptions {
  readonly type?: "GLOBAL" | "CATEGORY";
  readonly categoryId?: string;
  readonly pauseIntervals?: ReadonlyArray<{
    readonly from: number;
    readonly to: number;
  }>;
  readonly pausedAt?: string;
}

interface MockTransactionOptions {
  readonly id: string;
  readonly amount: number;
  readonly date: string;
  readonly categoryId?: string;
  readonly type?: "EXPENSE" | "INCOME";
}

let mockTransactions: Array<Record<string, unknown>> = [];
let mockCategories: Array<Record<string, unknown>> = [];

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
    desc: "desc",
    gte: (value: unknown): QueryOperator => ({ operator: "gte", value }),
    lte: (value: unknown): QueryOperator => ({ operator: "lte", value }),
    oneOf: (value: unknown): QueryOperator => ({ operator: "oneOf", value }),
    sortBy: (column: string): QueryCondition => ({
      kind: "sortBy",
      column,
    }),
    take: (value: number): QueryCondition => ({
      kind: "take",
      value,
    }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/budget-service", () => ({
  getCategoryAndSubcategoryIds: (
    categoryId: string | undefined
  ): Promise<string[]> => mockGetCategoryAndSubcategoryIds(categoryId),
  getSpendingForBudget: (budget: Budget): Promise<number> =>
    mockGetSpendingForBudget(budget),
}));

jest.mock("@/services/user-data-access", () => ({
  USER_DATA_ACCESS_ERROR_CODES: {
    OWNERSHIP_FAILED: "OWNERSHIP_FAILED",
  },
  getCurrentUserDataScope: (): Promise<MockUserDataScope> =>
    mockGetCurrentUserDataScope(),
  queryAccessibleCategories: (
    collection: string,
    userId: string,
    ...conditions: readonly QueryCondition[]
  ): { fetch: () => Promise<Category[]> } =>
    mockQueryAccessibleCategories(collection, userId, ...conditions),
  queryOwned: (
    collection: string,
    userId: string,
    ...conditions: readonly QueryCondition[]
  ): { fetch: () => Promise<Transaction[]> } =>
    mockQueryOwned(collection, userId, ...conditions),
}));

import { getBudgetDetailReadModel } from "@/services/budget-detail-read-model-service";

function flattenConditions(
  conditions: readonly QueryCondition[]
): QueryCondition[] {
  return conditions.flatMap((condition) =>
    condition.kind === "and" && condition.conditions
      ? flattenConditions(condition.conditions)
      : [condition]
  );
}

function mockFilterRecords<TRecord extends Record<string, unknown>>(
  records: readonly TRecord[],
  conditions: readonly QueryCondition[],
  userId: string
): TRecord[] {
  let result = records.filter((record) => record.userId === userId);
  const flatConditions = flattenConditions(conditions);

  for (const condition of flatConditions) {
    if (condition.kind !== "where" || !condition.column) {
      continue;
    }

    const column = condition.column;
    result = result.filter((record) =>
      matchesCondition(record, column, condition.value)
    );
  }

  if (flatConditions.some((condition) => condition.kind === "sortBy")) {
    result = [...result].sort((a, b) => toTime(b.date) - toTime(a.date));
  }

  const take = flatConditions.find((condition) => condition.kind === "take");
  if (typeof take?.value === "number") {
    result = result.slice(0, take.value);
  }

  return result;
}

function matchesCondition(
  record: { readonly [key: string]: unknown },
  column: string,
  value: unknown
): boolean {
  const field = record[toModelField(column)];

  if (isQueryOperator(value)) {
    if (value.operator === "gte") {
      return toTime(field) >= Number(value.value);
    }
    if (value.operator === "lte") {
      return toTime(field) <= Number(value.value);
    }
    return Array.isArray(value.value) && value.value.includes(field);
  }

  return field === value;
}

function isQueryOperator(value: unknown): value is QueryOperator {
  return (
    typeof value === "object" &&
    value !== null &&
    "operator" in value &&
    "value" in value
  );
}

function toModelField(column: string): string {
  const fieldMap: Record<string, string> = {
    category_id: "categoryId",
    parent_id: "parentId",
  };

  return fieldMap[column] ?? column;
}

function toTime(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

function createBudget(options: MockBudgetOptions = {}): Budget {
  const type = options.type ?? "GLOBAL";
  const categoryId = options.categoryId ?? "category-parent";

  return {
    id: "budget-1",
    userId: "user-1",
    name: "Budget",
    type,
    categoryId,
    amount: 1000,
    alertThreshold: 80,
    currency: "EGP",
    period: "CUSTOM",
    periodStart: new Date("2026-05-01T00:00:00.000Z"),
    periodEnd: new Date("2026-05-31T23:59:59.999Z"),
    isCategoryBudget: type === "CATEGORY",
    isGlobal: type === "GLOBAL",
    pauseIntervals: JSON.stringify(options.pauseIntervals ?? []),
    pausedAt: options.pausedAt,
  } as unknown as Budget;
}

function createTransaction(
  options: MockTransactionOptions
): Record<string, unknown> {
  return {
    id: options.id,
    userId: "user-1",
    deleted: false,
    type: options.type ?? "EXPENSE",
    amount: options.amount,
    date: new Date(options.date),
    categoryId: options.categoryId ?? "category-parent",
  };
}

function createCategory(
  id: string,
  displayName: string,
  parentId: string | null
): Record<string, unknown> {
  return {
    id,
    userId: "user-1",
    deleted: false,
    displayName,
    parentId,
  };
}

describe("budget-detail-read-model-service", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
    jest.clearAllMocks();
    mockTransactions = [];
    mockCategories = [];
    mockAssertOwned.mockImplementation((budget): Budget => budget);
    mockFindAccessibleCategory.mockResolvedValue(
      createCategory("category-parent", "Parent", null) as unknown as Category
    );
    mockQueryAccessibleCategories.mockImplementation(
      (
        _collection: string,
        userId: string,
        ...conditions: readonly QueryCondition[]
      ): { fetch: () => Promise<Category[]> } => ({
        fetch: (): Promise<Category[]> =>
          Promise.resolve(
            mockFilterRecords(
              mockCategories,
              conditions,
              userId
            ) as unknown as Category[]
          ),
      })
    );
    mockQueryOwned.mockImplementation(
      (
        collection: string,
        userId: string,
        ...conditions: readonly QueryCondition[]
      ): { fetch: () => Promise<Transaction[]> } => ({
        fetch: (): Promise<Transaction[]> =>
          Promise.resolve(
            mockFilterRecords(
              collection === "transactions" ? mockTransactions : [],
              conditions,
              userId
            ) as unknown as Transaction[]
          ),
      })
    );
    mockGetCurrentUserDataScope.mockResolvedValue({
      assertOwned: (budget): Budget => mockAssertOwned(budget),
      findAccessibleCategory: (collection, categoryId): Promise<Category> =>
        mockFindAccessibleCategory(collection, categoryId),
      queryAccessibleCategories: (
        collection,
        ...conditions
      ): { fetch: () => Promise<Category[]> } =>
        mockQueryAccessibleCategories(collection, "user-1", ...conditions),
      queryOwned: (
        collection,
        ...conditions
      ): { fetch: () => Promise<Transaction[]> } =>
        mockQueryOwned(collection, "user-1", ...conditions),
    });
    mockGetSpendingForBudget.mockResolvedValue(0);
    mockGetCategoryAndSubcategoryIds.mockResolvedValue(["category-parent"]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds global budget detail from scoped current-period expenses", async () => {
    const budget = createBudget();
    mockTransactions = [
      createTransaction({
        id: "tx-1",
        amount: 400,
        date: "2026-05-05T10:00:00.000Z",
      }),
      createTransaction({
        id: "tx-2",
        amount: 250,
        date: "2026-05-12T10:00:00.000Z",
      }),
    ];
    mockGetSpendingForBudget.mockResolvedValue(650);

    const result = await getBudgetDetailReadModel(budget);

    expect(result.metrics.spent).toBe(650);
    expect(result.subcategoryBreakdown).toEqual([]);
    expect(result.recentTransactions.map((tx) => tx.id)).toEqual([
      "tx-2",
      "tx-1",
    ]);
    expect(
      result.weeklySpending.reduce((sum, item) => sum + item.amount, 0)
    ).toBe(650);
  });

  it("rejects a budget not owned by the authenticated user before reading data", async () => {
    const error = new Error("OWNERSHIP_FAILED");
    const foreignBudget = {
      ...createBudget(),
      userId: "user-2",
    } as unknown as Budget;
    mockAssertOwned.mockImplementation(() => {
      throw error;
    });

    await expect(getBudgetDetailReadModel(foreignBudget)).rejects.toBe(error);

    expect(mockQueryAccessibleCategories).not.toHaveBeenCalled();
    expect(mockQueryOwned).not.toHaveBeenCalled();
  });

  it("does not expose inaccessible category metadata in historical detail", async () => {
    const budget = createBudget({
      type: "CATEGORY",
      categoryId: "foreign-category",
    });
    mockCategories = [
      {
        ...createCategory("foreign-category", "Foreign", null),
        userId: "user-2",
      },
    ];
    mockTransactions = [
      createTransaction({
        id: "tx-foreign-category",
        amount: 100,
        date: "2026-05-05T10:00:00.000Z",
        categoryId: "foreign-category",
      }),
    ];
    mockFindAccessibleCategory.mockRejectedValueOnce(
      new Error("OWNERSHIP_FAILED")
    );

    const result = await getBudgetDetailReadModel(budget);

    expect(result.metrics.spent).toBe(100);
    expect(result.subcategoryBreakdown).toEqual([]);
    expect(mockFindAccessibleCategory).not.toHaveBeenCalled();
    expect(mockQueryAccessibleCategories).toHaveBeenCalledTimes(1);
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("builds historical detail when the budget category was deleted", async () => {
    const budget = createBudget({
      type: "CATEGORY",
      categoryId: "deleted-category",
    });
    mockFindAccessibleCategory.mockRejectedValueOnce(
      new Error("Record categories#deleted-category not found")
    );
    mockCategories = [
      {
        ...createCategory("deleted-category", "Deleted Category", null),
        deleted: true,
      },
    ];
    mockTransactions = [
      createTransaction({
        id: "tx-deleted-category",
        amount: 275,
        date: "2026-05-05T10:00:00.000Z",
        categoryId: "deleted-category",
      }),
    ];

    const result = await getBudgetDetailReadModel(budget);

    expect(result.metrics.spent).toBe(275);
    expect(result.subcategoryBreakdown).toEqual([]);
    expect(
      result.recentTransactions.map((transaction) => transaction.id)
    ).toEqual(["tx-deleted-category"]);
    expect(mockFindAccessibleCategory).not.toHaveBeenCalled();
    expect(mockQueryAccessibleCategories).toHaveBeenCalledTimes(1);
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("includes selected category descendants and sorts subcategory breakdown", async () => {
    const budget = createBudget({ type: "CATEGORY" });
    mockCategories = [
      createCategory("food", "Food", "category-parent"),
      createCategory("grocery", "Groceries", "food"),
      createCategory("transport", "Transport", "category-parent"),
    ];
    mockTransactions = [
      createTransaction({
        id: "tx-food",
        amount: 300,
        date: "2026-05-05T10:00:00.000Z",
        categoryId: "food",
      }),
      createTransaction({
        id: "tx-grocery",
        amount: 200,
        date: "2026-05-06T10:00:00.000Z",
        categoryId: "grocery",
      }),
      createTransaction({
        id: "tx-transport",
        amount: 100,
        date: "2026-05-07T10:00:00.000Z",
        categoryId: "transport",
      }),
    ];
    mockGetSpendingForBudget.mockResolvedValue(600);
    mockGetCategoryAndSubcategoryIds.mockImplementation(
      (categoryId): Promise<string[]> => {
        if (categoryId === "food") return Promise.resolve(["food", "grocery"]);
        if (categoryId === "transport") return Promise.resolve(["transport"]);
        return Promise.resolve([
          "category-parent",
          "food",
          "grocery",
          "transport",
        ]);
      }
    );

    const result = await getBudgetDetailReadModel(budget);

    expect(result.subcategoryBreakdown).toEqual([
      {
        categoryId: "food",
        categoryName: "Food",
        amount: 500,
        percentage: (500 / 600) * 100,
      },
      {
        categoryId: "transport",
        categoryName: "Transport",
        amount: 100,
        percentage: (100 / 600) * 100,
      },
    ]);
    expect(
      result.weeklySpending.reduce((sum, item) => sum + item.amount, 0)
    ).toBe(600);
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
    expect(mockQueryAccessibleCategories).toHaveBeenCalledTimes(1);
    expect(mockGetSpendingForBudget).not.toHaveBeenCalled();
    expect(mockGetCategoryAndSubcategoryIds).not.toHaveBeenCalled();
  });

  it("excludes pause-window transactions from buckets, breakdown, and recent items", async () => {
    const budget = createBudget({
      type: "CATEGORY",
      pauseIntervals: [
        {
          from: new Date("2026-05-10T00:00:00.000Z").getTime(),
          to: new Date("2026-05-12T23:59:59.999Z").getTime(),
        },
      ],
    });
    mockCategories = [createCategory("food", "Food", "category-parent")];
    mockTransactions = [
      createTransaction({
        id: "tx-active",
        amount: 100,
        date: "2026-05-09T10:00:00.000Z",
        categoryId: "food",
      }),
      createTransaction({
        id: "tx-paused",
        amount: 999,
        date: "2026-05-11T10:00:00.000Z",
        categoryId: "food",
      }),
    ];
    mockGetSpendingForBudget.mockResolvedValue(100);
    mockGetCategoryAndSubcategoryIds.mockResolvedValue([
      "category-parent",
      "food",
    ]);

    const result = await getBudgetDetailReadModel(budget);

    expect(result.metrics.spent).toBe(100);
    expect(result.recentTransactions.map((tx) => tx.id)).toEqual(["tx-active"]);
    expect(result.subcategoryBreakdown).toEqual([
      {
        categoryId: "food",
        categoryName: "Food",
        amount: 100,
        percentage: 100,
      },
    ]);
    expect(
      result.weeklySpending.reduce((sum, item) => sum + item.amount, 0)
    ).toBe(100);
  });

  it("returns zero spend without a subcategory breakdown", async () => {
    const budget = createBudget({ type: "CATEGORY" });
    mockCategories = [createCategory("food", "Food", "category-parent")];

    const result = await getBudgetDetailReadModel(budget);

    expect(result.metrics.spent).toBe(0);
    expect(result.subcategoryBreakdown).toEqual([]);
    expect(result.weeklySpending.every((item) => item.amount === 0)).toBe(true);
  });

  it("returns the newest six non-paused matching transactions", async () => {
    const budget = createBudget();
    mockTransactions = Array.from({ length: 8 }, (_, index) =>
      createTransaction({
        id: `tx-${index + 1}`,
        amount: 10,
        date: `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      })
    );
    mockGetSpendingForBudget.mockResolvedValue(80);

    const result = await getBudgetDetailReadModel(budget);

    expect(result.recentTransactions.map((tx) => tx.id)).toEqual([
      "tx-8",
      "tx-7",
      "tx-6",
      "tx-5",
      "tx-4",
      "tx-3",
    ]);
  });

  it("assigns long custom-period transactions without rescanning per week", async () => {
    const transactionDate = new Date("2024-01-15T10:00:00.000Z");
    let dateReadCount = 0;
    const transaction = {
      id: "tx-long-period",
      userId: "user-1",
      deleted: false,
      type: "EXPENSE",
      amount: 100,
      categoryId: "category-parent",
      get date(): Date {
        dateReadCount += 1;
        return transactionDate;
      },
    } as unknown as Transaction;
    const budget = {
      ...createBudget(),
      periodStart: new Date("2024-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-12-31T23:59:59.999Z"),
    } as unknown as Budget;
    mockQueryOwned.mockReturnValueOnce({
      fetch: (): Promise<Transaction[]> => Promise.resolve([transaction]),
    });

    const result = await getBudgetDetailReadModel(budget);

    expect(result.metrics.spent).toBe(100);
    expect(
      result.weeklySpending.reduce((sum, item) => sum + item.amount, 0)
    ).toBe(100);
    expect(dateReadCount).toBeLessThan(20);
  });
});
