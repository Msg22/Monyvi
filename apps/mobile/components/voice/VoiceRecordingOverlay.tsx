/* eslint-disable react-native/no-inline-styles -- dynamic styles required for conditional rendering */
/**
 * VoiceRecordingOverlay Component
 *
 * WhatsApp-style bottom-sheet overlay for voice recording.
 * Slides up above the tab bar without navigating to a new screen.
 *
 * Architecture & Design Rationale:
 * - Pattern: Controlled Component (visibility driven by parent)
 * - Why: Overlay state is managed by orchestrator hook, keeping UI
 *   purely presentational. This enables reuse and testing.
 * - SOLID: SRP — only renders recording UI. DIP — depends on
 *   abstractions (onSubmit/onDiscard callbacks), not concrete services.
 *
 * @module VoiceRecordingOverlay
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideOutDown,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/colors";
import { MIC_BUTTON_SIZE, TAB_BAR_HEIGHT } from "@/constants/ui";
import { useTranslation } from "react-i18next";
import { WaveformVisualizer } from "./WaveformVisualizer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum recording duration in seconds. */
const MAX_DURATION_S = 60;

/** Duration threshold for "nearing limit" visual warning (seconds). */
const NEAR_LIMIT_THRESHOLD_S = 50;

/**
 * Extra clearance above the tab bar to clear the protruding mic button.
 * Derived from the MIC_BUTTON protrusion: top offset (-SIZE/2 + 8) ~ 24px,
 * plus 8px breathing room.
 */
const MIC_BUTTON_CLEARANCE = MIC_BUTTON_SIZE / 2 - 8 + 8;
const PANEL_ENTER_DURATION_MS = 220;
const PANEL_ENTER_OFFSET_Y = 320;

