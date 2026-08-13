/**
 * useBudgets Hook
 *
 * Observes all active/non-deleted budgets, computes spending per budget, and
 * supports period filtering. Lifecycle mutations, such as pausing expired
 * custom budgets, are explicit service commands invoked by containers.
 *
 * @module useBudgets
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Budget } from "@monyvi/db";
import type { PeriodFilter } from "@/components/budget/PeriodFilterChips";
import {
  buildBudgetListReadModel,
  buildBudgetMetrics,
  observeBudgetList,
  type BudgetWithMetrics,
} from "@/services/budget-list-read-model-service";
import { logger } from "@/utils/logger";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

export type { BudgetWithMetrics } from "@/services/budget-list-read-model-service";

// =============================================================================
// TYPES
// =============================================================================

interface UseBudgetsResult {
  /** All budgets with computed metrics, filtered by period */
  readonly budgets: readonly BudgetWithMetrics[];
  /** The global budget (if any) */
  readonly globalBudget: BudgetWithMetrics | undefined;
  /** Active and paused category budgets */
  readonly categoryBudgets: readonly BudgetWithMetrics[];
  /** Paused budgets */
  readonly pausedBudgets: readonly BudgetWithMetrics[];
  /** Whether data is loading */
  readonly isLoading: boolean;
  /** Total unfiltered budget count (for distinguishing empty vs filtered-empty) */
  readonly totalCount: number;
  /** Selected period filter */
  readonly periodFilter: PeriodFilter;
  /** Update the period filter */
  readonly setPeriodFilter: (filter: PeriodFilter) => void;
  /** Force refresh spending calculations */
  readonly refresh: () => void;
  /** Changes when budget fields relevant to lifecycle auto-pause change */
  readonly autoPauseCheckKey: string;
}

// =============================================================================
// HOOK
// =============================================================================

export function useBudgets(): UseBudgetsResult {
  const [rawBudgets, setRawBudgets] = useState<Budget[]>([]);
  const [budgetsWithMetrics, setBudgetsWithMetrics] = useState<
    readonly BudgetWithMetrics[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("ALL");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setRawBudgets([]);
        setBudgetsWithMetrics([]);
        setIsLoading(true);
      },
      onSignedOut: () => {
        setRawBudgets([]);
        setBudgetsWithMetrics([]);
        setIsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        const subscription = observeBudgetList(currentUserId)
          .observe()
          .subscribe({
            next: (budgets) => {
              setRawBudgets(budgets);
            },
            error: (error: unknown) => {
              logger.error("budgets.observe.failed", error);
              setRawBudgets([]);
              setBudgetsWithMetrics([]);
              setIsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [userId, isResolvingUser]);

  useEffect(() => {
    let cancelled = false;

    async function computeAll(): Promise<void> {
      setIsLoading(true);

      try {
        const results = await buildBudgetMetrics(rawBudgets);

        if (!cancelled) {
          setBudgetsWithMetrics(results);
          setIsLoading(false);
        }
      } catch (error: unknown) {
        logger.error("budgets.readModel.failed", error);

        if (!cancelled) {
          setBudgetsWithMetrics([]);
          setIsLoading(false);
        }
      }
    }

    void computeAll();

    return () => {
      cancelled = true;
    };
  }, [rawBudgets, refreshCounter]);

  const readModel = useMemo(
    () => buildBudgetListReadModel(budgetsWithMetrics, periodFilter),
    [budgetsWithMetrics, periodFilter]
  );

  const autoPauseCheckKey = useMemo(
    () =>
      rawBudgets
        .map((budget) =>
          [
            budget.id,
            budget.status,
            budget.period,
            budget.periodEnd?.getTime() ?? "none",
          ].join(":")
        )
        .join("|"),
    [rawBudgets]
  );

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  return {
    budgets: readModel.budgets,
    globalBudget: readModel.globalBudget,
    categoryBudgets: readModel.categoryBudgets,
    pausedBudgets: readModel.pausedBudgets,
    isLoading,
    totalCount: readModel.totalCount,
    periodFilter,
    setPeriodFilter,
    refresh,
    autoPauseCheckKey,
  };
}
