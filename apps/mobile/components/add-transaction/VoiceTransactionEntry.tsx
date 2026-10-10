import { useLocale } from "@/context/LocaleContext";
import { formatLocalizedCount } from "@/utils/localized-number-display";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { TFunction } from "i18next";
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

export type VoiceTransactionEntryState =
  | "loading"
  | "idle"
  | "recording"
  | "paused"
  | "completed"
  | "processing"
  | "daily-limit"
  | "burst-limit"
  | "unavailable"
  | "replay"
  | "permission-explanation"
  | "permission-denied"
  | "error";

interface VoiceTransactionEntryProps {
  readonly state: VoiceTransactionEntryState;
  readonly remaining: number | null;
  readonly dailyLimit: number | null;
  readonly durationMs: number;
  readonly errorMessage: string | null;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSubmit: () => void;
  readonly onDiscard: () => void;
  readonly onTryAgain: () => void;
  readonly onUseManual: () => void;
  readonly onRefreshAvailability: () => void;
  readonly onOpenSettings: () => void;
  readonly onPermissionContinue: () => void;
  readonly onPermissionCancel: () => void;
}

interface StatePresentation {
  readonly title: string | null;
  readonly description: string | null;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly centralLabel: string;
}

function formatDuration(durationMs: number): string {
  const secondsTotal = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(secondsTotal / 60);
  const seconds = secondsTotal % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPresentation(
  state: VoiceTransactionEntryState,
  errorMessage: string | null,
  t: TFunction<"transactions">,
  tCommon: TFunction<"common">
): StatePresentation {
  switch (state) {
    case "idle":
      return {
        title: tCommon("voice_ui_idle_title"),
        description: tCommon("voice_ui_idle_description"),
        icon: "mic",
        centralLabel: tCommon("voice_ui_idle_title"),
      };
    case "recording":
      return {
        title: tCommon("voice_listening"),
        description: null,
        icon: "mic",
        centralLabel: t("voice_action_stop"),
      };
    case "paused":
      return {
        title: t("voice_paused"),
        description: null,
        icon: "pause",
        centralLabel: t("voice_action_resume"),
      };
    case "completed":
      return {
        title: null,
        description: null,
        icon: "checkmark",
        centralLabel: t("voice_action_stop"),
      };
    case "processing":
      return {
        title: t("voice_processing_checking"),
        description: null,
        icon: "hourglass-outline",
        centralLabel: t("voice_processing_checking"),
      };
    case "daily-limit":
      return {
        title: tCommon("voice_ui_daily_unavailable_title"),
        description: tCommon("voice_ui_daily_unavailable_description"),
        icon: "mic",
        centralLabel: tCommon("voice_ui_daily_unavailable_title"),
      };
    case "burst-limit":
      return {
        title: t("voice_limit_burst"),
        description: null,
        icon: "timer-outline",
        centralLabel: t("voice_action_try_again"),
      };
    case "unavailable":
      return {
        title: tCommon("voice_ui_unavailable_title"),
        description: t("voice_limit_unavailable"),
        icon: "cloud-offline-outline",
        centralLabel: tCommon("voice_ui_unavailable_title"),
      };
    case "replay":
      return {
        title: t("voice_replay_unavailable"),
        description: null,
        icon: "refresh-outline",
        centralLabel: t("voice_action_try_again"),
      };
    case "permission-explanation":
      return {
        title: null,
        description: null,
        icon: "mic-outline",
        centralLabel: tCommon("voice_recording_label"),
      };
    case "permission-denied":
      return {
        title: errorMessage ?? tCommon("voice_microphone_permission_error"),
        description: null,
        icon: "settings-outline",
        centralLabel: tCommon("open_settings"),
      };
    case "error":
      return {
        title: errorMessage ?? t("voice_error"),
        description: null,
        icon: "alert-circle-outline",
        centralLabel: t("voice_action_try_again"),
      };
    case "loading":
      return {
        title: null,
        description: null,
        icon: "mic",
        centralLabel: "",
      };
  }
}

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
              <DailyLimitNotice dailyLimit={props.dailyLimit} isArabic={isArabic} />
            ) : null}
            {showAllowance && props.remaining !== null && props.dailyLimit !== null ? (
              <AllowanceCard
                remaining={props.remaining}
                dailyLimit={props.dailyLimit}
                isArabic={isArabic}
                isCompact={isCompact}
              />
            ) : null}
            <VoiceActionSurface {...props} isArabic={isArabic} />
            {props.state === "idle" ? <ExamplesCard isArabic={isArabic} /> : null}
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

