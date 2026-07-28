import { palette } from "@/constants/colors";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

interface SmsReviewResumeStateProps {
  readonly itemCount: number;
  readonly onContinueReview: () => void;
  readonly onCheckNewMessages: () => void;
  readonly onBack: () => void;
}

export function SmsReviewResumeState({
  itemCount,
  onContinueReview,
  onCheckNewMessages,
  onBack,
}: SmsReviewResumeStateProps): React.JSX.Element {
  const { t } = useTranslation("transactions");

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <PageHeader
        title={t("sms_scan_header")}
        showDrawer={false}
        showBackButton
        centerTitle
        onBack={onBack}
        backAccessibilityLabel={t("back_to_dashboard")}
      />

      <View className="flex-1 justify-center px-4 pb-10">
        <View className="items-center">
          <View className="mb-5 h-16 w-16 items-center justify-center rounded-2xl bg-nileGreen-500/15">
            <Ionicons
              name="document-text-outline"
              size={32}
              color={palette.nileGreen[500]}
            />
          </View>
          <Text className="text-center text-xl font-bold text-text-primary dark:text-text-primary-dark">
            {t("sms_review_pending_title")}
          </Text>
          <Text className="mt-2 max-w-sm text-center text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
            {t("sms_review_pending_description")}
          </Text>
        </View>

        <View className="mt-8 gap-3">
          <TouchableOpacity
            testID="sms-review-resume-primary"
            accessibilityRole="button"
            onPress={onContinueReview}
            activeOpacity={0.85}
            className="min-h-14 flex-row items-center justify-center rounded-2xl bg-nileGreen-500 px-5"
          >
            <Text className="text-base font-bold text-white">
              {t("sms_review_continue", { count: itemCount })}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={palette.slate[25]}
            />
          </TouchableOpacity>

          <TouchableOpacity
            testID="sms-review-check-new"
            accessibilityRole="button"
            onPress={onCheckNewMessages}
            activeOpacity={0.8}
            className="min-h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-25 px-5 dark:border-slate-700 dark:bg-slate-800"
          >
            <Ionicons
              name="refresh-outline"
              size={20}
              color={palette.nileGreen[500]}
            />
            <Text className="text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400">
              {t("sms_review_check_new")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
