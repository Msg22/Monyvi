import type { Transaction } from "@monyvi/db";

const mockTransactionsCollection = { table: "transactions" };
const mockCategoriesCollection = { table: "categories" };
const mockTransactionsQuery = { kind: "transactions-query" };
const mockCategoriesQuery = { kind: "categories-query" };
const mockQueryOwned = jest.fn(
  (..._args: readonly unknown[]) => mockTransactionsQuery
);
const mockQueryAccessibleCategories = jest.fn(
  (..._args: readonly unknown[]) => mockCategoriesQuery
);

interface QueryCondition {
  readonly kind: "where" | "gte" | "lte" | "oneOf";
  readonly column?: string;
  readonly value: unknown;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (tableName: string): unknown => {
      if (tableName === "transactions") return mockTransactionsCollection;
      if (tableName === "categories") return mockCategoriesCollection;
      throw new Error(`Unexpected table: ${tableName}`);
    },
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    gte: (value: unknown): QueryCondition => ({ kind: "gte", value }),
    lte: (value: unknown): QueryCondition => ({ kind: "lte", value }),
    oneOf: (value: unknown): QueryCondition => ({ kind: "oneOf", value }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryAccessibleCategories: (...args: readonly unknown[]): unknown =>
    mockQueryAccessibleCategories(...args),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import * as analyticsService from "@/services/analytics-read-model-service";

function hasCurrencyCondition(call: readonly unknown[], currency: string): boolean {
  return call.some(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      "column" in value &&
      "value" in value &&
      (value as QueryCondition).kind === "where" &&
      (value as QueryCondition).column === "currency" &&
      (value as QueryCondition).value === currency
  );
}

function expectLastOwnedQueryToUseCurrency(currency: string): void {
  const calls = mockQueryOwned.mock.calls as ReadonlyArray<readonly unknown[]>;
  const lastCall = calls.at(-1);
  expect(lastCall).toBeDefined();
  expect(hasCurrencyCondition(lastCall ?? [], currency)).toBe(true);
}

function transaction(currency: "EGP" | "USD" | "EUR"): Transaction {
  return { currency } as unknown as Transaction;
}

describe("Stats currency query contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("constrains every Stats transaction query to the selected currency", () => {
    analyticsService.observeMonthlyChartTransactions({
      userId: "user-1",
      months: 6,
      type: "EXPENSE",
      currency: "USD",
    });
    expectLastOwnedQueryToUseCurrency("USD");

    analyticsService.observeMonthlySummaryTransactions({
      userId: "user-1",
      months: 3,
      currency: "USD",
    });
    expectLastOwnedQueryToUseCurrency("USD");

    analyticsService.observeCategoryBreakdownSources({
      userId: "user-1",
      year: 2026,
      month: 5,
      currency: "USD",
    });
    expectLastOwnedQueryToUseCurrency("USD");

    analyticsService.observeComparisonTransactions({
      userId: "user-1",
      type: "mom",
      year: 2026,
      month: 5,
      currency: "USD",
    });
    const comparisonCalls = mockQueryOwned.mock.calls.slice(-2) as ReadonlyArray<
      readonly unknown[]
    >;
    expect(comparisonCalls).toHaveLength(2);
    expect(comparisonCalls.every((call) => hasCurrencyCondition(call, "USD"))).toBe(
      true
    );
  });

  it("uses a currency-scoped drilldown query and an unfiltered currency-source query", () => {
    analyticsService.observeCategoryDrilldownTransactions({
      userId: "user-1",
      year: 2026,
      month: 5,
      currency: "EUR",
    });
    expectLastOwnedQueryToUseCurrency("EUR");

    mockQueryOwned.mockClear();
    analyticsService.observeStatsCurrencyTransactions({ userId: "user-1" });
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockTransactionsCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false }
    );
  });

  it("derives unique transaction currencies with preferred currency first", () => {
    expect(
      analyticsService.buildStatsCurrencies(
        [
          transaction("USD"),
          transaction("EGP"),
          transaction("USD"),
          transaction("EUR"),
        ],
        "EGP"
      )
    ).toEqual(["EGP", "EUR", "USD"]);

    expect(
      analyticsService.buildStatsCurrencies(
        [transaction("USD"), transaction("EUR")],
        "EGP"
      )
    ).toEqual(["EUR", "USD"]);

    expect(analyticsService.buildStatsCurrencies([], "EGP")).toEqual([]);
  });
});
