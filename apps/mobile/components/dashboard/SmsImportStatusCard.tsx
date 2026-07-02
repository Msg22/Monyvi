/**
 * SmsImportStatusCard
 *
 * Compact dashboard banner showing SMS auto-import status.
 * Displays the count of SMS-sourced transactions this month,
 * last scan time, and a toggle to enable/disable SMS permission.
 *
 * Only renders on Android when SMS permission has been granted.
 *
 * Mockup reference: SMS Import Status Card image
 *
 * @module SmsImportStatusCard
 */

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useSmsImportStats } from "@/hooks/useSmsImportStats";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { useSmsSync } from "@/hooks/useSmsSync";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { memo, useCallback, useMemo } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Formats a timestamp into a human-readable relative time string.
 */
function formatLastScan(
  timestamp: number | null,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!timestamp) {
    return t("sms_never_scanned");
  }

  const diffMs = Date.now() - timestamp;
  // Guard against future timestamps (e.g., clock skew)
  if (diffMs < 0) {
    return t("just_now");
  }
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return t("just_now");
  if (diffMinutes < 60) {
    return t("sms_last_scan", {
      time: t("minutes_ago", { count: diffMinutes }),
    });
  }
  if (diffHours < 24) {
    return t("sms_last_scan", {
      time: t("hours_ago", { count: diffHours }),
    });
  }
  return t("sms_last_scan", {
    time: t("days_ago", { count: diffDays }),
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

function SmsImportStatusCardComponent(): React.ReactElement | null {
  const { t } = useTranslation("common");
  const { isDark } = useTheme();
  const router = useRouter();
  const { status, isAndroid } = useSmsPermission();
  const { hasSynced, lastSyncTimestamp } = useSmsSync();
  const { importedThisMonth, isLoading } = useSmsImportStats();

  const isEnabled = status === "granted";

  const lastScanText = useMemo(
    () => formatLastScan(lastSyncTimestamp, t),
    [lastSyncTimestamp, t]
  );

  const handleCardPress = useCallback((): void => {
    router.push("/sms-scan");
  }, [router]);

  const handleToggle = useCallback((): void => {
    // Navigate to SMS settings/scan screen for toggling
    router.push("/sms-scan");
  }, [router]);

  // Only show on Android after user has synced at least once
  if (!isAndroid || !hasSynced || isLoading) {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={handleCardPress}
      activeOpacity={0.7}
      className="flex-row items-center rounded-xl p-3.5 mt-4 overflow-hidden bg-slate-100 dark:bg-slate-800 border-s-2 border-s-nileGreen-500"
    >
      {/* SMS Icon */}
      <View className="w-10 h-10 rounded-[10px] items-center justify-center bg-nileGreen-500/10">
        <Ionicons name="chatbubble" size={20} color={palette.nileGreen[500]} />
      </View>

      {/* Text Content */}
      <View className="flex-1 ms-3">
        <Text
          className="text-sm font-bold text-slate-800 dark:text-slate-50"
          numberOfLines={1}
        >
          {t("sms_imported_count", { count: importedThisMonth })}
        </Text>
        <Text className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400/70">
          {lastScanText}
        </Text>
      </View>

      {/* Toggle Switch — isDark used for component color props (allowed exception) */}
      <Switch
        value={isEnabled}
        onValueChange={handleToggle}
        trackColor={{
          false: isDark ? palette.slate[600] : palette.slate[300],
          true: palette.nileGreen[500],
        }}
        thumbColor={palette.slate[25]}
        className="ms-2"
      />
    </TouchableOpacity>
  );
}

export const SmsImportStatusCard = memo(SmsImportStatusCardComponent);
