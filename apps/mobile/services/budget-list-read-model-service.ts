import {
  Budget,
  database,
  type BudgetPeriod,
  type CurrencyType,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import type Query from "@nozbe/watermelondb/Query";
import {
  computeSpendingMetrics,
  getCurrentPeriodBounds,
  getDaysElapsed,
  getDaysLeft,
  isPeriodExpired,
  type SpendingMetrics,
} from "@monyvi/logic";

import { getSpendingForBudget } from "@/services/budget-service";
import { queryOwned } from "@/services/user-data-access";
import {
  getCategoryIconConfig,
  type CategoryIconConfig,
} from "@/utils/category-icon-config";

export type BudgetPeriodFilter = "ALL" | BudgetPeriod;

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

export type BudgetDashboardLifecycle =
  | "HEALTHY"
  | "NEAR_LIMIT"
  | "OVER_BUDGET"
  | "PAUSED"
  | "EXPIRED";

export type BudgetDashboardSectionId =
  | "OVERALL"
  | "NEEDS_ATTENTION"
  | "CATEGORY"
  | "PAUSED";

export type BudgetDashboardCategoryLabel =
  | { readonly kind: "not-applicable" }
  | {
      readonly kind: "resolved";
      readonly categoryId: string;
      readonly name: string;
    }
  | { readonly kind: "deleted"; readonly categoryId: string | null };

export interface BudgetDashboardItem {
  readonly id: string;
  readonly displayName: string;
  readonly period: BudgetPeriod;
  readonly currency: CurrencyType | null;
  readonly scope: "GLOBAL" | "CATEGORY";
  readonly lifecycle: BudgetDashboardLifecycle;
  readonly sectionId: BudgetDashboardSectionId;
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly expiresAt: Date | null;
  readonly categoryLabel: BudgetDashboardCategoryLabel;
  readonly categoryIcon: CategoryIconConfig | null;
  readonly availableAction: "RESUME" | "RENEW" | null;
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
  readonly filter: BudgetPeriodFilter;
  readonly now: Date;
  readonly activeLocale: "en" | "ar";
  readonly fallbackName: string;
}

export interface BudgetDashboardReadModel {
  readonly overallBudgets: readonly BudgetDashboardItem[];
  readonly needsAttentionBudgets: readonly BudgetDashboardItem[];
  readonly categoryBudgets: readonly BudgetDashboardItem[];
  readonly pausedBudgets: readonly BudgetDashboardItem[];
  readonly totalCount: number;
  readonly matchingCount: number;
}

export function buildBudgetDashboardReadModel({
  budgets,
  categoryMap,
  filter,
  now,
  activeLocale,
  fallbackName,
}: BuildBudgetDashboardReadModelInput): BudgetDashboardReadModel {
  const matchingBudgets =
    filter === "ALL"
      ? budgets
      : budgets.filter((item) => item.budget.period === filter);
  const overallBudgets: BudgetDashboardItem[] = [];
  const needsAttentionBudgets: BudgetDashboardItem[] = [];
  const categoryBudgets: BudgetDashboardItem[] = [];
  const pausedBudgets: BudgetDashboardItem[] = [];

  for (const item of matchingBudgets) {
    const { budget, metrics, daysLeft, daysElapsed } = item;
    const category = budget.categoryId
      ? categoryMap.get(budget.categoryId)
      : undefined;
    const isExpired =
      budget.period === "CUSTOM" && isPeriodExpired(budget.periodEnd, now);
    const lifecycle: BudgetDashboardLifecycle = isExpired
      ? "EXPIRED"
      : budget.status === "PAUSED"
        ? "PAUSED"
        : metrics.status === "warning"
          ? "NEAR_LIMIT"
          : metrics.status === "danger"
            ? "OVER_BUDGET"
            : "HEALTHY";
    const sectionId: BudgetDashboardSectionId = isExpired
      ? "NEEDS_ATTENTION"
      : budget.status === "PAUSED"
        ? "PAUSED"
        : metrics.status !== "safe"
          ? "NEEDS_ATTENTION"
          : budget.isGlobal
            ? "OVERALL"
            : "CATEGORY";
    const categoryLabel: BudgetDashboardCategoryLabel = budget.isGlobal
      ? { kind: "not-applicable" }
      : category && budget.categoryId
        ? {
            kind: "resolved",
            categoryId: budget.categoryId,
            name: category.displayName,
          }
        : { kind: "deleted", categoryId: budget.categoryId ?? null };
    const persistedName = budget.name?.trim() ?? "";
    const categoryName = category?.displayName.trim() ?? "";
    const displayName = persistedName || categoryName || fallbackName.trim();
    const categoryIcon =
      category?.icon &&
      category.iconLibrary &&
      typeof category.isExpense === "boolean"
        ? getCategoryIconConfig({
            icon: category.icon,
            iconLibrary: category.iconLibrary,
            color: category.color,
            isExpense: category.isExpense,
          })
        : null;
    const dashboardItem: BudgetDashboardItem = Object.freeze({
      id: budget.id,
      displayName,
      period: budget.period,
      currency: budget.currency ?? null,
      scope: budget.type,
      lifecycle,
      sectionId,
      metrics,
      daysLeft,
      daysElapsed,
      expiresAt: isExpired ? (budget.periodEnd ?? null) : null,
      categoryLabel: Object.freeze(categoryLabel),
      categoryIcon: categoryIcon ? Object.freeze(categoryIcon) : null,
      availableAction:
        lifecycle === "EXPIRED"
          ? "RENEW"
          : lifecycle === "PAUSED"
            ? "RESUME"
            : null,
    });

    if (sectionId === "NEEDS_ATTENTION") {
      needsAttentionBudgets.push(dashboardItem);
    } else if (sectionId === "PAUSED") {
      pausedBudgets.push(dashboardItem);
    } else if (sectionId === "OVERALL") {
      overallBudgets.push(dashboardItem);
    } else {
      categoryBudgets.push(dashboardItem);
    }
  }

  const collator = new Intl.Collator(activeLocale, {
    sensitivity: "base",
    numeric: true,
    usage: "sort",
  });
  const compareItems = (
    left: BudgetDashboardItem,
    right: BudgetDashboardItem
  ): number => {
    const nameResult = collator.compare(left.displayName, right.displayName);
    if (nameResult !== 0) return nameResult;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
  };

  overallBudgets.sort(compareItems);
  needsAttentionBudgets.sort(compareItems);
  categoryBudgets.sort(compareItems);
  pausedBudgets.sort(compareItems);

  return Object.freeze({
    overallBudgets: Object.freeze(overallBudgets),
    needsAttentionBudgets: Object.freeze(needsAttentionBudgets),
    categoryBudgets: Object.freeze(categoryBudgets),
    pausedBudgets: Object.freeze(pausedBudgets),
    totalCount: budgets.length,
    matchingCount: matchingBudgets.length,
  });
}
