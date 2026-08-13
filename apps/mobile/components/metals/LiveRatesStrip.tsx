/**
 * LiveRatesStrip Component
 *
 * Sticky bottom strip displaying live gold and silver prices
 * fetched from the MarketRates hook.
 *
 * Architecture & Design Rationale:
 * - Pattern: Container Component (thin)
 * - Why: Fetches market rates via useMarketRates and formats for display.
 *   Kept minimal; complex formatting delegated to logic utils.
 * - SOLID: SRP — renders the live rate ticker only.
 *
 * @module LiveRatesStrip
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

import { getChangeColor, getChangeIcon } from "@/utils/profit-loss-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveRatesStripProps {
  /** Gold price per gram in USD */
  readonly goldPricePerGramUsd: number;
  /** Silver price per gram in USD */
  readonly silverPricePerGramUsd: number;
  /** Gold 24h change percentage (positive = up) */
  readonly goldChangePercent: number;
  /** Silver 24h change percentage (positive = up) */
  readonly silverChangePercent: number;
  /** Measured bottom offset owned by the parent navigation surface. */
  readonly bottomOffset?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TROY_OUNCE_GRAMS = 31.1035;

const STRIP_SHADOW: ViewStyle = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.1,
  shadowRadius: 8,
  elevation: 8,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sticky bottom strip showing live gold/silver prices.
 * Gold displays price per troy ounce, silver per gram.
 */
export function LiveRatesStrip({
  goldPricePerGramUsd,
  silverPricePerGramUsd,
  goldChangePercent,
  silverChangePercent,
  bottomOffset = 0,
}: LiveRatesStripProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const goldPerOz = goldPricePerGramUsd * TROY_OUNCE_GRAMS;
  const goldColor = getChangeColor(goldChangePercent);
  const silverColor = getChangeColor(silverChangePercent);

  const accessibilityLabel = t("live_rates_accessibility", {
    goldPrice: goldPerOz.toFixed(0),
    goldDirection:
      goldChangePercent >= 0 ? t("direction_up") : t("direction_down"),
    goldChange: Math.abs(goldChangePercent).toFixed(1),
    silverPrice: silverPricePerGramUsd.toFixed(2),
    silverDirection:
      silverChangePercent >= 0 ? t("direction_up") : t("direction_down"),
    silverChange: Math.abs(silverChangePercent).toFixed(1),
  });

  return (
    <View
      className="absolute start-4 end-4 flex-row items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
      style={[STRIP_SHADOW, { bottom: bottomOffset + 10 }]}
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Gold Price */}
      <View className="flex-row items-center">
        <Text className="text-xs text-slate-500 dark:text-slate-400 me-1">
          {t("gold_24k_label")}
        </Text>
        <Text className="text-xs font-bold text-slate-800 dark:text-white me-1">
          ${goldPerOz.toFixed(0)}/oz
        </Text>
        <Ionicons
          name={getChangeIcon(goldChangePercent)}
          size={12}
          color={goldColor}
          accessible={false}
        />
      </View>

      {/* Divider */}
      <View className="h-4 w-px mx-3 bg-slate-200 dark:bg-slate-600" />

      {/* Silver Price */}
      <View className="flex-row items-center">
        <Text className="text-xs text-slate-500 dark:text-slate-400 me-1">
          {t("silver_label")}
        </Text>
        <Text className="text-xs font-bold text-slate-800 dark:text-white me-1">
          ${silverPricePerGramUsd.toFixed(2)}/g
        </Text>
        <Ionicons
          name={getChangeIcon(silverChangePercent)}
          size={12}
          color={silverColor}
          accessible={false}
        />
      </View>
    </View>
  );
}
