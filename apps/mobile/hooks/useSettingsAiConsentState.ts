import { useCallback, useMemo, useState } from "react";

interface UseSettingsAiConsentStateResult {
  readonly isAiConsentEnabled: boolean;
  readonly markAiConsentGranted: () => void;
  readonly revokeConsent: () => Promise<void>;
}

export function useSettingsAiConsentState({
  isPersistedConsented,
  revokePersistedConsent,
}: {
  readonly isPersistedConsented: boolean;
  readonly revokePersistedConsent: () => Promise<void>;
}): UseSettingsAiConsentStateResult {
  const [isGrantedInSession, setIsGrantedInSession] = useState(false);
  const isAiConsentEnabled = isPersistedConsented || isGrantedInSession;
  const markAiConsentGranted = useCallback((): void => {
    setIsGrantedInSession(true);
  }, []);
  const revokeConsent = useCallback(async (): Promise<void> => {
    await revokePersistedConsent();
    setIsGrantedInSession(false);
  }, [revokePersistedConsent]);

  return useMemo(
    () => ({ isAiConsentEnabled, markAiConsentGranted, revokeConsent }),
    [isAiConsentEnabled, markAiConsentGranted, revokeConsent]
  );
}
