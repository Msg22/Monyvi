import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Budget } from "@monyvi/db";
import { useTranslation } from "react-i18next";

import type { PeriodFilter } from "@/components/budget/PeriodFilterChips";
import {
  useAllCategories,
  useCategoryLookup,
} from "@/context/CategoriesContext";
import {
  buildBudgetDashboardReadModel,
  buildBudgetMetrics,
  observeBudgetList,
  type BudgetDashboardItem,
  type BudgetDashboardReadModel,
  type BudgetWithMetrics,
} from "@/services/budget-list-read-model-service";
import { logger } from "@/utils/logger";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

export type {
  BudgetDashboardItem,
  BudgetDashboardReadModel,
  BudgetWithMetrics,
} from "@/services/budget-list-read-model-service";

const EMPTY_DASHBOARD_READ_MODEL: BudgetDashboardReadModel = Object.freeze({
  overallBudgets: Object.freeze([]),
  needsAttentionBudgets: Object.freeze([]),
  categoryBudgets: Object.freeze([]),
  pausedBudgets: Object.freeze([]),
  totalCount: 0,
  matchingCount: 0,
});

interface ComputedBudgets {
  readonly source: readonly Budget[];
  readonly metrics: readonly BudgetWithMetrics[];
  readonly refreshGeneration: number;
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const BUDGET_LIST_OBSERVED_COLUMNS = [
  "name",
  "type",
  "category_id",
  "amount",
  "currency",
  "period",
  "period_start",
  "period_end",
  "alert_threshold",
  "status",
  "pause_intervals",
  "paused_at",
];

function getNextExpiryDelayMs(
  budgets: readonly Budget[],
  now: Date
): number | null {
  let nextDelay: number | null = null;

  for (const budget of budgets) {
    if (budget.period !== "CUSTOM" || !budget.periodEnd) continue;
    const boundary = new Date(budget.periodEnd);
    boundary.setHours(23, 59, 59, 999);
    const delay = boundary.getTime() + 1 - now.getTime();
    if (delay <= 0) continue;
    nextDelay = nextDelay === null ? delay : Math.min(nextDelay, delay);
  }

  return nextDelay === null ? null : Math.min(nextDelay, MAX_TIMER_DELAY_MS);
}

export interface UseBudgetsResult {
  readonly readModel: BudgetDashboardReadModel;
  readonly overallBudgets: readonly BudgetDashboardItem[];
  readonly needsAttentionBudgets: readonly BudgetDashboardItem[];
  readonly categoryBudgets: readonly BudgetDashboardItem[];
  readonly pausedBudgets: readonly BudgetDashboardItem[];
  readonly budgets: readonly BudgetDashboardItem[];
  readonly totalCount: number;
  readonly matchingCount: number;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isLoading: boolean;
  readonly errorKey: "dashboard_load_error" | null;
  readonly hasValidData: boolean;
  readonly periodFilter: PeriodFilter;
  readonly setPeriodFilter: (filter: PeriodFilter) => void;
  readonly refresh: () => void;
  readonly retry: () => void;
  readonly autoPauseCheckKey: string;
}

function resolveActiveLocale(language: string | undefined): "en" | "ar" {
  return language?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function useBudgets(): UseBudgetsResult {
  const [rawBudgets, setRawBudgets] = useState<readonly Budget[]>([]);
  const [computedBudgets, setComputedBudgets] =
    useState<ComputedBudgets | null>(null);
  const [readModel, setReadModel] = useState<BudgetDashboardReadModel>(
    EMPTY_DASHBOARD_READ_MODEL
  );
  const [hasObservedBudgets, setHasObservedBudgets] = useState(false);
  const [hasValidData, setHasValidData] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [errorKey, setErrorKey] = useState<"dashboard_load_error" | null>(null);
  const [periodFilter, setPeriodFilterState] = useState<PeriodFilter>("ALL");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [observationRetryCounter, setObservationRetryCounter] = useState(0);
  const [lifecycleClockRevision, setLifecycleClockRevision] = useState(0);
  const refreshGenerationRef = useRef(0);
  const { userId, isResolvingUser } = useCurrentUser();
  const categoryMap = useCategoryLookup();
  const { isLoading: areCategoriesLoading } = useAllCategories();
  const { i18n, t } = useTranslation("budgets");
  const activeLocale = resolveActiveLocale(i18n.resolvedLanguage);

  const clearScopedState = useCallback((isLoading: boolean): void => {
    setRawBudgets([]);
    setComputedBudgets(null);
    setReadModel(EMPTY_DASHBOARD_READ_MODEL);
    setHasObservedBudgets(false);
    setHasValidData(false);
    setIsComputing(isLoading);
    setErrorKey(null);
  }, []);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => clearScopedState(true),
      onSignedOut: () => clearScopedState(false),
      onAuthenticated: (currentUserId) => {
        setHasObservedBudgets(false);
        setIsComputing(true);
        setErrorKey(null);

        const subscription = observeBudgetList(currentUserId)
          .observeWithColumns(BUDGET_LIST_OBSERVED_COLUMNS)
          .subscribe({
            next: (budgets) => {
              setRawBudgets(budgets);
              setHasObservedBudgets(true);
              setIsComputing(true);
            },
            error: (error: unknown) => {
              logger.error("budgets.observe.failed", error);
              setHasObservedBudgets(false);
              setIsComputing(false);
              setErrorKey("dashboard_load_error");
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [clearScopedState, isResolvingUser, observationRetryCounter, userId]);

  useEffect(() => {
    if (!userId || isResolvingUser || !hasObservedBudgets) {
      return;
    }

    let isCurrent = true;

    async function computeMetrics(): Promise<void> {
      setIsComputing(true);

      try {
        const metrics = await buildBudgetMetrics(rawBudgets);
        if (isCurrent) {
          setComputedBudgets({
            source: rawBudgets,
            metrics,
            refreshGeneration: refreshCounter,
          });
        }
      } catch (error: unknown) {
        logger.error("budgets.readModel.failed", error);
        if (isCurrent) {
          setIsComputing(false);
          setErrorKey("dashboard_load_error");
        }
      }
    }

    void computeMetrics();

    return () => {
      isCurrent = false;
    };
  }, [hasObservedBudgets, isResolvingUser, rawBudgets, refreshCounter, userId]);

  useEffect(() => {
    if (
      !userId ||
      isResolvingUser ||
      !computedBudgets ||
      computedBudgets.source !== rawBudgets ||
      areCategoriesLoading
    ) {
      return;
    }

    try {
      const nextReadModel = buildBudgetDashboardReadModel({
        budgets: computedBudgets.metrics,
        categoryMap,
        filter: periodFilter,
        now: new Date(),
        activeLocale,
        fallbackName: t("unnamed_budget"),
      });
      setReadModel(nextReadModel);
      setHasValidData(true);
      setIsComputing(false);
      if (computedBudgets.refreshGeneration === refreshGenerationRef.current) {
        setErrorKey(null);
      }
    } catch (error: unknown) {
      logger.error("budgets.readModel.failed", error);
      setIsComputing(false);
      setErrorKey("dashboard_load_error");
    }
  }, [
    activeLocale,
    areCategoriesLoading,
    categoryMap,
    computedBudgets,
    isResolvingUser,
    lifecycleClockRevision,
    periodFilter,
    rawBudgets,
    t,
    userId,
  ]);

  useEffect(() => {
    const delay = getNextExpiryDelayMs(rawBudgets, new Date());
    if (delay === null) return;

    const timer = setTimeout(() => {
      setLifecycleClockRevision((revision) => revision + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [lifecycleClockRevision, rawBudgets]);

  const setPeriodFilter = useCallback((filter: PeriodFilter): void => {
    setIsComputing(true);
    setPeriodFilterState(filter);
  }, []);

  const refresh = useCallback((): void => {
    setIsComputing(true);
    refreshGenerationRef.current += 1;
    setRefreshCounter(refreshGenerationRef.current);
  }, []);

  const retry = useCallback((): void => {
    setIsComputing(true);
    setHasObservedBudgets(false);
    setObservationRetryCounter((counter) => counter + 1);
    refreshGenerationRef.current += 1;
    setRefreshCounter(refreshGenerationRef.current);
  }, []);

  const allMatchingBudgets = useMemo(
    () =>
      Object.freeze([
        ...readModel.overallBudgets,
        ...readModel.needsAttentionBudgets,
        ...readModel.categoryBudgets,
        ...readModel.pausedBudgets,
      ]),
    [readModel]
  );

  const autoPauseCheckKey = useMemo(
    () =>
      [
        lifecycleClockRevision,
        ...rawBudgets.map((budget) =>
          [
            budget.id,
            budget.status,
            budget.period,
            budget.periodEnd?.getTime() ?? "none",
          ].join(":")
        ),
      ].join("|"),
    [lifecycleClockRevision, rawBudgets]
  );

  const isInitialLoading =
    isResolvingUser ||
    (Boolean(userId) &&
      errorKey === null &&
      (areCategoriesLoading ||
        (!hasValidData && (!hasObservedBudgets || isComputing))));

  return {
    readModel,
    overallBudgets: readModel.overallBudgets,
    needsAttentionBudgets: readModel.needsAttentionBudgets,
    categoryBudgets: readModel.categoryBudgets,
    pausedBudgets: readModel.pausedBudgets,
    budgets: allMatchingBudgets,
    totalCount: readModel.totalCount,
    matchingCount: readModel.matchingCount,
    isInitialLoading,
    isRefreshing: hasValidData && isComputing,
    isLoading: isInitialLoading,
    errorKey,
    hasValidData,
    periodFilter,
    setPeriodFilter,
    refresh,
    retry,
    autoPauseCheckKey,
  };
}
