import type { BudgetPeriod, CurrencyType } from "@monyvi/db";
import type { SpendingMetrics } from "@monyvi/logic";

import type { CategoryIconConfig } from "@/utils/category-icon-config";

export type BudgetDashboardScopeFilter = "ALL" | "CATEGORY" | "GLOBAL";
export type BudgetDashboardPeriodFilter = "ALL" | BudgetPeriod;
export type BudgetDashboardStatusFilter =
  | "ALL"
  | "ACTIVE"
  | "PAUSED"
  | "EXPIRED";

export interface BudgetDashboardFilters {
  readonly scope: BudgetDashboardScopeFilter;
  readonly period: BudgetDashboardPeriodFilter;
  readonly status: BudgetDashboardStatusFilter;
}

export type BudgetDashboardLifecycle =
  | "HEALTHY"
  | "NEAR_LIMIT"
  | "OVER_BUDGET"
  | "PAUSED"
  | "EXPIRED";

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
  readonly showsProgress: boolean;
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly expiresAt: Date | null;
  readonly categoryLabel: BudgetDashboardCategoryLabel;
  readonly categoryIcon: CategoryIconConfig | null;
  readonly availableAction: "RESUME" | "RENEW" | null;
}

export interface BudgetDashboardReadModel {
  readonly filters: BudgetDashboardFilters;
  readonly items: readonly BudgetDashboardItem[];
  readonly totalCount: number;
  readonly matchingCount: number;
}
