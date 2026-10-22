import React from "react";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

import type {
  ReviewNotice,
  ReviewNoticeSurface,
} from "@/hooks/useReviewNotice";

/** Persistent, dismissible Review feedback. Parent places it below its header. */
export function ReviewInlineNotice({
  notice,
  surface,
  onDismiss,
}: {
  readonly notice: ReviewNotice | null;
  readonly surface: ReviewNoticeSurface;
  readonly onDismiss: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const { language, isRTL } = useLocale();
  const textDirection = language === "ar" ? "rtl" : "ltr";
  const textAlign = language === "ar" ? "text-right" : "text-left";
  if (!notice) return null;
  const style =
    notice.tone === "error"
      ? "border-red-500/40 bg-red-50 dark:bg-red-900/20"
      : notice.tone === "warning"
        ? "border-gold-600/40 bg-gold-50 dark:bg-gold-900/20"
        : "border-nileGreen-500/40 bg-nileGreen-50 dark:bg-nileGreen-900/20";
  return (
    <View
      testID={`review-inline-notice-${surface}`}
      accessibilityRole="alert"
      accessibilityLanguage={language}
      className={`mx-4 my-2 items-start rounded-lg border px-3 py-3 ${isRTL ? "flex-row-reverse" : "flex-row"} ${style}`}
    >
      <View className="min-w-0 flex-1">
        <Text
          className={`text-sm font-semibold text-text-primary dark:text-text-primary-dark ${textAlign}`}
          style={{ writingDirection: textDirection }}
        >
          {notice.title}
        </Text>
        <Text
          className={`mt-1 text-sm text-text-secondary dark:text-text-secondary-dark ${textAlign}`}
          style={{ writingDirection: textDirection }}
        >
          {notice.message}
        </Text>
        {notice.action ? (
          <TouchableOpacity
            testID={`review-inline-notice-action-${surface}`}
            accessibilityRole="button"
            accessibilityLabel={notice.action.label}
            onPress={notice.action.onPress}
            className="mt-2 min-h-12 min-w-12 self-start justify-center px-2"
          >
            <Text
              className={`text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400 ${textAlign}`}
              style={{ writingDirection: textDirection }}
            >
              {notice.action.label}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        testID={`review-inline-notice-dismiss-${surface}`}
        accessibilityRole="button"
        accessibilityLabel={t("review_notice_dismiss")}
        onPress={onDismiss}
        hitSlop={8}
        className="ms-3 min-h-12 min-w-12 items-center justify-center"
      >
        <Text className="text-xl text-text-secondary dark:text-text-secondary-dark">
          ×
        </Text>
      </TouchableOpacity>
    </View>
  );
}
