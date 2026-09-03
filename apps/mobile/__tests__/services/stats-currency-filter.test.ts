import type { Transaction } from "@monyvi/db";

const mockTransactionsCollection = { table: "transactions" };
const mockTransactionsQuery = { kind: "transactions-query" };
const mockCategoriesQuery = { kind: "categories-query" };
const mockQueryOwned = jest.fn(() => mockTransactionsQuery);
const mockQueryAccessibleCategories = jest.fn(() => mockCategoriesQuery);

interface QueryCondition {
  readonly kind: "where" | "gte" | "lte" | "oneOf";
  readonly column?: string;
  readonly value: unknown;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (tableName: string): unknown => ({ table: tableName }),
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
    } as unknown as Parameters<
      typeof analyticsService.observeMonthlyChartTransactions
    >[0]);
    expectLastOwnedQueryToUseCurrency("USD");

    analyticsService.observeMonthlySummaryTransactions({
      userId: "user-1",
      months: 3,
      currency: "USD",
    } as unknown as Parameters<
      typeof analyticsService.observeMonthlySummaryTransactions
    >[0]);
    expectLastOwnedQueryToUseCurrency("USD");

    analyticsService.observeCategoryBreakdownSources({
      userId: "user-1",
      year: 2026,
      month: 5,
      currency: "USD",
    } as unknown as Parameters<
      typeof analyticsService.observeCategoryBreakdownSources
    >[0]);
    expectLastOwnedQueryToUseCurrency("USD");

    analyticsService.observeComparisonTransactions({
      userId: "user-1",
      type: "mom",
      year: 2026,
      month: 5,
      currency: "USD",
    } as unknown as Parameters<
      typeof analyticsService.observeComparisonTransactions
    >[0]);
    const comparisonCalls = mockQueryOwned.mock.calls.slice(-2) as ReadonlyArray<
      readonly unknown[]
    >;
    expect(comparisonCalls).toHaveLength(2);
    expect(comparisonCalls.every((call) => hasCurrencyCondition(call, "USD"))).toBe(
      true
    );
  });

  it("exposes currency-scoped drilldown and unfiltered currency-source queries", () => {
    const service = analyticsService as unknown as Record<string, unknown>;
    const observeDrilldown = service.observeCategoryDrilldownTransactions;
    const observeCurrencies = service.observeStatsCurrencyTransactions;

    expect(typeof observeDrilldown).toBe("function");
    expect(typeof observeCurrencies).toBe("function");

    if (typeof observeDrilldown !== "function" || typeof observeCurrencies !== "function") {
      return;
    }

    (observeDrilldown as (input: unknown) => unknown)({
      userId: "user-1",
      year: 2026,
      month: 5,
      currency: "EUR",
    });
    expectLastOwnedQueryToUseCurrency("EUR");

    mockQueryOwned.mockClear();
    (observeCurrencies as (input: unknown) => unknown)({ userId: "user-1" });
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockTransactionsCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false }
    );
  });

  it("derives unique transaction currencies with preferred currency first", () => {
    const service = analyticsService as unknown as Record<string, unknown>;
    const buildStatsCurrencies = service.buildStatsCurrencies;

    expect(typeof buildStatsCurrencies).toBe("function");
    if (typeof buildStatsCurrencies !== "function") {
      return;
    }

    expect(
      (buildStatsCurrencies as (
        transactions: readonly Transaction[],
        preferredCurrency: string
      ) => readonly string[])(
        [transaction("USD"), transaction("EGP"), transaction("USD"), transaction("EUR")],
        "EGP"
      )
    ).toEqual(["EGP", "EUR", "USD"]);

    expect(
      (buildStatsCurrencies as (
        transactions: readonly Transaction[],
        preferredCurrency: string
      ) => readonly string[])([transaction("USD"), transaction("EUR")], "EGP")
    ).toEqual(["EUR", "USD"]);
  });
});
