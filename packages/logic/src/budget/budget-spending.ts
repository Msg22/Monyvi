/**
 * Budget Spending Utilities
 *
 * Pure functions for calculating spending metrics and determining
 * visual progress status (green/amber/red color coding).
 */

import type { CurrencyType } from "@monyvi/db";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Threshold percentages for color-coded progress states */
/** Default threshold percentage for warning state */
const DEFAULT_WARNING_THRESHOLD = 80;
const DANGER_THRESHOLD = 100;

// =============================================================================
// TYPES
// =============================================================================

export type ProgressStatus = "safe" | "warning" | "danger";

export interface SpendingMetrics {
  readonly spent: number;
  readonly limit: number;
  readonly remaining: number;
  readonly percentage: number;
  readonly dailyAverage: number;
  readonly status: ProgressStatus;
}

/**
 * Determines whether a transaction may contribute to a budget.
 *
 * Budgets do not convert currencies: only an exact currency match counts.
 */
export function hasMatchingBudgetCurrency(
  transactionCurrency: CurrencyType,
  budgetCurrency: CurrencyType | null | undefined
): boolean {
  return (
    budgetCurrency !== null &&
    budgetCurrency !== undefined &&
    transactionCurrency === budgetCurrency
  );
}

// =============================================================================
// CALCULATIONS
// =============================================================================

/**
 * Calculate the spent percentage, clamping at 0.
 *
 * @param spent - Amount spent in the period
 * @param limit - Budget limit
 * @returns Percentage (0+, can exceed 100)
 */
export function calculateSpentPercentage(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return (spent / limit) * 100;
}

/**
 * Calculate remaining budget amount, clamped to 0.
 *
 * @param spent - Amount spent
 * @param limit - Budget limit
 * @returns Remaining amount (>= 0)
 */
export function calculateRemaining(spent: number, limit: number): number {
  return Math.max(0, limit - spent);
}

/**
 * Calculate daily average spending over elapsed days.
 *
 * @param spent - Total spent in period
 * @param daysElapsed - Number of days elapsed (minimum 1)
 * @returns Average daily spend
 */
export function calculateDailyAverage(
  spent: number,
  daysElapsed: number
): number {
  const safeDays = Math.max(1, daysElapsed);
  return spent / safeDays;
}

/**
 * Determine the visual progress status based on spending percentage.
 *
 * - safe (green): < 80%
 * - warning (amber): 80% – 99.99%
 * - danger (red): >= 100%
 *
 * @param percentage - Spent percentage (0-100+)
 * @param warningThreshold - Percentage at which to show warning (defaults to 80)
 * @returns The status label for color coding
 */
export function getProgressStatus(
  percentage: number,
  warningThreshold: number = DEFAULT_WARNING_THRESHOLD
): ProgressStatus {
  if (percentage >= DANGER_THRESHOLD) return "danger";
  if (percentage >= warningThreshold) return "warning";
  return "safe";
}

/**
 * Compute full spending metrics for display.
 *
 * @param spent - Amount spent in this period
 * @param limit - Budget limit
 * @param daysElapsed - Days elapsed in period
 * @param warningThreshold - Optional custom warning threshold (defaults to 80)
 * @returns All computed metrics in a single object
 */
export function computeSpendingMetrics(
  spent: number,
  limit: number,
  daysElapsed: number,
  warningThreshold?: number
): SpendingMetrics {
  const percentage = calculateSpentPercentage(spent, limit);
  return {
    spent,
    limit,
    remaining: calculateRemaining(spent, limit),
    percentage,
    dailyAverage: calculateDailyAverage(spent, daysElapsed),
    status: getProgressStatus(percentage, warningThreshold),
  };
}
