/**
 * Stats Tab Screen
 * Analytics and insights about spending patterns.
 * Composition-only — all UI is delegated to extracted components.
 */

import { PageHeader } from "@/components/navigation/PageHeader";
import { CategoryDrilldownCard } from "@/components/stats/CategoryDrilldownCard";
import { MonthlyExpenseChart } from "@/components/stats/MonthlyExpenseChart";
import { QuickStats } from "@/components/stats/QuickStats";
import { StatsCurrencyFilter } from "@/components/stats/StatsCurrencyFilter";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useStatsCurrencyFilter } from "@/hooks/useStatsCurrencyFilter";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import React from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

// =============================================================================
// Screen
// =============================================================================

const TAB_CONTENT_BOTTOM_SPACING = 20;

export default function StatsScreen(): React.JSX.Element {
  const { t } = useTranslation("common");
  const tabBarHeight = useBottomTabBarHeight();
  const { preferredCurrency } = usePreferredCurrency();
  const {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
  } = useStatsCurrencyFilter(preferredCurrency);

  return (
    <View className="flex-1">
      <PageHeader title={t("stats")}>
        <StatsCurrencyFilter
          availableCurrencies={availableCurrencies}
          selectedCurrency={selectedCurrency}
          onSelectCurrency={selectCurrency}
        />
      </PageHeader>
      <ScrollView
        testID="stats-scroll"
        contentContainerStyle={{
          paddingBottom: tabBarHeight + TAB_CONTENT_BOTTOM_SPACING,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          <QuickStats currency={selectedCurrency} />
          <MonthlyExpenseChart currency={selectedCurrency} />
          <CategoryDrilldownCard currency={selectedCurrency} />
        </View>
      </ScrollView>
    </View>
  );
}
