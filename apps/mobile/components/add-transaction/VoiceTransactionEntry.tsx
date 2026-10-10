import { useLocale } from "@/context/LocaleContext";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";

import { AllowanceCard } from "./voice-ui/AllowanceCard";
import { DailyLimitNotice } from "./voice-ui/DailyLimitNotice";
import { ExamplesCard } from "./voice-ui/ExamplesCard";
import {
  ActionButton,
  PassiveStateActions,
} from "./voice-ui/VoiceStateActions";
import { formatDuration, getPresentation } from "./voice-ui/VoicePresentation";
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
            {props.state === "idle" ? (
              <ExamplesCard isArabic={isArabic} />
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

  const isRecording = props.state === "recording";
  const isPaused = props.state === "paused";
  const isCompleted = props.state === "completed";
  const isProcessing = props.state === "processing";
  const isDailyLimit = props.state === "daily-limit";
  const isUnavailable = props.state === "unavailable";

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isRecording || reducedMotion) {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = 1;
      pulseOpacity.value = 0;
      return;
    }

    pulseScale.value = withRepeat(
      withTiming(1.2, { duration: 1000 }),
      -1,
      true
    );
    pulseOpacity.value = withRepeat(
      withTiming(0.15, { duration: 1000 }),
      -1,
      true
    );

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
    };
  }, [isRecording, pulseOpacity, pulseScale, reducedMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const centralAction =
    props.state === "idle"
      ? props.onStart
      : isRecording || isCompleted
        ? props.onSubmit
        : isPaused
          ? props.onResume
          : null;

  return (
    <View
      testID="voice-action-surface"
      accessibilityLiveRegion="polite"
      className="min-h-[260px] items-center justify-center py-4"
    >
      <View className="h-[172px] w-[172px] items-center justify-center">
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
        {isRecording && !reducedMotion ? (
          <Animated.View
            accessible={false}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            className="absolute h-[172px] w-[172px] rounded-[86px]"
            style={pulseStyle}
          >
            <View
              testID="voice-halo-pulse"
              accessible={false}
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              className="h-[172px] w-[172px] rounded-[86px] bg-nileGreen-100/60 dark:bg-nileGreen-100/60"
            />
          </Animated.View>
        ) : null}
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

        {isProcessing ? (
          <View className="h-[104px] w-[104px] overflow-hidden rounded-[52px]">
            <Skeleton width="100%" height={104} borderRadius={52} />
          </View>
        ) : centralAction !== null ? (
          <Pressable
            testID="voice-mic-target"
            accessibilityRole="button"
            accessibilityLabel={presentation.centralLabel}
            onPress={centralAction}
            className="h-[104px] w-[104px] rounded-[52px]"
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              shadowColor: palette.nileGreen[500],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.24,
              shadowRadius: 8,
              elevation: 6,
            })}
          >
            <View
              testID="voice-mic-clip"
              className="h-[104px] w-[104px] overflow-hidden rounded-[52px]"
              accessible={false}
              importantForAccessibility="no"
            >
              <LinearGradient
                colors={[palette.nileGreen[500], palette.nileGreen[600]]}
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons
                  name={presentation.icon}
                  size={42}
                  color={palette.slate[25]}
                />
              </LinearGradient>
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

      {isRecording || isPaused || isCompleted ? (
        <Text
          style={{ fontFamily: fontFamily.bold }}
          className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-25"
        >
          {formatDuration(props.durationMs)}
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
        {isRecording ? (
          <>
            <ActionButton
              testID="voice-action-stop"
              label={t("voice_action_stop")}
              icon="stop"
              onPress={props.onSubmit}
              variant="primary"
            />
            <ActionButton
              testID="voice-action-pause"
              label={t("voice_action_pause")}
              icon="pause"
              onPress={props.onPause}
            />
            <ActionButton
              testID="voice-action-discard"
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
            />
          </>
        ) : isPaused ? (
          <>
            <ActionButton
              testID="voice-action-resume"
              label={t("voice_action_resume")}
              icon="play"
              onPress={props.onResume}
              variant="primary"
            />
            <ActionButton
              testID="voice-action-stop"
              label={t("voice_action_stop")}
              icon="stop"
              onPress={props.onSubmit}
            />
            <ActionButton
              testID="voice-action-discard"
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
            />
          </>
        ) : isCompleted ? (
          <>
            <ActionButton
              testID="voice-action-stop"
              label={t("voice_action_stop")}
              icon="checkmark"
              onPress={props.onSubmit}
              variant="primary"
            />
            <ActionButton
              testID="voice-action-discard"
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
            />
          </>
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
