import { useEffect, useLayoutEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePreferredLanguage } from "./usePreferredLanguage";
import {
  useLanguageReconciliation,
  useLanguageState,
} from "./useLanguageRuntime";
import { languageCoordinator } from "@/services/language-runtime-service";
import { readIntroLocaleOverride } from "@/services/intro-flag-service";
import { getDeviceLanguage } from "@/utils/rtl";
import type { SupportedLanguage } from "@/i18n/translation-schema";
import type { LanguageSnapshot } from "@/services/language-coordinator";

export const PUBLIC_LANGUAGE_SCOPE = "public";

/** Mounted at the auth root, never below a locale-dependent rendering gate. */
export function useLanguageScope(): void {
  const { user, isLoading } = useAuth();
  const scope = isLoading ? null : (user?.id ?? PUBLIC_LANGUAGE_SCOPE);
  useLayoutEffect((): (() => void) => {
    languageCoordinator.setScope(scope);
    return (): void => languageCoordinator.setScope(null);
  }, [scope]);
}

export function usePublicLocaleStartup(): LanguageSnapshot {
  const current = useLanguageState();
  const { isLoading, isAuthenticated } = useAuth();
  const [language, setLanguage] = useState<SupportedLanguage | null>(null);
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    let cancelled = false;
    void readIntroLocaleOverride().then((override): void => {
      if (!cancelled)
        setLanguage(override ?? (getDeviceLanguage() === "ar" ? "ar" : "en"));
    });
    return (): void => {
      cancelled = true;
      setLanguage(null);
    };
  }, [isAuthenticated, isLoading]);
  const target =
    current.scope === PUBLIC_LANGUAGE_SCOPE
      ? (current.language ?? language)
      : language;
  return useLanguageReconciliation(
    target,
    PUBLIC_LANGUAGE_SCOPE,
    isLoading || isAuthenticated || target === null
  );
}

export function usePrivateLocaleStartup(): {
  readonly state: LanguageSnapshot;
  readonly isProfileUnavailable: boolean;
} {
  const { user, isLoading } = useAuth();
  const preference = usePreferredLanguage();
  const [fallbackLanguage, setFallbackLanguage] =
    useState<SupportedLanguage | null>(null);

  useEffect(() => {
    if (isLoading || !user) {
      setFallbackLanguage(null);
      return;
    }
    let cancelled = false;
    void readIntroLocaleOverride().then((override): void => {
      if (!cancelled) {
        setFallbackLanguage(
          override ?? (getDeviceLanguage() === "ar" ? "ar" : "en")
        );
      }
    });
    return (): void => {
      cancelled = true;
      setFallbackLanguage(null);
    };
  }, [isLoading, user?.id]);

  const targetLanguage = preference.profileExists
    ? (preference.language ?? fallbackLanguage)
    : null;

  const isReconciling =
    isLoading ||
    preference.isLoading ||
    (preference.profileExists && targetLanguage === null);

  const state = useLanguageReconciliation(
    targetLanguage,
    user?.id ?? null,
    isReconciling
  );

  return {
    state,
    isProfileUnavailable:
      !isLoading && !preference.isLoading && !preference.profileExists,
  };
}

