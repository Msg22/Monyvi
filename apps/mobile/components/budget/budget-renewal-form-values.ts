import type { BudgetPeriod, BudgetType } from "@monyvi/db";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BudgetFormInitialValues {
  readonly name: string;
  readonly type: BudgetType;
  readonly categoryId: string | null;
  readonly amount: string;
  readonly period: BudgetPeriod;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly alertThreshold: number;
}

export interface BudgetRenewalSource {
  readonly name: string;
  readonly type: BudgetType;
  readonly categoryId?: string;
  readonly amount: number;
  readonly period: BudgetPeriod;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly alertThreshold: number;
}

export function buildBudgetRenewalFormValues(
  source: BudgetRenewalSource,
  now: Date = new Date(),
  accessibleCategoryIds?: ReadonlySet<string>
): BudgetFormInitialValues {
  const periodStart = new Date(now.getTime());
  const sourceDurationDays = resolveSourceDurationDays(source);

  return {
    name: source.name,
    type: source.type,
    categoryId: resolveRenewalCategoryId(source, accessibleCategoryIds),
    amount: source.amount.toString(),
    period: source.period,
    periodStart,
    periodEnd: addCalendarDays(periodStart, sourceDurationDays),
    alertThreshold: source.alertThreshold,
  };
}

export function resolveRenewalCategoryId(
  source: BudgetRenewalSource,
  accessibleCategoryIds?: ReadonlySet<string>
): string | null {
  if (source.type === "GLOBAL") return null;
  const categoryId = source.categoryId ?? null;
  if (!categoryId || !accessibleCategoryIds) return categoryId;
  return accessibleCategoryIds.has(categoryId) ? categoryId : null;
}

function resolveSourceDurationDays(source: BudgetRenewalSource): number {
  if (source.period === "CUSTOM" && source.periodStart && source.periodEnd) {
    const durationDays = Math.round(
      (getLocalCalendarDay(source.periodEnd) -
        getLocalCalendarDay(source.periodStart)) /
        MILLISECONDS_PER_DAY
    );
    if (durationDays > 0) return durationDays;
  }

  return 1;
}

function getLocalCalendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}
