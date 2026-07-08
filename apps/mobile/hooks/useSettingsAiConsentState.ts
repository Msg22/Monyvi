import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseSettingsAiConsentStateResult {
  readonly hasConsentedBefore: boolean;
  readonly isAiConsentEnabled: boolean;
  readonly markAiConsentGranted: () => void;
  readonly revokeConsent: () => Promise<void>;
}

export function useSettingsAiConsentState({
  hasPersistedConsentRecord,
  isPersistedConsented,
  revokePersistedConsent,
}: {
  readonly hasPersistedConsentRecord: boolean;
  readonly isPersistedConsented: boolean;
  readonly revokePersistedConsent: () => Promise<void>;
}): UseSettingsAiConsentStateResult {
  const [isGrantedInSession, setIsGrantedInSession] = useState(false);
  const hasSeenPersistedConsentRef = useRef(hasPersistedConsentRecord);
  const isAiConsentEnabled = isPersistedConsented || isGrantedInSession;
  const hasConsentedBefore = hasSeenPersistedConsentRef.current;

  useEffect((): void => {
    if (hasPersistedConsentRecord) {
      hasSeenPersistedConsentRef.current = true;
      if (!isPersistedConsented) {
        setIsGrantedInSession(false);
      }
      return;
    }

    if (hasSeenPersistedConsentRef.current) {
      setIsGrantedInSession(false);
    }
  }, [hasPersistedConsentRecord, isPersistedConsented]);

  const markAiConsentGranted = useCallback((): void => {
    hasSeenPersistedConsentRef.current = true;
    setIsGrantedInSession(true);
  }, []);
  const revokeConsent = useCallback(async (): Promise<void> => {
    await revokePersistedConsent();
    setIsGrantedInSession(false);
  }, [revokePersistedConsent]);

  return useMemo(
    () => ({
      hasConsentedBefore,
      isAiConsentEnabled,
      markAiConsentGranted,
      revokeConsent,
    }),
    [
      hasConsentedBefore,
      isAiConsentEnabled,
      markAiConsentGranted,
      revokeConsent,
    ]
  );
}
