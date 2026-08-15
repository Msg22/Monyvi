/**
 * Budget Detail Screen
 *
 * Shows full detail for a single budget: overview card, weekly spending,
 * subcategory breakdown, and recent transactions.
 * Accessible via tapping a budget card on the dashboard.
 *
 * @module budget-detail
 */

import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageHeader } from "@/components/navigation/PageHeader";
import { BudgetDetailOverview } from "@/components/budget/BudgetDetailOverview";
import { BudgetSpendingTrendChart } from "@/components/budget/BudgetSpendingTrendChart";
import { SubcategoryBreakdown } from "@/components/budget/SubcategoryBreakdown";
import { BudgetRecentTransactions } from "@/components/budget/BudgetRecentTransactions";
import {
  BudgetActionsSheet,
  type BudgetAction,
} from "@/components/budget/BudgetActionsSheet";
import { useBudgetDetail } from "@/hooks/useBudgetDetail";
import { useBudgetPeriodExpiry } from "@/hooks/useBudgetPeriodExpiry";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  deleteBudget,
  pauseBudget,
  resumeBudget,
} from "@/services/budget-service";
import { useTranslation } from "react-i18next";

// =============================================================================
// Screen
// =============================================================================

export default function BudgetDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { preferredCurrency } = usePreferredCurrency();
  const { showToast } = useToast();

  const {
    budget,
    metrics,
    daysLeft,
    weeklySpending,
    subcategoryBreakdown,
    recentTransactions,
    isLoading,
  } = useBudgetDetail(id);
  const isCustomPeriodExpired = useBudgetPeriodExpiry(budget?.periodEnd);

  const { t } = useTranslation("budgets");
  const { t: tCommon } = useTranslation("common");

  const [showActions, setShowActions] = useState(false);

  const handleAction = useCallback(
    async (action: BudgetAction): Promise<void> => {
      if (!budget) return;

      try {
        switch (action) {
          case "edit":
            router.push(`/create-budget?id=${budget.id}`);
            break;
          case "pause":
            await pauseBudget(budget.id);
            showToast({
              type: "success",
              title: t("paused"),
              message: t("budget_paused"),
            });
            break;
          case "resume":
            await resumeBudget(budget.id);
            showToast({
              type: "success",
              title: t("resumed"),
              message: t("budget_resumed"),
            });
            break;
          case "delete":
            try {
              await deleteBudget(budget.id);
              showToast({
                type: "success",
                title: tCommon("delete"),
                message: t("budget_deleted"),
              });
              router.back();
            } catch (deleteErr) {
              // Close the actions sheet so the error toast is clearly visible
              setShowActions(false);
              showToast({
                type: "error",
                title: tCommon("error"),
                message: t("budget_delete_failed"),
              });
              // TODO: Replace with structured logging (e.g., Sentry)
              console.error("Failed to delete budget:", deleteErr);
            }
            break;
        }
      } catch (err) {
        showToast({
          type: "error",
          title: tCommon("error"),
          message:
            err instanceof Error ? err.message : tCommon("error_generic"),
        });
      }
    },
    [budget, showToast, t, tCommon]
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <View
        testID="budget-detail-screen"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        <PageHeader
          title={t("budget_detail")}
          showBackButton={true}
          showDrawer={false}
        />
        <BudgetDetailLoadingSkeleton />
      </View>
    );
  }

  // ── Budget not found ──
  if (!budget || !metrics) {
    return (
      <View
        testID="budget-detail-screen"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        <PageHeader
          title={t("budget_detail")}
          showBackButton={true}
          showDrawer={false}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-slate-600 dark:text-slate-400 text-center">
            {t("budget_not_found")}
          </Text>
          <Text className="text-sm text-slate-400 dark:text-slate-500 mt-1 text-center">
            {t("budget_deleted_hint")}
          </Text>
        </View>
      </View>
    );
  }

  const effectiveCurrency = budget.currency ?? preferredCurrency;
  const canTogglePause = !(budget.period === "CUSTOM" && isCustomPeriodExpired);

  return (
    <View
      testID="budget-detail-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Content layer — z-index 0 ensures actions overlay renders above */}
      <View style={{ zIndex: 0, flex: 1 }}>
        <PageHeader
          title={budget.name}
          centerTitle
          showBackButton={true}
          showDrawer={false}
          rightAction={{
            icon: "ellipsis-horizontal",
            transparent: true,
            onPress: () => setShowActions(true),
          }}
        />

        <ScrollView
          className="flex-1 px-5 pt-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Overview Card */}
          <BudgetDetailOverview
            metrics={metrics}
            currency={effectiveCurrency}
            daysLeft={daysLeft}
            isPaused={budget.isPaused}
          />

          {/* Spending Trend Chart */}
          {weeklySpending.length > 0 ? (
            <BudgetSpendingTrendChart
              data={weeklySpending.map((w) => ({
                label: w.bucket.label,
                amount: w.amount,
              }))}
              currency={effectiveCurrency}
              weeklyAverage={budget.amount / Math.max(weeklySpending.length, 1)}
            />
          ) : null}

          {/* Subcategory Breakdown */}
          {budget.isCategoryBudget && (
            <SubcategoryBreakdown
              data={subcategoryBreakdown}
              currency={effectiveCurrency}
            />
          )}

          {/* Recent Transactions */}
          <BudgetRecentTransactions transactions={recentTransactions} />
        </ScrollView>
      </View>

      {/* Actions Sheet — uses absolute overlay, not Modal */}
      <BudgetActionsSheet
        visible={showActions}
        isPaused={budget.isPaused}
        canTogglePause={canTogglePause}
        onClose={() => setShowActions(false)}
        onAction={handleAction}
      />
    </View>
  );
}

function BudgetDetailLoadingSkeleton(): React.JSX.Element {
  return (
    <View className="flex-1 px-5 pt-4">
      <Skeleton width="100%" height={190} borderRadius={20} />
      <View className="mt-6">
        <Skeleton width="45%" height={24} borderRadius={8} />
      </View>
      <View className="mt-3">
        <Skeleton width="100%" height={180} borderRadius={20} />
      </View>
      <View className="mt-6">
        <Skeleton width="55%" height={24} borderRadius={8} />
      </View>
      <View className="mt-3">
        <Skeleton width="100%" height={120} borderRadius={20} />
      </View>
    </View>
  );
}
