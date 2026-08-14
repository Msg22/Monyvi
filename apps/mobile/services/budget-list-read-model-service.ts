import { Budget, database, Transaction, type CurrencyType } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import type Query from "@nozbe/watermelondb/Query";
import {
  computeSpendingMetrics,
  formatCurrency,
  getCurrentPeriodBounds,
  getDaysElapsed,
  getDaysLeft,
  isPeriodExpired,
  type SpendingMetrics,
} from "@monyvi/logic";

import {
  type BudgetDashboardCategoryLabel,
  type BudgetDashboardFilters,
  type BudgetDashboardItem,
  type BudgetDashboardLifecycle,
  type BudgetDashboardPresentation,
  type BudgetDashboardPresentationCopy,
  type BudgetDashboardReadModel,
} from "@/contracts/budget-dashboard";
import { getSpendingForBudget } from "@/services/budget-service";
import { queryOwned } from "@/services/user-data-access";
import { getCategoryIconConfig } from "@/utils/category-icon-config";

export type {
  BudgetDashboardCategoryLabel,
  BudgetDashboardFilters,
  BudgetDashboardItem,
  BudgetDashboardLifecycle,
  BudgetDashboardPeriodFilter,
  BudgetDashboardReadModel,
  BudgetDashboardScopeFilter,
  BudgetDashboardStatusFilter,
} from "@/contracts/budget-dashboard";

export interface BudgetWithMetrics {
  readonly budget: Budget;
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
}

export function observeBudgetList(userId: string): Query<Budget> {
  return queryOwned(
    database.get<Budget>("budgets"),
    userId,
    Q.and(
      Q.where("deleted", false),
      Q.where("status", Q.oneOf(["ACTIVE", "PAUSED"]))
    )
  );
}

export function observeBudgetSpendingChanges(
  userId: string
): Query<Transaction> {
  return queryOwned(
    database.get<Transaction>("transactions"),
    userId,
    Q.and(Q.where("deleted", false), Q.where("type", "EXPENSE"))
  );
}

export async function buildBudgetMetrics(
  budgets: readonly Budget[]
): Promise<BudgetWithMetrics[]> {
  return Promise.all(
    budgets.map(async (budget) => {
      const bounds = getCurrentPeriodBounds(
        budget.period,
        budget.periodStart,
        budget.periodEnd
      );
      const spent = await getSpendingForBudget(budget);
      const daysElapsed = getDaysElapsed(bounds.start);
      const daysLeft = getDaysLeft(bounds.end);
      const metrics = computeSpendingMetrics(
        spent,
        budget.amount,
        daysElapsed,
        budget.alertThreshold
      );

      return { budget, metrics, daysLeft, daysElapsed };
    })
  );
}

interface BudgetDashboardCategorySource {
  readonly displayName: string;
  readonly icon?: string;
  readonly iconLibrary?: string;
  readonly color?: string | null;
  readonly isExpense?: boolean;
}

export interface BuildBudgetDashboardReadModelInput {
  readonly budgets: readonly BudgetWithMetrics[];
  readonly categoryMap: ReadonlyMap<string, BudgetDashboardCategorySource>;
  readonly filters: BudgetDashboardFilters;
  readonly now: Date;
  readonly activeLocale: "en" | "ar";
  readonly fallbackName: string;
  readonly preferredCurrency: CurrencyType;
  readonly presentationCopy: BudgetDashboardPresentationCopy;
}

const LIFECYCLE_PRIORITY: Readonly<Record<BudgetDashboardLifecycle, number>> = {
  EXPIRED: 0,
  OVER_BUDGET: 1,
  NEAR_LIMIT: 2,
  PAUSED: 3,
  HEALTHY: 4,
};

function deriveLifecycle(
  item: BudgetWithMetrics,
  now: Date
): BudgetDashboardLifecycle {
  const { budget, metrics } = item;
  if (budget.period === "CUSTOM" && isPeriodExpired(budget.periodEnd, now)) {
    return "EXPIRED";
  }
  if (budget.status === "PAUSED") return "PAUSED";
  if (metrics.status === "danger") return "OVER_BUDGET";
  if (metrics.status === "warning") return "NEAR_LIMIT";
  return "HEALTHY";
}

