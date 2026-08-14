import React, { useCallback } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import type {
  BudgetDashboardFilters as DashboardFilters,
  BudgetDashboardItem,
  BudgetDashboardPeriodFilter,
  BudgetDashboardReadModel,
  BudgetDashboardScopeFilter,
  BudgetDashboardStatusFilter,
} from "@/contracts/budget-dashboard";
import { BudgetDashboardFilters } from "./BudgetDashboardFilters";
import {
  BudgetDashboardRow,
  type BudgetDashboardRowPosition,
} from "./BudgetDashboardRow";
import { BudgetDashboardSkeleton } from "./BudgetDashboardSkeleton";
import { BudgetEmptyState } from "./BudgetEmptyState";

const DASHBOARD_BOTTOM_BASE_SPACING = 24;
const RESULT_COUNT_KEYS = {
  ALL: "dashboard_result_count_all",
  ACTIVE: "dashboard_result_count_active",
  PAUSED: "dashboard_result_count_paused",
  EXPIRED: "dashboard_result_count_expired",
} as const;

export interface BudgetDashboardProps {
  readonly readModel: BudgetDashboardReadModel;
  readonly filters: DashboardFilters;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly hasValidData: boolean;
  readonly errorKey: "dashboard_load_error" | null;
  readonly onSelectScope: (filter: BudgetDashboardScopeFilter) => void;
  readonly onSelectPeriod: (filter: BudgetDashboardPeriodFilter) => void;
  readonly onSelectStatus: (filter: BudgetDashboardStatusFilter) => void;
  readonly onResetFilters: () => void;
  readonly onRetry: () => void;
  readonly onCreateBudget: () => void;
  readonly onBudgetPress: (budgetId: string) => void;
  readonly onResume: (budgetId: string) => void;
  readonly onRenew: (budgetId: string) => void;
}

export function BudgetDashboard({
  readModel,
  filters,
  isInitialLoading,
  hasValidData,
  errorKey,
  onSelectScope,
  onSelectPeriod,
  onSelectStatus,
  onResetFilters,
  onRetry,
  onCreateBudget,
  onBudgetPress,
  onResume,
  onRenew,
}: BudgetDashboardProps): React.JSX.Element {
  const { bottom } = useSafeAreaInsets();
  const { t } = useTranslation("budgets");

  const renderItem = useCallback(
    ({
      item,
      index,
    }: {
      readonly item: BudgetDashboardItem;
      readonly index: number;
    }): React.JSX.Element => {
      const lastIndex = readModel.items.length - 1;
      const position: BudgetDashboardRowPosition =
        lastIndex === 0
          ? "only"
          : index === 0
            ? "first"
            : index === lastIndex
              ? "last"
              : "middle";

      return (
        <BudgetDashboardRow
          item={item}
          position={position}
          onPress={onBudgetPress}
          onResume={onResume}
          onRenew={onRenew}
        />
      );
    },
    [onBudgetPress, onRenew, onResume, readModel.items.length]
  );

  if (isInitialLoading) return <BudgetDashboardSkeleton />;

  const hasNoBudgets = readModel.totalCount === 0;
  const hasNoFilterMatches =
    readModel.totalCount > 0 && readModel.matchingCount === 0;

  return (
    <FlatList
      testID="budget-dashboard-list"
      data={readModel.items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: DASHBOARD_BOTTOM_BASE_SPACING + bottom,
      }}
      ListHeaderComponent={
        <View>
          <BudgetDashboardFilters
            filters={filters}
            onSelectScope={onSelectScope}
            onSelectPeriod={onSelectPeriod}
            onSelectStatus={onSelectStatus}
          />

          {errorKey && hasValidData ? (
            <View
              testID="budget-dashboard-recoverable-error"
              className="mt-4 flex-row items-center rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
            >
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={palette.gold[600]}
              />
              <Text className="mx-3 flex-1 text-sm text-amber-800 dark:text-amber-200">
                {t(errorKey)}
              </Text>
              <TouchableOpacity
                className="min-h-11 justify-center"
                accessibilityRole="button"
                accessibilityLabel={t("retry")}
                onPress={onRetry}
              >
                <Text className="font-semibold text-amber-800 dark:text-amber-200">
                  {t("retry")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {readModel.matchingCount > 0 ? (
            <View testID="budget-results-group" className="pb-2 pt-5">
              <Text className="text-sm text-text-muted dark:text-slate-400">
                {t(RESULT_COUNT_KEYS[filters.status], {
                  count: readModel.matchingCount,
                })}
              </Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        errorKey && !hasValidData ? (
          <View
            testID="budget-dashboard-initial-error"
            className="flex-1 items-center justify-center px-6 py-20"
          >
            <Ionicons
              name="cloud-offline-outline"
              size={42}
              color={palette.slate[400]}
            />
            <Text className="mt-4 text-center text-base text-text-secondary dark:text-slate-300">
              {t("dashboard_initial_load_error")}
            </Text>
            <TouchableOpacity
              className="mt-5 min-h-11 justify-center rounded-xl bg-nileGreen-500 px-6"
              accessibilityRole="button"
              accessibilityLabel={t("retry")}
              onPress={onRetry}
            >
              <Text className="font-semibold text-slate-25">{t("retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : hasNoBudgets ? (
          <BudgetEmptyState onCreateBudget={onCreateBudget} />
        ) : hasNoFilterMatches ? (
          <View
            testID="budget-dashboard-filtered-empty"
            className="flex-1 items-center justify-center px-6 py-20"
          >
            <Ionicons
              name="filter-outline"
              size={40}
              color={palette.slate[400]}
            />
            <Text className="mt-3 text-center text-base font-semibold text-text-secondary dark:text-slate-300">
              {t("no_budgets_for_filter")}
            </Text>
            <TouchableOpacity
              className="mt-5 min-h-11 justify-center rounded-xl border border-nileGreen-500 px-5"
              accessibilityRole="button"
              accessibilityLabel={t("reset_filters")}
              onPress={onResetFilters}
            >
              <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-400">
                {t("reset_filters")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      {...ANDROID_SAFE_LIST_PROPS}
    />
  );
}
