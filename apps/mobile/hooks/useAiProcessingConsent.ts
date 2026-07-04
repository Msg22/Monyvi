import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiProcessingConsent } from "@monyvi/db";
import {
  grantAiProcessingConsent,
  isActiveAiProcessingConsent,
  revokeAiProcessingConsent,
} from "@/services/profile-service";
import { useProfile } from "./useProfile";

interface UseAiProcessingConsentResult {
  readonly consent: AiProcessingConsent | null;
  readonly isConsented: boolean;
  readonly isLoading: boolean;
  readonly grantConsent: () => Promise<void>;
  readonly revokeConsent: () => Promise<void>;
}

export function useAiProcessingConsent(): UseAiProcessingConsentResult {
  const { profile, isLoading } = useProfile();
  const [optimisticConsent, setOptimisticConsent] = useState<boolean | null>(
    null
  );

  const persistedConsentRaw = profile?.aiProcessingConsentRaw ?? null;
  const persistedConsent = useMemo(
    () => profile?.aiProcessingConsent ?? null,
    [persistedConsentRaw, profile]
  );
  const persistedIsConsented = useMemo(
    () => isActiveAiProcessingConsent(persistedConsent),
    [persistedConsent]
  );

  useEffect(() => {
    setOptimisticConsent(null);
  }, [persistedConsent]);

  const grantConsent = useCallback(async (): Promise<void> => {
    await grantAiProcessingConsent();
    setOptimisticConsent(true);
  }, []);

  const revokeConsent = useCallback(async (): Promise<void> => {
    await revokeAiProcessingConsent();
    setOptimisticConsent(false);
  }, []);

  return {
    consent: persistedConsent,
    isConsented: optimisticConsent ?? persistedIsConsented,
    isLoading,
    grantConsent,
    revokeConsent,
  };
}
