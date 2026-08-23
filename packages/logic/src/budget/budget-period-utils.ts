/**
 * Budget Period Utilities
 *
 * Pure functions for computing budget period boundaries, days remaining,
 * and weekly spending bucket breakdowns.
 *
 * All dates are treated as local-time Date objects (no timezone conversion).
 */

import type { BudgetPeriod } from "@monyvi/db";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Sunday = 0 in JS Date.getDay() */
const SUNDAY = 0;
const DAYS_IN_WEEK = 7;
const MS_PER_DAY = 86_400_000;

// =============================================================================
// TYPES
// =============================================================================

export interface PeriodBounds {
  readonly start: Date;
  readonly end: Date;
}

export interface WeeklyBucket {
  readonly weekStart: Date;
  readonly weekEnd: Date;
  readonly label: string;
}

// =============================================================================
// CORE: Period Boundary Calculations
// =============================================================================

/**
 * Get the current period boundaries for a budget.
 *
 * - WEEKLY: Most recent Sunday → next Saturday (23:59:59.999)
 * - MONTHLY: 1st of current month → last day of current month (23:59:59.999)
 * - CUSTOM: Uses the explicit `periodStart` / `periodEnd` from the budget
 *
 * @param period - Budget period type
 * @param periodStart - Custom period start (required for CUSTOM)
 * @param periodEnd - Custom period end (required for CUSTOM)
 * @param referenceDate - Date to calculate from (defaults to now)
 * @returns Start and end dates of the current period
 */
export function getCurrentPeriodBounds(
  period: BudgetPeriod,
  periodStart?: Date | null,
  periodEnd?: Date | null,
  referenceDate: Date = new Date()
): PeriodBounds {
  switch (period) {
    case "WEEKLY":
      return getWeeklyPeriodBounds(referenceDate);
    case "MONTHLY":
      return getMonthlyPeriodBounds(referenceDate);
    case "CUSTOM":
      return getCustomPeriodBounds(periodStart, periodEnd);
    default: {
      const _exhaustive: never = period;
      throw new Error(`Unknown budget period: ${_exhaustive as string}`);
    }
  }
}

/**
 * Weekly period: Sunday 00:00:00 → Saturday 23:59:59.999
 */
