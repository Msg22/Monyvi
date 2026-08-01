import React from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";

import { palette } from "@/constants/colors";

import { PitchMockCard } from "./PitchMockCard";

const COMPACT_HEIGHT_BREAKPOINT = 700;

interface VoiceResult {
  readonly id: "coffee" | "clothes" | "borrowed";
  readonly title: string;
  readonly category: string;
  readonly amount: string;
  readonly accessibilityLabel: string;
  readonly iconName: React.ComponentProps<typeof Ionicons>["name"];
  readonly iconColor: string;
  readonly iconBackgroundClassName: string;
  readonly amountClassName: string;
}

interface VoiceResultRowProps {
  readonly result: VoiceResult;
  readonly isCompact: boolean;
  readonly isRtl: boolean;
}

function VoiceResultRow({
  result,
  isCompact,
  isRtl,
}: VoiceResultRowProps): React.ReactElement {
  return (
    <View
      accessible
      accessibilityLabel={result.accessibilityLabel}
      testID={`voice-pitch-result-${result.id}`}
      className={`flex-row items-center border-b border-slate-100 dark:border-slate-700 ${
        isCompact ? "min-h-[42px] py-1" : "min-h-[50px] py-2"
      }`}
    >
      <View
        className={`items-center justify-center rounded-xl ${
          result.iconBackgroundClassName
        } ${isCompact ? "h-8 w-8" : "h-9 w-9"}`}
      >
        <Ionicons
          name={result.iconName}
          size={isCompact ? 15 : 17}
          color={result.iconColor}
        />
      </View>

      <View className={`flex-1 ${isRtl ? "mr-3" : "ml-3"}`}>
        <Text
          numberOfLines={1}
          className={`font-semibold text-slate-900 dark:text-white ${
            isCompact ? "text-[11px]" : "text-xs"
          } ${isRtl ? "text-right" : "text-left"}`}
        >
          {result.title}
        </Text>
        <Text
          numberOfLines={1}
          className={`mt-0.5 text-slate-500 dark:text-slate-400 ${
            isCompact ? "text-[9px]" : "text-[10px]"
          } ${isRtl ? "text-right" : "text-left"}`}
        >
          {result.category}
        </Text>
      </View>

      <Text
        testID={`voice-pitch-result-${result.id}-amount`}
        className={`text-xs font-bold ${result.amountClassName}`}
        style={{ writingDirection: "ltr" }}
      >
        {result.amount}
      </Text>
    </View>
  );
}

export function Slide1Voice(): React.ReactElement {
  const { t, i18n } = useTranslation("onboarding");
  const { height } = useWindowDimensions();
  const isCompact = height < COMPACT_HEIGHT_BREAKPOINT;
  const isRtl = i18n.dir() === "rtl";

  const results: readonly VoiceResult[] = [
    {
      id: "coffee",
      title: t("pitch_slide_voice_result_coffee_title"),
      category: t("pitch_slide_voice_result_coffee_category"),
      amount: "−40 EGP",
      accessibilityLabel: t("pitch_slide_voice_result_coffee_accessibility"),
      iconName: "cafe-outline",
      iconColor: palette.orange[500],
      iconBackgroundClassName: "bg-orange-500/15",
      amountClassName: "text-red-500 dark:text-red-400",
    },
    {
      id: "clothes",
      title: t("pitch_slide_voice_result_clothes_title"),
      category: t("pitch_slide_voice_result_clothes_category"),
      amount: "−2,000 EGP",
      accessibilityLabel: t("pitch_slide_voice_result_clothes_accessibility"),
      iconName: "shirt-outline",
      iconColor: palette.violet[500],
      iconBackgroundClassName: "bg-violet-500/15",
      amountClassName: "text-red-500 dark:text-red-400",
    },
    {
      id: "borrowed",
      title: t("pitch_slide_voice_result_borrowed_title"),
      category: t("pitch_slide_voice_result_borrowed_category"),
      amount: "+500 EGP",
      accessibilityLabel: t("pitch_slide_voice_result_borrowed_accessibility"),
      iconName: "wallet-outline",
      iconColor: palette.nileGreen[500],
      iconBackgroundClassName: "bg-nileGreen-500/15",
      amountClassName: "text-nileGreen-600 dark:text-nileGreen-400",
    },
  ];

  return (
    <PitchMockCard density="compact">
      <View
        testID="voice-pitch-results"
        style={{ direction: isRtl ? "rtl" : "ltr" }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-nileGreen-500/15">
              <FontAwesome5
                name="microphone"
                size={13}
                color={palette.nileGreen[500]}
              />
            </View>
            <Text
              className={`text-xs font-semibold text-slate-600 dark:text-slate-300 ${
                isRtl ? "mr-2" : "ml-2"
              }`}
            >
              {t("pitch_slide_voice_listening")}
            </Text>
          </View>

          <View className="rounded-full bg-nileGreen-500/10 px-3 py-1 dark:bg-nileGreen-500/15">
            <Text className="text-[10px] font-bold text-nileGreen-700 dark:text-nileGreen-300">
              {t("pitch_slide_voice_count")}
            </Text>
          </View>
        </View>

        <Text
          className={`mt-2 rounded-xl bg-slate-50 px-3 py-2 italic text-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
            isCompact
              ? "text-[9px] leading-[13px]"
              : "text-[11px] leading-[16px]"
          } ${isRtl ? "text-right" : "text-left"}`}
        >
          {["“", t("pitch_slide_voice_transcript"), "”"].join("")}
        </Text>

        <View className={isCompact ? "mt-1" : "mt-2"}>
          {results.map((result) => (
            <VoiceResultRow
              key={result.id}
              result={result}
              isCompact={isCompact}
              isRtl={isRtl}
            />
          ))}
        </View>

        <View
          testID="voice-pitch-review-status"
          accessible
          accessibilityRole="summary"
          className="mt-2 flex-row items-center justify-center rounded-xl bg-nileGreen-500/10 px-3 py-2 dark:bg-nileGreen-600"
        >
          <Ionicons
            name="checkmark"
            size={13}
            color={isRtl ? palette.slate[25] : palette.nileGreen[700]}
          />
          <Text className="mx-1 text-[10px] font-bold text-nileGreen-700 dark:text-white">
            {t("pitch_slide_voice_review_ready")}
          </Text>
        </View>
      </View>
    </PitchMockCard>
  );
}
