import { renderHook } from "@testing-library/react-native";
import type { SelectedMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";

const mockRows: Record<string, readonly unknown[]> = {};
let mockSnapshot: SelectedMarketRateSnapshot | null = null;
let mockRatesLoading = false;
jest.mock("@monyvi/db", () => ({
  database: { get: (table: string) => table },
}));
jest.mock("@/services/user-data-access", () => {
  const query = (table: string): unknown => {
    const observe = (): unknown => ({
      subscribe: ({ next }: { next: (rows: readonly unknown[]) => void }) => {
        next(mockRows[table] ?? []);
        return { unsubscribe: jest.fn() };
      },
    });
    return { observe, observeWithColumns: observe };
  };
  return { queryOwned: query, queryChildrenOfOwnedParents: query };
});
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1", isResolvingUser: false }),
  runUserScopedEffect: ({
    onAuthenticated,
  }: {
    onAuthenticated: (id: string) => unknown;
  }) => onAuthenticated("user-1"),
}));
jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: () => ({
    selectedSnapshot: mockSnapshot,
    isLoading: mockRatesLoading,
    isCurrentLoading: mockRatesLoading,
  }),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));
jest.mock("@/utils/logger", () => ({ logger: { error: jest.fn() } }));

import { useAccounts } from "@/hooks/useAccounts";
import { usePeriodSummary } from "@/hooks/usePeriodSummary";
import { useRecurringPayments } from "@/hooks/useRecurringPayments";
import { useMetalHoldings } from "@/hooks/useMetalHoldings";
import { useAssetBreakdown } from "@/hooks/useAssetBreakdown";
import { sortPayments } from "@/services/recurring-payments-dashboard-read-model";
import type { RecurringPayment } from "@monyvi/db";

