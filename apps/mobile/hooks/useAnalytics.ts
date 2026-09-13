/**
 * useAnalytics Hooks
 * Local-first analytics facades backed by mobile read-model services.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  CurrencyType,
  Transaction,
  TransactionType,
} from "@monyvi/db";
import type {
  CategoryBreakdown,
  ChartDataPoint,
  ComparisonResult,
  MonthlySummary,
} from "@monyvi/logic";

import {
  buildCategoryBreakdown,
  buildComparison,
  buildMonthlyChartData,
  buildMonthlySummaries,
  observeCategoryBreakdownSources,
  observeComparisonTransactions,
  observeMonthlyChartTransactions,
  observeMonthlySummaryTransactions,
} from "@/services/analytics-read-model-service";
import { logger } from "@/utils/logger";
import { useCurrentUser } from "./useCurrentUser";

interface UseAnalyticsResult<T> {
  data: T;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface YearMonthPeriod {
  readonly year: number;
  readonly month: number;
}

const MAX_PERIOD_CHECK_DELAY_MS = 24 * 60 * 60 * 1000;

export function useMonthlyChartData(
  months: number = 12,
  accountIds?: string[],
  type: TransactionType = "EXPENSE",
  currency?: CurrencyType
): UseAnalyticsResult<ChartDataPoint[]> {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();
  const accountIdsString = useAccountIdsKey(accountIds);
  const selectedAccountIds = useSelectedAccountIds(accountIdsString);

  const refetch = (): void => {
    setRefreshKey((prev) => prev + 1);
  };

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

    const query = observeMonthlyChartTransactions({
      userId,
      months,
      type,
      accountIds: selectedAccountIds,
      ...(currency ? { currency } : {}),
    });
    const subscription = query.observe().subscribe({
      next: (result) => {
        setTransactions(result);
        setIsLoading(false);
      },
      error: (err: unknown) => {
        logger.error("analytics.monthlyChart.observe.failed", err);
        setError(toError(err));
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [
    months,
    type,
    currency,
    accountIdsString,
    refreshKey,
    userId,
    isResolvingUser,
    selectedAccountIds,
  ]);

  const data = useMemo(
    (): ChartDataPoint[] =>
      buildMonthlyChartData(transactions, { months, type }),
    [transactions, months, type]
  );

  return { data, isLoading, error, refetch };
}

export function useCategoryBreakdown(
  year: number,
  month: number,
  accountIds?: string[],
  currency?: CurrencyType
): UseAnalyticsResult<CategoryBreakdown[]> {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();
  const accountIdsString = useAccountIdsKey(accountIds);
  const selectedAccountIds = useSelectedAccountIds(accountIdsString);

  const refetch = (): void => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (isResolvingUser) {
      setTransactions([]);
      setCategories([]);
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setTransactions([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { transactionsQuery, categoriesQuery } =
      observeCategoryBreakdownSources({
        userId,
        year,
        month,
        accountIds: selectedAccountIds,
        ...(currency ? { currency } : {}),
      });

    const transactionsSub = transactionsQuery.observe().subscribe({
      next: (result) => setTransactions(result),
      error: (err: unknown) => {
        logger.error("analytics.categoryTransactions.observe.failed", err);
        setError(toError(err));
        setIsLoading(false);
      },
    });
    const categoriesSub = categoriesQuery.observe().subscribe({
      next: (result) => {
        setCategories(result);
        setIsLoading(false);
      },
      error: (err: unknown) => {
        logger.error("analytics.categories.observe.failed", err);
        setError(toError(err));
        setIsLoading(false);
      },
    });

    return () => {
      transactionsSub.unsubscribe();
      categoriesSub.unsubscribe();
    };
  }, [
    year,
    month,
    currency,
    accountIdsString,
    refreshKey,
    userId,
    isResolvingUser,
    selectedAccountIds,
  ]);

  const data = useMemo(
    (): CategoryBreakdown[] => buildCategoryBreakdown(transactions, categories),
    [transactions, categories]
  );

  return { data, isLoading, error, refetch };
}

export function useComparison(
  type: "mom" | "yoy",
  year?: number,
  month?: number,
  accountIds?: string[],
  currency?: CurrencyType
): UseAnalyticsResult<ComparisonResult> {
  const [currentTransactions, setCurrentTransactions] = useState<Transaction[]>(
    []
  );
  const [previousTransactions, setPreviousTransactions] = useState<
    Transaction[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();
  const accountIdsString = useAccountIdsKey(accountIds);
  const selectedAccountIds = useSelectedAccountIds(accountIdsString);
  const targetPeriod = useComparisonTargetPeriod(year, month);

  const refetch = (): void => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (isResolvingUser) {
      setCurrentTransactions([]);
      setPreviousTransactions([]);
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setCurrentTransactions([]);
      setPreviousTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { currentQuery, previousQuery } = observeComparisonTransactions({
      userId,
      type,
      year: targetPeriod.year,
      month: targetPeriod.month,
      accountIds: selectedAccountIds,
      ...(currency ? { currency } : {}),
    });
    const currentSub = currentQuery.observe().subscribe({
      next: (result) => setCurrentTransactions(result),
      error: (err: unknown) => {
        logger.error("analytics.currentPeriod.observe.failed", err);
        setError(toError(err));
        setIsLoading(false);
      },
    });
    const previousSub = previousQuery.observe().subscribe({
      next: (result) => {
        setPreviousTransactions(result);
        setIsLoading(false);
      },
      error: (err: unknown) => {
        logger.error("analytics.previousPeriod.observe.failed", err);
        setError(toError(err));
        setIsLoading(false);
      },
    });

    return () => {
      currentSub.unsubscribe();
      previousSub.unsubscribe();
    };
  }, [
    type,
    currency,
    targetPeriod.year,
    targetPeriod.month,
    accountIdsString,
    refreshKey,
    userId,
    isResolvingUser,
    selectedAccountIds,
  ]);

  const data = useMemo(
    (): ComparisonResult =>
      buildComparison(currentTransactions, previousTransactions),
    [currentTransactions, previousTransactions]
  );

  return { data, isLoading, error, refetch };
}

export function useMonthlySummaries(
  months: number = 12,
  accountIds?: string[],
  currency?: CurrencyType
): UseAnalyticsResult<MonthlySummary[]> {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();
  const accountIdsString = useAccountIdsKey(accountIds);
  const selectedAccountIds = useSelectedAccountIds(accountIdsString);

  const refetch = (): void => {
    setRefreshKey((prev) => prev + 1);
  };

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

    const query = observeMonthlySummaryTransactions({
      userId,
      months,
      accountIds: selectedAccountIds,
      ...(currency ? { currency } : {}),
    });
    const subscription = query.observe().subscribe({
      next: (result) => {
        setTransactions(result);
        setIsLoading(false);
      },
      error: (err: unknown) => {
        logger.error("analytics.monthlySummaries.observe.failed", err);
        setError(toError(err));
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [
    months,
    currency,
    accountIdsString,
    refreshKey,
    userId,
    isResolvingUser,
    selectedAccountIds,
  ]);

  const data = useMemo(
    (): MonthlySummary[] => buildMonthlySummaries(transactions, { months }),
    [transactions, months]
  );

  return { data, isLoading, error, refetch };
}

function useAccountIdsKey(accountIds: readonly string[] | undefined): string {
  return useMemo(() => accountIds?.join(",") ?? "", [accountIds]);
}

function useSelectedAccountIds(accountIdsString: string): readonly string[] {
  return useMemo(
    () => (accountIdsString.length > 0 ? accountIdsString.split(",") : []),
    [accountIdsString]
  );
}

function useComparisonTargetPeriod(
  year: number | undefined,
  month: number | undefined
): YearMonthPeriod {
  const [currentPeriod, setCurrentPeriod] =
    useState<YearMonthPeriod>(getCurrentYearMonth);

  useEffect(() => {
    if (year !== undefined && month !== undefined) {
      return;
    }

    setCurrentPeriod((prev) => {
      const next = getCurrentYearMonth();
      if (prev.year === next.year && prev.month === next.month) {
        return prev;
      }

      return next;
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    setCurrentPeriod((prev) => {
      const next = getCurrentYearMonth();
      if (prev.year === next.year && prev.month === next.month) {
        return prev;
      }

      return next;
    });

    const scheduleNextCheck = (): void => {
      timeoutId = setTimeout(() => {
        if (!isActive) {
          return;
        }

        setCurrentPeriod((prev) => {
          const next = getCurrentYearMonth();
          if (prev.year === next.year && prev.month === next.month) {
            return prev;
          }

          return next;
        });
        scheduleNextCheck();
      }, getDelayUntilNextPeriodCheck());
    };

    scheduleNextCheck();

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [year, month]);

  return useMemo(
    () => ({
      year: year ?? currentPeriod.year,
      month: month ?? currentPeriod.month,
    }),
    [year, month, currentPeriod]
  );
}

function getCurrentYearMonth(): YearMonthPeriod {
  const now = new Date();

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

function getDelayUntilNextPeriodCheck(): number {
  const now = new Date();
  const nextMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  ).getTime();
  const delayUntilNextMonth = nextMonthStart - now.getTime() + 1;

  return Math.max(1, Math.min(delayUntilNextMonth, MAX_PERIOD_CHECK_DELAY_MS));
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
