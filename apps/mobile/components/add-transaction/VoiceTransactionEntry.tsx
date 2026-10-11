import { useLocale } from "@/context/LocaleContext";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";

import { AllowanceCard } from "./voice-ui/AllowanceCard";
import { DailyLimitNotice } from "./voice-ui/DailyLimitNotice";
import { ExamplesCard } from "./voice-ui/ExamplesCard";
import { VoiceGradient } from "./voice-ui/VoiceGradient";
import {
  ParsingIllustration,
  RecordingActivity,
  RecordingRipples,
} from "./voice-ui/VoiceMotion";
import {
  ActionButton,
  PassiveStateActions,
} from "./voice-ui/VoiceStateActions";
import { formatRecordingTimer, getPresentation } from "./voice-ui/VoicePresentation";
import type { VoiceTransactionEntryProps } from "./voice-ui/types";

export type { VoiceTransactionEntryState } from "./voice-ui/types";

/**
 * Receives shaped Voice state only. The server/hook owns quota and permission
 * authority; this view neither calculates remaining uses nor starts providers.
 */
export function VoiceTransactionEntry(
  props: VoiceTransactionEntryProps
): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { language } = useLocale();
  const isArabic = language === "ar";
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const horizontalPadding = isCompact ? 12 : 16;

  const hasAuthoritativeCount =
    props.remaining !== null && props.dailyLimit !== null;
  const showAllowance =
    hasAuthoritativeCount &&
    props.state !== "daily-limit" &&
    props.state !== "unavailable" &&
    props.state !== "loading";

  return (
    <ScrollView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: horizontalPadding,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View
        testID="voice-content"
        className="w-full max-w-[560px] self-center gap-3 py-4"
      >
        {props.state === "loading" ? (
          <LoadingVoiceState />
        ) : (
          <>
            {props.state === "daily-limit" ? (
              <DailyLimitNotice
                dailyLimit={props.dailyLimit}
                isArabic={isArabic}
              />
            ) : null}
            {showAllowance &&
            props.remaining !== null &&
            props.dailyLimit !== null ? (
              <AllowanceCard
                remaining={props.remaining}
                dailyLimit={props.dailyLimit}
                isArabic={isArabic}
                isCompact={isCompact}
              />
            ) : null}
            <VoiceActionSurface {...props} isArabic={isArabic} />
            {props.state === "idle" && props.showExamples !== false ? (
              <ExamplesCard
                isArabic={isArabic}
                onDismiss={props.onDismissExamples}
              />
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function LoadingVoiceState(): React.JSX.Element {
  return (
    <>
      <View className="min-h-32 rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800">
        <View className="h-[18px] w-[58%] overflow-hidden rounded-md">
          <Skeleton width="100%" height={18} borderRadius={6} />
        </View>
        <View className="mt-3 h-4 w-[82%] overflow-hidden rounded-md">
          <Skeleton width="100%" height={16} borderRadius={6} />
        </View>
        <View className="mt-4 h-2 w-full overflow-hidden rounded">
          <Skeleton width="100%" height={8} borderRadius={4} />
        </View>
      </View>
      <View className="min-h-[260px] items-center justify-center py-4">
        <View className="h-[104px] w-[104px] overflow-hidden rounded-[52px]">
          <Skeleton width="100%" height={104} borderRadius={52} />
        </View>
        <View className="mt-5 h-[18px] w-[72%] overflow-hidden rounded-md">
          <Skeleton width="100%" height={18} borderRadius={6} />
        </View>
      </View>
    </>
  );
}

function VoiceActionSurface({
  isArabic,
  ...props
}: VoiceTransactionEntryProps & {
  readonly isArabic: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { fontFamily } = useLocale();
  const presentation = getPresentation(
    props.state,
    props.errorMessage,
    t,
    tCommon
  );

  const [isMicPressed, setIsMicPressed] = useState(false);

  const isRecording = props.state === "recording";
  const isPaused = props.state === "paused";
  const isCompleted = props.state === "completed";
  const isProcessing = props.state === "processing";
  const isDailyLimit = props.state === "daily-limit";
  const isUnavailable = props.state === "unavailable";
  const isStarting = props.state === "starting";

  // Only the idle microphone starts capture. R2 uses explicit actions while
  // recording/paused/completed, so the circular microphone is decorative.
  const hasInteractiveMic = props.state === "idle";
  const hasDecorativeGradientMic =
    isStarting || isRecording || isPaused || isCompleted;
  const showStaticHalos = !(
    props.state === "idle" || hasDecorativeGradientMic
  );
  // The explicit recorder action row uses direction="ltr" to preserve the
  // owner's physical LEFT/CENTER/RIGHT order even in Arabic/RTL layouts.

  return (
    <View
      testID="voice-action-surface"
      accessibilityLiveRegion="polite"
      className="min-h-[260px] items-center justify-center py-4"
    >
      {isProcessing ? (
        <ParsingIllustration isArabic={isArabic} />
      ) : (
        <View className="h-[172px] w-[172px] items-center justify-center">
          {showStaticHalos ? (
            <View
              testID="voice-halo-outer"
              accessible={false}
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              className={`absolute h-[172px] w-[172px] rounded-[86px] ${
                isDailyLimit || isUnavailable
                  ? "bg-slate-200/20 dark:bg-slate-700/25"
                  : "bg-nileGreen-50/60 dark:bg-nileGreen-50/25"
              }`}
            />
          ) : null}
          {isRecording || isPaused ? (
            <RecordingRipples isActive={isRecording} />
          ) : null}
          {showStaticHalos ? (
            <View
              testID="voice-halo-inner"
              accessible={false}
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              className={`absolute h-[140px] w-[140px] rounded-[70px] ${
                isDailyLimit || isUnavailable
                  ? "bg-slate-200/20 dark:bg-slate-700/30"
                  : "bg-nileGreen-100/50 dark:bg-nileGreen-100/40"
              }`}
            />
          ) : null}

          {hasDecorativeGradientMic ? (
            <View
              testID="voice-mic-target"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              className="h-[104px] w-[104px] overflow-hidden rounded-[52px]"
            >
              <VoiceGradient
                colors={[palette.nileGreen[500], palette.nileGreen[600]]}
                className="flex-1 items-center justify-center"
              >
                <Ionicons
                  name={presentation.icon}
                  size={42}
                  color={palette.slate[25]}
                  accessible={false}
                />
              </VoiceGradient>
            </View>
          ) : hasInteractiveMic ? (
            <Pressable
              testID="voice-mic-target"
              accessibilityRole="button"
              accessibilityLabel={presentation.centralLabel}
              onPress={props.onStart}
              onPressIn={() => {
                setIsMicPressed(true);
              }}
              onPressOut={() => {
                setIsMicPressed(false);
              }}
              className="h-[104px] w-[104px] rounded-[52px]"
              style={{
                opacity: isMicPressed ? 0.88 : 1,
                shadowColor: palette.nileGreen[500],
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.24,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <View
                testID="voice-mic-clip"
                className="h-[104px] w-[104px] overflow-hidden rounded-[52px]"
                accessible={false}
                importantForAccessibility="no"
              >
                <VoiceGradient
                  colors={[palette.nileGreen[500], palette.nileGreen[600]]}
                  className="flex-1 items-center justify-center"
                >
                  <Ionicons
                    name={presentation.icon}
                    size={42}
                    color={palette.slate[25]}
                  />
                </VoiceGradient>
              </View>
            </Pressable>
          ) : (
            <View
              testID="voice-mic-target"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              className="h-[104px] w-[104px] items-center justify-center rounded-[52px] bg-slate-200 dark:bg-slate-700"
            >
              <Ionicons
                name={presentation.icon}
                size={42}
                color={palette.slate[400]}
              />
            </View>
          )}
        </View>
      )}

      {isRecording || isPaused ? (
        <RecordingActivity isActive={isRecording} />
      ) : null}

      {isRecording || isPaused || isCompleted ? (
        <Text
          style={{ fontFamily: fontFamily.bold }}
          className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-25"
        >
          {formatRecordingTimer(props.durationMs, isCompleted)}
        </Text>
      ) : null}

      {presentation.title ? (
        <Text
          style={{ fontFamily: fontFamily.bold }}
          accessibilityRole="header"
          className="mt-3 text-center text-lg font-bold leading-7 text-slate-900 dark:text-slate-25"
        >
          {presentation.title}
        </Text>
      ) : null}
      {presentation.description ? (
        <Text
          style={{ fontFamily: fontFamily.regular }}
          className="mt-2 text-center text-sm leading-[22px] text-slate-600 dark:text-slate-300"
        >
          {presentation.description}
        </Text>
      ) : null}

      <View
        className={`mt-4 ${
          isDailyLimit || isUnavailable
            ? "w-full gap-2"
            : "flex-row flex-wrap justify-center gap-2"
        }`}
      >
        {isRecording || isPaused || isCompleted ? (
          <View
            testID="voice-recorder-action-row"
            className="w-full flex-row flex-wrap items-center justify-center gap-2"
            style={{ direction: "ltr" }}
          >
            <ActionButton
              testID="voice-action-submit"
              label={t("voice_action_submit")}
              icon="send"
              onPress={props.onSubmit}
              variant="primary"
            />
            <ActionButton
              testID={isPaused ? "voice-action-resume" : "voice-action-pause"}
              label={t(isPaused ? "voice_action_resume" : "voice_action_pause")}
              icon={isPaused ? "play" : "pause"}
              onPress={isPaused ? props.onResume : props.onPause}
              variant="neutral-outline"
              disabled={isCompleted}
            />
            <ActionButton
              testID="voice-action-discard"
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
              variant="danger-outline"
            />
          </View>
        ) : (
          <PassiveStateActions {...props} isArabic={isArabic} />
        )}
      </View>

      {isDailyLimit && isArabic ? (
        <View className="mt-3 min-h-12 w-full flex-row-reverse items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800">
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={palette.slate[400]}
          />
          <Text
            style={{ fontFamily: fontFamily.regular }}
            className="flex-1 text-right text-xs leading-5 text-slate-600 dark:text-slate-300"
          >
            {tCommon("voice_ui_daily_reset_strip")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