function getWeeklyPeriodBounds(referenceDate: Date): PeriodBounds {
  const dayOfWeek = referenceDate.getDay();
  const daysSinceSunday = dayOfWeek === SUNDAY ? 0 : dayOfWeek;

  const start = new Date(referenceDate);
  start.setDate(start.getDate() - daysSinceSunday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + DAYS_IN_WEEK - 1);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Monthly period: 1st of month 00:00:00 → last day 23:59:59.999
 */
function getMonthlyPeriodBounds(referenceDate: Date): PeriodBounds {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const start = new Date(year, month, 1, 0, 0, 0, 0);
  // Day 0 of next month = last day of current month
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Custom period: uses explicit start/end dates from the budget.
 */
function getCustomPeriodBounds(
  periodStart?: Date | null,
  periodEnd?: Date | null
): PeriodBounds {
  if (!periodStart || !periodEnd) {
    throw new Error(
      "Custom period requires both periodStart and periodEnd dates"
    );
  }

  const start = new Date(periodStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(periodEnd);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// =============================================================================
// DAYS CALCULATIONS
// =============================================================================

/**
 * Calculate days remaining in the current budget period.
 * Returns 0 if the period has ended.
 *
 * @param periodEnd - End date of the budget period
 * @param referenceDate - Current date (defaults to now)
 * @returns Number of days remaining (0 if ended)
 */
export function getDaysLeft(
  periodEnd: Date,
  referenceDate: Date = new Date()
): number {
  const diff = periodEnd.getTime() - referenceDate.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

/**
 * Calculate days elapsed in the current budget period.
 * Returns at least 1 to avoid division-by-zero in daily average calculations.
 *
 * @param periodStart - Start date of the budget period
 * @param referenceDate - Current date (defaults to now)
 * @returns Number of days elapsed (minimum 1)
 */
export function getDaysElapsed(
  periodStart: Date,
  referenceDate: Date = new Date()
): number {
  const diff = referenceDate.getTime() - periodStart.getTime();
  if (diff <= 0) return 1;
  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

/**
 * Count local calendar days in an inclusive date range.
 *
 * Converting each local date to a UTC day number avoids daylight-saving hour
 * changes affecting the number of represented calendar days.
 */
export function getInclusiveCalendarDayCount(
  periodStart: Date,
  periodEnd: Date
): number {
  const startDay = getLocalCalendarDayTimestamp(periodStart);
  const endDay = getLocalCalendarDayTimestamp(periodEnd);

  if (
    !Number.isFinite(startDay) ||
    !Number.isFinite(endDay) ||
    endDay < startDay
  ) {
    return 0;
  }

  return Math.floor((endDay - startDay) / MS_PER_DAY) + 1;
}

/**
 * Count inclusive local calendar days elapsed within a period.
 *
 * The injected reference date keeps all calculations in one read-model build
 * anchored to the same instant. The result is clamped to the period.
 */
export function getElapsedCalendarDays(
  periodStart: Date,
  periodEnd: Date,
  referenceDate: Date = new Date()
): number {
  const totalDays = getInclusiveCalendarDayCount(periodStart, periodEnd);
  const startDay = getLocalCalendarDayTimestamp(periodStart);
  const referenceDay = getLocalCalendarDayTimestamp(referenceDate);

  if (
    totalDays === 0 ||
    !Number.isFinite(startDay) ||
    !Number.isFinite(referenceDay) ||
    referenceDay < startDay
  ) {
    return 0;
  }

  const elapsedDays = Math.floor((referenceDay - startDay) / MS_PER_DAY) + 1;
  return Math.min(totalDays, elapsedDays);
}

function getLocalCalendarDayTimestamp(date: Date): number {
  if (!Number.isFinite(date.getTime())) return Number.NaN;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Check whether a given date falls within a period boundary.
 *
 * @param date - The date to check
 * @param bounds - The period boundaries
 * @returns true if date is within [start, end]
 */
export function isWithinPeriod(date: Date, bounds: PeriodBounds): boolean {
  const time = date.getTime();
  return time >= bounds.start.getTime() && time <= bounds.end.getTime();
}

/**
 * Check whether a custom budget period has expired.
 *
 * @param periodEnd - End date of the budget period
 * @param referenceDate - Current date (defaults to now)
 * @returns true if the period end has passed
 */
export function isPeriodExpired(
  periodEnd: Date | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!periodEnd) return false;
  // Normalize to end-of-day so the entire last day of the period is included
  const endOfDay = new Date(periodEnd);
  endOfDay.setHours(23, 59, 59, 999);
  return referenceDate.getTime() > endOfDay.getTime();
}

// =============================================================================
// WEEKLY BREAKDOWN
// =============================================================================

/**
 * Generate weekly bucket boundaries within a monthly period.
 * Used for the spending breakdown chart on the Budget Detail screen.
 *
 * @param periodBounds - The full period boundaries
 * @returns Array of weekly bucket objects with start/end dates and labels
 */
export function getWeeklyBuckets(periodBounds: PeriodBounds): WeeklyBucket[] {
  const buckets: WeeklyBucket[] = [];
  const current = new Date(periodBounds.start);
  let weekIndex = 1;

  while (current.getTime() <= periodBounds.end.getTime()) {
    const weekStart = new Date(current);

    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + DAYS_IN_WEEK - 1);
    // Clamp to period end
    if (weekEnd.getTime() > periodBounds.end.getTime()) {
      weekEnd.setTime(periodBounds.end.getTime());
    }
    weekEnd.setHours(23, 59, 59, 999);

    buckets.push({
      weekStart,
      weekEnd,
      label: `Week ${weekIndex}`,
    });

    current.setDate(current.getDate() + DAYS_IN_WEEK);
    weekIndex++;
  }

  return buckets;
}
