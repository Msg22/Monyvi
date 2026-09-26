/**
 * Live Rates Empty State
 *
 * Full-page empty state shown when no market rate data is cached (offline/first launch).
 * Features a View-composition illustration matching the approved Stitch mockup:
 * dark card with green left border, abstract bar chart, wifi-off icon, and line graph.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component (pure, no state)
 * - Why: Parent (LiveRatesScreen) decides when to show it based on `hasData`.
 * - SOLID: SRP — renders only the empty state UI. No business logic.
 *
 * @module LiveRatesEmptyState
 */

import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Composed illustration: a rounded dark card containing abstract bar chart
 * columns (green, low opacity), a wifi-off icon in a bordered circle,
 * abstract line graph dots, and a signal-off indicator in the corner.
 * Built entirely using View blocks + Ionicons — no static images.
 */
function EmptyIllustration(): React.JSX.Element {
  return (
    <View className="w-48 h-48 items-center justify-center">
      {/* Background card shell with green left border */}
      <View className="absolute inset-0 rounded-2xl overflow-hidden bg-slate-800 border-l-2 border-l-nileGreen-500">
        {/* Abstract bar chart at bottom — low opacity */}
        <View className="absolute bottom-0 start-0 end-0 p-4 opacity-20">
          <View className="flex-row items-end gap-2 h-12">
            <View className="w-4 h-6 rounded-t-sm bg-nileGreen-500" />
            <View className="w-4 h-9 rounded-t-sm bg-nileGreen-500" />
            <View className="w-4 h-4 rounded-t-sm bg-nileGreen-500" />
            <View className="w-4 h-12 rounded-t-sm bg-nileGreen-500" />
          </View>
          {/* Abstract horizontal lines */}
          <View className="mt-3 h-1 rounded-full bg-nileGreen-500/30" />
          <View className="mt-2 w-2/3 h-1 rounded-full bg-nileGreen-500/30" />
        </View>
      </View>

      {/* Central wifi-off icon in bordered circle */}
      <View className="w-24 h-24 items-center justify-center rounded-full bg-slate-900/50 border border-slate-600/50">
        <Ionicons
          name="cloud-offline-outline"
          size={48}
          className="text-slate-500"
          color={palette.slate[500]}
        />
      </View>

      {/* Abstract line graph dots below circle */}
      <View className="flex-row items-center mt-2 gap-2.5 opacity-40">
        <View className="w-1 h-1 rounded-full bg-nileGreen-500" />
        <View className="w-6 h-0.5 rounded-full bg-nileGreen-500" />
        <View className="w-1 h-1 rounded-full bg-nileGreen-500" />
        <View className="w-6 h-0.5 rounded-full bg-nileGreen-500" />
        <View className="w-1 h-1 rounded-full bg-nileGreen-500" />
      </View>

      {/* Signal-off icon at top-right corner */}
      <View className="absolute top-4 end-4 opacity-60">
        <Ionicons
          name="cellular-outline"
          size={24}
          color={palette.nileGreen[500]}
        />
      </View>
    </View>
  );
}

// =============================================================================
// Component
// =============================================================================

export function LiveRatesEmptyState(): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View className="flex-1 items-center justify-center px-8 pb-20">
      {/* Composed illustration */}
      <View className="mb-5">
        <EmptyIllustration />
      </View>

      {/* Heading */}
      <Text className="text-xl font-semibold text-slate-900 dark:text-white text-center">
        {t("rates_unavailable")}
      </Text>

      {/* Description */}
      <Text className="mt-3 text-sm text-center leading-5 text-slate-600 dark:text-slate-400">
        {t("pull_to_refresh_offline")}
      </Text>
    </View>
  );
}
