import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Budget, CurrencyType } from "@monyvi/db";
import { useTranslation } from "react-i18next";

import {
  useAllCategories,
  useCategoryLookup,
} from "@/context/CategoriesContext";
import {
  type BudgetDashboardItem,
  type BudgetDashboardFilters,
  type BudgetDashboardPeriodFilter,
  type BudgetDashboardPresentationCopy,
  type BudgetDashboardReadModel,
  type BudgetDashboardScopeFilter,
  type BudgetDashboardStatusFilter,
} from "@/contracts/budget-dashboard";
import {
  buildBudgetDashboardReadModel,
  buildBudgetMetrics,
  observeBudgetList,
  observeBudgetSpendingChanges,
  type BudgetWithMetrics,
} from "@/services/budget-list-read-model-service";
import { logger } from "@/utils/logger";
import {
  clearBudgetDashboardFilterSession,
  DEFAULT_BUDGET_DASHBOARD_FILTERS,
  readBudgetDashboardFilterSession,
  resetBudgetDashboardFilterSession,
  writeBudgetDashboardFilterSession,
} from "./budget-dashboard-filter-session";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

export type {
  BudgetDashboardItem,
  BudgetDashboardReadModel,
  BudgetWithMetrics,
} from "@/services/budget-list-read-model-service";

