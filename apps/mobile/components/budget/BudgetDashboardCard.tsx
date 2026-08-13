import React, { useMemo } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  type DimensionValue,
} from "react-native";
import type { CurrencyType } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";
import { formatCurrency } from "@monyvi/logic";

export type BudgetDashboardCardVariant = "global" | "full" | "compact";

interface BudgetDashboardCardProps {
  readonly item: BudgetDashboardItem;
  readonly variant: BudgetDashboardCardVariant;
  readonly preferredCurrency: CurrencyType;
  readonly onPress: (budgetId: string) => void;
  readonly onResume?: (budgetId: string) => void;
  readonly onRenew?: (budgetId: string) => void;
}

const PERIOD_KEYS = {
  WEEKLY: "filter_weekly",
  MONTHLY: "filter_monthly",
  CUSTOM: "filter_custom",
} as const;

const STATUS_KEYS = {
  HEALTHY: "safe_to_spend",
  NEAR_LIMIT: "alert_warning_title",
  OVER_BUDGET: "over_budget",
  PAUSED: "paused",
  EXPIRED: "budget_expired",
} as const;

function getStatusClasses(lifecycle: BudgetDashboardItem["lifecycle"]): string {
  if (lifecycle === "OVER_BUDGET" || lifecycle === "EXPIRED") {
    return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
  }
  if (lifecycle === "NEAR_LIMIT") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  }
  if (lifecycle === "PAUSED") {
    return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200";
  }
  return "bg-nileGreen-50 text-nileGreen-700 dark:bg-nileGreen-950 dark:text-nileGreen-300";
}

function getStatusTextClasses(
  lifecycle: BudgetDashboardItem["lifecycle"]
): string {
  if (lifecycle === "OVER_BUDGET" || lifecycle === "EXPIRED") {
    return "text-red-700 dark:text-red-300";
  }
  if (lifecycle === "NEAR_LIMIT") {
    return "text-amber-700 dark:text-amber-300";
  }
  if (lifecycle === "PAUSED") {
    return "text-slate-600 dark:text-slate-200";
  }
  return "text-nileGreen-700 dark:text-nileGreen-300";
}

export function BudgetDashboardCard({
  item,
  variant,
  preferredCurrency,
  onPress,
  onResume,
  onRenew,
}: BudgetDashboardCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation("budgets");
  const currency = item.currency ?? preferredCurrency;
  const formattedSpent = formatCurrency({
    amount: item.metrics.spent,
    currency,
  });
  const formattedLimit = formatCurrency({
    amount: item.metrics.limit,
    currency,
  });
  const formattedRemaining = formatCurrency({
    amount: item.metrics.remaining,
    currency,
  });
  const statusLabel = t(STATUS_KEYS[item.lifecycle]);
  const periodLabel = t(PERIOD_KEYS[item.period]);
  const remainingTime =
    item.lifecycle === "EXPIRED" && item.expiresAt
      ? item.expiresAt.toLocaleDateString(i18n.resolvedLanguage ?? "en")
      : t("days_remaining", { count: Math.max(0, item.daysLeft) });
  const accessibleLabel = [
    item.displayName,
    periodLabel,
    `${t("spent")}: ${formattedSpent}`,
    `${t("budget_limit")}: ${formattedLimit}`,
    `${Math.round(item.metrics.percentage)}%`,
    `${t("remaining")}: ${formattedRemaining}`,
    remainingTime,
    statusLabel,
  ].join(", ");
  const progressWidth: DimensionValue = `${Math.min(100, Math.max(0, item.metrics.percentage))}%`;
  const isCompact = variant === "compact";
  const cardClassName = useMemo(
    () =>
      `overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${
        isCompact
          ? "min-h-52 p-4"
          : variant === "global"
            ? "h-full min-h-64 p-5"
            : "min-h-64 p-5"
      }`,
    [isCompact, variant]
  );

  return (
    <View testID={`budget-dashboard-card-${item.id}`} className={cardClassName}>
      <TouchableOpacity
        className="flex-1"
        activeOpacity={0.8}
        onPress={() => onPress(item.id)}
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text
              className={`${isCompact ? "text-lg" : "text-xl"} font-bold text-text-primary dark:text-slate-25`}
            >
              {item.displayName}
            </Text>
            {item.categoryLabel.kind === "deleted" ? (
              <Text className="mt-1 text-xs text-text-muted dark:text-slate-400">
                {t("deleted_category")}
              </Text>
            ) : null}
          </View>
          <View
            className={`rounded-full px-3 py-1 ${getStatusClasses(item.lifecycle)}`}
          >
            <Text
              className={`text-xs font-semibold ${getStatusTextClasses(item.lifecycle)}`}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        <View className="mt-5 flex-row items-end justify-between">
          <View>
            <Text className="text-xs font-medium uppercase tracking-wider text-text-muted dark:text-slate-400">
              {periodLabel}
            </Text>
            <Text className="mt-1 text-3xl font-bold text-text-primary dark:text-slate-25">
              {Math.round(item.metrics.percentage)}%
            </Text>
          </View>
          <Ionicons
            name={
              item.scope === "GLOBAL" ? "wallet-outline" : "pie-chart-outline"
            }
            size={26}
            color={palette.nileGreen[500]}
          />
        </View>

        <View className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <View
            className={`h-full rounded-full ${
              item.lifecycle === "OVER_BUDGET" || item.lifecycle === "EXPIRED"
                ? "bg-red-500"
                : item.lifecycle === "NEAR_LIMIT"
                  ? "bg-amber-500"
                  : "bg-nileGreen-500"
            }`}
            style={{ width: progressWidth }}
          />
        </View>

        <Text className="mt-4 text-sm text-text-secondary dark:text-slate-300">
          {formattedSpent} / {formattedLimit}
        </Text>
        <View className="mt-2 flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
            {t("remaining")}: {formattedRemaining}
          </Text>
          <Text className="text-xs text-text-muted dark:text-slate-400">
            {remainingTime}
          </Text>
        </View>
      </TouchableOpacity>

      {item.availableAction ? (
        <TouchableOpacity
          testID={`budget-action-${item.availableAction.toLowerCase()}-${item.id}`}
          className="mt-4 min-h-11 items-center justify-center rounded-xl bg-nileGreen-500 px-4"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={
            item.availableAction === "RESUME"
              ? t("resume_budget")
              : t("renew_budget")
          }
          onPress={() => {
            if (item.availableAction === "RESUME") onResume?.(item.id);
            else onRenew?.(item.id);
          }}
        >
          <Text className="font-semibold text-slate-25">
            {item.availableAction === "RESUME"
              ? t("resume_budget")
              : t("renew_budget")}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
