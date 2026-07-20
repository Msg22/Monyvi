import { useCallback } from "react";
import {
  createPermissionRecoveryState,
  type PermissionRecoveryState,
} from "@/components/settings/permission-recovery-content";

type SmsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";
type SmsScanMode = "incremental" | "history";

interface UseSettingsSmsSyncActionsParams {
  readonly onOpenSmsScan: () => void;
  readonly setPendingSmsScanMode: (mode: SmsScanMode | null) => void;
  readonly setPermissionRecovery: (
    permissionRecovery: PermissionRecoveryState | null
  ) => void;
  readonly setScanMode: (mode: SmsScanMode) => void;
  readonly smsPermissionStatus: SmsPermissionStatus;
}

interface UseSettingsSmsSyncActionsResult {
  readonly continueSmsScanWithConsent: (mode: SmsScanMode) => void;
}

export function useSettingsSmsSyncActions({
  onOpenSmsScan,
  setPendingSmsScanMode,
  setPermissionRecovery,
  setScanMode,
  smsPermissionStatus,
}: UseSettingsSmsSyncActionsParams): UseSettingsSmsSyncActionsResult {
  const continueSmsScanWithConsent = useCallback(
    (mode: SmsScanMode): void => {
      setScanMode(mode);

      if (smsPermissionStatus === "granted") {
        onOpenSmsScan();
        return;
      }

      setPendingSmsScanMode(mode);
      setPermissionRecovery(
        createPermissionRecoveryState("sms-sync", smsPermissionStatus)
      );
    },
    [
      onOpenSmsScan,
      setPendingSmsScanMode,
      setPermissionRecovery,
      setScanMode,
      smsPermissionStatus,
    ]
  );

  return {
    continueSmsScanWithConsent,
  };
}
