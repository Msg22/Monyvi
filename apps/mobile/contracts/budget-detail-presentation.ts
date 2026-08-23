import type { BudgetPeriod, BudgetType, CurrencyType } from "@monyvi/db";
import type { SpendingMetrics } from "@monyvi/logic";

export type BudgetDetailLifecycle = "ACTIVE" | "PAUSED" | "EXPIRED";

export type BudgetDetailLifecycleAction = "PAUSE" | "RESUME" | null;

export type BudgetDetailPaceState = "BELOW" | "ON" | "ABOVE";

export type BudgetDetailIconLibrary =
  | "Ionicons"
  | "MaterialCommunityIcons"
  | "FontAwesome5"
  | "MaterialIcons";

export type BudgetDetailIconTone =
  | "GREEN"
  | "GOLD"
  | "RED"
  | "BLUE"
  | "VIOLET"
  | "SLATE";

export type BudgetDetailIcon =
  | {
      readonly kind: "CATEGORY";
      readonly iconName: string;
      readonly iconLibrary: BudgetDetailIconLibrary;
      readonly tone: BudgetDetailIconTone;
    }
  | { readonly kind: "GLOBAL" }
  | { readonly kind: "DELETED_CATEGORY" }
  | { readonly kind: "TRANSACTION_FALLBACK" };

export interface BudgetDetailIdentity {
  readonly budgetId: string;
  readonly name: string;
  readonly type: BudgetType;
  readonly lifecycle: BudgetDetailLifecycle;
  readonly period: BudgetPeriod;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly icon: BudgetDetailIcon;
  readonly availableLifecycleAction: BudgetDetailLifecycleAction;
}

export interface BudgetDetailWeek {
  readonly id: string;
  readonly start: Date;
  readonly end: Date;
  readonly actualAmount: number;
  readonly paceAmount: number;
}

export interface BudgetDetailBreakdownItem {
  readonly categoryId: string;
  readonly name: string;
  readonly icon: BudgetDetailIcon;
  readonly transactionCount: number;
  readonly amount: number;
  readonly percentage: number;
}

export interface BudgetDetailTransactionItem {
  readonly transactionId: string;
  readonly label: string | null;
  readonly date: Date;
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly icon: BudgetDetailIcon;
}

export interface BudgetDetailReadModel {
  readonly identity: BudgetDetailIdentity;
  readonly currency: CurrencyType;
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly paceState: BudgetDetailPaceState | null;
  readonly weeklySpending: readonly BudgetDetailWeek[];
  readonly categoryBreakdown: readonly BudgetDetailBreakdownItem[] | null;
  readonly recentTransactions: readonly BudgetDetailTransactionItem[];
  readonly hasCompletedPauseExclusion: boolean;
}

export type BudgetDetailErrorKey =
  | "budget_detail_load_failed"
  | "budget_detail_refresh_failed";
