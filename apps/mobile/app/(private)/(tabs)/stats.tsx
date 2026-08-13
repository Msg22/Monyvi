/**
 * Stats Tab Screen
 * Analytics and insights about spending patterns.
 * Composition-only — all UI is delegated to extracted components.
 */

import { PageHeader } from "@/components/navigation/PageHeader";
import { CategoryDrilldownCard } from "@/components/stats/CategoryDrilldownCard";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { MonthlyExpenseChart } from "@/components/stats/MonthlyExpenseChart";
import { QuickStats } from "@/components/stats/QuickStats";
import { useTranslation } from "react-i18next";
import React from "react";
import { ScrollView, View } from "react-native";

// =============================================================================
// Screen
// =============================================================================

const TAB_CONTENT_BOTTOM_SPACING = 20;

export default function StatsScreen(): React.JSX.Element {
  const { t } = useTranslation("common");
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View className="flex-1">
      <PageHeader title={t("stats")} />
      <ScrollView
        testID="stats-scroll"
        contentContainerStyle={{
          paddingBottom: tabBarHeight + TAB_CONTENT_BOTTOM_SPACING,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          <QuickStats />
          <MonthlyExpenseChart />
          <CategoryDrilldownCard />
        </View>
      </ScrollView>
    </View>
  );
}
