import { useCallback } from "react";
import {
  createPermissionRecoveryState,
  type PermissionRecoveryState,
} from "@/components/settings/permission-recovery-content";

type SmsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";
type SmsScanMode = "incremental" | "full";

interface UseSettingsSmsSyncActionsParams {
  readonly onOpenSmsScan: () => void;
  readonly requestPermission: () => Promise<SmsPermissionStatus>;
  readonly setPendingSmsScanMode: (mode: SmsScanMode | null) => void;
  readonly setPermissionRecovery: (
    permissionRecovery: PermissionRecoveryState | null
  ) => void;
  readonly setScanMode: (mode: SmsScanMode) => void;
  readonly smsPermissionStatus: SmsPermissionStatus;
}

interface UseSettingsSmsSyncActionsResult {
  readonly continueSmsScanAfterCombinedConsent: (
    mode: SmsScanMode
  ) => Promise<void>;
  readonly continueSmsScanWithConsent: (mode: SmsScanMode) => void;
}

export function useSettingsSmsSyncActions({
  onOpenSmsScan,
  requestPermission,
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

  const continueSmsScanAfterCombinedConsent = useCallback(
    async (mode: SmsScanMode): Promise<void> => {
      setScanMode(mode);

      if (smsPermissionStatus === "granted") {
        onOpenSmsScan();
        return;
      }

      setPendingSmsScanMode(mode);

      if (smsPermissionStatus === "blocked") {
        setPermissionRecovery(
          createPermissionRecoveryState("sms-sync", smsPermissionStatus)
        );
        return;
      }

      const result = await requestPermission();
      if (result === "granted") {
        setPendingSmsScanMode(null);
        setPermissionRecovery(null);
        onOpenSmsScan();
        return;
      }

      setPermissionRecovery(createPermissionRecoveryState("sms-sync", result));
    },
    [
      onOpenSmsScan,
      requestPermission,
      setPendingSmsScanMode,
      setPermissionRecovery,
      setScanMode,
      smsPermissionStatus,
    ]
  );

  return {
    continueSmsScanAfterCombinedConsent,
    continueSmsScanWithConsent,
  };
}
