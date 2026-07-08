import React from "react";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { logger } from "@/utils/logger";

interface SettingsConfirmationModalsProps {
  readonly dismissForceLogoutError: () => void;
  readonly dismissSyncWarning: () => void;
  readonly forceLogout: () => Promise<void>;
  readonly isAiDisableConfirmOpen: boolean;
  readonly isFullRescanModalOpen: boolean;
  readonly onCancelAiDisableConfirm: () => void;
  readonly onCancelFullRescan: () => void;
  readonly onConfirmAiDisable: () => void;
  readonly onConfirmFullRescan: () => void;
  readonly showForceLogoutError: boolean;
  readonly showSyncWarning: boolean;
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
}

export function SettingsConfirmationModals({
  dismissForceLogoutError,
  dismissSyncWarning,
  forceLogout,
  isAiDisableConfirmOpen,
  isFullRescanModalOpen,
  onCancelAiDisableConfirm,
  onCancelFullRescan,
  onConfirmAiDisable,
  onConfirmFullRescan,
  showForceLogoutError,
  showSyncWarning,
  t,
  tCommon,
}: SettingsConfirmationModalsProps): React.JSX.Element {
  const handleForceLogout = (): void => {
    forceLogout().catch((error: unknown) => {
      logger.error("settings.forceLogout.failed", error);
    });
  };

  const handleForceLogoutRetry = (): void => {
    dismissForceLogoutError();
    forceLogout().catch((error: unknown) => {
      logger.error("settings.forceLogout.retry.failed", error);
    });
  };

  return (
    <>
      <ConfirmationModal
        visible={isFullRescanModalOpen}
        onConfirm={onConfirmFullRescan}
        onCancel={onCancelFullRescan}
        title={t("rescan_title")}
        message={t("rescan_message")}
        confirmLabel={t("rescan_confirm")}
        variant="warning"
      />
      <ConfirmationModal
        visible={showSyncWarning}
        variant="warning"
        icon="cloud-offline-outline"
        title={t("sync_failed_title")}
        message={t("sync_failed_message")}
        confirmLabel={t("proceed_anyway")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleForceLogout}
        onCancel={dismissSyncWarning}
      />
      <ConfirmationModal
        visible={showForceLogoutError}
        variant="warning"
        icon="alert-circle-outline"
        title={t("logout_failed")}
        message={t("logout_failed_message")}
        confirmLabel={tCommon("retry")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleForceLogoutRetry}
        onCancel={dismissForceLogoutError}
      />
      <ConfirmationModal
        visible={isAiDisableConfirmOpen}
        variant="warning"
        icon="sparkles-outline"
        title={t("ai_disable_confirm_title")}
        message={t("ai_disable_confirm_message")}
        confirmLabel={t("ai_disable_confirm_turn_off")}
        cancelLabel={t("ai_disable_confirm_keep_on")}
        onConfirm={onConfirmAiDisable}
        onCancel={onCancelAiDisableConfirm}
      />
    </>
  );
}
