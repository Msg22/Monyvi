/**
 * BudgetDashboard Component
 *
 * Container component that composes the budget dashboard:
 * - Period filter chips
 * - Global budget hero card (if any)
 * - Category budget list with section header
 * - Bottom summary bar (safe to spend + daily limit)
 * - Empty state (when no budgets)
 *
 * Architecture & Design Rationale:
 * - Pattern: Container Component (composition)
 * - Why: Orchestrates layout of presentational budget components.
 * - SOLID: SRP — manages layout, delegates data to hook and rendering to sub-components.
 *
 * @module BudgetDashboard
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useBudgets } from "@/hooks/useBudgets";
import { pauseExpiredCustomBudgets } from "@/services/budget-service";
import type { BudgetWithMetrics } from "@/services/budget-list-read-model-service";
import { logger } from "@/utils/logger";

import { formatCurrency } from "@monyvi/logic";
import { PeriodFilterChips } from "./PeriodFilterChips";
import { BudgetHeroCard } from "./BudgetHeroCard";
import { BudgetCategoryCard } from "./BudgetCategoryCard";
import { BudgetEmptyState } from "./BudgetEmptyState";

const SUMMARY_FOOTER_BASE_PADDING = 12;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BudgetDashboard(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("budgets");
  const { preferredCurrency } = usePreferredCurrency();
  const {
    globalBudget,
    categoryBudgets,
    isLoading,
    totalCount,
    periodFilter,
    setPeriodFilter,
    budgets,
    refresh,
    autoPauseCheckKey,
  } = useBudgets();
  const [isAutoPauseActive, setIsAutoPauseActive] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsAutoPauseActive(true);

      return () => {
        setIsAutoPauseActive(false);
      };
    }, [])
  );

  useEffect(() => {
    if (!isAutoPauseActive) return;

    let isActive = true;

    pauseExpiredCustomBudgets()
      .then((pausedCount) => {
        if (isActive && pausedCount > 0) {
          refresh();
        }
      })
      .catch((error: unknown) => {
        logger.error("budgetDashboard.pauseExpired.failed", error);
      });

    return () => {
      isActive = false;
    };
  }, [autoPauseCheckKey, isAutoPauseActive, refresh]);

  const handleCreateBudget = useCallback((): void => {
    router.push("/create-budget");
  }, []);

  const handleBudgetPress = useCallback((budgetId: string): void => {
    router.push(`/budget-detail?id=${budgetId}`);
  }, []);

  const renderCategoryItem = useCallback(
    ({ item }: { item: BudgetWithMetrics }) => (
      <BudgetCategoryCard
        data={item}
        currency={preferredCurrency}
        onPress={() => handleBudgetPress(item.budget.id)}
      />
    ),
    [preferredCurrency, handleBudgetPress]
  );

  const keyExtractor = useCallback(
    (item: BudgetWithMetrics) => item.budget.id,
    []
  );

  // Loading
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={palette.nileGreen[500]} />
      </View>
    );
  }

  // S-01: Compute safe-to-spend and daily limit from global budget
  const safeToSpend = globalBudget
    ? Math.max(0, globalBudget.metrics.remaining)
    : 0;
  const dailyLimit =
    globalBudget && globalBudget.daysLeft > 0
      ? safeToSpend / globalBudget.daysLeft
      : 0;

  return (
    <View className="flex-1">
      {/* Period Filter */}
      <PeriodFilterChips selected={periodFilter} onSelect={setPeriodFilter} />

      {/* Budget Content or Empty State */}
      {budgets.length === 0 && totalCount === 0 ? (
        <BudgetEmptyState onCreateBudget={handleCreateBudget} />
      ) : budgets.length === 0 && periodFilter !== "ALL" ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons
            name="filter-outline"
            size={40}
            color={palette.slate[400]}
          />
          <Text className="text-base font-semibold text-slate-500 dark:text-slate-400 mt-3 text-center">
            {t("no_budgets_for_filter")}
          </Text>
          <Text className="text-sm text-slate-400 dark:text-slate-500 mt-1 text-center">
            {t("try_different_filter")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={categoryBudgets}
          keyExtractor={keyExtractor}
          renderItem={renderCategoryItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 80,
          }}
          {...ANDROID_SAFE_LIST_PROPS}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListHeaderComponent={
            <>
              {/* Hero Card */}
              {globalBudget ? (
                <View className="px-5 mt-6 mb-2">
                  <BudgetHeroCard
                    data={globalBudget}
                    currency={preferredCurrency}
                    onPress={() => handleBudgetPress(globalBudget.budget.id)}
                  />
                </View>
              ) : null}

              {/* S-04: CATEGORIES section header */}
              {categoryBudgets.length > 0 && (
                <View className="px-5 mb-3 mt-2">
                  <Text className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
                    {t("categories")}
                  </Text>
                </View>
              )}
            </>
          }
        />
      )}

      {/* S-01: Bottom summary bar */}
      {globalBudget && (
        <View
          testID="budget-summary-footer"
          className="flex-row items-center justify-center border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3"
          style={{
            paddingBottom: SUMMARY_FOOTER_BASE_PADDING + insets.bottom,
          }}
        >
          <View className="items-center flex-1">
            <Text className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
              {t("safe_to_spend")}
            </Text>
            <Text
              className="text-base font-bold"
              style={{ color: palette.nileGreen[500] }}
            >
              {formatCurrency({
                amount: safeToSpend,
                currency: preferredCurrency,
                maximumFractionDigits: 0,
              })}
            </Text>
          </View>

          {/* Vertical divider */}
          <View className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-4" />

          <View className="items-center flex-1">
            <Text className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
              {t("daily_limit")}
            </Text>
            <Text className="text-base font-bold text-slate-800 dark:text-white">
              {formatCurrency({
                amount: dailyLimit,
                currency: preferredCurrency,
                maximumFractionDigits: 0,
              })}
            </Text>
          </View>
        </View>
      )}

      {/* FAB - Create Budget */}
      {budgets.length > 0 && (
        <TouchableOpacity
          onPress={handleCreateBudget}
          className="absolute end-5 bg-nileGreen-500 w-14 h-14 rounded-full items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t("accessibility_create_budget")}
          accessibilityHint={t("accessibility_create_budget_hint")}
          // NativeWind v4 shadow limitation — requires inline style on interactive components
          style={{
            bottom: globalBudget
              ? insets.bottom + 85 // Above bottom summary bar
              : insets.bottom + 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <Ionicons name="add" size={28} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
}
