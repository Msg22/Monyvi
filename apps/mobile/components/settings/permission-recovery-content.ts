import type { PermissionRecoveryMode } from "@/components/permissions/PermissionRecoveryModal";
import type { Ionicons } from "@expo/vector-icons";

export type PermissionRecoveryKind = "sms-sync" | "sms-live" | "notification";

export interface PermissionRecoveryState {
  readonly kind: PermissionRecoveryKind;
  readonly mode: PermissionRecoveryMode;
}

export interface PermissionRecoveryContent {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly message: string;
  readonly primaryLabel: string;
}

interface PermissionRecoveryContentOption {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly titleKey: string;
  readonly messageKey: string;
  readonly primaryLabelKey: string;
}

interface PermissionRecoveryContentConfig {
  readonly blocked: PermissionRecoveryContentOption;
  readonly request: PermissionRecoveryContentOption;
}

const PERMISSION_RECOVERY_CONTENT_CONFIG: Record<
  PermissionRecoveryKind,
  PermissionRecoveryContentConfig
> = {
  notification: {
    blocked: {
      icon: "notifications-outline",
      titleKey: "notification_permission_blocked_title",
      messageKey: "notification_permission_blocked_message",
      primaryLabelKey: "permission_open_settings",
    },
    request: {
      icon: "notifications-outline",
      titleKey: "notification_permission_request_title",
      messageKey: "notification_permission_request_message",
      primaryLabelKey: "notification_permission_allow",
    },
  },
  "sms-sync": {
    blocked: {
      icon: "settings-outline",
      titleKey: "sms_sync_permission_blocked_title",
      messageKey: "sms_sync_permission_blocked_message",
      primaryLabelKey: "permission_open_settings",
    },
    request: {
      icon: "chatbubble-ellipses-outline",
      titleKey: "sms_sync_permission_request_title",
      messageKey: "sms_sync_permission_request_message",
      primaryLabelKey: "sms_permission_allow",
    },
  },
  "sms-live": {
    blocked: {
      icon: "settings-outline",
      titleKey: "sms_permission_blocked_title",
      messageKey: "sms_permission_blocked_message",
      primaryLabelKey: "permission_open_settings",
    },
    request: {
      icon: "chatbubble-ellipses-outline",
      titleKey: "sms_permission_request_title",
      messageKey: "sms_permission_request_message",
      primaryLabelKey: "sms_permission_allow",
    },
  },
};

export function getRecoveryModeForPermissionStatus(
  status: "undetermined" | "granted" | "denied" | "blocked"
): PermissionRecoveryMode {
  return status === "blocked" ? "blocked" : "request";
}

export function createPermissionRecoveryState(
  kind: PermissionRecoveryKind,
  status: "undetermined" | "granted" | "denied" | "blocked"
): PermissionRecoveryState {
  return { kind, mode: getRecoveryModeForPermissionStatus(status) };
}

export function getPermissionRecoveryContent(
  recovery: PermissionRecoveryState,
  translate: (key: string) => string
): PermissionRecoveryContent {
  const config = PERMISSION_RECOVERY_CONTENT_CONFIG[recovery.kind];
  const option = recovery.mode === "blocked" ? config.blocked : config.request;

  return {
    icon: option.icon,
    title: translate(option.titleKey),
    message: translate(option.messageKey),
    primaryLabel: translate(option.primaryLabelKey),
  };
}
