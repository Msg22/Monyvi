/**
 * MetalsHeroCard Component
 *
 * Premium hero card showing total portfolio value with profit/loss indicator.
 * Includes a Tooltip explaining the profit/loss calculation.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component with Composition
 * - Why: Receives pre-computed data from parent; no data fetching.
 * - SOLID: SRP — renders portfolio summary card only.
 *   OCP — styling via props, not hardcoded variants.
 *
 * @module MetalsHeroCard
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getProfitLossColor,
  getProfitLossIcon,
} from "@/utils/profit-loss-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetalsHeroCardProps {
  /** Total portfolio value in preferred currency */
  readonly totalValue: number;
  /** Profit/loss amount in preferred currency */
  readonly profitLossAmount: number;
  /** Profit/loss as a percentage */
  readonly profitLossPercent: number;
  /** User's preferred currency */
  readonly currency: CurrencyType;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DARK_GRADIENT_COLORS: readonly [string, string] = [
  "rgba(217, 119, 6, 0.08)",
  "rgba(15, 23, 42, 0)",
];

const LIGHT_GRADIENT_COLORS: readonly [string, string] = [
  "rgba(217, 119, 6, 0.06)",
  "rgba(255, 255, 255, 0)",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Hero card at the top of the Metals page showing total value and profit/loss.
 */
export function MetalsHeroCard({
  totalValue,
  profitLossAmount,
  profitLossPercent,
  currency,
}: MetalsHeroCardProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { isDark } = useTheme();
  const [showTooltip, setShowTooltip] = useState(false);

  const handleInfoPress = useCallback((): void => {
    setShowTooltip((prev) => !prev);
  }, []);

  const handleTooltipDismiss = useCallback((): void => {
    setShowTooltip(false);
  }, []);

  const formattedTotal = formatCurrency({
    amount: totalValue,
    currency,
  });

  const formattedProfitLoss = formatCurrency({
    amount: Math.abs(profitLossAmount),
    currency,
  });

  const sign = profitLossAmount >= 0 ? "+" : "-";
  const percentText = `${Math.abs(profitLossPercent).toFixed(1)}%`;
  const plColor = getProfitLossColor(profitLossAmount, isDark);
  const plIcon = getProfitLossIcon(profitLossAmount);

  const gradientColors = isDark ? DARK_GRADIENT_COLORS : LIGHT_GRADIENT_COLORS;

  return (
    <View className="mb-6 rounded-3xl overflow-hidden bg-white dark:bg-slate-800 border border-amber-200/30 dark:border-amber-500/10">
      {/* Subtle gold gradient overlay */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />

      <View className="items-center py-8 px-6">
        {/* Label */}
        <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t("total_metals_value")}
        </Text>

        {/* Total Value */}
        <Text className="text-4xl font-bold text-slate-800 dark:text-white">
          {formattedTotal}
        </Text>

        {/* Profit/Loss Row */}
        <View className="flex-row items-center mt-3">
          <Ionicons name={plIcon} size={14} color={plColor} />
          <Text
            className="ms-1 text-sm font-semibold"
            style={{ color: plColor }}
          >
            {sign}
            {formattedProfitLoss} ({percentText})
          </Text>

          {/* Info icon + Tooltip */}
          <View className="relative ms-2">
            <Pressable
              onPress={handleInfoPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("hero_accessibility")}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={isDark ? palette.slate[500] : palette.slate[400]}
              />
            </Pressable>

            <Tooltip
              text={t("metals_tooltip")}
              visible={showTooltip}
              onDismiss={handleTooltipDismiss}
              position="bottom"
              arrowAlignment="center"
            />
          </View>
        </View>
      </View>
    </View>
  );
}
