import React, { useCallback, useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { CurrencyType } from "@monyvi/db";

import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import type {
  BudgetDashboardItem,
  BudgetDashboardReadModel,
} from "@/services/budget-list-read-model-service";
import {
  BudgetDashboardRow,
  type BudgetDashboardRowPosition,
  type BudgetDashboardRowVariant,
} from "./BudgetDashboardRow";
import { BudgetDashboardSectionHeader } from "./BudgetDashboardSectionHeader";
import { BudgetDashboardSkeleton } from "./BudgetDashboardSkeleton";
import { BudgetEmptyState } from "./BudgetEmptyState";
import { GlobalBudgetCarousel } from "./GlobalBudgetCarousel";
import { PeriodFilterChips, type PeriodFilter } from "./PeriodFilterChips";

const DASHBOARD_BOTTOM_BASE_SPACING = 24;

type DashboardRow =
  | {
      readonly kind: "heading";
      readonly key: string;
      readonly titleKey: "needs_attention" | "category_budgets" | "paused";
    }
  | {
      readonly kind: "budget";
      readonly key: string;
      readonly item: BudgetDashboardItem;
      readonly variant: BudgetDashboardRowVariant;
      readonly position: BudgetDashboardRowPosition;
    };

export interface BudgetDashboardProps {
  readonly readModel: BudgetDashboardReadModel;
  readonly periodFilter: PeriodFilter;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly hasValidData: boolean;
  readonly errorKey: "dashboard_load_error" | null;
  readonly preferredCurrency: CurrencyType;
  readonly onSelectPeriod: (filter: PeriodFilter) => void;
  readonly onRetry: () => void;
  readonly onCreateBudget: () => void;
  readonly onBudgetPress: (budgetId: string) => void;
  readonly onResume: (budgetId: string) => void;
  readonly onRenew: (budgetId: string) => void;
}

function buildDashboardRows(
  readModel: BudgetDashboardReadModel
): readonly DashboardRow[] {
  const rows: DashboardRow[] = [];

  const appendSection = (
    titleKey: "needs_attention" | "category_budgets" | "paused",
    budgets: readonly BudgetDashboardItem[],
    variant: BudgetDashboardRowVariant
  ): void => {
    if (budgets.length === 0) return;
    rows.push({ kind: "heading", key: `heading-${variant}`, titleKey });
    budgets.forEach((item, index) => {
      const position: BudgetDashboardRowPosition =
        budgets.length === 1
          ? "only"
          : index === 0
            ? "first"
            : index === budgets.length - 1
              ? "last"
              : "middle";
      rows.push({
        kind: "budget",
        key: `${variant}-${item.id}`,
        item,
        variant,
        position,
      });
    });
  };

  appendSection(
    "needs_attention",
    readModel.needsAttentionBudgets,
    "attention"
  );
  appendSection("category_budgets", readModel.categoryBudgets, "category");
  appendSection("paused", readModel.pausedBudgets, "paused");

  return Object.freeze(rows);
}

export function BudgetDashboard({
  readModel,
  periodFilter,
  isInitialLoading,
  hasValidData,
  errorKey,
  preferredCurrency,
  onSelectPeriod,
  onRetry,
  onCreateBudget,
  onBudgetPress,
  onResume,
  onRenew,
}: BudgetDashboardProps): React.JSX.Element {
  const { bottom } = useSafeAreaInsets();
  const { t } = useTranslation("budgets");
  const rows = useMemo(() => buildDashboardRows(readModel), [readModel]);

  const renderRow = useCallback(
    ({ item: row }: { readonly item: DashboardRow }): React.JSX.Element => {
      if (row.kind === "heading") {
        return (
          <BudgetDashboardSectionHeader
            testID={`budget-section-${row.titleKey}`}
            title={t(row.titleKey)}
          />
        );
      }

      return (
        <BudgetDashboardRow
          item={row.item}
          variant={row.variant}
          position={row.position}
          preferredCurrency={preferredCurrency}
          onPress={onBudgetPress}
          onResume={onResume}
          onRenew={onRenew}
        />
      );
    },
    [onBudgetPress, onRenew, onResume, preferredCurrency, t]
  );

  if (isInitialLoading) return <BudgetDashboardSkeleton />;

  const hasNoBudgets = readModel.totalCount === 0;
  const hasNoFilterMatches =
    readModel.totalCount > 0 && readModel.matchingCount === 0;

  return (
    <FlatList
      testID="budget-dashboard-list"
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: DASHBOARD_BOTTOM_BASE_SPACING + bottom,
      }}
      ListHeaderComponent={
        <View>
          <View className="-mx-5">
            <PeriodFilterChips
              selected={periodFilter}
              onSelect={onSelectPeriod}
            />
          </View>

          {errorKey && hasValidData ? (
            <View
              testID="budget-dashboard-recoverable-error"
              className="mt-3 flex-row items-center rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
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
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={t("retry")}
              >
                <Text className="font-semibold text-amber-800 dark:text-amber-200">
                  {t("retry")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {readModel.overallBudgets.length > 0 ? (
            <View className="pt-4">
              <BudgetDashboardSectionHeader
                testID="budget-section-overall"
                title={t("overall_budgets")}
              />
              <GlobalBudgetCarousel
                budgets={readModel.overallBudgets}
                preferredCurrency={preferredCurrency}
                onBudgetPress={onBudgetPress}
                onResume={onResume}
                onRenew={onRenew}
              />
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
              accessibilityLabel={t("filter_all")}
              onPress={() => onSelectPeriod("ALL")}
            >
              <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-400">
                {t("filter_all")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      {...ANDROID_SAFE_LIST_PROPS}
    />
  );
}
