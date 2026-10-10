import { useLocale } from "@/context/LocaleContext";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import type { VoiceTransactionEntryProps } from "./types";

export function PassiveStateActions(
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

type ActionVariant = "primary" | "outline" | "disabled";

export function ActionButton({
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
  const { fontFamily } = useLocale();
  const base =
    variant === "primary"
      ? "border-nileGreen-500 bg-nileGreen-500"
      : variant === "disabled"
        ? "border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700"
        : "border-nileGreen-500 bg-transparent";
  const labelColor =
    variant === "primary"
      ? "text-slate-25"
      : variant === "disabled"
        ? "text-slate-500 dark:text-slate-400"
        : "text-nileGreen-700 dark:text-nileGreen-400";
  const iconColor =
    variant === "primary"
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
        style={{ fontFamily: fontFamily.semiBold }}
        className={`min-w-0 text-center text-sm font-semibold leading-[22px] ${labelColor}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
