import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useSync } from "@/providers/SyncProvider";
import { useLanguageState } from "@/hooks/useLanguageRuntime";
import { logger } from "@/utils/logger";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";

/** Splash coordinator; language application mounts independently of content gates. */
export function AppReadyGate({
  isLocaleSettled,
}: {
  readonly isLocaleSettled?: boolean;
}): null {
  const { isLoading: authIsLoading, isAuthenticated, user } = useAuth();
  const { initialSyncState } = useSync();
  const { profile, isLoading: profileIsLoading } = useProfile();
  const language = useLanguageState();
  const hiddenRef = useRef(false);
  const hideInFlightRef = useRef(false);
  const accountReady =
    !authIsLoading &&
    (!isAuthenticated ||
      (initialSyncState !== "in-progress" && !profileIsLoading));
  const languageReady =
    profile === null ||
    (language.scope === user?.id &&
      (language.phase === "ready" || language.phase === "error"));
  const ready = accountReady && (isLocaleSettled ?? languageReady);

  useEffect((): void => {
    if (!ready || hiddenRef.current || hideInFlightRef.current) return;
    hideInFlightRef.current = true;
    void SplashScreen.hideAsync()
      .then((): void => {
        hiddenRef.current = true;
      })
      .catch((error: unknown): void => {
        logger.warn("appReadyGate.splash.hideAsync.failed", { error });
      })
      .finally((): void => {
        hideInFlightRef.current = false;
      });
  }, [ready]);
  return null;
}
