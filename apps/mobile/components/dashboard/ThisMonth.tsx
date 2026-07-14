/**
 * ThisMonth Section - Dashboard period summary with ring gauge
 *
 * Design: Option D - Minimal ring with filter chips
 * Shows: Income, Expenses, Saved (amount + percentage)
 * Features: Filter chips for different time periods, dynamic title
 */

import { formatCurrency } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { palette } from "@/constants/colors";
import { ThisMonthSkeleton } from "@/components/dashboard/skeletons/ThisMonthSkeleton";
import { useTheme } from "@/context/ThemeContext";
import { usePeriodSummary, type PeriodFilter } from "@/hooks/usePeriodSummary";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { translatePeriod } from "@/utils/period-translation";
import { useTranslation } from "react-i18next";

// =============================================================================
// Constants
// =============================================================================

const RING_SIZE = 80;
const RING_STROKE_WIDTH = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const FILTER_OPTIONS: PeriodFilter[] = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "six_months",
  "this_year",
];

// =============================================================================
// Sub-Components
// =============================================================================

interface RingGaugeProps {
  percentage: number;
}

/**
 * Returns a contextual color based on spending percentage.
 * Green (<60%) = on track, Yellow (60-80%) = watch spending, Red (>80%) = over budget.
 */
function getGaugeColor(percentage: number): string {
  if (percentage < 60) return palette.nileGreen[500];
  if (percentage < 80) return palette.orange[500];
  return palette.red[500];
}

function RingGauge({ percentage }: RingGaugeProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  // Clamp percentage between 0 and 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset =
    RING_CIRCUMFERENCE - (clampedPercentage / 100) * RING_CIRCUMFERENCE;
  const gaugeColor = getGaugeColor(clampedPercentage);

  return (
    <View
      className="relative items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <Svg width={RING_SIZE} height={RING_SIZE}>
        {/* Background Circle */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={isDark ? palette.slate[700] : palette.slate[200]}
          strokeWidth={RING_STROKE_WIDTH}
          fill="transparent"
        />
        {/* Progress Circle */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={gaugeColor}
          strokeWidth={RING_STROKE_WIDTH}
          fill="transparent"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      {/* Center Text */}
      <View className="absolute items-center justify-center">
        <Text className="text-lg font-bold text-slate-800 dark:text-slate-25">
          {clampedPercentage}%
        </Text>
        <Text className="text-[10px] font-medium mt-0.5 text-slate-500 dark:text-slate-400">
          {t("spent")}
        </Text>
      </View>
    </View>
  );
}

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

function FilterChip({
  label,
  isSelected,
  onPress,
}: FilterChipProps): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-1.5 rounded-2xl border ${
        isSelected
          ? "bg-nileGreen-500 border-nileGreen-500"
          : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          isSelected ? "text-white" : "text-slate-600 dark:text-slate-300"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// =============================================================================
// Main Component
/**
 * Renders the "This Month" dashboard card showing a period summary with a ring gauge, income/expense/saved stats, and selectable period filter chips.
 *
 * Displays a loading indicator while the period summary is being fetched, updates contents when the selected period changes, and navigates to the transactions screen when the "Details" action is pressed.
 *
 * @returns A React element containing the period summary card with ring gauge, stats, divider, and horizontal filter chips.
 */

function ThisMonthComponent(): React.JSX.Element {
  const [selectedPeriod, setSelectedPeriod] =
    useState<PeriodFilter>("this_month");
  const { data, isLoading } = usePeriodSummary(selectedPeriod);
  const { preferredCurrency } = usePreferredCurrency();
  const { t } = useTranslation("common");

  const handleDetails = useCallback((): void => {
    router.push("/transactions");
  }, []);

  const handlePeriodSelect = useCallback((filter: PeriodFilter): void => {
    setSelectedPeriod(filter);
  }, []);

  const title = translatePeriod(t, selectedPeriod);

  if (isLoading) {
    return <ThisMonthSkeleton />;
  }

  return (
    <View className="my-4 rounded-2xl border p-4 overflow-hidden bg-slate-100/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold text-slate-800 dark:text-slate-25">
          {title}
        </Text>
        <TouchableOpacity
          onPress={handleDetails}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="flex-row items-center"
        >
          <Text className="text-sm font-semibold text-nileGreen-500">
            {t("details")}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={palette.nileGreen[500]}
            className="ms-1"
          />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View className="flex-row items-center mb-4">
        {/* Ring Gauge */}
        <RingGauge percentage={data.spentPercentage} />

        {/* Stats */}
        <View className="flex-1 ms-5 gap-2">
          {/* Income */}
          <View className="flex-row items-center">
            <Text className="stat-label me-1.5">{t("income_label")}</Text>
            <Text className="text-sm font-semibold text-nileGreen-500">
              {formatCurrency({
                amount: data.totalIncome,
                currency: preferredCurrency,
              })}{" "}
              ↑
            </Text>
          </View>

          {/* Expenses */}
          <View className="flex-row items-center">
            <Text className="stat-label me-1.5">{t("expenses_label")}</Text>
            <Text className="text-sm font-semibold text-red-500">
              {formatCurrency({
                amount: data.totalExpenses,
                currency: preferredCurrency,
              })}{" "}
              ↓
            </Text>
          </View>

          {/* Saved / Deficit */}
          <View className="flex-row items-center">
            <Text className="stat-label me-1.5">
              {data.savings >= 0 ? t("saved_label") : t("deficit_label")}
            </Text>
            <Text
              className={`text-sm font-semibold ${data.savings >= 0 ? "text-gold-600" : "text-red-500"}`}
            >
              {formatCurrency({
                amount: Math.abs(data.savings),
                currency: preferredCurrency,
              })}{" "}
              ({Math.abs(data.savingsPercentage)}%){" "}
              {data.savings >= 0 ? "✓" : "⚠"}
            </Text>
          </View>
        </View>
      </View>

      {/* Divider Line */}
      <View className="h-[1px] bg-slate-200 dark:bg-slate-700 -mx-4 mb-3" />

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4"
        contentContainerClassName="flex-row gap-2 px-4"
      >
        {FILTER_OPTIONS.map((filter) => (
          <FilterChip
            key={filter}
            label={translatePeriod(t, filter)}
            isSelected={selectedPeriod === filter}
            onPress={() => handlePeriodSelect(filter)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export const ThisMonth = React.memo(ThisMonthComponent);
