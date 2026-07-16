import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";

interface PartialSmsResultsNoticeProps {
  readonly unresolvedCount: number;
  readonly isRetrying: boolean;
  readonly onRetry: () => void;
}

export function PartialSmsResultsNotice({
  unresolvedCount,
  isRetrying,
  onRetry,
}: PartialSmsResultsNoticeProps): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  if (unresolvedCount === 0) return null;

  return (
    <View
      testID="partial-sms-results-notice"
      accessibilityRole="alert"
      className="mt-3 flex-row items-center rounded-lg border border-gold-500 bg-gold-50 px-3 py-3 dark:bg-gold-950/30"
    >
      <Ionicons name="warning-outline" size={24} color={palette.gold[500]} />
      <View className="ms-3 min-w-0 flex-1">
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
          {t("partial_sms_title", { count: unresolvedCount })}
        </Text>
        <Text className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
          {t("partial_sms_description")}
        </Text>
      </View>
      <View className="mx-3 h-10 w-px bg-gold-500/50" />
      <TouchableOpacity
        testID="partial-sms-retry"
        accessibilityRole="button"
        accessibilityState={{ disabled: isRetrying, busy: isRetrying }}
        disabled={isRetrying}
        activeOpacity={0.7}
        onPress={onRetry}
        className="h-10 flex-row items-center justify-center"
      >
        <Ionicons name="sync" size={20} color={palette.nileGreen[600]} />
        <Text className="ms-1.5 text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {isRetrying
            ? t("partial_sms_retrying")
            : t("partial_sms_retry", { count: unresolvedCount })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
