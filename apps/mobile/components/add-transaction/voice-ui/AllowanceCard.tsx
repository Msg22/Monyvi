import { useLocale } from "@/context/LocaleContext";
import { formatLocalizedCount } from "@/utils/localized-number-display";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";

export function AllowanceCard({
  remaining,
  dailyLimit,
  isArabic,
  isCompact,
}: {
  readonly remaining: number;
  readonly dailyLimit: number;
  readonly isArabic: boolean;
  readonly isCompact: boolean;
}): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  const { language, fontFamily } = useLocale();

  const safeLimit = Math.max(0, Math.floor(dailyLimit));
  const safeRemaining = Math.min(safeLimit, Math.max(0, Math.floor(remaining)));
  const progress = safeLimit > 0 ? safeRemaining / safeLimit : 0;
  const formattedRemaining = formatLocalizedCount(remaining, language);
  const formattedLimit = formatLocalizedCount(dailyLimit, language);

  return (
    <View
      testID="voice-allowance-card"
      accessibilityLiveRegion="polite"
      className="min-h-32 rounded-2xl border border-nileGreen-500/15 bg-nileGreen-50/50 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <View className="flex-row items-start" style={{ direction: "ltr" }}>
        <View
          importantForAccessibility="no-hide-descendants"
          className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-nileGreen-100 dark:bg-nileGreen-900"
        >
          <Ionicons
            name="mic-outline"
            size={24}
            color={palette.nileGreen[600]}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            style={{ fontFamily: fontFamily.bold }}
            accessibilityRole="header"
            className={`text-lg font-bold leading-7 text-slate-900 dark:text-slate-25 ${
              isArabic ? "text-right" : "text-left"
            }`}
          >
            {tCommon("voice_ui_limited_heading")}
          </Text>
          <Text
            style={{ fontFamily: fontFamily.regular }}
            className={`mt-1 text-sm leading-[22px] text-slate-600 dark:text-slate-300 ${
              isArabic ? "text-right" : "text-left"
            }`}
          >
            {tCommon("voice_ui_remaining", {
              remaining: formattedRemaining,
              limit: formattedLimit,
            })}
          </Text>
          {isArabic ? (
            <>
              <View
                testID="voice-allowance-segments"
                accessibilityLabel={`${formattedRemaining} / ${formattedLimit}`}
                className="mt-3 flex-row-reverse gap-1.5"
                accessible
              >
                {Array.from({ length: safeLimit }, (_, index) => (
                  <View
                    key={index}
                    testID="voice-allowance-segment"
                    accessible={false}
                    className={`h-2 min-w-0 flex-1 rounded-full ${
                      index < safeRemaining
                        ? "bg-nileGreen-600"
                        : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  />
                ))}
              </View>
              <Text
                style={{ fontFamily: fontFamily.regular }}
                className="mt-3 text-right text-xs leading-5 text-slate-500 dark:text-slate-400"
              >
                {tCommon("voice_ui_reset")}
              </Text>
            </>
          ) : (
            <>
              <View
                className={
                  isCompact ? "mt-3 gap-2" : "mt-3 flex-row items-center gap-3"
                }
              >
                <View
                  className={`h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${
                    isCompact ? "w-full" : "flex-1"
                  }`}
                  accessible
                  accessibilityLabel={`${formattedRemaining} / ${formattedLimit}`}
                >
                  <View
                    testID="voice-allowance-progress-fill"
                    className="h-2 rounded-full bg-nileGreen-600"
                    style={{ width: `${progress * 100}%` }}
                  />
                </View>
                <Text
                  style={{ fontFamily: fontFamily.semiBold }}
                  className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200"
                >
                  {formattedRemaining} / {formattedLimit}
                </Text>
              </View>
              <Text
                style={{ fontFamily: fontFamily.regular }}
                className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400"
              >
                {tCommon("voice_ui_reset")}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
