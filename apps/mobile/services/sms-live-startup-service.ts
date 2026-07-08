import { Platform } from "react-native";

import { getAiProcessingConsentStatus } from "./profile-service";
import {
  reconcileLiveDetectionPreference,
  setAutoConfirm,
  setLiveDetectionEnabled,
} from "./sms-live-detection-handler";
import { startSmsListener, stopSmsListener } from "./sms-live-listener-service";

export async function startConsentAwareLiveSmsListenerIfEnabled(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  const enabled = await reconcileLiveDetectionPreference();
  if (!enabled) {
    stopSmsListener();
    return;
  }

  try {
    const consentStatus = await getAiProcessingConsentStatus();
    if (consentStatus.isConsented) {
      startSmsListener();
      return;
    }

    try {
      await setLiveDetectionEnabled(false);
      await setAutoConfirm(false);
    } finally {
      stopSmsListener();
    }
  } catch (error: unknown) {
    stopSmsListener();
    throw error;
  }
}
