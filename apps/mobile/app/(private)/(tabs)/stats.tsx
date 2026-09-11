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
import { Skeleton } from "@/components/ui/Skeleton";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useStatsCurrencyFilter } from "@/hooks/useStatsCurrencyFilter";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

const TAB_CONTENT_BOTTOM_SPACING = 20;

export default function StatsScreen(): React.JSX.Element {
  const { t } = useTranslation("common");
  const tabBarHeight = useBottomTabBarHeight();
  const {
    preferredCurrency,
    isLoading: isPreferredCurrencyLoading,
  } = usePreferredCurrency();
  const {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
    isLoading,
    error,
    retry,
  } = useStatsCurrencyFilter(
    preferredCurrency,
    isPreferredCurrencyLoading
  );

  return (
    <View className="flex-1">
      <View className="z-30">
        <PageHeader title={t("stats")}>
          {!isLoading && !error ? (
            <StatsCurrencyFilter
              availableCurrencies={availableCurrencies}
              selectedCurrency={selectedCurrency}
              onSelectCurrency={selectCurrency}
            />
          ) : null}
        </PageHeader>
      </View>
      <ScrollView
        testID="stats-scroll"
        contentContainerStyle={{
          paddingBottom: tabBarHeight + TAB_CONTENT_BOTTOM_SPACING,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          {isLoading ? (
            <View testID="stats-currency-loading" className="py-4">
              <Skeleton width="100%" height={112} borderRadius={24} />
              <Skeleton
                width="100%"
                height={300}
                borderRadius={24}
                style={{ marginTop: 20 }}
              />
              <Skeleton
                width="100%"
                height={320}
                borderRadius={16}
                style={{ marginTop: 20 }}
              />
            </View>
          ) : error ? (
            <View
              testID="stats-currency-error"
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("error_generic")}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={retry}
                className="mt-3 self-start rounded-xl border border-nileGreen-500 px-4 py-2"
              >
                <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-400">
                  {t("retry")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <QuickStats
                key={`quick-stats-${selectedCurrency}`}
                currency={selectedCurrency}
              />
              <MonthlyExpenseChart currency={selectedCurrency} />
              <CategoryDrilldownCard currency={selectedCurrency} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