const EMPTY_DASHBOARD_READ_MODEL: BudgetDashboardReadModel = Object.freeze({
  filters: DEFAULT_BUDGET_DASHBOARD_FILTERS,
  items: Object.freeze([]),
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
const BUDGET_SPENDING_OBSERVED_COLUMNS = [
  "amount",
  "type",
  "category_id",
  "date",
  "deleted",
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
  readonly budgets: readonly BudgetDashboardItem[];
  readonly totalCount: number;
  readonly matchingCount: number;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isLoading: boolean;
  readonly errorKey: "dashboard_load_error" | null;
  readonly hasValidData: boolean;
  readonly filters: BudgetDashboardFilters;
  readonly setScopeFilter: (filter: BudgetDashboardScopeFilter) => void;
  readonly setPeriodFilter: (filter: BudgetDashboardPeriodFilter) => void;
  readonly setStatusFilter: (filter: BudgetDashboardStatusFilter) => void;
  readonly resetFilters: () => void;
  readonly refresh: () => void;
  readonly retry: () => void;
  readonly autoPauseCheckKey: string;
}

function resolveActiveLocale(language: string | undefined): "en" | "ar" {
  return language?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function useBudgets(
  preferredCurrency: CurrencyType = "EGP"
): UseBudgetsResult {
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
  const [filters, setFilters] = useState<BudgetDashboardFilters>(
    DEFAULT_BUDGET_DASHBOARD_FILTERS
  );
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [observationRetryCounter, setObservationRetryCounter] = useState(0);
  const [lifecycleClockRevision, setLifecycleClockRevision] = useState(0);
  const [spendingRevision, setSpendingRevision] = useState(0);
  const [hasBudgetObservationError, setHasBudgetObservationError] =
    useState(false);
  const [hasSpendingObservationError, setHasSpendingObservationError] =
    useState(false);
  const [hasMetricComputationError, setHasMetricComputationError] =
    useState(false);
  const refreshGenerationRef = useRef(0);
  const activeScopeUserIdRef = useRef<string | null>(null);
  const { userId, isResolvingUser } = useCurrentUser();
  const categoryMap = useCategoryLookup();
  const {
    isLoading: areCategoriesLoading,
    error: categoryError,
    retry: retryCategories,
  } = useAllCategories();
  const { i18n, t } = useTranslation("budgets");
  const activeLocale = resolveActiveLocale(i18n.resolvedLanguage);
  const presentationCopy = useMemo<BudgetDashboardPresentationCopy>(
    () => ({
      periodLabels: {
        WEEKLY: t("filter_weekly"),
        MONTHLY: t("filter_monthly"),
        CUSTOM: t("filter_custom"),
      },
      scopeLabels: {
        GLOBAL: t("global_type"),
        CATEGORY: t("category_type"),
      },
      statusLabels: {
        HEALTHY: t("safe_to_spend"),
        NEAR_LIMIT: t("near_limit"),
        OVER_BUDGET: t("over_budget"),
        PAUSED: t("paused"),
        EXPIRED: t("budget_expired"),
      },
      deletedCategoryLabel: t("deleted_category"),
      resumeActionLabel: t("resume_action"),
      renewActionLabel: t("renew_action"),
      formatSpentOfLimit: (spent, limit) =>
        t("spent_of_limit", { spent, limit }),
      formatViewBudget: (name) => `${t("view_budget")}: ${name}`,
    }),
    [activeLocale, t]
  );

  const clearScopedState = useCallback((isLoading: boolean): void => {
    setRawBudgets([]);
    setComputedBudgets(null);
    setReadModel(EMPTY_DASHBOARD_READ_MODEL);
    setHasObservedBudgets(false);
    setHasValidData(false);
    setIsComputing(isLoading);
    setErrorKey(null);
    setHasBudgetObservationError(false);
    setHasSpendingObservationError(false);
    setHasMetricComputationError(false);
  }, []);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        activeScopeUserIdRef.current = null;
        clearScopedState(true);
        setFilters(DEFAULT_BUDGET_DASHBOARD_FILTERS);
      },
      onSignedOut: () => {
        activeScopeUserIdRef.current = null;
        clearBudgetDashboardFilterSession();
        clearScopedState(false);
        setFilters(DEFAULT_BUDGET_DASHBOARD_FILTERS);
      },
      onAuthenticated: (currentUserId) => {
        const isNewUser = activeScopeUserIdRef.current !== currentUserId;
        activeScopeUserIdRef.current = currentUserId;
        if (isNewUser) {
          clearScopedState(true);
          setFilters(readBudgetDashboardFilterSession(currentUserId));
        }

        const subscription = observeBudgetList(currentUserId)
          .observeWithColumns(BUDGET_LIST_OBSERVED_COLUMNS)
          .subscribe({
            next: (budgets) => {
              setHasBudgetObservationError(false);
              setRawBudgets(budgets);
              setHasObservedBudgets(true);
              setIsComputing(true);
            },
            error: (error: unknown) => {
              logger.error("budgets.observe.failed", error);
              setHasBudgetObservationError(true);
              setHasObservedBudgets(false);
              setIsComputing(false);
              setErrorKey("dashboard_load_error");
            },
          });

        let hasReceivedInitialSpendingSnapshot = false;
        const spendingSubscription = observeBudgetSpendingChanges(currentUserId)
          .observeWithColumns(BUDGET_SPENDING_OBSERVED_COLUMNS)
          .subscribe({
            next: () => {
              setHasSpendingObservationError(false);
              if (!hasReceivedInitialSpendingSnapshot) {
                hasReceivedInitialSpendingSnapshot = true;
                return;
              }
              setSpendingRevision((revision) => revision + 1);
            },
            error: (error: unknown) => {
              logger.error("budgets.spendingObserve.failed", error);
              setHasSpendingObservationError(true);
              setIsComputing(false);
              setErrorKey("dashboard_load_error");
            },
          });

        return () => {
          subscription.unsubscribe();
          spendingSubscription.unsubscribe();
        };
      },
    });
  }, [clearScopedState, isResolvingUser, observationRetryCounter, userId]);

  useEffect(() => {
    if (!categoryError) return;
    logger.error("budgets.categories.failed", categoryError);
    setIsComputing(false);
    setErrorKey("dashboard_load_error");
  }, [categoryError]);

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
          setHasMetricComputationError(false);
          setComputedBudgets({
            source: rawBudgets,
            metrics,
            refreshGeneration: refreshCounter,
          });
        }
      } catch (error: unknown) {
        logger.error("budgets.readModel.failed", error);
        if (isCurrent) {
          setHasMetricComputationError(true);
          setIsComputing(false);
          setErrorKey("dashboard_load_error");
        }
      }
    }

    void computeMetrics();

    return () => {
      isCurrent = false;
    };
  }, [
    hasObservedBudgets,
    isResolvingUser,
    rawBudgets,
    refreshCounter,
    spendingRevision,
    userId,
  ]);

  useEffect(() => {
    if (
      !userId ||
      isResolvingUser ||
      !computedBudgets ||
      computedBudgets.source !== rawBudgets ||
      areCategoriesLoading ||
      categoryError
    ) {
      return;
    }

    try {
      const nextReadModel = buildBudgetDashboardReadModel({
        budgets: computedBudgets.metrics,
        categoryMap,
        filters,
        now: new Date(),
        activeLocale,
        fallbackName: t("unnamed_budget"),
        preferredCurrency,
        presentationCopy,
      });
      setReadModel(nextReadModel);
      setHasValidData(true);
      setIsComputing(false);
      if (
        computedBudgets.refreshGeneration === refreshGenerationRef.current &&
        !hasBudgetObservationError &&
        !hasSpendingObservationError &&
        !hasMetricComputationError
      ) {
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
    categoryError,
    computedBudgets,
    hasBudgetObservationError,
    hasMetricComputationError,
    hasSpendingObservationError,
    isResolvingUser,
    lifecycleClockRevision,
    preferredCurrency,
    presentationCopy,
    filters,
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

  const updateFilters = useCallback(
    (update: Partial<BudgetDashboardFilters>): void => {
      if (!userId) return;
      setIsComputing(true);
      setFilters((current) =>
        writeBudgetDashboardFilterSession(userId, { ...current, ...update })
      );
    },
    [userId]
  );

  const setScopeFilter = useCallback(
    (scope: BudgetDashboardScopeFilter): void => updateFilters({ scope }),
    [updateFilters]
  );

  const setPeriodFilter = useCallback(
    (period: BudgetDashboardPeriodFilter): void => updateFilters({ period }),
    [updateFilters]
  );

  const setStatusFilter = useCallback(
    (status: BudgetDashboardStatusFilter): void => updateFilters({ status }),
    [updateFilters]
  );

  const resetFilters = useCallback((): void => {
    if (!userId) return;
    setIsComputing(true);
    setFilters(resetBudgetDashboardFilterSession(userId));
  }, [userId]);

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
    retryCategories();
  }, [retryCategories]);

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
    budgets: readModel.items,
    totalCount: readModel.totalCount,
    matchingCount: readModel.matchingCount,
    isInitialLoading,
    isRefreshing: hasValidData && isComputing,
    isLoading: isInitialLoading,
    errorKey,
    hasValidData,
    filters: hasValidData && errorKey === null ? readModel.filters : filters,
    setScopeFilter,
    setPeriodFilter,
    setStatusFilter,
    resetFilters,
    refresh,
    retry,
    autoPauseCheckKey,
  };
}
