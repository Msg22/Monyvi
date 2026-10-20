/** #395 compact Voice transcript preview within the review scroll content. */
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/context/LocaleContext";
import { palette } from "@/constants/colors";

export interface CompactReviewTranscriptProps {
  readonly text: string;
  readonly detectedLanguage: string;
}

export function CompactReviewTranscript({
  text,
  detectedLanguage,
}: CompactReviewTranscriptProps): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const [expanded, setExpanded] = useState(false);
  if (!text.trim()) return null;
  const isTranscriptRtl = detectedLanguage.toUpperCase().startsWith("AR");
  const rtl = language === "ar";
  return (
    <View
      testID="voice-review-transcript"
      className="mx-4 mb-3 rounded-xl bg-surface px-3 py-3 dark:bg-surface-dark"
    >
      <TouchableOpacity
        testID="voice-review-transcript-toggle"
        accessibilityRole="button"
        accessibilityLabel={t(
          expanded
            ? "compact_review_transcript_collapse"
            : "compact_review_transcript_expand"
        )}
        accessibilityState={{ expanded }}
        activeOpacity={0.8}
        onPress={() => setExpanded((value) => !value)}
        className={
          "min-h-11 items-center gap-2 " +
          (rtl ? "flex-row-reverse" : "flex-row")
        }
      >
        <Ionicons
          name="mic-outline"
          size={17}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          className={
            "min-w-0 flex-1 text-xs font-semibold tracking-wide text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {t("voice_what_i_heard")}
        </Text>
        <Text className="text-xs font-semibold text-text-secondary dark:text-text-secondary-dark">
          {detectedLanguage}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
      <Text
        testID="voice-review-transcript-text"
        numberOfLines={expanded ? undefined : 2}
        ellipsizeMode="tail"
        style={{ writingDirection: isTranscriptRtl ? "rtl" : "ltr" }}
        className={
          "mt-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (isTranscriptRtl ? "text-right" : "text-left")
        }
      >
        {text}
      </Text>
    </View>
  );
}
