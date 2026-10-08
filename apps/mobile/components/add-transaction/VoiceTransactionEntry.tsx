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
        title: t("voice_idle_title"),
        description: t("voice_description"),
        icon: "mic",
        centralLabel: t("voice_idle_title"),
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
        title: t("voice_limit_exhausted"),
        description: null,
        icon: "time-outline",
        centralLabel: t("voice_action_use_manual"),
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
        title: t("voice_limit_unavailable"),
        description: null,
        icon: "cloud-offline-outline",
        centralLabel: t("voice_action_try_again"),
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

export function VoiceTransactionEntry(
  props: VoiceTransactionEntryProps
): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");

  const isCompact = shouldUseCompactLayout(width, fontScale);
  const horizontalPadding = isCompact ? 12 : 16;

  if (props.state === "loading") {
    return (
      <ScrollView
        className="flex-1 bg-slate-50 dark:bg-slate-900"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View className="w-full max-w-[560px] self-center gap-3 py-4">
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

          <View className="min-h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800">
            <View className="h-[104px] w-[104px] overflow-hidden rounded-[52px]">
              <Skeleton width="100%" height={104} borderRadius={52} />
            </View>

            <View className="mt-5 h-[18px] w-[72%] overflow-hidden rounded-md">
              <Skeleton width="100%" height={18} borderRadius={6} />
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  const presentation = getPresentation(
    props.state,
    props.errorMessage,
    t,
    tCommon
  );

  return (
    <ScrollView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: horizontalPadding,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View className="w-full max-w-[560px] self-center gap-3 py-4">
        {props.remaining !== null && props.dailyLimit !== null ? (
          <AllowanceCard
            dailyLimit={props.dailyLimit}
            remaining={props.remaining}
            isCompact={isCompact}
          />
        ) : null}

        <VoiceActionCard {...props} presentation={presentation} />

        <ExamplesCard />
      </View>
    </ScrollView>
  );
}

function AllowanceCard({
  remaining,
  dailyLimit,
  isCompact,
}: {
  readonly remaining: number;
  readonly dailyLimit: number;
  readonly isCompact: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();

  const progress =
    dailyLimit > 0 ? Math.max(0, Math.min(1, remaining / dailyLimit)) : 0;

  const formattedRemaining = formatLocalizedCount(remaining, language);
  const formattedLimit = formatLocalizedCount(dailyLimit, language);

  return (
    <View className="min-h-32 rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800">
      <View className="flex-row items-start">
        <View className="me-3 h-12 w-12 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-nileGreen-900">
          <Ionicons
            name="sparkles-outline"
            size={24}
            color={palette.nileGreen[600]}
          />
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold leading-[26px] text-slate-800 dark:text-slate-25">
            {t("voice_limit_heading")}
          </Text>

          <Text className="mt-1 text-sm leading-[22px] text-slate-600 dark:text-slate-300">
            {t("voice_limit_remaining", {
              remaining: formattedRemaining,
              limit: formattedLimit,
            })}
          </Text>

          <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t("voice_limit_reset")}
          </Text>
        </View>
      </View>

      <View
        className={
          isCompact ? "mt-4 gap-2" : "mt-4 flex-row items-center gap-3"
        }
      >
        <View
          className={`h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${
            isCompact ? "w-full" : "flex-1"
          }`}
        >
          <View
            className="h-2 rounded-full bg-nileGreen-500"
            style={{ width: `${progress * 100}%` }}
          />
        </View>

        <Text className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {formattedRemaining} / {formattedLimit}
        </Text>
      </View>
    </View>
  );
}

function VoiceActionCard({
  presentation,
  ...props
}: VoiceTransactionEntryProps & {
  readonly presentation: StatePresentation;
}): React.JSX.Element {
  const { t } = useTranslation("transactions");

  const isRecording = props.state === "recording";
  const isPaused = props.state === "paused";
  const isCompleted = props.state === "completed";
  const isProcessing = props.state === "processing";

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
      accessibilityLiveRegion="polite"
      className="min-h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <View className="h-[172px] w-[172px] items-center justify-center">
        <View
          pointerEvents="none"
          className="absolute h-[172px] w-[172px] rounded-[86px] bg-nileGreen-50 opacity-[0.45] dark:bg-nileGreen-900"
        />

        {isRecording && !reducedMotion ? (
          <Animated.View
            pointerEvents="none"
            className="absolute h-[172px] w-[172px] rounded-[86px] bg-nileGreen-50 dark:bg-nileGreen-900"
            style={pulseStyle}
          />
        ) : null}

        <View
          pointerEvents="none"
          className="absolute h-[140px] w-[140px] rounded-[70px] bg-nileGreen-50 dark:bg-nileGreen-900"
        />

        {isProcessing ? (
          <View className="h-[104px] w-[104px] overflow-hidden rounded-[52px]">
            <Skeleton width="100%" height={104} borderRadius={52} />
          </View>
        ) : centralAction !== null ? (
          <Pressable
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
            accessible={false}
            className="h-[104px] w-[104px] items-center justify-center rounded-[52px] bg-nileGreen-500"
          >
            <Ionicons
              name={presentation.icon}
              size={42}
              color={palette.slate[25]}
            />
          </View>
        )}
      </View>

      {(isRecording || isPaused || isCompleted) && (
        <Text className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-25">
          {formatDuration(props.durationMs)}
        </Text>
      )}

      {presentation.title ? (
        <Text
          accessibilityRole="header"
          className="mt-3 text-center text-lg font-bold leading-7 text-slate-800 dark:text-slate-25"
        >
          {presentation.title}
        </Text>
      ) : null}

      {presentation.description ? (
        <Text className="mt-2 text-center text-sm leading-[22px] text-slate-600 dark:text-slate-300">
          {presentation.description}
        </Text>
      ) : null}

      <View className="mt-4 flex-row flex-wrap justify-center gap-2">
        {isRecording ? (
          <>
            <ActionButton
              label={t("voice_action_stop")}
              icon="stop"
              onPress={props.onSubmit}
              primary
            />
            <ActionButton
              label={t("voice_action_pause")}
              icon="pause"
              onPress={props.onPause}
            />
            <ActionButton
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
            />
          </>
        ) : isPaused ? (
          <>
            <ActionButton
              label={t("voice_action_resume")}
              icon="play"
              onPress={props.onResume}
              primary
            />
            <ActionButton
              label={t("voice_action_stop")}
              icon="stop"
              onPress={props.onSubmit}
            />
            <ActionButton
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
            />
          </>
        ) : isCompleted ? (
          <>
            <ActionButton
              label={t("voice_action_stop")}
              icon="checkmark"
              onPress={props.onSubmit}
              primary
            />
            <ActionButton
              label={t("voice_action_discard")}
              icon="close"
              onPress={props.onDiscard}
            />
          </>
        ) : (
          <PassiveStateActions {...props} />
        )}
      </View>
    </View>
  );
}

