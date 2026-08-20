import type { Budget, Category, Transaction } from "@monyvi/db";

const mockDatabaseGet = jest.fn((table: string): string => table);
const mockGetCurrentUserDataScope = jest.fn<Promise<unknown>, []>();
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();
const mockObserveOwnedById = jest.fn<unknown, unknown[]>();
const mockCreateCategoryQuery = jest.fn<unknown, unknown[]>();
const mockCreateTransactionQuery = jest.fn<unknown, unknown[]>();
const mockBuildReadModel = jest.fn<unknown, unknown[]>();

interface Observer<T> {
  readonly next: (value: T) => void;
  readonly error?: (error: unknown) => void;
}

function createObservable<T>(): {
  readonly observable: {
    subscribe(observer: Observer<T>): { unsubscribe: jest.Mock };
  };
  readonly emit: (value: T) => void;
  readonly fail: (error: unknown) => void;
  readonly unsubscribe: jest.Mock;
} {
  let observer: Observer<T> | null = null;
  const unsubscribe = jest.fn();
  return {
    observable: {
      subscribe(nextObserver: Observer<T>): { unsubscribe: jest.Mock } {
        observer = nextObserver;
        return { unsubscribe };
      },
    },
    emit: (value): void => observer?.next(value),
    fail: (error): void => observer?.error?.(error),
    unsubscribe,
  };
}

jest.mock("@monyvi/db", () => ({
  database: { get: (table: string): string => mockDatabaseGet(table) },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): Promise<unknown> =>
    mockGetCurrentUserDataScope(),
  assertExpectedCurrentUser: (userId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(userId),
  observeOwnedById: (...args: unknown[]): unknown =>
    mockObserveOwnedById(...args),
}));

jest.mock("@/services/budget-detail-read-model-service", () => ({
  createBudgetDetailCategoryQuery: (...args: unknown[]): unknown =>
    mockCreateCategoryQuery(...args),
  createBudgetDetailTransactionQuery: (...args: unknown[]): unknown =>
    mockCreateTransactionQuery(...args),
  buildBudgetDetailReadModel: (...args: unknown[]): unknown =>
    mockBuildReadModel(...args),
}));

import { observeBudgetDetailReadModels } from "@/services/budget-detail-observation-service";

