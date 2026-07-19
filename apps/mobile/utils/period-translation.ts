import type { TFunction } from "i18next";

const PERIOD_TRANSLATION_KEYS = {
  today: "period_today",
  this_week: "period_this_week",
  last_week: "period_last_week",
  this_month: "period_this_month",
  last_month: "period_last_month",
  six_months: "period_six_months",
  this_year: "period_this_year",
  all_time: "period_all_time",
  one_year: "period_one_year",
} as const;

const BILLS_PERIOD_TRANSLATION_KEYS = {
  this_week: "period_this_week",
  this_month: "period_this_month",
  six_months: "bills_period_six_months",
  one_year: "period_one_year",
} as const;

type TranslatablePeriod = keyof typeof PERIOD_TRANSLATION_KEYS;
type TranslatableBillsPeriod = keyof typeof BILLS_PERIOD_TRANSLATION_KEYS;

export function translatePeriod(
  t: TFunction<"common">,
  period: TranslatablePeriod
): string {
  return t(PERIOD_TRANSLATION_KEYS[period]);
}

export function translateBillsPeriod(
  t: TFunction<"common">,
  period: TranslatableBillsPeriod
): string {
  return t(BILLS_PERIOD_TRANSLATION_KEYS[period]);
}
