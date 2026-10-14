import { t } from "i18next";
import type {
  VoiceQuotaRefusal,
  VoiceAvailabilitySnapshot,
} from "@monyvi/logic";

export function microphonePermissionError(): string {
  return t("common:voice_microphone_permission_error");
}

export function recordingStartError(): string {
  return t("common:voice_recording_start_failed");
}

export function settingsOpenError(): string {
  return t("common:voice_settings_open_failed");
}

export function recordingTooShortError(): string {
  return t("transactions:voice_recording_too_short");
}

export function recordingFinalizeError(): string {
  return t("transactions:voice_recording_finalize_failed");
}

export function emptyVoiceResultError(): string {
  return t("transactions:voice_no_transactions_found");
}

export function quotaRefusalMessage(
  reason: VoiceQuotaRefusal["reason"]
): string {
  switch (reason) {
    case "daily_limit":
      return t("transactions:voice_limit_exhausted");
    case "burst_limit":
      return t("transactions:voice_limit_burst");
    case "already_processed_result_unavailable":
      return t("transactions:voice_replay_unavailable");
  }
}

export function isAvailabilityBlocked(
  availability: VoiceAvailabilitySnapshot | null
): boolean {
  return (
    availability === null ||
    availability.reason !== null ||
    (availability.remaining !== null && availability.remaining <= 0)
  );
}
