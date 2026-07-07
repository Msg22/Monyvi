import { useCallback, type Dispatch, type SetStateAction } from "react";
import { setAutoConfirm, setLiveDetectionEnabled } from "@/services/sms-live-detection-handler";
import { stopSmsListener } from "@/services/sms-live-listener-service";
import { logger } from "@/utils/logger";

interface AiConsentActions {
  revokeConsent: () => Promise<void>;
}

interface UseSettingsAiConsentToggleParams {
  readonly aiConsent: AiConsentActions;
  readonly autoConfirmSms: boolean;
  readonly cancelLiveDetectionEnableFlow: () => void;
  readonly hasActiveLiveDetectionEnableFlowRef: { current: boolean };
  readonly hasPendingLiveDetectionEnable: boolean;
  readonly hasPendingNotificationEnable: boolean;
  readonly isLiveDetectionEnabling: boolean;
  readonly liveDetection: boolean;
  readonly setAutoConfirmSms: Dispatch<SetStateAction<boolean>>;
  readonly setIsAiConsentSheetVisible: Dispatch<SetStateAction<boolean>>;
  readonly setIsAiConsentUpdating: Dispatch<SetStateAction<boolean>>;
  readonly setLiveDetection: Dispatch<SetStateAction<boolean>>;
  readonly showToast: (config: {
    readonly type: "error";
    readonly title: string;
  }) => void;
  readonly tCommon: (key: string) => string;
}

export function useSettingsAiConsentToggle({
  aiConsent,
  autoConfirmSms,
  cancelLiveDetectionEnableFlow,
  hasActiveLiveDetectionEnableFlowRef,
  hasPendingLiveDetectionEnable,
  hasPendingNotificationEnable,
  isLiveDetectionEnabling,
  liveDetection,
  setAutoConfirmSms,
  setIsAiConsentSheetVisible,
  setIsAiConsentUpdating,
  setLiveDetection,
  showToast,
  tCommon,
}: UseSettingsAiConsentToggleParams): (value: boolean) => void {
  return useCallback((value: boolean): void => {
    if (value) {
      setIsAiConsentSheetVisible(true);
      return;
    }

    const hadSmsAutomationWork =
      liveDetection ||
      autoConfirmSms ||
      isLiveDetectionEnabling ||
      hasPendingLiveDetectionEnable ||
      hasPendingNotificationEnable ||
      hasActiveLiveDetectionEnableFlowRef.current;
    setIsAiConsentUpdating(true);
    aiConsent
      .revokeConsent()
      .then(async () => {
        cancelLiveDetectionEnableFlow();
        if (!hadSmsAutomationWork) return;
        setLiveDetection(false);
        stopSmsListener();
        setAutoConfirmSms(false);
        await setLiveDetectionEnabled(false);
        await setAutoConfirm(false);
      })
      .catch((error: unknown) => {
        logger.error("settings.revokeAiConsent.failed", error);
        showToast({ type: "error", title: tCommon("error") });
      })
      .finally(() => {
        setIsAiConsentUpdating(false);
      });
  }, [
    aiConsent,
    autoConfirmSms,
    cancelLiveDetectionEnableFlow,
    hasActiveLiveDetectionEnableFlowRef,
    hasPendingLiveDetectionEnable,
    hasPendingNotificationEnable,
    isLiveDetectionEnabling,
    liveDetection,
    setAutoConfirmSms,
    setIsAiConsentSheetVisible,
    setIsAiConsentUpdating,
    setLiveDetection,
    showToast,
    tCommon,
  ]);
}
