import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";

interface QaSmsMessageEmptyStateProps {
  readonly onRetry: () => void;
}

export function QaSmsMessageEmptyState({
  onRetry,
}: QaSmsMessageEmptyStateProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");

  return (
    <View
      testID="qa-sms-message-empty-state"
      className="flex-1 items-center justify-center px-8 pb-8"
    >
      <View className="h-20 w-20 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700">
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={38}
          color={palette.slate[500]}
        />
      </View>
      <Text className="mt-6 text-center text-xl font-bold text-text-primary dark:text-text-primary-dark">
        {t("empty_title")}
      </Text>
      <Text className="mt-3 text-center text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
        {t("empty_description")}
      </Text>
      <TouchableOpacity
        testID="qa-sms-empty-retry"
        className="mt-6 min-h-12 items-center justify-center rounded-lg border border-nileGreen-600 px-6"
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {t("retry")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export type { QaSmsMessageEmptyStateProps };
