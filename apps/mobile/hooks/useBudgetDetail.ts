import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { Budget } from "@monyvi/db";

import type {
  BudgetDetailErrorKey,
  BudgetDetailReadModel,
} from "@/contracts/budget-detail-presentation";
import { observeBudgetDetailReadModels } from "@/services/budget-detail-observation-service";
import { logger } from "@/utils/logger";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface BudgetDetailState {
  readonly budget: Budget | null;
  readonly readModel: BudgetDetailReadModel | null;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isNotFound: boolean;
  readonly errorKey: BudgetDetailErrorKey | null;
}

export interface UseBudgetDetailResult extends BudgetDetailState {
  readonly hasValidData: boolean;
  readonly retry: () => void;
  readonly isLoading: boolean;
  readonly metrics: BudgetDetailReadModel["metrics"] | null;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly weeklySpending: BudgetDetailReadModel["weeklySpending"];
  readonly subcategoryBreakdown: NonNullable<
    BudgetDetailReadModel["categoryBreakdown"]
  >;
  readonly recentTransactions: BudgetDetailReadModel["recentTransactions"];
}

const SIGNED_OUT_STATE: BudgetDetailState = {
  budget: null,
  readModel: null,
  isInitialLoading: false,
  isRefreshing: false,
  isNotFound: false,
  errorKey: null,
};

const INITIAL_STATE: BudgetDetailState = {
  ...SIGNED_OUT_STATE,
  isInitialLoading: true,
};

export function useBudgetDetail(
  budgetId: string | undefined
): UseBudgetDetailResult {
  const [state, setState] = useState<BudgetDetailState>(INITIAL_STATE);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const generationRef = useRef(0);
  const hasFocusedRef = useRef(false);
  const activeRequestRef = useRef<{
    readonly userId: string;
    readonly budgetId: string;
  } | null>(null);
  const { userId, isResolvingUser } = useCurrentUser();

  const requestRefresh = useCallback((): void => {
    setRefreshRevision((revision) => revision + 1);
  }, []);

  useFocusEffect(
    useCallback((): void => {
      if (hasFocusedRef.current) requestRefresh();
      else hasFocusedRef.current = true;
    }, [requestRefresh])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") requestRefresh();
    });
    return () => subscription.remove();
  }, [requestRefresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextDay = (): void => {
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 0, 0);
      timer = setTimeout(
        () => {
          requestRefresh();
          scheduleNextDay();
        },
        Math.max(1, nextDay.getTime() - now.getTime())
      );
    };
    scheduleNextDay();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [requestRefresh]);

  useEffect(() => {
    const generation = ++generationRef.current;
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    const clear = (nextState: BudgetDetailState): void => {
      if (!isActive || generation !== generationRef.current) return;
      setState(nextState);
    };

    const cleanup = runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => clear(INITIAL_STATE),
      onSignedOut: () => {
        activeRequestRef.current = null;
        clear(SIGNED_OUT_STATE);
      },
      onAuthenticated: (currentUserId) => {
        if (!budgetId) {
          activeRequestRef.current = null;
          clear({ ...SIGNED_OUT_STATE, isNotFound: true });
          return;
        }
        const previousRequest = activeRequestRef.current;
        const isSameRequest =
          previousRequest?.userId === currentUserId &&
          previousRequest.budgetId === budgetId;
        activeRequestRef.current = {
          userId: currentUserId,
          budgetId,
        };
        if (isSameRequest) {
          setState((previous) => ({
            ...previous,
            isInitialLoading: previous.readModel === null,
            isRefreshing: previous.readModel !== null,
            isNotFound: false,
            errorKey: null,
          }));
        } else {
          clear(INITIAL_STATE);
        }

        void (async (): Promise<void> => {
          try {
            const observation = await observeBudgetDetailReadModels({
              budgetId,
              userId: currentUserId,
              getNow: () => new Date(),
            });
            if (!isActive || generation !== generationRef.current) return;
            const subscription = observation.subscribe({
              next: (value): void => {
                if (!isActive || generation !== generationRef.current) return;
                if (!value) {
                  setState({
                    ...SIGNED_OUT_STATE,
                    isNotFound: true,
                  });
                  return;
                }
                setState({
                  budget: value.budget,
                  readModel: value.readModel,
                  isInitialLoading: false,
                  isRefreshing: false,
                  isNotFound: false,
                  errorKey: null,
                });
              },
              error: (error): void => {
                if (!isActive || generation !== generationRef.current) return;
                logger.error("budgetDetail.observe.failed", error, {
                  budgetId,
                });
                setState((previous) => ({
                  ...previous,
                  isInitialLoading: false,
                  isRefreshing: false,
                  errorKey: previous.readModel
                    ? "budget_detail_refresh_failed"
                    : "budget_detail_load_failed",
                }));
              },
            });
            unsubscribe = (): void => subscription.unsubscribe();
          } catch (error: unknown) {
            if (!isActive || generation !== generationRef.current) return;
            logger.error("budgetDetail.observe.failed", error, { budgetId });
            setState((previous) => ({
              ...previous,
              isInitialLoading: false,
              isRefreshing: false,
              errorKey: previous.readModel
                ? "budget_detail_refresh_failed"
                : "budget_detail_load_failed",
            }));
          }
        })();

        return () => unsubscribe?.();
      },
    });

    return () => {
      isActive = false;
      generationRef.current += 1;
      cleanup?.();
    };
  }, [budgetId, isResolvingUser, refreshRevision, userId]);

  const readModel = state.readModel;
  return {
    ...state,
    hasValidData: readModel !== null,
    retry: requestRefresh,
    isLoading: state.isInitialLoading,
    metrics: readModel?.metrics ?? null,
    daysLeft: readModel?.daysLeft ?? 0,
    daysElapsed: readModel?.daysElapsed ?? 1,
    weeklySpending: readModel?.weeklySpending ?? [],
    subcategoryBreakdown: readModel?.categoryBreakdown ?? [],
    recentTransactions: readModel?.recentTransactions ?? [],
  };
}
