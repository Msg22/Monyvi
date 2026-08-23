const mockWrite = jest.fn();
const mockGet = jest.fn();
const mockCreateBudget = jest.fn();
const mockWhere = jest.fn();
const mockAnd = jest.fn();
const mockFindAccessibleCategory = jest.fn();
const mockQueryOwned = jest.fn();
const mockQueryAccessibleCategories = jest.fn();
const mockAssertOwned = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid"),
  digestStringAsync: jest.fn(() => Promise.resolve("test-digest")),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

interface MockQueryResult<TRecord> {
  readonly fetch: () => Promise<TRecord[]>;
  readonly fetchCount: () => Promise<number>;
}

interface MockUserDataScope {
  readonly userId: string;
  readonly findAccessibleCategory: typeof mockFindAccessibleCategory;
  readonly queryOwned: typeof mockQueryOwned;
  readonly queryAccessibleCategories: typeof mockQueryAccessibleCategories;
  readonly assertOwned: typeof mockAssertOwned;
}

interface MockBudgetRecord {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  name?: string;
  categoryId: string | null;
  deleted?: boolean;
  readonly period: string;
  status: string;
  pausedAt?: string;
  pauseIntervals?: string;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly update: jest.Mock<
    Promise<void>,
    [(record: MockBudgetRecord) => void]
  >;
}

function createQueryResult<TRecord>(
  records: readonly TRecord[],
  count = 0
): MockQueryResult<TRecord> {
  return {
    fetch: (): Promise<TRecord[]> => Promise.resolve([...records]),
    fetchCount: (): Promise<number> => Promise.resolve(count),
  };
}

function createExistingCategoryBudget(): MockBudgetRecord {
  const existingBudget: MockBudgetRecord = {
    id: "budget-1",
    userId: "user-1",
    type: "CATEGORY",
    categoryId: "category-old",
    period: "MONTHLY",
    status: "ACTIVE",
    update: jest.fn(
      (builder: (record: MockBudgetRecord) => void): Promise<void> => {
        builder(existingBudget);
        return Promise.resolve();
      }
    ),
  };

  return existingBudget;
}

function createLifecycleBudget(
  overrides: Partial<MockBudgetRecord> = {}
): MockBudgetRecord {
  const budget: MockBudgetRecord = {
    id: "budget-lifecycle",
    userId: "user-1",
    type: "GLOBAL",
    categoryId: null,
    deleted: false,
    period: "CUSTOM",
    status: "ACTIVE",
    periodStart: new Date("2019-12-01T00:00:00.000Z"),
    periodEnd: new Date("2020-01-01T00:00:00.000Z"),
    update: jest.fn(
      (builder: (record: MockBudgetRecord) => void): Promise<void> => {
        builder(budget);
        return Promise.resolve();
      }
    ),
    ...overrides,
  };

  return budget;
}

jest.mock("@monyvi/db", (): unknown => ({
  database: {
    write: (...args: unknown[]): Promise<unknown> =>
      mockWrite(...args) as Promise<unknown>,
    get: (tableName: string): unknown => mockGet(tableName),
  },
  Q: {
    where: (...args: unknown[]): unknown => mockWhere(...args),
    and: (...args: unknown[]): unknown => mockAnd(...args),
    notEq: (value: unknown): unknown => ({ operator: "notEq", value }),
    oneOf: (values: readonly unknown[]): unknown => ({ operator: "oneOf", values }),
  },
}));

jest.mock("@nozbe/watermelondb", (): unknown => {
  const actual = jest.requireActual("@nozbe/watermelondb");
  return {
    ...actual,
    Q: {
      ...actual.Q,
      where: (...args: unknown[]): unknown => mockWhere(...args),
      and: (...args: unknown[]): unknown => mockAnd(...args),
      notEq: (value: unknown): unknown => ({ operator: "notEq", value }),
    },
  };
});