describe("budget-detail-observation-service", () => {
  const scope = { userId: "user-1" };
  const budget = {
    id: "budget-1",
    userId: "user-1",
    deleted: false,
  } as unknown as Budget;
  const categories = [{ id: "category-1" }] as Category[];
  const transactions = [{ id: "transaction-1" }] as Transaction[];
  const readModel = { identity: { budgetId: "budget-1" } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserDataScope.mockResolvedValue(scope);
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    mockBuildReadModel.mockReturnValue(readModel);
  });

  it("emits a shaped model from one observed category and transaction snapshot without fetching", async () => {
    const budgetSource = createObservable<Budget | null>();
    const categorySource = createObservable<readonly Category[]>();
    const transactionSource = createObservable<readonly Transaction[]>();
    const categoryFetch = jest.fn();
    const transactionFetch = jest.fn();
    mockObserveOwnedById.mockReturnValue(budgetSource.observable);
    mockCreateCategoryQuery.mockReturnValue({
      observe: () => categorySource.observable,
      fetch: categoryFetch,
    });
    mockCreateTransactionQuery.mockReturnValue({
      observe: () => transactionSource.observable,
      fetch: transactionFetch,
    });
    const now = new Date("2026-05-15T12:00:00.000Z");
    const observation = await observeBudgetDetailReadModels({
      budgetId: "budget-1",
      userId: "user-1",
      fallbackCurrency: "KWD",
      getNow: () => now,
    });
    const next = jest.fn();
    const subscription = observation.subscribe({ next });

    budgetSource.emit(budget);
    categorySource.emit(categories);
    transactionSource.emit(transactions);

    expect(mockObserveOwnedById).toHaveBeenCalledWith(
      "budgets",
      "budget-1",
      "user-1"
    );
    expect(mockCreateCategoryQuery).toHaveBeenCalledTimes(1);
    expect(mockCreateTransactionQuery).toHaveBeenCalledWith(
      scope,
      budget,
      categories,
      now
    );
    expect(mockBuildReadModel).toHaveBeenCalledWith(
      { budget, categories, transactions, fallbackCurrency: "KWD" },
      now
    );
    expect(next).toHaveBeenCalledWith({ budget, readModel });
    expect(categoryFetch).not.toHaveBeenCalled();
    expect(transactionFetch).not.toHaveBeenCalled();

    subscription.unsubscribe();
    expect(budgetSource.unsubscribe).toHaveBeenCalledTimes(1);
    expect(categorySource.unsubscribe).toHaveBeenCalledTimes(1);
    expect(transactionSource.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("replaces the transaction observation when category dependencies change", async () => {
    const budgetSource = createObservable<Budget | null>();
    const categorySource = createObservable<readonly Category[]>();
    const firstTransactions = createObservable<readonly Transaction[]>();
    const secondTransactions = createObservable<readonly Transaction[]>();
    mockObserveOwnedById.mockReturnValue(budgetSource.observable);
    mockCreateCategoryQuery.mockReturnValue({
      observe: () => categorySource.observable,
    });
    mockCreateTransactionQuery
      .mockReturnValueOnce({ observe: () => firstTransactions.observable })
      .mockReturnValueOnce({ observe: () => secondTransactions.observable });
    const observation = await observeBudgetDetailReadModels({
      budgetId: "budget-1",
      userId: "user-1",
      fallbackCurrency: "EGP",
    });
    const next = jest.fn();
    observation.subscribe({ next });

    budgetSource.emit(budget);
    categorySource.emit(categories);
    firstTransactions.emit(transactions);
    categorySource.emit([...categories]);
    firstTransactions.emit([]);
    secondTransactions.emit([]);

    expect(firstTransactions.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockCreateTransactionQuery).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("emits not-found without observing dependencies for a missing or deleted budget", async () => {
    const budgetSource = createObservable<Budget | null>();
    mockObserveOwnedById.mockReturnValue(budgetSource.observable);
    const observation = await observeBudgetDetailReadModels({
      budgetId: "budget-1",
      userId: "user-1",
      fallbackCurrency: "EGP",
    });
    const next = jest.fn();
    observation.subscribe({ next });

    budgetSource.emit(null);
    budgetSource.emit({ ...budget, deleted: true } as unknown as Budget);

    expect(next).toHaveBeenNthCalledWith(1, null);
    expect(next).toHaveBeenNthCalledWith(2, null);
    expect(mockCreateCategoryQuery).not.toHaveBeenCalled();
    expect(mockCreateTransactionQuery).not.toHaveBeenCalled();
  });

  it("rejects a stale authenticated-user scope before subscribing", async () => {
    mockGetCurrentUserDataScope.mockResolvedValue({ userId: "user-2" });
    mockAssertExpectedCurrentUser.mockRejectedValue(
      new Error("AUTH_SCOPE_CHANGED")
    );

    await expect(
      observeBudgetDetailReadModels({
        budgetId: "budget-1",
        userId: "user-1",
        fallbackCurrency: "EGP",
      })
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");

    expect(mockAssertExpectedCurrentUser).toHaveBeenCalledWith("user-1");
    expect(mockObserveOwnedById).not.toHaveBeenCalled();
  });

  it("rejects a mismatched scope even when the recheck resolves", async () => {
    mockGetCurrentUserDataScope.mockResolvedValue({ userId: "user-2" });
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);

    await expect(
      observeBudgetDetailReadModels({
        budgetId: "budget-1",
        userId: "user-1",
        fallbackCurrency: "EGP",
      })
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");

    expect(mockObserveOwnedById).not.toHaveBeenCalled();
  });
});