function matchesFilters(
  item: BudgetWithMetrics,
  lifecycle: BudgetDashboardLifecycle,
  filters: BudgetDashboardFilters
): boolean {
  const matchesScope =
    filters.scope === "ALL" || item.budget.type === filters.scope;
  const matchesPeriod =
    filters.period === "ALL" || item.budget.period === filters.period;
  const matchesStatus =
    filters.status === "ALL" ||
    (filters.status === "ACTIVE"
      ? lifecycle === "HEALTHY" ||
        lifecycle === "NEAR_LIMIT" ||
        lifecycle === "OVER_BUDGET"
      : lifecycle === filters.status);

  return matchesScope && matchesPeriod && matchesStatus;
}

function resolveCategoryLabel(
  budget: Budget,
  category: BudgetDashboardCategorySource | undefined
): BudgetDashboardCategoryLabel {
  if (budget.isGlobal) return { kind: "not-applicable" };
  if (category && budget.categoryId) {
    return {
      kind: "resolved",
      categoryId: budget.categoryId,
      name: category.displayName,
    };
  }
  return { kind: "deleted", categoryId: budget.categoryId ?? null };
}

function resolveCategoryIcon(
  category: BudgetDashboardCategorySource | undefined
): BudgetDashboardItem["categoryIcon"] {
  if (
    !category?.icon ||
    !category.iconLibrary ||
    typeof category.isExpense !== "boolean"
  ) {
    return null;
  }

  return Object.freeze(
    getCategoryIconConfig({
      icon: category.icon,
      iconLibrary: category.iconLibrary,
      color: category.color,
      isExpense: category.isExpense,
    })
  );
}

function resolveExpiryLabel(
  budget: Budget,
  lifecycle: BudgetDashboardLifecycle,
  statusLabel: string,
  activeLocale: "en" | "ar"
): string | null {
  if (lifecycle !== "EXPIRED" || !budget.periodEnd) return null;
  const expiryDate = budget.periodEnd.toLocaleDateString(activeLocale, {
    month: "short",
    day: "numeric",
  });
  return `${statusLabel} ${expiryDate}`;
}

function resolveActionLabel(
  lifecycle: BudgetDashboardLifecycle,
  copy: BudgetDashboardPresentationCopy
): string | null {
  if (lifecycle === "EXPIRED") return copy.renewActionLabel;
  if (lifecycle === "PAUSED") return copy.resumeActionLabel;
  return null;
}

function createAccessibilityLabel(
  displayName: string,
  deletedCategoryLabel: string | null,
  periodLabel: string,
  scopeLabel: string,
  spentOfLimitLabel: string,
  percentageLabel: string | null,
  statusLabel: string
): string {
  return [
    displayName,
    ...(deletedCategoryLabel ? [deletedCategoryLabel] : []),
    periodLabel,
    scopeLabel,
    spentOfLimitLabel,
    ...(percentageLabel ? [percentageLabel] : []),
    statusLabel,
  ].join(", ");
}

function createDashboardPresentation(
  item: BudgetWithMetrics,
  lifecycle: BudgetDashboardLifecycle,
  displayName: string,
  categoryLabel: BudgetDashboardCategoryLabel,
  preferredCurrency: CurrencyType,
  activeLocale: "en" | "ar",
  copy: BudgetDashboardPresentationCopy
): BudgetDashboardPresentation {
  const currency = item.budget.currency ?? preferredCurrency;
  const spent = formatCurrency({ amount: item.metrics.spent, currency });
  const limit = formatCurrency({ amount: item.metrics.limit, currency });
  const spentOfLimitLabel = copy.formatSpentOfLimit(spent, limit);
  const roundedPercentage = Math.round(item.metrics.percentage);
  const showsProgress = ["HEALTHY", "NEAR_LIMIT", "OVER_BUDGET"].includes(
    lifecycle
  );
  const statusLabel = copy.statusLabels[lifecycle];
  const deletedCategoryLabel =
    categoryLabel.kind === "deleted" ? copy.deletedCategoryLabel : null;
  const periodLabel = copy.periodLabels[item.budget.period];
  const scopeLabel = copy.scopeLabels[item.budget.type];
  const expiryLabel = resolveExpiryLabel(
    item.budget,
    lifecycle,
    statusLabel,
    activeLocale
  );
  const percentageLabel = showsProgress ? `${roundedPercentage}%` : null;
  const actionLabel = resolveActionLabel(lifecycle, copy);
  const accessibilityLabel = createAccessibilityLabel(
    displayName,
    deletedCategoryLabel,
    periodLabel,
    scopeLabel,
    spentOfLimitLabel,
    percentageLabel,
    statusLabel
  );

  return Object.freeze({
    periodAndScopeLabel: `${periodLabel} • ${scopeLabel}`,
    spentOfLimitLabel,
    percentageLabel,
    progressWidth: showsProgress
      ? `${Math.min(100, Math.max(0, roundedPercentage))}%`
      : null,
    statusLabel,
    deletedCategoryLabel,
    expiryLabel,
    actionLabel,
    accessibilityLabel,
    viewBudgetLabel: copy.formatViewBudget(displayName),
  });
}

