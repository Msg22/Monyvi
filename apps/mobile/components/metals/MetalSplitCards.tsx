/**
 * MetalSplitCards Component
 *
 * Two side-by-side cards showing Gold vs Silver portfolio breakdown
 * with percentage bars and total values.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component
 * - Why: Receives pre-computed PortfolioSplit; no business logic.
 * - SOLID: SRP — renders the split visualization only.
 *
 * @module MetalSplitCards
 */

import React, { memo } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";

import { palette } from "@/constants/colors";
import type { PortfolioSplit } from "@/hooks/useMetalHoldings";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOLD_BAR_COLOR: ViewStyle = { backgroundColor: palette.gold[500] };
const SILVER_BAR_COLOR: ViewStyle = { backgroundColor: palette.silver[500] };

const MIN_BAR_WIDTH_PERCENT = 5;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SplitCardProps {
  readonly label: string;
  readonly percentage: number;
  readonly totalValue: number;
  readonly itemCount: number;
  readonly currency: CurrencyType;
  readonly barStyle: ViewStyle;
  readonly isGold: boolean;
}

function SplitCardInner({
  label,
  percentage,
  totalValue,
  itemCount,
  currency,
  barStyle,
  isGold,
}: SplitCardProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const formattedValue = formatCurrency({
    amount: totalValue,
    currency,
  });

  const displayPercent = Math.max(percentage, MIN_BAR_WIDTH_PERCENT);

  return (
    <View
      className={`flex-1 rounded-2xl p-4 ${
        isGold
          ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30"
          : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
      }`}
    >
      {/* Label + Percentage */}
      <View className="flex-row items-center justify-between mb-2">
        <Text
          className={`text-xs font-semibold ${
            isGold
              ? "text-amber-800 dark:text-amber-400"
              : "text-slate-600 dark:text-slate-300"
          }`}
        >
          {label}
        </Text>
        <Text
          className={`text-xs font-bold ${
            isGold
              ? "text-amber-700 dark:text-amber-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {percentage.toFixed(0)}%
        </Text>
      </View>

      {/* Progress Bar */}
      <View className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mb-3">
        <View
          className="h-1.5 rounded-full"
          style={[barStyle, { width: `${displayPercent}%` }]}
        />
      </View>

      {/* Value */}
      <Text
        className={`text-sm font-bold ${
          isGold
            ? "text-amber-900 dark:text-amber-300"
            : "text-slate-800 dark:text-white"
        }`}
      >
        {formattedValue}
      </Text>

      {/* Count */}
      <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
        {t("holding", { count: itemCount })}
      </Text>
    </View>
  );
}

const SplitCard = memo(SplitCardInner);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface MetalSplitCardsProps {
  /** Portfolio split data from useMetalHoldings */
  readonly portfolioSplit: PortfolioSplit;
  /** User's preferred currency */
  readonly currency: CurrencyType;
}

/**
 * Two side-by-side cards showing Gold vs Silver portfolio breakdown.
 */
export function MetalSplitCards({
  portfolioSplit,
  currency,
}: MetalSplitCardsProps): React.JSX.Element {
  const { gold, silver } = portfolioSplit;
  const { t } = useTranslation("metals");

  return (
    <View className="flex-row gap-3 mb-6">
      <SplitCard
        label={t("gold")}
        percentage={gold.percentage}
        totalValue={gold.totalValue}
        itemCount={gold.itemCount}
        currency={currency}
        barStyle={GOLD_BAR_COLOR}
        isGold
      />
      <SplitCard
        label={t("silver")}
        percentage={silver.percentage}
        totalValue={silver.totalValue}
        itemCount={silver.itemCount}
        currency={currency}
        barStyle={SILVER_BAR_COLOR}
        isGold={false}
      />
    </View>
  );
}