describe("recorded facts without current exchange rates", () => {
  it("waits for initial snapshot selection when period conversion needs rates", () => {
    mockRows.transactions = [{ type: "EXPENSE", amount: 10, currency: "USD" }];
    mockRatesLoading = true;
    const { result, rerender } = renderHook(() => usePeriodSummary());
    expect(result.current.isLoading).toBe(true);
    mockRatesLoading = false;
    rerender({});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.totalExpenses).toBeNull();
  });
  beforeEach(() => {
    Object.keys(mockRows).forEach((key) => delete mockRows[key]);
    mockSnapshot = null;
    mockRatesLoading = false;
  });
  it("keeps accounts with an unavailable converted balance", () => {
    mockRows.accounts = [
      { id: "usd", balance: 20, currency: "USD", type: "CASH" },
    ];
    const { result } = renderHook(() => useAccounts());
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.totalAccountsBalance).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
  it("keeps a truly empty set at zero without requiring market data", () => {
    expect(
      renderHook(() => useAccounts()).result.current.totalAccountsBalance
    ).toBe(0);
    expect(
      renderHook(() => useRecurringPayments()).result.current.totalDueThisMonth
    ).toBe(0);
    expect(
      renderHook(() => usePeriodSummary()).result.current.data.savings
    ).toBe(0);
  });
  it("retains known period income when expense conversion is unavailable", () => {
    mockRows.transactions = [
      { type: "INCOME", amount: 300, currency: "EGP" },
      { type: "EXPENSE", amount: 10, currency: "USD" },
    ];
    const { result } = renderHook(() => usePeriodSummary());
    expect(result.current.data).toMatchObject({
      totalIncome: 300,
      totalExpenses: null,
      savings: null,
      savingsPercentage: null,
      spentPercentage: null,
    });
  });
  it("keeps recurring payments and marks only dependent totals unavailable", () => {
    const payment = {
      id: "bill",
      name: "Bill",
      amount: 10,
      currency: "USD",
      status: "ACTIVE",
      isActive: true,
      isExpense: true,
      nextDueDate: new Date(),
    };
    mockRows.recurring_payments = [payment];
    const { result } = renderHook(() => useRecurringPayments());
    expect(result.current.filteredPayments).toEqual([payment]);
    expect(result.current.next7DaysTotal).toBeNull();
    expect(result.current.totalDueThisMonth).toBeNull();
    expect(result.current.totalIncomeThisMonth).toBe(0);
  });
  it("keeps holdings and counts while their valuations are unavailable", () => {
    mockRows.assets = [
      {
        id: "gold",
        purchasePrice: 300,
        currency: "EGP",
        purchaseDate: new Date(),
      },
    ];
    mockRows.asset_metals = [
      {
        assetId: "gold",
        metalType: "GOLD",
        calculateValue: (price: number): number => price * 10,
      },
    ];
    const { result } = renderHook(() => useMetalHoldings());
    expect(result.current.goldHoldings).toHaveLength(1);
    expect(result.current.goldHoldings[0].currentValue).toBeNull();
    expect(result.current.totalValue).toBeNull();
    expect(result.current.totalPurchasePrice).toBe(300);
    expect(result.current.portfolioSplit.gold.itemCount).toBe(1);
  });
  it("distinguishes an unavailable breakdown from an empty account set", () => {
    mockRows.accounts = [
      { id: "egp", balance: 20, currency: "EGP", type: "CASH" },
    ];
    const { result } = renderHook(() => useAssetBreakdown());
    expect(result.current.breakdown).toBeNull();
  });
  it("does not sort mixed nominal amounts as though their currencies were comparable", () => {
    const payments = [
      { id: "usd", amount: 10, currency: "USD", nextDueDate: new Date(1) },
      { id: "egp", amount: 300, currency: "EGP", nextDueDate: new Date(2) },
    ] as unknown as RecurringPayment[];
    expect(
      sortPayments(payments, "highest_amount", {
        preferredCurrency: "EGP",
      }).map((payment) => payment.id)
    ).toEqual(["usd", "egp"]);
    expect(
      sortPayments(payments, "lowest_amount", { preferredCurrency: "EGP" }).map(
        (payment) => payment.id
      )
    ).toEqual(["usd", "egp"]);
    const sameCurrency = payments.map((payment) => ({
      ...payment,
      currency: "EGP",
    })) as unknown as RecurringPayment[];
    expect(
      sortPayments(sameCurrency, "highest_amount").map((payment) => payment.id)
    ).toEqual(["egp", "usd"]);
    expect(
      sortPayments(sameCurrency, "lowest_amount").map((payment) => payment.id)
    ).toEqual(["usd", "egp"]);
  });
  it("keeps recorded lists ready while the rates subscription is loading", () => {
    mockRatesLoading = true;
    expect(renderHook(() => useAccounts()).result.current.isLoading).toBe(
      false
    );
    expect(
      renderHook(() => useRecurringPayments()).result.current.isLoading
    ).toBe(false);
    expect(renderHook(() => useMetalHoldings()).result.current.isLoading).toBe(
      false
    );
    expect(renderHook(() => usePeriodSummary()).result.current.isLoading).toBe(
      false
    );
  });
  it("does not throw during recurring render when a selected snapshot lacks the required currency", () => {
    mockSnapshot = {
      snapshotId: "partial",
      capturedAt: new Date(),
      ratesByInstrument: new Map(),
      trust: {
        gold: { state: "missing", ageMs: null, providerObservedAt: null },
        silver: { state: "missing", ageMs: null, providerObservedAt: null },
        currencies: new Map(),
      },
    };
    mockRows.recurring_payments = [
      {
        id: "bill",
        amount: 10,
        currency: "USD",
        status: "ACTIVE",
        isActive: true,
        isExpense: true,
        nextDueDate: new Date(),
      },
    ];
    const { result } = renderHook(() => useRecurringPayments());
    expect(result.current.totalDueThisMonth).toBeNull();
    expect(result.current.filteredPayments).toHaveLength(1);
  });
  it("keeps filtered recurring totals unavailable when an unrendered payment needs conversion", () => {
    const due = new Date();
    mockRows.recurring_payments = [
      {
        id: "egp",
        amount: 300,
        currency: "EGP",
        status: "ACTIVE",
        isActive: true,
        isExpense: true,
        nextDueDate: due,
      },
      {
        id: "usd",
        amount: 10,
        currency: "USD",
        status: "ACTIVE",
        isActive: true,
        isExpense: true,
        nextDueDate: due,
      },
    ];
    const { result } = renderHook(() =>
      useRecurringPayments({
        limit: 1,
        dateRange: {
          start: new Date(due.getTime() - 1000),
          end: new Date(due.getTime() + 1000),
        },
      })
    );
    expect(result.current.filteredPayments).toHaveLength(1);
    expect(result.current.totalDueFiltered).toBeNull();
  });
});