function PassiveStateActions(
  props: VoiceTransactionEntryProps
): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");

  switch (props.state) {
    case "daily-limit":
      return (
        <ActionButton
          label={t("voice_action_use_manual")}
          icon="create-outline"
          onPress={props.onUseManual}
          primary
        />
      );

    case "burst-limit":
    case "replay":
    case "error":
      return (
        <>
          <ActionButton
            label={t("voice_action_try_again")}
            icon="refresh"
            onPress={props.onTryAgain}
            primary
          />
          <ActionButton
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
            label={t("voice_action_try_again")}
            icon="refresh"
            onPress={props.onRefreshAvailability}
            primary
          />
          <ActionButton
            label={t("voice_action_use_manual")}
            icon="create-outline"
            onPress={props.onUseManual}
          />
        </>
      );

    /*
     * The pre-native microphone explanation is intentionally not recreated
     * inside this card. The route owns the existing Monyvi permission modal;
     * this is only its passive underlying Voice surface.
     */
    case "permission-explanation":
      return null;

    case "permission-denied":
      return (
        <>
          <ActionButton
            label={tCommon("open_settings")}
            icon="settings-outline"
            onPress={props.onOpenSettings}
            primary
          />
          <ActionButton
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

function ExamplesCard(): React.JSX.Element {
  const { t } = useTranslation("transactions");

  const examples = [
    t("voice_example_cafe"),
    t("voice_example_groceries"),
    t("voice_example_transport"),
  ];

  return (
    <View className="rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-800">
      <Text className="text-lg font-bold text-slate-800 dark:text-slate-25">
        {t("voice_examples_heading")}
      </Text>

      <View className="mt-3 gap-2">
        {examples.map((example) => (
          <View
            key={example}
            className="min-h-12 flex-row items-center rounded-xl bg-slate-50 px-3 dark:bg-slate-900"
          >
            <View className="me-3 h-8 w-8 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-nileGreen-900">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={17}
                color={palette.nileGreen[600]}
              />
            </View>

            <Text className="flex-1 text-sm leading-[22px] text-slate-700 dark:text-slate-200">
              {example}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  primary = false,
}: {
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly onPress: () => void;
  readonly primary?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center rounded-xl border px-4 ${
        primary
          ? "border-nileGreen-500 bg-nileGreen-500"
          : "border-slate-200 bg-slate-25 dark:border-slate-700 dark:bg-slate-800"
      }`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons
        name={icon}
        size={18}
        color={primary ? palette.slate[25] : palette.nileGreen[600]}
      />

      <Text
        className={`ms-2 text-sm font-semibold ${
          primary
            ? "text-slate-25"
            : "text-nileGreen-700 dark:text-nileGreen-400"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
