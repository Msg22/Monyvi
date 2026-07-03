import type { Account, Category, Transaction, Transfer } from "@monyvi/db";

const mockTransactionsCollection = { table: "transactions" };
const mockTransfersCollection = { table: "transfers" };
const mockAccountsCollection = { table: "accounts" };
const mockCategoriesCollection = { table: "categories" };
const mockDatabaseGet = jest.fn((tableName: string): unknown => {
  if (tableName === "transactions") return mockTransactionsCollection;
  if (tableName === "transfers") return mockTransfersCollection;
  if (tableName === "accounts") return mockAccountsCollection;
  if (tableName === "categories") return mockCategoriesCollection;
  throw new Error(`Unexpected table: ${tableName}`);
});
const mockQueryOwned = jest.fn();
const mockQueryAccessibleCategories = jest.fn();

interface QueryCondition {
  readonly kind: "where" | "gte" | "lte" | "gt" | "oneOf" | "notEq" | "sortBy";
  readonly column?: string;
  readonly value: unknown;
}

interface MockQuery<TRecord> {
  readonly fetch: jest.Mock<Promise<TRecord[]>, []>;
  readonly observeWithColumns: jest.Mock;
}

interface MockRelation {
  readonly fetch: jest.Mock;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (tableName: string): unknown => mockDatabaseGet(tableName),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    gt: (value: unknown): QueryCondition => ({ kind: "gt", value }),
    gte: (value: unknown): QueryCondition => ({ kind: "gte", value }),
    lte: (value: unknown): QueryCondition => ({ kind: "lte", value }),
    notEq: (value: unknown): QueryCondition => ({ kind: "notEq", value }),
    oneOf: (value: unknown): QueryCondition => ({ kind: "oneOf", value }),
    sortBy: (column: string, value: unknown): QueryCondition => ({
      kind: "sortBy",
      column,
      value,
    }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
  queryAccessibleCategories: (...args: readonly unknown[]): unknown =>
    mockQueryAccessibleCategories(...args),
}));

import {
  buildTransactionGroups,
  type DisplayListItem,
  getTransactionListReadModel,
  observeTransactionListInvalidationSources,
} from "@/services/transaction-list-read-model-service";

function createQuery<TRecord>(records: readonly TRecord[]): MockQuery<TRecord> {
  return {
    fetch: jest.fn((): Promise<TRecord[]> => Promise.resolve([...records])),
    observeWithColumns: jest.fn(),
  };
}

function createAccount(
  id: string,
  name: string,
  currency: string,
  deleted = false
): Account {
  return { id, name, currency, deleted } as unknown as Account;
}

function createCategory(
  displayName: string,
  iconName = "restaurant",
  iconLibrary = "Ionicons",
  id = displayName.toLowerCase()
): Category {
  return {
    id,
    displayName,
    iconConfig: { iconName, iconLibrary },
  } as unknown as Category;
}

interface MockTransactionOverrides {
  readonly id: string;
  readonly amount: number;
  readonly type: "INCOME" | "EXPENSE";
  readonly date: Date;
  readonly currency?: "EGP" | "USD";
  readonly note?: string;
  readonly counterparty?: string;
  readonly account?: Account;
  readonly category?: Category | null;
  readonly userId?: string;
}

function createTransaction(overrides: MockTransactionOverrides): Transaction {
  const account =
    overrides.account ?? createAccount("account-1", "Cash", "EGP");
  const category = overrides.category ?? createCategory("Food");

  return {
    ...overrides,
    userId: overrides.userId ?? "user-1",
    accountId: account.id,
    categoryId: category?.id ?? "missing-category",
    currency: overrides.currency ?? "EGP",
    dateInMs: overrides.date.getTime(),
    isIncome: overrides.type === "INCOME",
    isExpense: overrides.type === "EXPENSE",
    account: {
      fetch: jest.fn(() => Promise.resolve(account)),
    },
    category: {
      fetch: jest.fn(() => Promise.resolve(category)),
    },
  } as unknown as Transaction;
}

interface MockTransferOverrides {
  readonly id: string;
  readonly amount: number;
  readonly date: Date;
  readonly fromAccount?: Account;
  readonly toAccount?: Account;
  readonly notes?: string;
  readonly userId?: string;
}

function createTransfer(overrides: MockTransferOverrides): Transfer {
  const fromAccount =
    overrides.fromAccount ?? createAccount("account-1", "Cash", "EGP");
  const toAccount =
    overrides.toAccount ?? createAccount("account-2", "Savings", "EGP");

  return {
    ...overrides,
    userId: overrides.userId ?? "user-1",
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    currency: "EGP",
    dateInMs: overrides.date.getTime(),
    fromAccount: {
      fetch: jest.fn(() => Promise.resolve(fromAccount)),
    },
    toAccount: {
      fetch: jest.fn(() => Promise.resolve(toAccount)),
    },
  } as unknown as Transfer;
}

