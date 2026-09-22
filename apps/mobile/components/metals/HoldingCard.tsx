/**
 * HoldingCard Component
 *
 * Displays a single metal holding with purity badge, name, weight,
 * current value, and profit/loss indicator.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component
 * - Why: Receives enriched MetalHolding data; no data fetching.
 * - SOLID: SRP — renders a single holding card.
 *
 * @module HoldingCard
 */

import { Ionicons } from "@expo/vector-icons";
import React, { memo } from "react";
import { Text, View } from "react-native";

import type { CurrencyType } from "@monyvi/db";
import { formatPurityForDisplay } from "@monyvi/logic";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

import { useTheme } from "@/context/ThemeContext";
import type { MetalHolding } from "@/hooks/useMetalHoldings";
import {
  getProfitLossColor,
  getProfitLossIcon,
} from "@/utils/profit-loss-helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHT_UNIT = "g";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HoldingCardProps {
  /** The enriched metal holding data */
  readonly holding: MetalHolding;
  /** User's preferred currency */
  readonly currency: CurrencyType;
}

/**
 * Card displaying a single metal holding with:
 * - Purity badge (e.g. "24K", "925")
 * - Holding name
 * - Weight in grams
 * - Current value in preferred currency
 * - Profit/loss indicator
 */
function HoldingCardInner({
  holding,
  currency,
}: HoldingCardProps): React.JSX.Element {
  const { isDark } = useTheme();
  const {
    asset,
    assetMetal,
    currentValue,
    profitLossPercent,
    profitLossAmount,
  } = holding;

  const isGold = assetMetal.metalType === "GOLD";

  const purityLabel = formatPurityForDisplay(
    assetMetal.metalType,
    assetMetal.purityFraction
  );

  const formattedValue =
    currentValue === null
      ? "—"
      : formatLocalizedMoneyAmount({
          amount: currentValue,
          currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });

  const weight = `${assetMetal.weightGrams.toFixed(1)}${WEIGHT_UNIT}`;
  const sign = profitLossAmount !== null && profitLossAmount >= 0 ? "+" : "-";
  const percentText =
    profitLossPercent === null
      ? "—"
      : `${sign}${Math.abs(profitLossPercent).toFixed(1)}%`;
  const plColor = getProfitLossColor(profitLossAmount ?? 0, isDark);
  const plIcon = getProfitLossIcon(profitLossAmount ?? 0);

  return (
    <View className="mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <View className="flex-row items-center justify-between">
        {/* Left: Badge + Name + Weight */}
        <View className="flex-row items-center flex-1">
          {/* Purity Badge */}
          <View
            className={`min-w-[48px] items-center rounded-full px-3 py-1.5 ${
              isGold
                ? "bg-amber-100 dark:bg-amber-900/40"
                : "bg-slate-100 dark:bg-slate-700"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isGold
                  ? "text-amber-800 dark:text-amber-400"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {purityLabel}
            </Text>
          </View>

          {/* Name + Weight */}
          <View className="ms-3 flex-1">
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-slate-800 dark:text-white"
            >
              {asset.name}
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              {weight}
            </Text>
          </View>
        </View>

        {/* Right: Value + P/L */}
        <View className="items-end ms-3">
          <Text className="text-sm font-semibold text-slate-800 dark:text-white">
            {formattedValue}
          </Text>
          <View className="flex-row items-center mt-0.5">
            {profitLossAmount !== null && (
              <Ionicons name={plIcon} size={10} color={plColor} />
            )}
            <Text
              className="ms-0.5 text-xs font-medium"
              style={{ color: plColor }}
            >
              {percentText}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const HoldingCard = memo(HoldingCardInner);
