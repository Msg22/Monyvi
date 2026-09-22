/**
 * Live Rates Header
 *
 * Displays back arrow, "Live Rates" title, and connection status indicator.
 * Uses the unified PageHeader component with a custom `rightAction` area.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presenter Component (pure, props-driven)
 * - Why: Header is stateless — connection status comes from hook.
 * - SOLID: SRP — renders only the header UI. OCP — indicator colors are
 *   configurable via isConnected/isStale without modifying this component.
 *
 * @module LiveRatesHeader
 */

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// =============================================================================
// Types
// =============================================================================

interface LiveRatesHeaderProps {
  readonly isLive: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Custom header that mirrors PageHeader's layout but includes the
 * connection indicator in the right slot. Built custom rather than using
 * PageHeader children because the indicator needs to sit in the nav row,
 * not below it.
 *
 * The approved content contract reserves "Live Rates"/الأسعار المباشرة and
 * the Live badge for confirmed-fresh, online rates; every other trust state
 * shows the neutral "Rates"/أسعار السوق title while the per-section trust
 * chips below keep the precise status.
 */
export function LiveRatesHeader({
  isLive,
}: LiveRatesHeaderProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  const { t: tMetals } = useTranslation("metals");

  return (
    <View
      className="px-5 pb-4 mt-2 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top + 10 }}
    >
      <View className="flex-row items-center justify-between h-10">
        {/* Centered Title */}
        <View
          className="absolute start-0 end-0 h-full items-center justify-center"
          pointerEvents="none"
        >
          <Text
            className="text-2xl font-bold text-slate-800 dark:text-white px-12"
            numberOfLines={1}
          >
            {tMetals(isLive ? "live_rates" : "rates")}
          </Text>
        </View>

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          testID="header-back"
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel={t("back")}
        >
          <Ionicons
            name="arrow-back-outline"
            size={28}
            color={isDark ? palette.slate[50] : palette.slate[800]}
          />
        </TouchableOpacity>

        {/* Live indicator (confirmed-fresh rates only) */}
        {isLive ? (
          <View className="flex-row items-center">
            <View className="w-2 h-2 rounded-full me-1.5 bg-nileGreen-500" />
            <Text className="text-sm font-medium text-nileGreen-500">
              {tMetals("live_badge")}
            </Text>
          </View>
        ) : (
          <View className="w-2" />
        )}
      </View>
    </View>
  );
}
