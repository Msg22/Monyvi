/** #395 compact Voice transcript preview within the review scroll content. */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from "react-native";
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
  const [measurement, setMeasurement] = useState<{
    readonly text: string;
    readonly overflows: boolean;
  } | null>(null);
  const onTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>): void => {
      const overflows = event.nativeEvent.lines.length > 2;
      setMeasurement((previous) =>
        previous?.text === text && previous.overflows === overflows
          ? previous
          : { text, overflows }
      );
    },
    [text]
  );
  if (!text.trim()) return null;
  const canExpand = measurement?.text === text && measurement.overflows;
  const showingFullText = canExpand && expanded;
  const isTranscriptRtl = detectedLanguage.toUpperCase().startsWith("AR");
  const rtl = language === "ar";
  const textClassName =
    "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
    (isTranscriptRtl ? "text-right" : "text-left");
  const writingDirection = isTranscriptRtl ? "rtl" : "ltr";
  return (
    <View
      testID="voice-review-transcript"
      className="mx-4 mb-3 rounded-xl bg-surface px-3 py-3 dark:bg-surface-dark"
    >
      <TouchableOpacity
        testID="voice-review-transcript-toggle"
        accessible={Boolean(canExpand)}
        accessibilityRole={canExpand ? "button" : undefined}
        accessibilityLabel={
          canExpand
            ? t(
                showingFullText
                  ? "compact_review_transcript_collapse"
                  : "compact_review_transcript_expand"
              )
            : undefined
        }
        accessibilityState={
          canExpand ? { expanded: showingFullText } : undefined
        }
        disabled={!canExpand}
        activeOpacity={0.8}
        onPress={() => {
          if (canExpand) setExpanded((value) => !value);
        }}
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
        {canExpand ? (
          <Ionicons
            testID="voice-review-transcript-chevron"
            name={showingFullText ? "chevron-up" : "chevron-down"}
            size={18}
            color={palette.slate[500]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
      </TouchableOpacity>
      <View className="relative mt-1">
        {/* Measure native wrapping without the visible preview's line limit. */}
        <Text
          testID="voice-review-transcript-measure"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          onTextLayout={onTextLayout}
          style={{ writingDirection }}
          className={"absolute inset-x-0 top-0 opacity-0 " + textClassName}
        >
          {text}
        </Text>
        <Text
          testID="voice-review-transcript-text"
          numberOfLines={showingFullText ? undefined : 2}
          ellipsizeMode="tail"
          style={{ writingDirection }}
          className={textClassName}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