function createDashboardItem(
  item: BudgetWithMetrics,
  categoryMap: ReadonlyMap<string, BudgetDashboardCategorySource>,
  lifecycle: BudgetDashboardLifecycle,
  fallbackName: string,
  preferredCurrency: CurrencyType,
  activeLocale: "en" | "ar",
  presentationCopy: BudgetDashboardPresentationCopy
): BudgetDashboardItem {
  const { budget, metrics, daysLeft, daysElapsed } = item;
  const category = budget.categoryId
    ? categoryMap.get(budget.categoryId)
    : undefined;
  const persistedName = budget.name?.trim() ?? "";
  const categoryName = category?.displayName.trim() ?? "";
  const displayName = persistedName || categoryName || fallbackName.trim();
  const categoryLabel = Object.freeze(resolveCategoryLabel(budget, category));

  return Object.freeze({
    id: budget.id,
    displayName,
    period: budget.period,
    currency: budget.currency ?? null,
    scope: budget.type,
    lifecycle,
    showsProgress: ["HEALTHY", "NEAR_LIMIT", "OVER_BUDGET"].includes(lifecycle),
    metrics,
    daysLeft,
    daysElapsed,
    expiresAt: lifecycle === "EXPIRED" ? (budget.periodEnd ?? null) : null,
    categoryLabel,
    categoryIcon: resolveCategoryIcon(category),
    availableAction:
      lifecycle === "EXPIRED"
        ? "RENEW"
        : lifecycle === "PAUSED"
          ? "RESUME"
          : null,
    presentation: createDashboardPresentation(
      item,
      lifecycle,
      displayName,
      categoryLabel,
      preferredCurrency,
      activeLocale,
      presentationCopy
    ),
  });
}

function createItemComparator(
  activeLocale: "en" | "ar"
): (left: BudgetDashboardItem, right: BudgetDashboardItem) => number {
  const collator = new Intl.Collator(activeLocale, {
    sensitivity: "base",
    numeric: true,
    usage: "sort",
  });

  return (left, right) => {
    const priorityResult =
      LIFECYCLE_PRIORITY[left.lifecycle] - LIFECYCLE_PRIORITY[right.lifecycle];
    if (priorityResult !== 0) return priorityResult;
    const nameResult = collator.compare(left.displayName, right.displayName);
    if (nameResult !== 0) return nameResult;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
  };
}

export function buildBudgetDashboardReadModel({
  budgets,
  categoryMap,
  filters,
  now,
  activeLocale,
  fallbackName,
  preferredCurrency,
  presentationCopy,
}: BuildBudgetDashboardReadModelInput): BudgetDashboardReadModel {
  const dashboardItems: BudgetDashboardItem[] = [];

  for (const item of budgets) {
    const lifecycle = deriveLifecycle(item, now);
    if (!matchesFilters(item, lifecycle, filters)) continue;

    dashboardItems.push(
      createDashboardItem(
        item,
        categoryMap,
        lifecycle,
        fallbackName,
        preferredCurrency,
        activeLocale,
        presentationCopy
      )
    );
  }

  dashboardItems.sort(createItemComparator(activeLocale));

  const readModelFilters = Object.freeze({ ...filters });

  return Object.freeze({
    filters: readModelFilters,
    items: Object.freeze(dashboardItems),
    totalCount: budgets.length,
    matchingCount: dashboardItems.length,
  });
}