function AllowanceCard({
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
  const { language } = useLocale();

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
            accessibilityRole="header"
            className={`text-lg font-bold leading-7 text-slate-900 dark:text-slate-25 ${
              isArabic ? "text-right" : "text-left"
            }`}
          >
            {tCommon("voice_ui_limited_heading")}
          </Text>
          <Text
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
              <Text className="mt-3 text-right text-xs leading-5 text-slate-500 dark:text-slate-400">
                {tCommon("voice_ui_reset")}
              </Text>
            </>
          ) : (
            <>
              <View
                className={isCompact
                  ? "mt-3 gap-2"
                  : "mt-3 flex-row items-center gap-3"}
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
                <Text className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {formattedRemaining} / {formattedLimit}
                </Text>
              </View>
              <Text className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {tCommon("voice_ui_reset")}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function DailyLimitNotice({
  dailyLimit,
  isArabic,
}: {
  readonly dailyLimit: number | null;
  readonly isArabic: boolean;
}): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");
  const { language } = useLocale();
  const limit = dailyLimit === null
    ? null
    : formatLocalizedCount(dailyLimit, language);

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
          accessibilityRole="header"
          className="text-center text-lg font-bold leading-7 text-slate-900 dark:text-slate-25"
        >
          {tCommon("voice_ui_daily_title")}
        </Text>
        {limit !== null ? (
          <Text className="mt-2 text-center text-sm leading-[22px] text-slate-600 dark:text-slate-300">
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
          <Text className="text-center text-xs leading-5 text-slate-600 dark:text-slate-300">
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
          accessibilityRole="header"
          className="text-lg font-bold leading-7 text-slate-900 dark:text-slate-25"
        >
          {tCommon("voice_ui_daily_title")}
        </Text>
        {limit !== null ? (
          <Text className="mt-1 text-sm leading-[22px] text-slate-600 dark:text-slate-300">
            {tCommon("voice_ui_daily_count", { limit })}
          </Text>
        ) : null}
        <Text className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {tCommon("voice_ui_reset")}
        </Text>
      </View>
    </View>
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
              : "bg-nileGreen-50/60 dark:bg-nileGreen-900/50"
          }`}
        />
        {isRecording && !reducedMotion ? (
          <Animated.View
            accessible={false}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            className="absolute h-[172px] w-[172px] rounded-[86px] bg-nileGreen-100/60 dark:bg-nileGreen-900/50"
            style={pulseStyle}
          />
        ) : null}
        <View
          testID="voice-halo-inner"
          accessible={false}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          className={`absolute h-[140px] w-[140px] rounded-[70px] ${
            isDailyLimit || isUnavailable
              ? "bg-slate-200/20 dark:bg-slate-700/30"
              : "bg-nileGreen-100/50 dark:bg-nileGreen-900/60"
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
            <LinearGradient
              colors={[palette.nileGreen[500], palette.nileGreen[600]]}
              className="h-[104px] w-[104px] items-center justify-center rounded-[52px]"
            >
              <Ionicons
                name={presentation.icon}
                size={42}
                color={palette.slate[25]}
              />
            </LinearGradient>
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

      {(isRecording || isPaused || isCompleted) ? (
        <Text className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-25">
          {formatDuration(props.durationMs)}
        </Text>
      ) : null}

      {presentation.title ? (
        <Text
          accessibilityRole="header"
          className="mt-3 text-center text-lg font-bold leading-7 text-slate-900 dark:text-slate-25"
        >
          {presentation.title}
        </Text>
      ) : null}
      {presentation.description ? (
        <Text className="mt-2 text-center text-sm leading-[22px] text-slate-600 dark:text-slate-300">
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
          <Text className="flex-1 text-right text-xs leading-5 text-slate-600 dark:text-slate-300">
            {tCommon("voice_ui_daily_reset_strip")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PassiveStateActions(
  props: VoiceTransactionEntryProps & { readonly isArabic: boolean }
): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");

  switch (props.state) {
    case "daily-limit":
      return props.isArabic ? (
        <ActionButton
          testID="voice-action-use-manual"
          label={tCommon("voice_ui_daily_use_manual")}
          icon="create-outline"
          onPress={props.onUseManual}
          variant="primary"
          fullWidth
        />
      ) : (
        <>
          <ActionButton
            testID="voice-action-try-tomorrow"
            label={tCommon("voice_ui_daily_try_tomorrow")}
            icon="time-outline"
            onPress={props.onTryAgain}
            variant="disabled"
            disabled
            fullWidth
          />
          <ActionButton
            testID="voice-action-use-manual"
            label={tCommon("voice_ui_daily_use_manual")}
            icon="create-outline"
            onPress={props.onUseManual}
            fullWidth
          />
        </>
      );
    case "burst-limit":
    case "replay":
    case "error":
      return (
        <>
          <ActionButton
            testID="voice-action-try-again"
            label={t("voice_action_try_again")}
            icon="refresh"
            onPress={props.onTryAgain}
            variant="primary"
          />
          <ActionButton
            testID="voice-action-use-manual"
            label={t("voice_action_use_manual")}
            icon="create-outline"
            onPress={props.onUseManual}
          />
        </>
      );
    case "unavailable":
      return (
        <>
          <ActionButton
            testID="voice-action-try-again"
            label={t("voice_action_try_again")}
            icon="refresh"
            onPress={props.onRefreshAvailability}
            variant="primary"
            fullWidth
          />
          <ActionButton
            testID="voice-action-use-manual"
            label={t("voice_action_use_manual")}
            icon="create-outline"
            onPress={props.onUseManual}
            fullWidth
          />
        </>
      );
    // The route, not this passive Voice surface, owns the custom pre-native
    // permission explanation and the real permission/Settings action.
    case "permission-explanation":
      return null;
    case "permission-denied":
      return (
        <>
          <ActionButton
            testID="voice-action-settings"
            label={tCommon("open_settings")}
            icon="settings-outline"
            onPress={props.onOpenSettings}
            variant="primary"
          />
          <ActionButton
            testID="voice-action-use-manual"
            label={t("voice_action_use_manual")}
            icon="create-outline"
            onPress={props.onUseManual}
          />
        </>
      );
    default:
      return null;
  }
}

function ExamplesCard({
  isArabic,
}: {
  readonly isArabic: boolean;
}): React.JSX.Element {
  const { t: tCommon } = useTranslation("common");

  const examples = [
    tCommon("voice_ui_example_first"),
    tCommon("voice_ui_example_second"),
    tCommon("voice_ui_example_third"),
  ];
  const enIcons = [
    "restaurant-outline",
    "car-outline",
    "cafe-outline",
  ] as const;

  return (
    <View
      testID="voice-examples-card"
      className="rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
        <View
          importantForAccessibility="no-hide-descendants"
          className="h-10 w-10 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-slate-700"
        >
          <Ionicons
            name="bulb-outline"
            size={20}
            color={palette.nileGreen[600]}
          />
        </View>
        <Text
          accessibilityRole="header"
          className={`min-w-0 flex-1 text-lg font-bold leading-7 text-slate-900 dark:text-slate-25 ${
            isArabic ? "text-right" : "text-left"
          }`}
        >
          {tCommon("voice_ui_examples_heading")}
        </Text>
      </View>
      <View className="mt-3 gap-2">
        {examples.map((example, index) => (
          <View
            key={index}
            className={`min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900 ${
              isArabic ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {!isArabic ? (
              <View
                importantForAccessibility="no-hide-descendants"
                className="h-8 w-8 items-center justify-center"
              >
                <Ionicons
                  name={enIcons[index]}
                  size={20}
                  color={palette.slate[600]}
                />
              </View>
            ) : null}
            <Text
              className={`min-w-0 flex-1 text-sm leading-[22px] text-slate-700 dark:text-slate-200 ${
                isArabic ? "text-right" : "text-left"
              }`}
            >
              {isArabic ? `“${example}”` : example}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type ActionVariant = "primary" | "outline" | "disabled";

function ActionButton({
  label,
  icon,
  onPress,
  testID,
  disabled = false,
  fullWidth = false,
  variant = "outline",
}: {
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly variant?: ActionVariant;
}): React.JSX.Element {
  const base = variant === "primary"
    ? "border-nileGreen-500 bg-nileGreen-500"
    : variant === "disabled"
      ? "border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700"
      : "border-nileGreen-500 bg-transparent";
  const labelColor = variant === "primary"
    ? "text-slate-25"
    : variant === "disabled"
      ? "text-slate-500 dark:text-slate-400"
      : "text-nileGreen-700 dark:text-nileGreen-400";
  const iconColor = variant === "primary"
    ? palette.slate[25]
    : variant === "disabled"
      ? palette.slate[400]
      : palette.nileGreen[600];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-2 ${
        fullWidth ? "w-full" : ""
      } ${base}`}
      style={({ pressed }) => ({
        opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text
        className={`min-w-0 text-center text-sm font-semibold leading-[22px] ${labelColor}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
