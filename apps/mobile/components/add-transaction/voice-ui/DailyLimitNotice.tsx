import { useLocale } from "@/context/LocaleContext";
import { formatLocalizedCount } from "@/utils/localized-number-display";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";

export function DailyLimitNotice({
  dailyLimit,
  isArabic,
}: {
  readonly dailyLimit: number | null;
  readonly isArabic: boolean;
}): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  const { language, fontFamily } = useLocale();
  const limit =
    dailyLimit === null ? null : formatLocalizedCount(dailyLimit, language);

  if (isArabic) {
    return (
      <View
        testID="voice-daily-alert"
        accessibilityLiveRegion="polite"
        className="items-center rounded-2xl border border-red-500/40 bg-red-500/10 p-4"
      >
        <View
          importantForAccessibility="no-hide-descendants"
          className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-red-500/15"
        >
          <Ionicons name="ban-outline" size={24} color={palette.red[500]} />
        </View>
        <Text
          style={{ fontFamily: fontFamily.bold }}
          accessibilityRole="header"
          className="text-center text-lg font-bold leading-7 text-slate-900 dark:text-slate-25"
        >
          {tCommon("voice_ui_daily_title")}
        </Text>
        {limit !== null ? (
          <Text
            style={{ fontFamily: fontFamily.regular }}
            className="mt-2 text-center text-sm leading-[22px] text-slate-600 dark:text-slate-300"
          >
            {tCommon("voice_ui_daily_count", { limit })}
          </Text>
        ) : null}
        <View className="my-4 h-px w-full bg-red-500/20" />
        <View className="flex-row-reverse items-center justify-center gap-2">
          <Ionicons
            name="calendar-outline"
            size={20}
            color={palette.red[500]}
          />
          <Text
            style={{ fontFamily: fontFamily.regular }}
            className="text-center text-xs leading-5 text-slate-600 dark:text-slate-300"
          >
            {tCommon("voice_ui_reset")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      testID="voice-daily-alert"
      accessibilityLiveRegion="polite"
      className="min-h-32 flex-row items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4"
    >
      <View
        importantForAccessibility="no-hide-descendants"
        className="h-16 w-16 items-center justify-center rounded-full bg-red-500/15"
      >
        <Ionicons name="ban-outline" size={24} color={palette.red[500]} />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          style={{ fontFamily: fontFamily.bold }}
          accessibilityRole="header"
          className="text-lg font-bold leading-7 text-slate-900 dark:text-slate-25"
        >
          {tCommon("voice_ui_daily_title")}
        </Text>
        {limit !== null ? (
          <Text
            style={{ fontFamily: fontFamily.regular }}
            className="mt-1 text-sm leading-[22px] text-slate-600 dark:text-slate-300"
          >
            {tCommon("voice_ui_daily_count", { limit })}
          </Text>
        ) : null}
        <Text
          style={{ fontFamily: fontFamily.regular }}
          className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400"
        >
          {tCommon("voice_ui_reset")}
        </Text>
      </View>
    </View>
  );
}
