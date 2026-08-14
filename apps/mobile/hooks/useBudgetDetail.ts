/**
 * useBudgetDetail Hook
 *
 * Observes a single scoped budget and delegates detail aggregation to the
 * budget detail read-model service.
 *
 * @module useBudgetDetail
 */

import { useEffect, useState } from "react";
import { database, type Budget, type Transaction } from "@monyvi/db";
import type { SpendingMetrics } from "@monyvi/logic";

import {
  getBudgetDetailReadModel,
  type SubcategorySpending,
  type WeeklySpendingData,
} from "@/services/budget-detail-read-model-service";
import { observeOwnedById } from "@/services/user-data-access";
import { logger } from "@/utils/logger";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface UseBudgetDetailResult {
  readonly budget: Budget | null;
  readonly metrics: SpendingMetrics | null;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly weeklySpending: readonly WeeklySpendingData[];
  readonly subcategoryBreakdown: readonly SubcategorySpending[];
  readonly recentTransactions: readonly Transaction[];
  readonly isLoading: boolean;
}

interface BudgetDetailState {
  readonly metrics: SpendingMetrics | null;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly weeklySpending: readonly WeeklySpendingData[];
  readonly subcategoryBreakdown: readonly SubcategorySpending[];
  readonly recentTransactions: readonly Transaction[];
  readonly isLoading: boolean;
}

const EMPTY_DETAIL_STATE: BudgetDetailState = {
  metrics: null,
  daysLeft: 0,
  daysElapsed: 1,
  weeklySpending: [],
  subcategoryBreakdown: [],
  recentTransactions: [],
  isLoading: false,
};

export function useBudgetDetail(budgetId: string): UseBudgetDetailResult {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [observedRevision, setObservedRevision] = useState(0);
  const [state, setState] = useState<BudgetDetailState>({
    ...EMPTY_DETAIL_STATE,
    isLoading: true,
  });
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (!budgetId) return;

    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setBudget(null);
        setObservedRevision(0);
        setState((prev) => ({ ...prev, isLoading: true }));
      },
      onSignedOut: () => {
        setBudget(null);
        setObservedRevision(0);
        setState(EMPTY_DETAIL_STATE);
      },
      onAuthenticated: (currentUserId) => {
        const subscription = observeOwnedById<Budget>(
          database.get<Budget>("budgets"),
          budgetId,
          currentUserId
        ).subscribe({
          next: (observedBudget) => {
            setBudget(observedBudget);
            setObservedRevision((revision) => revision + 1);
          },
          error: (err: unknown) => {
            logger.error("budgetDetail.budget.observe.failed", err);
            setBudget(null);
            setState(EMPTY_DETAIL_STATE);
          },
        });

        return () => subscription.unsubscribe();
      },
    });
  }, [budgetId, userId, isResolvingUser]);

  useEffect(() => {
    if (!budget) return;
    const currentBudget = budget;
    let cancelled = false;

    async function compute(): Promise<void> {
      setState((previous) =>
        previous.metrics ? previous : { ...previous, isLoading: true }
      );

      try {
        const detail = await getBudgetDetailReadModel(currentBudget);

        if (!cancelled) {
          setState({
            ...detail,
            isLoading: false,
          });
        }
      } catch (error: unknown) {
        logger.error("budgetDetail.compute.failed", error);
        if (!cancelled) {
          setState((previous) =>
            previous.metrics
              ? { ...previous, isLoading: false }
              : EMPTY_DETAIL_STATE
          );
        }
      }
    }

    void compute();

    return () => {
      cancelled = true;
    };
  }, [budget, observedRevision]);

  return {
    budget,
    metrics: state.metrics,
    daysLeft: state.daysLeft,
    daysElapsed: state.daysElapsed,
    weeklySpending: state.weeklySpending,
    subcategoryBreakdown: state.subcategoryBreakdown,
    recentTransactions: state.recentTransactions,
    isLoading: state.isLoading,
  };
}