jest.mock("@/services/user-data-access", (): unknown => ({
  getCurrentUserDataScope: (): Promise<unknown> => {
    const scope = mockGetCurrentUserDataScope() as Promise<unknown>;
    return scope;
  },
}));

import {
  createBudget,
  deleteBudget,
  getCategoryAndSubcategoryIds,
  getRenewableBudgetById,
  getSpendingForBudget,
  pauseExpiredCustomBudgets,
  resumeBudget,
  updateBudget,
  validateBudgetUniqueness,
} from "@/services/budget-service";

describe("budget-service", () => {
  beforeEach((): void => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockWrite.mockImplementation(
      async (callback: () => Promise<unknown>): Promise<unknown> => callback()
    );
    mockCreateBudget.mockImplementation(
      (
        builder: (record: Record<string, unknown>) => void
      ): Promise<Record<string, unknown>> => {
        const budget: Record<string, unknown> = {};
        builder(budget);
        return Promise.resolve(budget);
      }
    );
    mockGet.mockImplementation((tableName: string): unknown => {
      if (tableName === "budgets") {
        return { create: mockCreateBudget };
      }
      return {};
    });
    mockWhere.mockImplementation((column: string, value: unknown): unknown => ({
      column,
      value,
    }));
    mockAnd.mockImplementation(
      (...conditions: readonly unknown[]): unknown => ({
        conditions,
      })
    );
    mockFindAccessibleCategory.mockResolvedValue({ id: "category-resolved" });
    mockQueryOwned.mockReturnValue(createQueryResult<MockBudgetRecord>([]));
    mockQueryAccessibleCategories.mockReturnValue(createQueryResult([]));
    const scope: MockUserDataScope = {
      userId: "user-1",
      findAccessibleCategory: mockFindAccessibleCategory,
      queryOwned: mockQueryOwned,
      queryAccessibleCategories: mockQueryAccessibleCategories,
      assertOwned: mockAssertOwned,
    };
    mockGetCurrentUserDataScope.mockResolvedValue(scope);
  });

  afterEach((): void => {
    jest.useRealTimers();
  });

  it("resolves a category budget category through the current user scope before create", async (): Promise<void> => {
    const budget = await createBudget({
      name: "Food",
      type: "CATEGORY",
      categoryId: "category-input",
      amount: 1000,
      currency: "EGP",
      period: "MONTHLY",
      alertThreshold: 80,
    });

    expect(mockFindAccessibleCategory).toHaveBeenCalledWith(
      expect.anything(),
      "category-input"
    );
    expect(mockFindAccessibleCategory.mock.invocationCallOrder[0]).toBeLessThan(
      mockQueryOwned.mock.invocationCallOrder[0]
    );
    expect(budget).toMatchObject({
      userId: "user-1",
      type: "CATEGORY",
      categoryId: "category-resolved",
    });
  });

  it("does not create a category budget when category resolution fails", async (): Promise<void> => {
    mockFindAccessibleCategory.mockRejectedValueOnce(
      new Error("category inaccessible")
    );

    await expect(
      createBudget({
        name: "Food",
        type: "CATEGORY",
        categoryId: "category-input",
        amount: 1000,
        currency: "EGP",
        period: "MONTHLY",
        alertThreshold: 80,
      })
    ).rejects.toThrow("category inaccessible");

    expect(mockFindAccessibleCategory).toHaveBeenCalledWith(
      expect.anything(),
      "category-input"
    );
    expect(mockQueryOwned).not.toHaveBeenCalled();
    expect(mockCreateBudget).not.toHaveBeenCalled();
  });

  it("does not create a category budget when category resolution returns no category", async (): Promise<void> => {
    mockFindAccessibleCategory.mockResolvedValueOnce(null);

    await expect(
      createBudget({
        name: "Food",
        type: "CATEGORY",
        categoryId: "category-input",
        amount: 1000,
        currency: "EGP",
        period: "MONTHLY",
        alertThreshold: 80,
      })
    ).rejects.toThrow();

    expect(mockQueryOwned).not.toHaveBeenCalled();
    expect(mockCreateBudget).not.toHaveBeenCalled();
  });

  it("allows a custom budget when only expired historical matches exist", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const expired = createLifecycleBudget({
      id: "expired-history",
      status: "PAUSED",
      periodEnd: new Date("2026-08-13T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired], 1));

    await expect(
      validateBudgetUniqueness("GLOBAL", "CUSTOM", { currency: "EGP" })
    ).resolves.toBeUndefined();
  });

  it("allows a category custom budget when only expired historical matches exist", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const expired = createLifecycleBudget({
      id: "expired-category-history",
      type: "CATEGORY",
      categoryId: "category-resolved",
      status: "PAUSED",
      periodEnd: new Date("2026-08-13T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired], 1));

    await expect(
      validateBudgetUniqueness("CATEGORY", "CUSTOM", {
        categoryId: "category-resolved",
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a custom budget when a current matching budget exists", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const current = createLifecycleBudget({
      id: "current-custom",
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([current], 1));

    await expect(
      validateBudgetUniqueness("GLOBAL", "CUSTOM", { currency: "EGP" })
    ).rejects.toThrow("A Global custom budget already exists");
  });

  it("creates expired custom history without competing with a current custom budget", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const current = createLifecycleBudget({
      id: "current-custom",
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValue(createQueryResult([current], 1));

    await expect(
      createBudget({
        name: "Historical trip",
        type: "GLOBAL",
        amount: 1000,
        currency: "EGP",
        period: "CUSTOM",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-13T00:00:00.000Z"),
        alertThreshold: 80,
      })
    ).resolves.toMatchObject({
      name: "Historical trip",
      period: "CUSTOM",
    });

    expect(mockQueryOwned).not.toHaveBeenCalled();
  });

  it("rejects a category custom budget when a current matching budget exists", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const current = createLifecycleBudget({
      id: "current-category-custom",
      type: "CATEGORY",
      categoryId: "category-resolved",
      periodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([current], 1));

    await expect(
      validateBudgetUniqueness("CATEGORY", "CUSTOM", {
        categoryId: "category-resolved",
      })
    ).rejects.toThrow(
      "A budget for this category with custom period already exists"
    );
  });

  it("keeps non-custom uniqueness validation unchanged", async (): Promise<void> => {
    mockQueryOwned.mockReturnValueOnce(createQueryResult([], 1));

    await expect(
      validateBudgetUniqueness("GLOBAL", "MONTHLY", { currency: "EGP" })
    ).rejects.toThrow("A Global monthly budget already exists");
  });

  it("scopes global-budget uniqueness to the selected currency", async (): Promise<void> => {
    mockQueryOwned.mockReturnValueOnce(createQueryResult([], 0));

    await expect(
      validateBudgetUniqueness("GLOBAL", "MONTHLY", { currency: "USD" })
    ).resolves.toBeUndefined();

    expect(mockWhere).toHaveBeenCalledWith("currency", "USD");
  });

  it("allows editing an expired custom history when a current replacement exists", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const expiredHistory = createLifecycleBudget({
      id: "expired-history",
      status: "PAUSED",
      periodEnd: new Date("2026-08-13T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expiredHistory]));

    await updateBudget("expired-history", {
      name: "Renamed history",
      period: "CUSTOM",
      periodStart: new Date("2026-07-13T00:00:00.000Z"),
      periodEnd: new Date("2026-08-13T00:00:00.000Z"),
    });

    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
    expect(expiredHistory.update).toHaveBeenCalledTimes(1);
    expect(expiredHistory.name).toBe("Renamed history");
  });

  it("resolves a replacement category through the current user scope before update", async (): Promise<void> => {
    const existingBudget = createExistingCategoryBudget();
    mockQueryOwned
      .mockReturnValueOnce(createQueryResult([existingBudget]))
      .mockReturnValue(createQueryResult<MockBudgetRecord>([]));

    await updateBudget("budget-1", { categoryId: "category-new" });

    expect(mockFindAccessibleCategory).toHaveBeenCalledWith(
      expect.anything(),
      "category-new"
    );
    expect(existingBudget.update).toHaveBeenCalledTimes(1);
    expect(existingBudget.categoryId).toBe("category-resolved");
  });

  it("does not update a budget when replacement category resolution fails", async (): Promise<void> => {
    const existingBudget = createExistingCategoryBudget();
    mockQueryOwned.mockReturnValueOnce(createQueryResult([existingBudget]));
    mockFindAccessibleCategory.mockRejectedValueOnce(
      new Error("category inaccessible")
    );

    await expect(
      updateBudget("budget-1", { categoryId: "category-new" })
    ).rejects.toThrow("category inaccessible");

    expect(mockFindAccessibleCategory).toHaveBeenCalledWith(
      expect.anything(),
      "category-new"
    );
    expect(existingBudget.update).not.toHaveBeenCalled();
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("does not update a budget when replacement category resolution returns no category", async (): Promise<void> => {
    const existingBudget = createExistingCategoryBudget();
    mockQueryOwned.mockReturnValueOnce(createQueryResult([existingBudget]));
    mockFindAccessibleCategory.mockResolvedValueOnce(null);

    await expect(
      updateBudget("budget-1", { categoryId: "category-new" })
    ).rejects.toThrow();

    expect(existingBudget.update).not.toHaveBeenCalled();
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("loads an owned non-deleted expired custom budget as a renewal source", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const expired = createLifecycleBudget({
      id: "expired-custom",
      status: "PAUSED",
      periodEnd: new Date("2026-08-13T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired]));

    await expect(getRenewableBudgetById("expired-custom")).resolves.toBe(
      expired
    );
  });

  it.each([
    ["deleted", { deleted: true }],
    ["non-custom", { period: "MONTHLY", periodEnd: undefined }],
    ["not expired", { periodEnd: new Date("2026-08-15T00:00:00.000Z") }],
  ])(
    "rejects a %s budget as a renewal source",
    async (_caseName, overrides): Promise<void> => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
      const ineligible = createLifecycleBudget(overrides);
      mockQueryOwned.mockReturnValueOnce(createQueryResult([ineligible]));

      await expect(getRenewableBudgetById(ineligible.id)).rejects.toMatchObject(
        { code: "BUDGET_NOT_FOUND" }
      );
    }
  );

  it("counts owned historical transactions for a deleted budget category", async (): Promise<void> => {
    const budget = {
      ...createLifecycleBudget({
        type: "CATEGORY",
        categoryId: "deleted-category",
        period: "MONTHLY",
      }),
      isGlobal: false,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      pauseIntervals: "[]",
      pausedAt: undefined,
      currency: "EGP",
    };
    const historicalTransaction = {
      amount: 420,
      date: new Date("2026-08-05T00:00:00.000Z"),
      currency: "EGP",
    };
    mockQueryAccessibleCategories.mockReturnValueOnce(createQueryResult([]));
    mockQueryOwned.mockReturnValueOnce(
      createQueryResult([historicalTransaction as unknown as Transaction])
    );

    await expect(
      getSpendingForBudget(budget as unknown as Budget)
    ).resolves.toBe(420);

    expect(mockAssertOwned).toHaveBeenCalledWith(budget);
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("excludes transactions whose currency differs from the budget", async (): Promise<void> => {
    const budget = {
      ...createLifecycleBudget({ period: "MONTHLY" }),
      isGlobal: true,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      pauseIntervals: "[]",
      currency: "EGP",
    };
    mockQueryOwned.mockReturnValueOnce(
      createQueryResult([
        {
          amount: 420,
          currency: "EGP",
          date: new Date("2026-08-05T00:00:00.000Z"),
        },
        {
          amount: 20,
          currency: "USD",
          date: new Date("2026-08-06T00:00:00.000Z"),
        },
      ] as unknown as Transaction[])
    );

    await expect(
      getSpendingForBudget(budget as unknown as Budget)
    ).resolves.toBe(420);
  });

  it("discovers accessible descendants when the category root is deleted", async (): Promise<void> => {
    mockQueryAccessibleCategories
      .mockReturnValueOnce(createQueryResult([]))
      .mockReturnValueOnce(createQueryResult([{ id: "child" }]))
      .mockReturnValueOnce(createQueryResult([{ id: "grandchild" }]));

    await expect(getCategoryAndSubcategoryIds("deleted-root")).resolves.toEqual(
      ["deleted-root", "child", "grandchild"]
    );

    expect(mockFindAccessibleCategory).not.toHaveBeenCalled();
  });

  it("pauses only expired active custom budgets and returns the paused count", async (): Promise<void> => {
    const expired = createLifecycleBudget({ id: "expired" });
    const future = createLifecycleBudget({
      id: "future",
      periodEnd: new Date("2999-01-01T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired, future]));

    const pausedCount = await pauseExpiredCustomBudgets();

    expect(pausedCount).toBe(1);
    expect(expired.update).toHaveBeenCalledTimes(1);
    expect(expired.status).toBe("PAUSED");
    expect(expired.pausedAt).toEqual(expect.any(String));
    expect(future.update).not.toHaveBeenCalled();
  });

  it("re-checks pause eligibility inside the writer before pausing", async (): Promise<void> => {
    const expired = createLifecycleBudget({ id: "expired" });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired]));
    mockWrite.mockImplementationOnce(
      async (callback: () => Promise<unknown>): Promise<unknown> => {
        expired.status = "PAUSED";
        expired.pausedAt = "2024-01-01T00:00:00.000Z";
        return callback();
      }
    );

    const pausedCount = await pauseExpiredCustomBudgets();

    expect(pausedCount).toBe(0);
    expect(expired.update).not.toHaveBeenCalled();
    expect(expired.pausedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("skips a budget deleted before the writer runs", async (): Promise<void> => {
    const expired = createLifecycleBudget({ id: "expired" });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired]));
    mockWrite.mockImplementationOnce(
      async (callback: () => Promise<unknown>): Promise<unknown> => {
        expired.deleted = true;
        return callback();
      }
    );

    const pausedCount = await pauseExpiredCustomBudgets();

    expect(pausedCount).toBe(0);
    expect(expired.update).not.toHaveBeenCalled();
  });

  it("captures pausedAt inside the writer execution window", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-20T10:00:00.000Z"));
    const expired = createLifecycleBudget({ id: "expired" });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired]));
    mockWrite.mockImplementationOnce(
      async (callback: () => Promise<unknown>): Promise<unknown> => {
        jest.setSystemTime(new Date("2026-05-20T10:01:00.000Z"));
        return callback();
      }
    );

    const pausedCount = await pauseExpiredCustomBudgets();

    expect(pausedCount).toBe(1);
    expect(expired.pausedAt).toBe("2026-05-20T10:01:00.000Z");
    jest.useRealTimers();
  });

  it("preserves an existing pausedAt value when pausing an eligible budget", async (): Promise<void> => {
    const pausedAt = "2024-01-01T00:00:00.000Z";
    const expired = createLifecycleBudget({ id: "expired", pausedAt });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([expired]));

    const pausedCount = await pauseExpiredCustomBudgets();

    expect(pausedCount).toBe(1);
    expect(expired.update).toHaveBeenCalledTimes(1);
    expect(expired.status).toBe("PAUSED");
    expect(expired.pausedAt).toBe(pausedAt);
  });

  it("does not open a writer when no active custom budgets are expired", async (): Promise<void> => {
    const future = createLifecycleBudget({
      id: "future",
      periodEnd: new Date("2999-01-01T00:00:00.000Z"),
    });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([future]));

    const pausedCount = await pauseExpiredCustomBudgets();

    expect(pausedCount).toBe(0);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(future.update).not.toHaveBeenCalled();
  });

  it("soft-deletes only the owned budget and never mutates transactions", async (): Promise<void> => {
    const budget = createLifecycleBudget({ id: "budget-delete" });
    mockQueryOwned.mockReturnValueOnce(createQueryResult([budget]));

    await deleteBudget(budget.id);

    expect(budget.deleted).toBe(true);
    expect(budget.update).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalledWith("transactions");
  });

  it("resumes only a paused owned budget and appends one closed pause interval", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const pausedAt = "2026-08-14T10:00:00.000Z";
    const existingInterval = {
      from: new Date("2026-08-13T08:00:00.000Z").getTime(),
      to: new Date("2026-08-13T09:00:00.000Z").getTime(),
    };
    const budget = createLifecycleBudget({
      status: "PAUSED",
      periodEnd: new Date("2026-08-20T00:00:00.000Z"),
      pausedAt,
      pauseIntervals: JSON.stringify([existingInterval]),
    });
    mockQueryOwned.mockReturnValue(createQueryResult([budget]));

    await resumeBudget(budget.id);

    expect(budget.status).toBe("ACTIVE");
    expect(budget.pausedAt).toBeUndefined();
    expect(JSON.parse(budget.pauseIntervals ?? "[]")).toEqual([
      existingInterval,
      {
        from: new Date(pausedAt).getTime(),
        to: new Date("2026-08-14T12:00:00.000Z").getTime(),
      },
    ]);
    expect(budget.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a second Resume and appends no second interval", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const budget = createLifecycleBudget({
      status: "PAUSED",
      periodEnd: new Date("2026-08-20T00:00:00.000Z"),
      pausedAt: "2026-08-14T10:00:00.000Z",
      pauseIntervals: "[]",
    });
    mockQueryOwned.mockReturnValue(createQueryResult([budget]));

    await resumeBudget(budget.id);
    const intervalsAfterFirstResume = budget.pauseIntervals;
    await expect(resumeBudget(budget.id)).rejects.toThrow(
      "Cannot resume a budget that is not paused"
    );

    expect(budget.pauseIntervals).toBe(intervalsAfterFirstResume);
    expect(budget.update).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("leaves a paused budget unchanged when the writer rejects", async (): Promise<void> => {
    const pausedAt = "2026-08-14T10:00:00.000Z";
    const budget = createLifecycleBudget({
      status: "PAUSED",
      periodEnd: new Date("2999-01-01T00:00:00.000Z"),
      pausedAt,
      pauseIntervals: "[]",
    });
    mockQueryOwned.mockReturnValue(createQueryResult([budget]));
    mockWrite.mockRejectedValueOnce(new Error("writer unavailable"));

    await expect(resumeBudget(budget.id)).rejects.toThrow("writer unavailable");

    expect(budget.status).toBe("PAUSED");
    expect(budget.pausedAt).toBe(pausedAt);
    expect(budget.pauseIntervals).toBe("[]");
    expect(budget.update).not.toHaveBeenCalled();
  });

  it("rejects Resume when a paused custom budget has expired", async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const budget = createLifecycleBudget({
      status: "PAUSED",
      periodEnd: new Date("2026-08-13T00:00:00.000Z"),
      pausedAt: "2026-08-12T10:00:00.000Z",
      pauseIntervals: "[]",
    });
    mockQueryOwned.mockReturnValue(createQueryResult([budget]));

    await expect(resumeBudget(budget.id)).rejects.toThrow(
      "Cannot resume an expired budget"
    );

    expect(mockWrite).not.toHaveBeenCalled();
    expect(budget.update).not.toHaveBeenCalled();
    expect(budget.status).toBe("PAUSED");
  });
});
import type { Budget, Transaction } from "@monyvi/db";
