import {
  getElapsedCalendarDays,
  getInclusiveCalendarDayCount,
  type WeeklyBucket,
} from "./budget-period-utils";

export type BudgetPaceState = "BELOW" | "ON" | "ABOVE";

export interface BudgetPaceInput {
  readonly limit: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly now: Date;
  readonly spent: number;
  readonly currencyFractionDigits: number;
}

export interface WeeklyBudgetPace {
  readonly start: Date;
  readonly end: Date;
  readonly allowance: number;
}

export interface WeeklyBudgetPaceInput {
  readonly limit: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly buckets: readonly WeeklyBucket[];
}

type ElapsedBudgetAllowanceInput = Pick<
  BudgetPaceInput,
  "limit" | "periodStart" | "periodEnd" | "now"
>;

export function calculateElapsedBudgetAllowance(
  input: ElapsedBudgetAllowanceInput
): number {
  const limit = getValidLimit(input.limit);
  const totalDays = getInclusiveCalendarDayCount(
    input.periodStart,
    input.periodEnd
  );

  if (limit === 0 || totalDays === 0) return 0;

  const elapsedDays = getElapsedCalendarDays(
    input.periodStart,
    input.periodEnd,
    input.now
  );
  return Math.min(limit, (limit * elapsedDays) / totalDays);
}

export function classifyBudgetPace(input: BudgetPaceInput): BudgetPaceState {
  const allowance = calculateElapsedBudgetAllowance(input);
  const spent = roundForDisplay(input.spent, input.currencyFractionDigits);
  const displayedAllowance = roundForDisplay(
    allowance,
    input.currencyFractionDigits
  );

  if (spent < displayedAllowance) return "BELOW";
  if (spent > displayedAllowance) return "ABOVE";
  return "ON";
}

export function calculateWeeklyBudgetPace(
  input: WeeklyBudgetPaceInput
): readonly WeeklyBudgetPace[] {
  const limit = getValidLimit(input.limit);
  const totalDays = getInclusiveCalendarDayCount(
    input.periodStart,
    input.periodEnd
  );

  return input.buckets.map((bucket): WeeklyBudgetPace => {
    const start = new Date(
      Math.max(bucket.weekStart.getTime(), input.periodStart.getTime())
    );
    const end = new Date(
      Math.min(bucket.weekEnd.getTime(), input.periodEnd.getTime())
    );
    const bucketDays = getInclusiveCalendarDayCount(start, end);

    return {
      start,
      end,
      allowance:
        limit === 0 || totalDays === 0
          ? 0
          : (limit * bucketDays) / totalDays,
    };
  });
}

function getValidLimit(limit: number): number {
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function roundForDisplay(value: number, fractionDigits: number): number {
  if (!Number.isFinite(value)) return 0;
  const digits = Number.isFinite(fractionDigits)
    ? Math.min(20, Math.max(0, Math.trunc(fractionDigits)))
    : 0;
  return Number(value.toFixed(digits));
}
