import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useColorScheme } from "nativewind";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

export interface CompactReviewSummaryProps {
  readonly expanded: boolean;
  readonly pendingCount: number;
  readonly accountNeededCount: number;
  readonly isReviewed: boolean;
  readonly onToggle: () => void;
}

export function CompactReviewSummary({
  expanded,
  pendingCount,
  accountNeededCount,
  isReviewed,
  onToggle,
}: CompactReviewSummaryProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const { colorScheme } = useColorScheme();
  const rtl = language === "ar";
  const iconColor =
    colorScheme === "dark"
      ? isReviewed
        ? palette.nileGreen[400]
        : palette.gold[400]
      : isReviewed
        ? palette.nileGreen[700]
        : palette.gold[800];
  const title =
    pendingCount > 0
      ? t("compact_review_pending", { count: pendingCount })
      : accountNeededCount > 0
        ? t("compact_review_account_needed", { count: accountNeededCount })
        : t("compact_review_accounts_reviewed");
  return (
    <TouchableOpacity
      testID="account-review-compact-summary-toggle"
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={title}
      onPress={onToggle}
      className={
        "min-h-12 w-full items-center gap-2 px-3 py-2.5 " +
        (rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <Ionicons
        name={isReviewed ? "checkmark-circle-outline" : "alert-circle-outline"}
        size={20}
        color={iconColor}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View className="min-w-0 flex-1">
        <Text
          className={
            "text-sm font-semibold text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {title}
        </Text>
        <Text
          className={
            "text-xs text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {pendingCount > 0
            ? t("compact_review_confirm_before_save")
            : isReviewed
              ? t("compact_review_confirmed_accounts")
              : t("compact_review_choose_below")}
        </Text>
      </View>
      <Ionicons
        name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
        size={18}
        color={palette.slate[500]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </TouchableOpacity>
  );
}
