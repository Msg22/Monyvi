import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";

interface SmsReviewUndoBannerProps {
  readonly discardedName: string;
  readonly onUndo: () => void | Promise<void>;
  readonly onClose: () => void;
}

export function SmsReviewUndoBanner({
  discardedName,
  onUndo,
  onClose,
}: SmsReviewUndoBannerProps): React.JSX.Element {
  const { t } = useTranslation("transactions");

  return (
    <Animated.View
      entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
      className="mb-3 flex-row items-center rounded-lg border border-nileGreen-500/40 bg-surface px-3 py-2 dark:bg-surface-dark"
      testID="sms-review-undo-banner"
    >
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={2}
          className="text-sm font-semibold text-text-primary dark:text-text-primary-dark"
        >
          {t("sms_review_undo_title", { name: discardedName })}
        </Text>
        <Text
          numberOfLines={2}
          className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark"
        >
          {t("sms_review_undo_description")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => void onUndo()}
        hitSlop={8}
        activeOpacity={0.7}
        accessibilityRole="button"
        className="mx-2 h-9 justify-center px-2"
      >
        <Text className="text-sm font-bold text-nileGreen-600 dark:text-nileGreen-400">
          {t("sms_review_undo")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="sms-review-undo-close"
        onPress={onClose}
        hitSlop={8}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("sms_review_undo_close")}
        className="h-9 w-9 items-center justify-center"
      >
        <Ionicons name="close" size={19} color={palette.slate[400]} />
      </TouchableOpacity>
    </Animated.View>
  );
}
