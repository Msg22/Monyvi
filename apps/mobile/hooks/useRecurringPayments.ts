/**
 * Hook to fetch, filter, and summarize recurring payments.
 *
 * Encapsulates:
 *  - WatermelonDB observation of the `recurring_payments` collection
 *  - Status-based filtering and counting
 *  - Currency-aware "Next 7 days" and "This month" expense summaries
 *  - Limit-based slicing for dashboard previews
 */

import {
  database,
  RecurringPayment,
  RecurringStatus,
  TransactionType,
  type CurrencyType,
} from "@monyvi/db";
import {
  calculateCalendarDaysUntil,
  convertCurrency,
  isInCurrentLocalMonth,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";
import { queryOwned } from "@/services/user-data-access";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseRecurringPaymentsOptions {
  readonly limit?: number;
  readonly status?: RecurringStatus;
  readonly type?: TransactionType;
  readonly dateRange?: { readonly start: Date; readonly end: Date };
  /** Changes when calendar-based results must be recalculated without a DB update. */
  readonly calendarRevision?: number;
}

interface UseRecurringPaymentsResult {
  readonly allPayments: readonly RecurringPayment[];
  readonly filteredPayments: readonly RecurringPayment[];
  readonly counts: Record<RecurringStatus, number>;
  readonly next7DaysTotal: number;
  readonly totalDueThisMonth: number;
  readonly totalDueFiltered: number;
  readonly totalIncomeThisMonth: number;
  readonly isLoading: boolean;
  readonly statusFilter: RecurringStatus;
  readonly setStatusFilter: (tab: RecurringStatus) => void;
}

export type { UseRecurringPaymentsOptions, UseRecurringPaymentsResult };

// ---------------------------------------------------------------------------
// Bills Period Filter
// ---------------------------------------------------------------------------

type BillsPeriodFilter = "this_week" | "this_month" | "six_months" | "one_year";

const RECURRING_PAYMENT_LIST_OBSERVED_COLUMNS = [
  "name",
  "amount",
  "currency",
  "type",
  "category_id",
  "account_id",
  "frequency",
  "next_due_date",
  "status",
] as const;

/**
 * Computes a date range (start, end) for a given bills period filter.
 * Start is always today (start of day). End is the last millisecond of the target period.
 */
function getBillsPeriodDateRange(period: BillsPeriodFilter): {
  readonly start: Date;
  readonly end: Date;
} {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);

  switch (period) {
    case "this_week": {
      const dayOfWeek = start.getDay();
      const daysUntilEndOfWeek = 6 - dayOfWeek;
      end.setDate(start.getDate() + daysUntilEndOfWeek);
      break;
    }
    case "this_month":
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // last day of current month
      break;
    case "six_months":
      end.setMonth(end.getMonth() + 6);
      break;
    case "one_year":
      end.setFullYear(end.getFullYear() + 1);
      break;
  }

  // Set end to end-of-day
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export { getBillsPeriodDateRange };
export type { BillsPeriodFilter };

// ---------------------------------------------------------------------------
// Hook
/**
 * Provides observed recurring payments and derived views, filters, counts, and currency-aware totals for UI consumption.
 *
 * @param options - Optional controls for the returned subset:
 *   - limit: maximum number of items in `filteredPayments`
 *   - status: initial status used for `statusFilter`
 *   - type: transaction type to restrict `filteredPayments`
 * @returns An object containing:
 *   - `allPayments`: all observed recurring payments from the database
 *   - `filteredPayments`: `allPayments` filtered by `statusFilter`, `limit`, and `type`
 *   - `counts`: number of payments grouped by `RecurringStatus` (`ACTIVE`, `PAUSED`, `COMPLETED`)
 *   - `next7DaysTotal`: sum of active expense amounts due within 0–7 days, converted to the user's preferred currency
 *   - `totalDueThisMonth`: sum of active expense amounts due this month, converted to the user's preferred currency
 *   - `totalIncomeThisMonth`: sum of active income amounts due this month, converted to the user's preferred currency
 *   - `isLoading`: `true` while initial data is loading
 *   - `statusFilter`: the currently selected `RecurringStatus` filter
 *   - `setStatusFilter`: function to update `statusFilter`
 */

export function useRecurringPayments(
  options: UseRecurringPaymentsOptions = {}
): UseRecurringPaymentsResult {
  const { limit, status, type, dateRange, calendarRevision } = options;

  const [allPayments, setAllPayments] = useState<RecurringPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RecurringStatus>(
    status || "ACTIVE"
  );
  const { latestRates, isLoading: isRatesLoading } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { userId, isResolvingUser } = useCurrentUser();

  // -------------------------------------------------------------------------
  // Observe recurring payments
  // -------------------------------------------------------------------------

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAllPayments([]);
        setIsLoading(true);
      },
      onSignedOut: () => {
        setAllPayments([]);
        setIsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setAllPayments([]);
        setIsLoading(true);

        const subscription = queryOwned(
          database.get<RecurringPayment>("recurring_payments"),
          currentUserId,
          Q.where("deleted", false),
          Q.sortBy("next_due_date", Q.asc)
        )
          .observeWithColumns([...RECURRING_PAYMENT_LIST_OBSERVED_COLUMNS])
          .subscribe({
            next: (result) => {
              setAllPayments(sortRecurringPaymentsByDueDate(result));
              setIsLoading(false);
            },
            error: (err) => {
              logger.error("recurringPayments.observe.failed", err);
              setIsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [userId, isResolvingUser]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  /** All payments matching status, type, and dateRange filters (NOT truncated by limit). */
  const matchingPayments = useMemo((): RecurringPayment[] => {
    let result: RecurringPayment[] = allPayments;
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (type) {
      result = result.filter((p) => p.type === type);
    }
    if (dateRange) {
      result = result.filter((p) => {
        const dueDate = p.nextDueDate;
        return dueDate >= dateRange.start && dueDate <= dateRange.end;
      });
    }
    return result;
  }, [allPayments, statusFilter, type, dateRange]);

  /** Payments sliced by limit for dashboard preview display. */
  const filteredPayments = useMemo(
    (): RecurringPayment[] =>
      limit ? matchingPayments.slice(0, limit) : matchingPayments,
    [matchingPayments, limit]
  );

  const counts = useMemo<Record<RecurringStatus, number>>(
    () => ({
      ACTIVE: allPayments.filter((p) => p.isActive).length,
      PAUSED: allPayments.filter((p) => p.isPaused).length,
      COMPLETED: allPayments.filter((p) => p.isCompleted).length,
    }),
    [allPayments]
  );

  /** Convert a payment amount to the user's preferred currency. */
  const toPreferred = useCallback(
    (amount: number, currency: CurrencyType): number => {
      if (!latestRates) {
        throw new Error("MARKET_RATES_NOT_READY");
      }
      return convertCurrency(amount, currency, preferredCurrency, latestRates);
    },
    [latestRates, preferredCurrency]
  );

  const { next7DaysTotal, totalDueThisMonth, totalIncomeThisMonth } =
    useMemo(() => {
      if (!latestRates) {
        return {
          next7DaysTotal: 0,
          totalDueThisMonth: 0,
          totalIncomeThisMonth: 0,
        };
      }
      const activeExpenses = allPayments.filter(
        (p) => p.isActive && p.isExpense
      );
      const activeIncome = allPayments.filter((p) => p.isActive && p.isIncome);

      const dueNext7Days = getNext7DaysTotal(activeExpenses, toPreferred);
      const dueThisMonth = getThisMonthTotal(activeExpenses, toPreferred);
      const incomeThisMonth = getThisMonthTotal(activeIncome, toPreferred);

      return {
        next7DaysTotal: dueNext7Days,
        totalDueThisMonth: dueThisMonth,
        totalIncomeThisMonth: incomeThisMonth,
      };
    }, [allPayments, calendarRevision, latestRates, toPreferred]);

  /** Total due for filtered period, computed from the FULL matching set (not limit-truncated). */
  const totalDueFiltered = useMemo((): number => {
    if (!latestRates) return 0;
    if (!dateRange) return totalDueThisMonth;
    return matchingPayments
      .filter((p) => p.isExpense)
      .reduce((sum, p) => sum + toPreferred(p.amount, p.currency), 0);
  }, [
    matchingPayments,
    dateRange,
    latestRates,
    totalDueThisMonth,
    toPreferred,
  ]);

  return {
    allPayments,
    filteredPayments,
    counts,
    next7DaysTotal,
    totalDueThisMonth,
    totalDueFiltered,
    totalIncomeThisMonth,
    isLoading: isLoading || isRatesLoading,
    statusFilter,
    setStatusFilter,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
/**
 * Calculates the total amount, converted to the preferred currency, of active expense payments due within the next seven days.
 *
 * @param activeExpenses - Active expense recurring payments to consider
 * @param toPreferred - Function that converts an amount from the payment's currency to the user's preferred currency
 * @returns The sum, in the preferred currency, of amounts due in 0 to 7 local calendar days
 */

function getNext7DaysTotal(
  activeExpenses: RecurringPayment[],
  toPreferred: (amount: number, currency: CurrencyType) => number
): number {
  return activeExpenses
    .filter((p) => {
      const daysUntilDue = calculateCalendarDaysUntil(p.nextDueDate);
      return daysUntilDue >= 0 && daysUntilDue <= 7;
    })
    .reduce((sum, p) => sum + toPreferred(p.amount, p.currency), 0);
}

/**
 * Calculate the total amount due this month across the provided recurring payments, expressed in the user's preferred currency.
 *
 * @param payments - Recurring payments to include in the aggregation
 * @param toPreferred - Function that converts an amount and its currency to the user's preferred currency
 * @returns The sum of amounts due in the current local calendar month, converted to the preferred currency
 */
function getThisMonthTotal(
  payments: RecurringPayment[],
  toPreferred: (amount: number, currency: CurrencyType) => number
): number {
  return payments
    .filter((p) => isInCurrentLocalMonth(p.nextDueDate))
    .reduce((sum, p) => sum + toPreferred(p.amount, p.currency), 0);
}

function sortRecurringPaymentsByDueDate(
  payments: readonly RecurringPayment[]
): RecurringPayment[] {
  return [...payments].sort(
    (first, second) =>
      first.nextDueDate.getTime() - second.nextDueDate.getTime()
  );
}
