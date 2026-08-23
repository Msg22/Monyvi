/**
 * Budget Alert Service
 *
 * After a transaction is created, this service checks if any matching budget
 * has crossed its alert threshold or limit, and returns alert metadata.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service (stateless utility functions)
 * - Why: Decouples alert detection from UI. Can be called from any transaction
 *   creation flow (manual, voice, SMS).
 * - SOLID: SRP — only detects threshold crossings.
 *
 * @module budget-alert-service
 */

import { Budget, database, Transaction, type CurrencyType } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import {
  getCurrentPeriodBounds,
  getDaysElapsed,
  computeSpendingMetrics,
  hasMatchingBudgetCurrency,
} from "@monyvi/logic";
import {
  getSpendingForBudget,
  setAlertFiredLevel,
  resetAlertFiredLevel,
  getCategoryAndSubcategoryIds,
} from "./budget-service";
import { queryOwned } from "./user-data-access";

// =============================================================================
// TYPES
// =============================================================================

export interface BudgetAlert {
  readonly budgetId: string;
  readonly budgetName: string;
  readonly level: "WARNING" | "DANGER";
  readonly percentage: number;
  readonly spent: number;
  readonly limit: number;
  readonly currency: CurrencyType;
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Checks if any active budget has crossed its alert threshold after a transaction.
 * Returns alert metadata for the first crossing found (WARNING before DANGER).
 *
 * Alert deduplication:
 * - Only fires once per level per period (tracked by `alert_fired_level`)
 * - WARNING fires when threshold is crossed for the first time
 * - DANGER fires when 100% is crossed for the first time
 *
 * Period rollover:
 * - Resets `alert_fired_level` when the current period's start is after
 *   the budget's last update, ensuring new-period alerts are not suppressed.
 *
 * @param transaction - The newly created transaction
 * @returns Alert metadata if a threshold was crossed, null otherwise
 */
export async function checkBudgetAlerts(
  transaction: Transaction
): Promise<BudgetAlert | null> {
  // Only check expense transactions
  if (transaction.type !== "EXPENSE") return null;

  // Find all active budgets that match this transaction
  const budgets = await queryOwned(
    database.get<Budget>("budgets"),
    transaction.userId,
    Q.where("deleted", false),
    Q.where("status", "ACTIVE")
  ).fetch();

  // Filter to budgets that match the transaction's category (including descendants)
  const matchingBudgets: Array<{
    readonly budget: Budget;
    readonly currency: CurrencyType;
  }> = [];
  for (const budget of budgets) {
    const currency = budget.currency;
    if (
      currency === undefined ||
      !hasMatchingBudgetCurrency(transaction.currency, currency)
    ) {
      continue;
    }
    if (budget.isGlobal) {
      matchingBudgets.push({ budget, currency });
    } else if (budget.isCategoryBudget && budget.categoryId) {
      const categoryIds = await getCategoryAndSubcategoryIds(budget.categoryId);
      if (categoryIds.includes(transaction.categoryId)) {
        matchingBudgets.push({ budget, currency });
      }
    }
  }

  for (const { budget, currency } of matchingBudgets) {
    const bounds = getCurrentPeriodBounds(
      budget.period,
      budget.periodStart,
      budget.periodEnd
    );

    // Check if transaction is within the current budget period
    if (
      transaction.date.getTime() < bounds.start.getTime() ||
      transaction.date.getTime() > bounds.end.getTime()
    ) {
      continue;
    }

    // F5 fix: Reset alert level on period rollover so new-period alerts fire correctly
    if (
      budget.alertFiredLevel &&
      bounds.start.getTime() > budget.updatedAt.getTime()
    ) {
      await resetAlertFiredLevel(budget.id);
    }

    const spent = await getSpendingForBudget(budget);
    const daysElapsed = getDaysElapsed(bounds.start);
    const metrics = computeSpendingMetrics(
      spent,
      budget.amount,
      daysElapsed,
      budget.alertThreshold
    );

    const currentFiredLevel = budget.typedAlertFiredLevel;

    // Check DANGER first (100%+)
    if (metrics.percentage >= 100 && currentFiredLevel !== "DANGER") {
      await setAlertFiredLevel(budget.id, "DANGER");
      return {
        budgetId: budget.id,
        budgetName: budget.name,
        level: "DANGER",
        percentage: metrics.percentage,
        spent: metrics.spent,
        limit: metrics.limit,
        currency,
      };
    }

    // Check WARNING (threshold crossed but not yet 100%)
    if (
      metrics.percentage >= budget.alertThreshold &&
      metrics.percentage < 100 &&
      currentFiredLevel === null
    ) {
      await setAlertFiredLevel(budget.id, "WARNING");
      return {
        budgetId: budget.id,
        budgetName: budget.name,
        level: "WARNING",
        percentage: metrics.percentage,
        spent: metrics.spent,
        limit: metrics.limit,
        currency,
      };
    }
  }

  return null;
}
