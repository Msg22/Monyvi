/**
 * usePeriodSummary Hook
 * Calculates income, expenses, and savings for a configurable time period
 * Used by the "This Month" dashboard section
 *
 * All transaction amounts are converted to the user's preferred currency
 * before aggregation to handle mixed-currency transactions correctly.
 */

import { database, Transaction } from "@monyvi/db";
import { convertCurrency, getYearMonthBoundaries } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";
import { queryOwned } from "@/services/user-data-access";
import { useCurrentUser } from "./useCurrentUser";
import { logger } from "@/utils/logger";

// =============================================================================
// Types
// =============================================================================

export type PeriodFilter =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "six_months"
  | "this_year"
  | "all_time";

export interface PeriodSummary {
  totalIncome: number;
  totalExpenses: number;
  savings: number;
  savingsPercentage: number;
  spentPercentage: number;
}

export interface UsePeriodSummaryResult {
  data: PeriodSummary;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getStartOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}

function getEndOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function getStartOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = Sunday
  const diff = date.getDate() - day;
  return getStartOfDay(new Date(date.getFullYear(), date.getMonth(), diff));
}

function getEndOfWeek(date: Date): Date {
  const startOfWeek = getStartOfWeek(date);
  return getEndOfDay(
    new Date(
      startOfWeek.getFullYear(),
      startOfWeek.getMonth(),
      startOfWeek.getDate() + 6
    )
  );
}

export function getPeriodDateRange(period: PeriodFilter): {
  startDate: number;
  endDate: number;
} {
  const now = new Date();

  switch (period) {
    case "today": {
      return {
        startDate: getStartOfDay(now).getTime(),
        endDate: getEndOfDay(now).getTime(),
      };
    }
    case "this_week": {
      return {
        startDate: getStartOfWeek(now).getTime(),
        endDate: getEndOfWeek(now).getTime(),
      };
    }
    case "last_week": {
      const lastWeek = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 7
      );
      return {
        startDate: getStartOfWeek(lastWeek).getTime(),
        endDate: getEndOfWeek(lastWeek).getTime(),
      };
    }
    case "this_month": {
      const { startDate, endDate } = getYearMonthBoundaries(
        now.getFullYear(),
        now.getMonth() + 1
      );
      return { startDate, endDate };
    }
    case "last_month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const { startDate, endDate } = getYearMonthBoundaries(
        lastMonth.getFullYear(),
        lastMonth.getMonth() + 1
      );
      return { startDate, endDate };
    }
    case "six_months": {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return {
        startDate: sixMonthsAgo.getTime(),
        endDate: getEndOfDay(now).getTime(),
      };
    }
    case "this_year": {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return {
        startDate: startOfYear.getTime(),
        endDate: getEndOfDay(now).getTime(),
      };
    }
    default:
      return { startDate: 0, endDate: Date.now() };
  }
}

// =============================================================================
// Hook
// =============================================================================

export function usePeriodSummary(
  period: PeriodFilter = "this_month",
  accountIds?: string[]
): UsePeriodSummaryResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { latestRates } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { userId, isResolvingUser } = useCurrentUser();

  const refetch = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const accountIdsString = useMemo(
    () => accountIds?.join(",") ?? "",
    [accountIds]
  );

  useEffect(() => {
    if (isResolvingUser) {
      setTransactions([]);
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const transactionsCollection = database.get<Transaction>("transactions");
    const { startDate, endDate } = getPeriodDateRange(period);

    const conditions = [
      Q.where("deleted", false),
      Q.where("date", Q.gte(startDate)),
      Q.where("date", Q.lte(endDate)),
    ];
    const selectedAccountIds =
      accountIdsString.length > 0 ? accountIdsString.split(",") : [];

    if (selectedAccountIds.length > 0) {
      conditions.push(Q.where("account_id", Q.oneOf(selectedAccountIds)));
    }

    const query = queryOwned(transactionsCollection, userId, ...conditions);

    const subscription = query.observe().subscribe({
      next: (result) => {
        setTransactions(result);
        setIsLoading(false);
      },
      error: (err: unknown) => {
        logger.error("periodSummary.observe.failed", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [period, accountIdsString, refreshKey, userId, isResolvingUser]);

  // Calculate summary — convert each transaction to preferred currency first
  const data = useMemo((): PeriodSummary => {
    // Sum amounts after converting each transaction to preferred currency
    const totals = transactions.reduce(
      (acc, t) => {
        const convertedAmount = latestRates
          ? convertCurrency(
              t.amount,
              t.currency,
              preferredCurrency,
              latestRates
            )
          : t.amount;

        if (t.type === "EXPENSE") {
          acc.totalExpenses += convertedAmount;
        } else {
          acc.totalIncome += convertedAmount;
        }
        return acc;
      },
      { totalExpenses: 0, totalIncome: 0 }
    );

    // Savings can be negative (deficit) when expenses exceed income
    const savings = totals.totalIncome - totals.totalExpenses;
    const savingsPercentage =
      totals.totalIncome > 0
        ? Math.round((savings / totals.totalIncome) * 100)
        : 0;
    const spentPercentage =
      totals.totalIncome > 0
        ? Math.round((totals.totalExpenses / totals.totalIncome) * 100)
        : 0;

    return {
      totalIncome: totals.totalIncome,
      totalExpenses: totals.totalExpenses,
      savings,
      savingsPercentage,
      spentPercentage,
    };
  }, [transactions, latestRates, preferredCurrency]);

  return { data, isLoading, error, refetch };
}
