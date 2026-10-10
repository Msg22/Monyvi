import type { TFunction } from "i18next";

import type { StatePresentation, VoiceTransactionEntryState } from "./types";

export function formatDuration(durationMs: number): string {
  const secondsTotal = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(secondsTotal / 60);
  const seconds = secondsTotal % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getPresentation(
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