function expectRelationFetchNotCalled(relation: unknown): void {
  const mockRelation = relation as MockRelation;
  expect(mockRelation.fetch.mock.calls).toHaveLength(0);
}

describe("transaction-list-read-model-service", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds invalidation queries scoped to the current user", () => {
    const transactionsQuery = createQuery<Transaction>([]);
    const transfersQuery = createQuery<Transfer>([]);
    mockQueryOwned
      .mockReturnValueOnce(transactionsQuery)
      .mockReturnValueOnce(transfersQuery);

    const queries = observeTransactionListInvalidationSources({
      userId: "user-1",
      period: "this_month",
    });

    expect(queries).toEqual({ transactionsQuery, transfersQuery });
    const transactionCall = mockQueryOwned.mock.calls[0] as readonly unknown[];
    const transferCall = mockQueryOwned.mock.calls[1] as readonly unknown[];
    expect(transactionCall[0]).toBe(mockTransactionsCollection);
    expect(transactionCall[1]).toBe("user-1");
    expect(transactionCall[2]).toEqual({
      kind: "where",
      column: "deleted",
      value: false,
    });
    expect(transactionCall[3]).toMatchObject({
      kind: "where",
      column: "date",
      value: { kind: "gte" },
    });
    expect(transferCall[0]).toBe(mockTransfersCollection);
    expect(transferCall[1]).toBe("user-1");
    expect(transferCall[2]).toEqual({
      kind: "where",
      column: "deleted",
      value: false,
    });
    expect(transferCall[3]).toMatchObject({
      kind: "where",
      column: "date",
      value: { kind: "gte" },
    });
    expect(transferCall[4]).toMatchObject({
      kind: "where",
      column: "date",
      value: { kind: "lte" },
    });
  });

  it("fetches selected transaction types, transfers, future transactions, and display account names", async () => {
    const cashEgp = createAccount("account-1", "Cash", "EGP");
    const cashUsd = createAccount("account-2", "Cash", "USD");
    const foodCategory = createCategory(
      "Food",
      "fast-food",
      "Ionicons",
      "category-food"
    );
    const salaryCategory = createCategory(
      "Salary",
      "cash",
      "Ionicons",
      "category-salary"
    );
    const expense = createTransaction({
      id: "expense",
      amount: 100,
      type: "EXPENSE",
      date: new Date("2026-05-14T10:00:00.000Z"),
      account: cashEgp,
      category: foodCategory,
      note: "Lunch",
    });
    const income = createTransaction({
      id: "income",
      amount: 500,
      type: "INCOME",
      date: new Date("2026-05-13T10:00:00.000Z"),
      account: cashUsd,
      category: salaryCategory,
    });
    const future = createTransaction({
      id: "future",
      amount: 50,
      type: "EXPENSE",
      date: new Date("2026-06-01T10:00:00.000Z"),
      account: cashEgp,
    });
    const transfer = createTransfer({
      id: "transfer",
      amount: 75,
      date: new Date("2026-05-12T10:00:00.000Z"),
      fromAccount: cashEgp,
      toAccount: cashUsd,
      notes: "Move cash",
    });
    const futureQuery = createQuery([future]);
    const transfersQuery = createQuery([transfer]);
    const displayTransactionsQuery = createQuery([expense, income]);
    const accountsQuery = createQuery([cashEgp, cashUsd]);
    const categoriesQuery = createQuery([foodCategory, salaryCategory]);
    mockQueryOwned
      .mockReturnValueOnce(futureQuery)
      .mockReturnValueOnce(transfersQuery)
      .mockReturnValueOnce(displayTransactionsQuery)
      .mockReturnValueOnce(accountsQuery);
    mockQueryAccessibleCategories.mockReturnValueOnce(categoriesQuery);

    const model = await getTransactionListReadModel({
      userId: "user-1",
      period: "this_month",
      selectedTypes: ["Income", "Expense", "Transfer"],
    });

    expect(model.futureTransactions).toEqual([future]);
    expect(model.displayedItems.map((item) => item.id)).toEqual([
      "expense",
      "income",
      "transfer",
    ]);
    expect(model.displayedItems[0]).toMatchObject({
      accountName: "Cash (EGP)",
      categoryName: "Food",
      categoryIconName: "fast-food",
      categoryIconLibrary: "Ionicons",
      record: expense,
    });
    expect(model.displayedItems[2]).toMatchObject({
      fromAccountName: "Cash (EGP)",
      toAccountName: "Cash (USD)",
      record: transfer,
    });
    expect(Object.getPrototypeOf(model.displayedItems[0])).toBe(
      Object.prototype
    );
    expect(Object.getPrototypeOf(model.displayedItems[2])).toBe(
      Object.prototype
    );
    expectRelationFetchNotCalled(expense.account);
    expectRelationFetchNotCalled(expense.category);
    expectRelationFetchNotCalled(income.account);
    expectRelationFetchNotCalled(income.category);
    expectRelationFetchNotCalled(transfer.fromAccount);
    expectRelationFetchNotCalled(transfer.toAccount);
    expect(mockQueryOwned).toHaveBeenNthCalledWith(
      3,
      mockTransactionsCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false },
      expect.objectContaining({ column: "date" }),
      expect.objectContaining({ column: "date" }),
      { kind: "sortBy", column: "date", value: "desc" }
    );
    const accountLookupCall = mockQueryOwned.mock
      .calls[3] as readonly unknown[];
    const categoryLookupCall = mockQueryAccessibleCategories.mock
      .calls[0] as readonly unknown[];
    expect(accountLookupCall[0]).toBe(mockAccountsCollection);
    expect(accountLookupCall[1]).toBe("user-1");
    expect(accountLookupCall[2]).toMatchObject({
      kind: "where",
      column: "deleted",
    });
    expect(categoryLookupCall[0]).toBe(mockCategoriesCollection);
    expect(categoryLookupCall[1]).toBe("user-1");
    expect(categoryLookupCall[2]).toMatchObject({
      kind: "where",
      column: "id",
    });
    expect(categoryLookupCall[3]).toMatchObject({
      kind: "where",
      column: "deleted",
    });
  });

  it("keeps duplicate account-name disambiguation when the duplicate is outside the visible list", async () => {
    const cashEgp = createAccount("account-1", "Cash", "EGP");
    const cashUsd = createAccount("account-2", "Cash", "USD");
    const foodCategory = createCategory(
      "Food",
      "fast-food",
      "Ionicons",
      "category-food"
    );
    const expense = createTransaction({
      id: "expense",
      amount: 100,
      type: "EXPENSE",
      date: new Date("2026-05-14T10:00:00.000Z"),
      account: cashEgp,
      category: foodCategory,
    });

    mockQueryOwned
      .mockReturnValueOnce(createQuery<Transaction>([]))
      .mockReturnValueOnce(createQuery<Transaction>([expense]))
      .mockReturnValueOnce(createQuery<Account>([cashEgp, cashUsd]));
    mockQueryAccessibleCategories.mockReturnValueOnce(
      createQuery<Category>([foodCategory])
    );

    const model = await getTransactionListReadModel({
      userId: "user-1",
      period: "this_month",
      selectedTypes: ["Expense"],
    });

    expect(model.displayedItems[0]).toMatchObject({
      id: "expense",
      accountName: "Cash (EGP)",
    });
    const accountLookupCall = mockQueryOwned.mock
      .calls[2] as readonly unknown[];
    expect(accountLookupCall).toHaveLength(3);
    expect(accountLookupCall[2]).toMatchObject({
      kind: "where",
      column: "deleted",
    });
  });

  it("keeps search filtering out of the database read model", async () => {
    const food = createTransaction({
      id: "food",
      amount: 100,
      type: "EXPENSE",
      date: new Date("2026-05-14T10:00:00.000Z"),
      category: createCategory("Food"),
    });
    const rent = createTransaction({
      id: "rent",
      amount: 3000,
      type: "EXPENSE",
      date: new Date("2026-05-13T10:00:00.000Z"),
      category: createCategory("Rent"),
    });
    mockQueryOwned
      .mockReturnValueOnce(createQuery<Transaction>([]))
      .mockReturnValueOnce(createQuery<Transaction>([food, rent]))
      .mockReturnValueOnce(
        createQuery<Account>([createAccount("a1", "Cash", "EGP")])
      );
    mockQueryAccessibleCategories.mockReturnValueOnce(
      createQuery<Category>([createCategory("Food"), createCategory("Rent")])
    );

    const model = await getTransactionListReadModel({
      userId: "user-1",
      period: "this_month",
      selectedTypes: ["Expense"],
    });

    expect(model.displayedItems.map((item) => item.id)).toEqual([
      "food",
      "rent",
    ]);
  });

  it("builds net-worth groups without mutating source display items", () => {
    const expenseRecord = createTransaction({
      id: "expense",
      amount: 100,
      type: "EXPENSE",
      date: new Date("2026-05-14T10:00:00.000Z"),
    });
    const incomeRecord = createTransaction({
      id: "income",
      amount: 300,
      type: "INCOME",
      date: new Date("2026-05-13T10:00:00.000Z"),
    });
    const expense: DisplayListItem = {
      _type: "transaction",
      record: expenseRecord,
      id: expenseRecord.id,
      userId: expenseRecord.userId,
      accountId: expenseRecord.accountId,
      categoryId: expenseRecord.categoryId,
      amount: expenseRecord.amount,
      currency: expenseRecord.currency,
      type: expenseRecord.type,
      date: expenseRecord.date,
      dateInMs: expenseRecord.dateInMs,
      isIncome: expenseRecord.isIncome,
      isExpense: expenseRecord.isExpense,
      source: "MANUAL",
      accountName: "Cash",
      categoryName: "Food",
      categoryIconName: "restaurant",
      categoryIconLibrary: "Ionicons",
    };
    const income: DisplayListItem = {
      _type: "transaction",
      record: incomeRecord,
      id: incomeRecord.id,
      userId: incomeRecord.userId,
      accountId: incomeRecord.accountId,
      categoryId: incomeRecord.categoryId,
      amount: incomeRecord.amount,
      currency: incomeRecord.currency,
      type: incomeRecord.type,
      date: incomeRecord.date,
      dateInMs: incomeRecord.dateInMs,
      isIncome: incomeRecord.isIncome,
      isExpense: incomeRecord.isExpense,
      source: "MANUAL",
      accountName: "Cash",
      categoryName: "Salary",
      categoryIconName: "cash",
      categoryIconLibrary: "Ionicons",
    };
    const future = createTransaction({
      id: "expense",
      amount: 50,
      type: "EXPENSE",
      date: new Date("2026-06-01T10:00:00.000Z"),
    });

    const groups = buildTransactionGroups({
      futureTransactions: [future],
      displayedItems: [expense, income],
      totalNetWorth: 1000,
      preferredCurrency: "EGP",
      latestRates: null,
      period: "this_month",
      searchQuery: "",
    });

    expect(
      (expense as { displayNetWorth?: number }).displayNetWorth
    ).toBeUndefined();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      title: "May 11 - May 17",
      groupNetWorth: 1050,
      groupTotalIncome: 300,
      groupTotalExpense: 100,
    });
    expect(groups[0].transactions.map((item) => item.displayNetWorth)).toEqual([
      1050, 1150,
    ]);
  });

  it("filters grouped display items by search query without changing the read model", () => {
    const foodRecord = createTransaction({
      id: "food",
      amount: 100,
      type: "EXPENSE",
      date: new Date("2026-05-14T10:00:00.000Z"),
    });
    const rentRecord = createTransaction({
      id: "rent",
      amount: 3000,
      type: "EXPENSE",
      date: new Date("2026-05-13T10:00:00.000Z"),
      category: createCategory("Rent"),
    });
    const food: DisplayListItem = {
      _type: "transaction",
      record: foodRecord,
      id: foodRecord.id,
      userId: foodRecord.userId,
      accountId: foodRecord.accountId,
      categoryId: foodRecord.categoryId,
      amount: foodRecord.amount,
      currency: foodRecord.currency,
      type: foodRecord.type,
      date: foodRecord.date,
      dateInMs: foodRecord.dateInMs,
      isIncome: foodRecord.isIncome,
      isExpense: foodRecord.isExpense,
      source: "MANUAL",
      accountName: "Cash",
      categoryName: "Food",
      categoryIconName: "restaurant",
      categoryIconLibrary: "Ionicons",
    };
    const rent: DisplayListItem = {
      _type: "transaction",
      record: rentRecord,
      id: rentRecord.id,
      userId: rentRecord.userId,
      accountId: rentRecord.accountId,
      categoryId: rentRecord.categoryId,
      amount: rentRecord.amount,
      currency: rentRecord.currency,
      type: rentRecord.type,
      date: rentRecord.date,
      dateInMs: rentRecord.dateInMs,
      isIncome: rentRecord.isIncome,
      isExpense: rentRecord.isExpense,
      source: "MANUAL",
      accountName: "Cash",
      categoryName: "Rent",
      categoryIconName: "home",
      categoryIconLibrary: "Ionicons",
    };

    const groups = buildTransactionGroups({
      futureTransactions: [],
      displayedItems: [food, rent],
      totalNetWorth: 5000,
      preferredCurrency: "EGP",
      latestRates: null,
      period: "this_month",
      searchQuery: "rent",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].transactions.map((item) => item.id)).toEqual(["rent"]);
  });
});