const PANEL_ENTERING_ANIMATION: EntryExitAnimationFunction = () => {
  "worklet";

  return {
    animations: {
      transform: [
        {
          translateY: withTiming(0, {
            duration: PANEL_ENTER_DURATION_MS,
            easing: Easing.out(Easing.cubic),
          }),
        },
      ],
    },
    initialValues: {
      transform: [{ translateY: PANEL_ENTER_OFFSET_Y }],
    },
  };
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  panelShadow: {
    shadowColor: palette.slate[900],
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  controlBtnDefault: {
    borderWidth: 1.5,
    borderColor: palette.slate[400],
    backgroundColor: "transparent",
  },
  controlBtnPrimary: {
    backgroundColor: palette.nileGreen[500],
  },
  controlBtnDestructive: {
    borderWidth: 1.5,
    borderColor: palette.red[400],
    backgroundColor: "transparent",
  },
  retryBtn: {
    backgroundColor: palette.nileGreen[500],
  },
  recordingDot: {
    backgroundColor: palette.nileGreen[500],
  },
  pausedDot: {
    backgroundColor: palette.gold[500],
  },
  labelDefault: {
    color: palette.slate[500],
    fontWeight: "400" as const,
  },
  labelPrimary: {
    color: palette.nileGreen[500],
    fontWeight: "600" as const,
  },
  labelDestructive: {
    color: palette.red[500],
    fontWeight: "400" as const,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OverlayStatus =
  | "idle"
  | "recording"
  | "paused"
  | "completed"
  | "analyzing"
  | "error"
  | "success";

interface VoiceRecordingOverlayProps {
  /** Whether the overlay is visible. */
  readonly visible: boolean;
  /** Current recording status. */
  readonly status: OverlayStatus;
  /** Elapsed recording time in milliseconds. */
  readonly durationMs: number;
  /** Error message to display (when status === "error"). */
  readonly errorMessage?: string;
  /** Called when user taps Done — submit recording for analysis. */
  readonly onSubmit: () => void | Promise<void>;
  /** Called when user taps Discard — cancel and close overlay. */
  readonly onDiscard: () => void | Promise<void>;
  /** Called when user taps Pause. */
  readonly onPause: () => void | Promise<void>;
  /** Called when user taps Resume. */
  readonly onResume: () => void | Promise<void>;
  /** Called when user taps Retry (from error state). */
  readonly onRetry?: () => void | Promise<void>;
  /** Label for the error-state primary action. Defaults to Retry. */
  readonly errorActionLabel?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/** Wrap a possibly-async callback so it returns void for Pressable onPress. */
function fireAndForget(
  fn: (() => void | Promise<void>) | undefined
): (() => void) | undefined {
  if (!fn) return undefined;
  return () => void fn();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ControlButtonProps {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: "default" | "primary" | "destructive";
  readonly size?: number;
}

function ControlButton({
  icon,
  label,
  onPress,
  variant = "default",
  size = 48,
}: ControlButtonProps): React.ReactElement {
  const isPrimary = variant === "primary";
  const isDestructive = variant === "destructive";

  const buttonStyle = isPrimary
    ? styles.controlBtnPrimary
    : isDestructive
      ? styles.controlBtnDestructive
      : styles.controlBtnDefault;

  const labelStyle = isPrimary
    ? styles.labelPrimary
    : isDestructive
      ? styles.labelDestructive
      : styles.labelDefault;

  const iconColor = isPrimary
    ? palette.slate[50]
    : isDestructive
      ? palette.red[500]
      : palette.slate[500];

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      className="items-center"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={[{ width: size, height: size }, buttonStyle]}
      >
        <Ionicons name={icon} size={isPrimary ? 22 : 20} color={iconColor} />
      </View>
      <Text className="mt-1.5 text-xs" style={labelStyle}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function VoiceRecordingOverlayComponent({
  visible,
  status,
  durationMs,
  errorMessage,
  onSubmit,
  onDiscard,
  onPause,
  onResume,
  onRetry,
  errorActionLabel,
}: VoiceRecordingOverlayProps): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("transactions");
  const bottomPadding = Math.max(insets.bottom, 0);

  const elapsedSeconds = Math.floor(durationMs / 1000);
  const progressPercent = Math.min(
    (elapsedSeconds / MAX_DURATION_S) * 100,
    100
  );
  const isNearLimit = elapsedSeconds >= NEAR_LIMIT_THRESHOLD_S;
  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isAnalyzing = status === "analyzing";
  const isError = status === "error";
  const isCompleted = status === "completed";

  // Wrap async callbacks for Pressable (returns void, not Promise)
  const safeOnDiscard = useMemo(
    () => fireAndForget(onDiscard) ?? (() => {}),
    [onDiscard]
  );
  const safeOnSubmit = useMemo(
    () => fireAndForget(onSubmit) ?? (() => {}),
    [onSubmit]
  );
  const safeOnRetry = useMemo(() => fireAndForget(onRetry), [onRetry]);

  const safeOnPause = useMemo(
    () => fireAndForget(onPause) ?? (() => {}),
    [onPause]
  );
  const safeOnResume = useMemo(
    () => fireAndForget(onResume) ?? (() => {}),
    [onResume]
  );

  const handlePauseResume = useCallback((): void => {
    if (isPaused) safeOnResume();
    else safeOnPause();
  }, [isPaused, safeOnPause, safeOnResume]);

  // Dynamic panel position based on tab bar height
  // The mic button on the tab bar protrudes 24px above the tab bar bounds (top: -24).
  // Adding 32px to paddingBottom ensures the overlay content comfortably clears the mic button.
  const panelStyle = useMemo(
    () => [
      styles.panelShadow,
      {
        bottom: 0,
        paddingBottom: bottomPadding + TAB_BAR_HEIGHT + MIC_BUTTON_CLEARANCE,
      },
    ],
    [bottomPadding]
  );

  // Progress bar width
  const progressStyle = useMemo<{
    readonly width: DimensionValue;
    readonly backgroundColor: string;
  }>(
    () => ({
      width: `${progressPercent}%`,
      backgroundColor: isNearLimit ? palette.gold[500] : palette.nileGreen[500],
    }),
    [progressPercent, isNearLimit]
  );

  // Status dot color
  const dotStyle = isRecording ? styles.recordingDot : styles.pausedDot;
  const contentClassName = isError
    ? "px-6 pb-1 pt-5"
    : "min-h-[228px] px-6 pb-4 pt-5";

  if (!visible || status === "idle" || status === "success") return null;

  return (
    <>
      {/* Dimmed backdrop (FR-014) */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        className="absolute inset-0 z-[20]"
        style={styles.backdrop}
      >
        <Pressable
          className="flex-1"
          onPress={safeOnDiscard}
          accessibilityLabel={t("close_recording_overlay")}
        />
      </Animated.View>

      {/* Recording panel */}
      <Animated.View
        entering={PANEL_ENTERING_ANIMATION}
        exiting={SlideOutDown.duration(200)}
        className="absolute start-0 end-0 z-[22] rounded-t-3xl bg-white dark:bg-slate-800"
        style={panelStyle}
      >
        <View className={contentClassName}>
          {/* Analyzing state */}
          {isAnalyzing && (
            <View className="items-center py-8">
              <Ionicons name="pulse" size={32} color={palette.nileGreen[500]} />
              <Text className="mt-3 text-base font-medium text-slate-700 dark:text-slate-200">
                {t("voice_analyzing")}
              </Text>
              <Text className="mt-1 text-sm text-slate-400">
                {t("voice_analyzing_hint")}
              </Text>
            </View>
          )}

          {/* Error state */}
          {isError && (
            <View className="items-center py-6">
              <Ionicons
                name="alert-circle"
                size={32}
                color={palette.red[500]}
              />
              <Text className="mt-3 text-center text-sm text-slate-700 dark:text-slate-200">
                {errorMessage ?? t("voice_error_default")}
              </Text>
              <View className="mt-4 flex-row gap-4">
                <Pressable
                  onPress={safeOnDiscard}
                  className="rounded-full border border-slate-300 px-6 py-2.5 dark:border-slate-600"
                >
                  <Text className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {t("cancel")}
                  </Text>
                </Pressable>
                {safeOnRetry && (
                  <Pressable
                    onPress={safeOnRetry}
                    className="rounded-full px-6 py-2.5"
                    style={styles.retryBtn}
                  >
                    <Text className="text-sm font-semibold text-white">
                      {errorActionLabel ?? t("voice_retry")}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Recording / Paused / Completed states */}
          {(isRecording || isPaused || isCompleted) && (
            <>
              {/* Status indicator + Timer */}
              <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View
                    className="me-2 h-2 w-2 rounded-full"
                    style={dotStyle}
                  />
                  <Text className="text-sm text-slate-500 dark:text-slate-400">
                    {isRecording
                      ? t("recording")
                      : isPaused
                        ? t("recording_paused")
                        : t("recording_complete")}
                  </Text>
                </View>
                <Text className="text-xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {formatTimer(durationMs)}
                </Text>
              </View>

              {/* Waveform */}
              <View className="mb-3">
                <WaveformVisualizer
                  isActive={isRecording || isPaused}
                  isPaused={isPaused || isCompleted}
                />
              </View>

              {/* Progress bar (FR-006) */}
              <View className="mb-1 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <View className="h-full rounded-full" style={progressStyle} />
              </View>
              <Text className="mb-5 text-end text-xs text-slate-400 dark:text-slate-500">
                {t("voice_timer_progress", {
                  elapsed: elapsedSeconds,
                  max: MAX_DURATION_S,
                })}
              </Text>

              {/* Control buttons */}
              <View className="flex-row items-center justify-evenly">
                <ControlButton
                  icon="close"
                  label={t("discard")}
                  onPress={safeOnDiscard}
                  variant="destructive"
                />
                {!isCompleted && (
                  <ControlButton
                    icon={isPaused ? "play" : "pause"}
                    label={isPaused ? t("voice_resume") : t("voice_pause")}
                    onPress={handlePauseResume}
                  />
                )}
                <ControlButton
                  icon="stop"
                  label={t("voice_done")}
                  onPress={safeOnSubmit}
                  variant="primary"
                  size={56}
                />
              </View>
            </>
          )}
        </View>
      </Animated.View>
    </>
  );
}

export const VoiceRecordingOverlay = memo(VoiceRecordingOverlayComponent);
