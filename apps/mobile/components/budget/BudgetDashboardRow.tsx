import React from "react";
import {
  I18nManager,
  Text,
  TouchableOpacity,
  View,
  type DimensionValue,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { useTranslation } from "react-i18next";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { palette } from "@/constants/colors";
import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";

export type BudgetDashboardRowVariant = "attention" | "category" | "paused";
export type BudgetDashboardRowPosition = "first" | "middle" | "last" | "only";

interface BudgetDashboardRowProps {
  readonly item: BudgetDashboardItem;
  readonly variant: BudgetDashboardRowVariant;
  readonly position: BudgetDashboardRowPosition;
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
  NEAR_LIMIT: "near_limit",
  OVER_BUDGET: "over_budget",
  PAUSED: "paused",
  EXPIRED: "budget_expired",
} as const;

function getContainerClasses(position: BudgetDashboardRowPosition): string {
  const borderClasses = "border-slate-200 dark:border-slate-700";
  if (position === "only") return `rounded-2xl border ${borderClasses}`;
  if (position === "first") {
    return `rounded-t-2xl border-x border-t border-b ${borderClasses}`;
  }
  if (position === "last") {
    return `rounded-b-2xl border-x border-b ${borderClasses}`;
  }
  return `border-x border-b ${borderClasses}`;
}

function getStatusClasses(item: BudgetDashboardItem): string {
  if (item.lifecycle === "EXPIRED" || item.lifecycle === "OVER_BUDGET") {
    return "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300";
  }
  if (item.lifecycle === "NEAR_LIMIT") {
    return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (item.lifecycle === "PAUSED") {
    return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-nileGreen-500/50 bg-nileGreen-500/10 text-nileGreen-600 dark:text-nileGreen-300";
}

function getProgressClasses(item: BudgetDashboardItem): string {
  if (item.lifecycle === "EXPIRED" || item.lifecycle === "OVER_BUDGET") {
    return "bg-red-500";
  }
  if (item.lifecycle === "NEAR_LIMIT") return "bg-amber-500";
  return "bg-nileGreen-500";
}

function getPercentageClasses(item: BudgetDashboardItem): string {
  if (item.lifecycle === "EXPIRED" || item.lifecycle === "OVER_BUDGET") {
    return "text-red-500 dark:text-red-300";
  }
  if (item.lifecycle === "NEAR_LIMIT") {
    return "text-amber-600 dark:text-amber-300";
  }
  if (item.lifecycle === "PAUSED") {
    return "text-amber-600 dark:text-amber-300";
  }
  return "text-nileGreen-600 dark:text-nileGreen-300";
}

function RowIcon({
  item,
  variant,
}: {
  readonly item: BudgetDashboardItem;
  readonly variant: BudgetDashboardRowVariant;
}): React.JSX.Element {
  const containerClasses =
    variant === "attention"
      ? "border-red-500/60 bg-red-500/15"
      : variant === "paused"
        ? "border-amber-500/60 bg-amber-500/15"
        : "border-nileGreen-500/60 bg-nileGreen-500/15";
  const fallbackColor =
    variant === "attention"
      ? palette.red[500]
      : variant === "paused"
        ? palette.gold[600]
        : palette.nileGreen[500];

  return (
    <View
      testID={`budget-row-icon-${item.id}`}
      className={`h-11 w-11 items-center justify-center rounded-full border ${containerClasses}`}
    >
      {variant !== "attention" && item.categoryIcon ? (
        <CategoryIcon
          iconName={item.categoryIcon.iconName}
          iconLibrary={item.categoryIcon.iconLibrary}
          color={item.categoryIcon.iconColor}
          size={22}
        />
      ) : (
        <Ionicons
          name={
            variant === "attention"
              ? "alert-circle-outline"
              : item.scope === "GLOBAL"
                ? "wallet-outline"
                : variant === "paused"
                  ? "pause-circle-outline"
                  : "pie-chart-outline"
          }
          size={23}
          color={fallbackColor}
        />
      )}
    </View>
  );
}

export function BudgetDashboardRow({
  item,
  variant,
  position,
  preferredCurrency,
  onPress,
  onResume,
  onRenew,
}: BudgetDashboardRowProps): React.JSX.Element {
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
  const percentage = Math.round(item.metrics.percentage);
  const progressWidth: DimensionValue = `${Math.min(100, Math.max(0, percentage))}%`;
  const periodLabel = t(PERIOD_KEYS[item.period]);
  const statusLabel = t(STATUS_KEYS[item.lifecycle]);
  const expiryDate = item.expiresAt
    ? item.expiresAt.toLocaleDateString(i18n.resolvedLanguage ?? "en", {
        month: "short",
        day: "numeric",
      })
    : null;
  const expiryLabel = expiryDate ? `${statusLabel} ${expiryDate}` : statusLabel;
  const spentOfLimit = t("spent_of_limit", {
    spent: formattedSpent,
    limit: formattedLimit,
  });
  const subtitle =
    item.lifecycle === "EXPIRED"
      ? `${periodLabel} • ${expiryLabel}`
      : item.lifecycle === "PAUSED"
        ? `${statusLabel} • ${spentOfLimit}`
        : spentOfLimit;
  const accessibleLabel = [
    item.displayName,
    ...(item.categoryLabel.kind === "deleted" ? [t("deleted_category")] : []),
    periodLabel,
    spentOfLimit,
    `${percentage}%`,
    statusLabel,
  ].join(", ");
  const hasAction = item.availableAction !== null;

  return (
    <View
      testID={`budget-dashboard-row-${item.id}`}
      className={`min-h-20 flex-row items-center bg-white px-3 py-2.5 dark:bg-slate-800 ${getContainerClasses(position)}`}
    >
      <TouchableOpacity
        className="min-w-0 flex-1 flex-row items-center"
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
        onPress={() => onPress(item.id)}
      >
        <RowIcon item={item} variant={variant} />
        <View className="ms-2.5 min-w-0 flex-1">
          <Text
            numberOfLines={2}
            className="text-[15px] font-bold leading-5 text-text-primary dark:text-slate-25"
          >
            {item.displayName}
          </Text>
          {item.categoryLabel.kind === "deleted" ? (
            <Text className="mt-1 text-xs text-text-muted dark:text-slate-400">
              {t("deleted_category")}
            </Text>
          ) : null}
          <Text
            testID={`budget-row-subtitle-${item.id}`}
            numberOfLines={1}
            className={`mt-0.5 text-xs ${
              item.lifecycle === "EXPIRED" || item.lifecycle === "PAUSED"
                ? getPercentageClasses(item)
                : "text-text-muted dark:text-slate-400"
            }`}
          >
            {subtitle}
          </Text>
        </View>
      </TouchableOpacity>

      <View
        testID={`budget-row-trailing-${item.id}`}
        className={`ms-2 items-end ${hasAction ? "w-24" : "w-32"}`}
      >
        {hasAction ? (
          <>
            <View
              className={`max-w-full rounded-full border px-2 py-1 ${getStatusClasses(item)}`}
            >
              <Text
                testID={`budget-row-status-${item.id}`}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.7}
                className={`text-[11px] font-semibold ${getPercentageClasses(item)}`}
              >
                {item.lifecycle === "EXPIRED" ? expiryLabel : statusLabel}
              </Text>
            </View>
            <TouchableOpacity
              className="min-h-7 justify-center px-1"
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={
                item.availableAction === "RESUME"
                  ? t("resume_action")
                  : t("renew_action")
              }
              onPress={() => {
                if (item.availableAction === "RESUME") onResume?.(item.id);
                else onRenew?.(item.id);
              }}
            >
              <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-300">
                {item.availableAction === "RESUME"
                  ? t("resume_action")
                  : t("renew_action")}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View className="w-full flex-row items-center justify-end gap-1">
              <Text
                testID={`budget-row-percentage-${item.id}`}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.65}
                className={`min-w-0 flex-shrink text-lg font-bold ${getPercentageClasses(item)}`}
              >
                {percentage}%
              </Text>
              {variant === "attention" ? (
                <View
                  className={`rounded-full border px-2 py-1 ${getStatusClasses(item)}`}
                >
                  <Text
                    testID={`budget-row-status-${item.id}`}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.7}
                    className={`text-[10px] font-semibold ${getPercentageClasses(item)}`}
                  >
                    {statusLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <View
              testID={`budget-row-progress-${item.id}`}
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            >
              <View
                className={`h-full rounded-full ${getProgressClasses(item)}`}
                style={{ width: progressWidth }}
              />
            </View>
          </>
        )}
      </View>

      <TouchableOpacity
        className="ms-1 min-h-11 min-w-6 items-end justify-center"
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${t("view_budget")}: ${item.displayName}`}
        onPress={() => onPress(item.id)}
      >
        <Ionicons
          name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
          size={22}
          color={palette.slate[400]}
        />
      </TouchableOpacity>
    </View>
  );
}
