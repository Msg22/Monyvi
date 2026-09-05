/**
 * MonthlyExpenseChart
 * Grouped bar chart showing income vs expenses over the last N months.
 */

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useMonthlyChartData } from "@/hooks/useAnalytics";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { useTranslation } from "react-i18next";

// =============================================================================
// Types
// =============================================================================

type PeriodFilter = "6m" | "12m";

interface MonthlyExpenseChartProps {
  readonly currency: CurrencyType;
}

const PERIOD_OPTIONS: readonly PeriodFilter[] = ["6m", "12m"];

// =============================================================================
// Component
// =============================================================================

export function MonthlyExpenseChart({
  currency,
}: MonthlyExpenseChartProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  const [period, setPeriod] = useState<PeriodFilter>("6m");
  const months = period === "6m" ? 6 : 12;

  const { data: expenseData, isLoading: expenseLoading } = useMonthlyChartData(
    months,
    undefined,
    "EXPENSE",
    currency
  );
  const { data: incomeData, isLoading: incomeLoading } = useMonthlyChartData(
    months,
    undefined,
    "INCOME",
    currency
  );

  const isLoading = expenseLoading || incomeLoading;

  // Transform data for grouped bar chart
  const chartData: Array<{
    value: number;
    frontColor: string;
    label?: string;
  }> = [];

  expenseData.forEach((expense, index) => {
    const income = incomeData[index];
    // Income bar
    chartData.push({
      value: income?.value ?? 0,
      frontColor: palette.nileGreen[500],
      label: expense.label.substring(0, 3),
    });
    // Expense bar
    chartData.push({
      value: expense.value,
      frontColor: palette.red[400],
    });
  });

  // Calculate totals
  const totalExpenses = expenseData.reduce((sum, d) => sum + d.value, 0);
  const totalIncome = incomeData.reduce((sum, d) => sum + d.value, 0);
  const netSavings = totalIncome - totalExpenses;

  return (
    <View className="rounded-3xl border p-5 mb-5 bg-white/60 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold text-slate-800 dark:text-white">
          {t("monthly_overview")}
        </Text>
        <View className="flex-row gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full ${period === p ? "bg-nileGreen-500" : "bg-slate-200 dark:bg-slate-700"}`}
            >
              <Text
                className={`text-xs font-semibold ${period === p ? "text-white" : "text-slate-600 dark:text-slate-300"}`}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View className="flex-row gap-4 mb-3">
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded-sm me-1 bg-nileGreen-500" />
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {t("income")}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded-sm me-1 bg-red-400" />
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {t("expense")}
          </Text>
        </View>
      </View>

      {/* Chart */}
      {isLoading ? (
        <View className="h-[200px] items-center justify-center">
          <ActivityIndicator size="small" color={palette.nileGreen[500]} />
        </View>
      ) : (
        <View className="overflow-hidden">
          <BarChart
            data={chartData}
            barWidth={14}
            spacing={period === "6m" ? 24 : 10}
            initialSpacing={10}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={isDark ? palette.slate[700] : palette.slate[200]}
            rulesColor={isDark ? palette.slate[700] : palette.slate[200]}
            // eslint-disable-next-line react-native/no-inline-styles
            yAxisTextStyle={{
              color: isDark ? palette.slate[500] : palette.slate[400],
              fontSize: 10,
            }}
            // eslint-disable-next-line react-native/no-inline-styles
            xAxisLabelTextStyle={{
              color: isDark ? palette.slate[400] : palette.slate[500],
              fontSize: 9,
            }}
            height={160}
            barBorderRadius={4}
            isAnimated
          />
        </View>
      )}

      {/* Summary Stats */}
      <View className="flex-row justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <View className="items-center flex-1">
          <Text className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
            {t("total_income")}
          </Text>
          <Text className="text-sm font-bold text-nileGreen-500 mt-0.5">
            {formatCurrency({
              amount: totalIncome,
              currency,
            })}
          </Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
            {t("total_expenses")}
          </Text>
          <Text className="text-sm font-bold text-red-500 dark:text-red-400 mt-0.5">
            {formatCurrency({
              amount: totalExpenses,
              currency,
            })}
          </Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
            {t("net_savings")}
          </Text>
          <Text
            className={`text-sm font-bold mt-0.5 ${netSavings >= 0 ? "text-nileGreen-500" : "text-red-400"}`}
          >
            {formatCurrency({
              amount: netSavings,
              currency,
            })}
          </Text>
        </View>
      </View>
    </View>
  );
}
