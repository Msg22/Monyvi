import { useLocale } from "@/context/LocaleContext";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency, type SpendingMetrics } from "@monyvi/logic";
import React from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";

interface BudgetDetailOverviewProps {
  readonly metrics: SpendingMetrics;
  readonly currency: CurrencyType;
  readonly daysLeft: number;
}

export function BudgetDetailOverview({
  metrics,
  currency,
  daysLeft,
}: BudgetDetailOverviewProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  useLocale();
  const { width, fontScale } = useWindowDimensions();
  const isConstrained = width < 390 || fontScale > 1.2;
  const clampedPercentage = Math.max(0, Math.min(metrics.percentage, 100));
  const isDanger = metrics.status === "danger";
  const isWarning = metrics.status === "warning";
  const semanticTextClass = isDanger
    ? "text-red-600 dark:text-red-500"
    : isWarning
      ? "text-gold-800 dark:text-gold-400"
      : "text-nileGreen-700 dark:text-nileGreen-400";
  const semanticBackgroundClass = isDanger
    ? "bg-red-600 dark:bg-red-500"
    : isWarning
      ? "bg-gold-800 dark:bg-gold-400"
      : "bg-nileGreen-700 dark:bg-nileGreen-400";
  const amount = (value: number, maximumFractionDigits = 2): string =>
    formatCurrency({ amount: value, currency, maximumFractionDigits });

  return (
    <View
      testID="budget-detail-overview"
      className="mx-5 mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <View className={isConstrained ? "gap-3" : "flex-row items-start justify-between"}>
        <View>
          <Text className="text-sm font-medium text-nileGreen-700 dark:text-nileGreen-400">
            {t("detail.overview.spent", { defaultValue: "Spent" })}
          </Text>
          <Text className="mt-1 text-2xl font-semibold text-text-primary">{amount(metrics.spent)}</Text>
          <Text className="mt-0.5 text-sm text-text-secondary">
            {t("detail.overview.of_budget", {
              defaultValue: `of ${amount(metrics.limit)}`,
              limit: amount(metrics.limit),
            })}
          </Text>
        </View>
        <View className={isConstrained ? "items-start" : "items-end"}>
          <Text className={`text-2xl font-bold ${semanticTextClass}`}>{Math.round(metrics.percentage)}%</Text>
          <Text className="text-sm text-text-secondary">
            {t("detail.overview.of_budget_percentage", { defaultValue: "of budget" })}
          </Text>
          {isDanger || isWarning ? (
            <Text className={`mt-1 text-xs font-semibold ${semanticTextClass}`}>
              {t(
                isDanger ? "detail.overview.status_danger" : "detail.overview.status_warning",
                { defaultValue: isDanger ? "Over budget" : "Near limit" }
              )}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        testID="budget-detail-progress"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t("detail.accessibility.progress", {
          defaultValue: `Budget spent ${Math.round(metrics.percentage)} percent`,
          percentage: Math.round(metrics.percentage),
        })}
        accessibilityValue={{ min: 0, max: 100, now: metrics.percentage }}
        className="mt-5"
      >
        <View className="relative h-6">
          <View
            className="absolute w-10 items-center"
            style={{
              left: `${Math.max(10, Math.min(clampedPercentage, 90))}%`,
              transform: [{ translateX: -20 }],
            }}
          >
            <Text className={`text-xs font-semibold ${semanticTextClass}`}>
              {Math.round(metrics.percentage)}%
            </Text>
          </View>
        </View>
        <View className="relative h-2 rounded-full bg-slate-200 dark:bg-slate-700">
          <View
            testID="budget-detail-progress-fill"
            className={`h-full rounded-full ${semanticBackgroundClass}`}
            style={{ width: `${clampedPercentage}%` }}
          />
          <View
            testID="budget-detail-progress-marker"
            className={`absolute -top-1 h-4 w-0.5 ${semanticBackgroundClass}`}
            style={{ left: `${clampedPercentage}%` }}
          />
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-xs text-text-muted">0%</Text>
          <Text className="text-xs text-text-muted">100%</Text>
        </View>
      </View>

      <View className={`mt-4 border-t border-slate-200 pt-4 dark:border-slate-700 ${isConstrained ? "gap-3" : "flex-row"}`}>
        <Stat label={t("detail.overview.remaining", { defaultValue: "Remaining" })} value={amount(metrics.remaining)} valueClass={semanticTextClass} isStacked={isConstrained} />
        <Stat
          label={t("detail.overview.daily_average_spent", { defaultValue: "Daily average spent" })}
          value={t("detail.overview.per_day", {
            defaultValue: `${amount(metrics.dailyAverage, 0)}/day`,
            amount: amount(metrics.dailyAverage, 0),
          })}
          hasDivider
          isStacked={isConstrained}
        />
        <Stat
          label={t("detail.overview.days_left", { defaultValue: "Days left" })}
          value={t("detail.overview.days_value", {
            defaultValue: `${daysLeft} days`,
            count: daysLeft,
          })}
          hasDivider
          isStacked={isConstrained}
        />
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-text-primary",
  hasDivider = false,
  isStacked = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueClass?: string;
  readonly hasDivider?: boolean;
  readonly isStacked?: boolean;
}): React.JSX.Element {
  return (
    <View className={`flex-1 px-1 ${isStacked ? "items-start" : "items-center"} ${hasDivider ? (isStacked ? "border-t border-slate-200 pt-3 dark:border-slate-700" : "border-s border-slate-200 dark:border-slate-700") : ""}`}>
      <Text className={`${isStacked ? "text-start" : "text-center"} text-xs text-text-secondary`}>{label}</Text>
      <Text className={`mt-1 ${isStacked ? "text-start" : "text-center"} text-sm font-semibold ${valueClass}`}>{value}</Text>
    </View>
  );
}
