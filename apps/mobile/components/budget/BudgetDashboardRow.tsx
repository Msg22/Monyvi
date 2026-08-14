import React from "react";
import { I18nManager, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { palette } from "@/constants/colors";
import type { BudgetDashboardItem } from "@/contracts/budget-dashboard";

export type BudgetDashboardRowPosition = "first" | "middle" | "last" | "only";

interface BudgetDashboardRowProps {
  readonly item: BudgetDashboardItem;
  readonly position: BudgetDashboardRowPosition;
  readonly onPress: (budgetId: string) => void;
  readonly onResume?: (budgetId: string) => void;
  readonly onRenew?: (budgetId: string) => void;
}

function getLifecycleColorClasses(item: BudgetDashboardItem): string {
  if (item.lifecycle === "EXPIRED" || item.lifecycle === "OVER_BUDGET") {
    return "text-red-500 dark:text-red-300";
  }
  if (item.lifecycle === "NEAR_LIMIT" || item.lifecycle === "PAUSED") {
    return "text-amber-600 dark:text-amber-300";
  }
  return "text-nileGreen-600 dark:text-nileGreen-300";
}

function getProgressClasses(item: BudgetDashboardItem): string {
  if (item.lifecycle === "OVER_BUDGET") return "bg-red-500";
  if (item.lifecycle === "NEAR_LIMIT") return "bg-amber-500";
  return "bg-nileGreen-500";
}

function getStatusContainerClasses(item: BudgetDashboardItem): string {
  return item.lifecycle === "EXPIRED" ? "border-red-500" : "border-amber-500";
}

function getContainerClasses(position: BudgetDashboardRowPosition): string {
  const borders = "border-slate-200 dark:border-slate-700";
  if (position === "only") return `rounded-2xl border ${borders}`;
  if (position === "first") return `rounded-t-2xl border-x border-t ${borders}`;
  if (position === "last") return `rounded-b-2xl border-x border-b ${borders}`;
  return `border-x ${borders}`;
}

function getIconColors(item: BudgetDashboardItem): {
  readonly container: string;
  readonly fallback: string;
} {
  if (item.lifecycle === "EXPIRED" || item.lifecycle === "OVER_BUDGET") {
    return {
      container: "border-red-500 bg-red-500/10",
      fallback: palette.red[500],
    };
  }
  if (item.lifecycle === "NEAR_LIMIT" || item.lifecycle === "PAUSED") {
    return {
      container: "border-amber-500 bg-amber-500/10",
      fallback: palette.gold[600],
    };
  }
  return {
    container: "border-nileGreen-500 bg-nileGreen-500/10",
    fallback: palette.nileGreen[500],
  };
}

function RowIcon({
  item,
}: {
  readonly item: BudgetDashboardItem;
}): React.JSX.Element {
  const colors = getIconColors(item);
  const shouldShowCategoryIcon =
    item.categoryIcon !== null &&
    item.lifecycle !== "EXPIRED" &&
    item.lifecycle !== "NEAR_LIMIT" &&
    item.lifecycle !== "OVER_BUDGET";

  return (
    <View
      testID={`budget-row-icon-${item.id}`}
      className={`h-12 w-12 items-center justify-center rounded-full border ${colors.container}`}
    >
      {shouldShowCategoryIcon && item.categoryIcon ? (
        <CategoryIcon
          iconName={item.categoryIcon.iconName}
          iconLibrary={item.categoryIcon.iconLibrary}
          color={
            item.lifecycle === "HEALTHY"
              ? item.categoryIcon.iconColor
              : colors.fallback
          }
          size={24}
        />
      ) : (
        <Ionicons
          name={
            item.lifecycle === "EXPIRED" ||
            item.lifecycle === "NEAR_LIMIT" ||
            item.lifecycle === "OVER_BUDGET"
              ? "alert-circle-outline"
              : item.lifecycle === "PAUSED"
                ? item.scope === "GLOBAL"
                  ? "wallet-outline"
                  : "pause-circle-outline"
                : item.scope === "GLOBAL"
                  ? "wallet-outline"
                  : "pie-chart-outline"
          }
          size={27}
          color={colors.fallback}
        />
      )}
    </View>
  );
}

export function BudgetDashboardRow({
  item,
  position,
  onPress,
  onResume,
  onRenew,
}: BudgetDashboardRowProps): React.JSX.Element {
  const { presentation } = item;
  const isLast = position === "last" || position === "only";
  const hasAction = item.availableAction !== null;

  return (
    <View
      testID={`budget-dashboard-row-${item.id}`}
      className={`min-h-28 bg-white px-4 py-4 dark:bg-slate-800 ${getContainerClasses(
        position
      )} ${isLast ? "" : "border-b"}`}
    >
      <View className="flex-row items-center">
        <TouchableOpacity
          className="min-w-0 flex-1 flex-row items-center"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={presentation.accessibilityLabel}
          onPress={() => onPress(item.id)}
        >
          <RowIcon item={item} />
          <View className="ms-3 min-w-0 flex-1">
            <Text
              numberOfLines={2}
              className="text-base font-bold leading-5 text-text-primary dark:text-slate-25"
            >
              {item.displayName}
            </Text>
            <Text className="mt-1 text-sm text-text-muted dark:text-slate-400">
              {presentation.periodAndScopeLabel}
            </Text>
            {item.categoryLabel.kind === "deleted" ? (
              <Text className="mt-1 text-sm text-red-500 dark:text-red-300">
                {presentation.deletedCategoryLabel}
              </Text>
            ) : null}
            {item.lifecycle === "EXPIRED" ? (
              <Text
                testID={`budget-row-expiry-${item.id}`}
                className="mt-1 text-sm text-red-500 dark:text-red-300"
              >
                {presentation.expiryLabel}
              </Text>
            ) : null}
            <Text
              testID={`budget-row-subtitle-${item.id}`}
              numberOfLines={2}
              className="mt-2 text-sm text-text-muted dark:text-slate-400"
            >
              {presentation.spentOfLimitLabel}
            </Text>
          </View>
        </TouchableOpacity>

        <View
          testID={`budget-row-trailing-${item.id}`}
          className="ms-3 w-28 items-end"
        >
          {item.showsProgress ? (
            <>
              <Text
                testID={`budget-row-percentage-${item.id}`}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.65}
                className={`max-w-full text-2xl font-bold ${getLifecycleColorClasses(item)}`}
              >
                {presentation.percentageLabel}
              </Text>
              <Text
                testID={`budget-row-status-${item.id}`}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.7}
                className={`mt-1 text-sm font-medium ${getLifecycleColorClasses(item)}`}
              >
                {presentation.statusLabel}
              </Text>
            </>
          ) : (
            <>
              <View
                className={`rounded-full border px-3 py-1 ${getStatusContainerClasses(
                  item
                )}`}
              >
                <Text
                  testID={`budget-row-status-${item.id}`}
                  numberOfLines={1}
                  className={`text-sm font-medium ${getLifecycleColorClasses(item)}`}
                >
                  {presentation.statusLabel}
                </Text>
              </View>
              {hasAction ? (
                <TouchableOpacity
                  testID={`budget-action-${item.availableAction.toLowerCase()}-${item.id}`}
                  className="mt-2 min-h-8 justify-center px-1"
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={presentation.actionLabel ?? undefined}
                  onPress={() => {
                    if (item.availableAction === "RESUME") onResume?.(item.id);
                    else onRenew?.(item.id);
                  }}
                >
                  <Text className="text-base font-semibold text-nileGreen-600 dark:text-nileGreen-300">
                    {presentation.actionLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>

        <TouchableOpacity
          className="ms-1 min-h-11 min-w-7 items-end justify-center"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={presentation.viewBudgetLabel}
          onPress={() => onPress(item.id)}
        >
          <Ionicons
            name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"}
            size={24}
            color={palette.slate[400]}
          />
        </TouchableOpacity>
      </View>

      {item.showsProgress ? (
        <View
          testID={`budget-row-progress-${item.id}`}
          className="ms-16 me-8 mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <View
            className={`h-full rounded-full ${getProgressClasses(item)}`}
            style={{ width: presentation.progressWidth ?? "0%" }}
          />
        </View>
      ) : null}
    </View>
  );
}
