import { useEffect, useSyncExternalStore } from "react";
import { languageCoordinator } from "@/services/language-runtime-service";
import type { LanguageSnapshot } from "@/services/language-coordinator";
import type { SupportedLanguage } from "@/i18n/translation-schema";
import { logger } from "@/utils/logger";

export function useLanguageState(): LanguageSnapshot {
  return useSyncExternalStore(
    languageCoordinator.subscribe,
    languageCoordinator.getSnapshot,
    languageCoordinator.getSnapshot
  );
}

/** A facade only: the service owns transition ordering, restart and failure state. */
export function useLanguageReconciliation(
  language: SupportedLanguage | null,
  scope: string | null,
  isLoading: boolean
): LanguageSnapshot {
  const state = useLanguageState();
  useEffect((): void => {
    if (
      isLoading ||
      language === null ||
      languageCoordinator.getSnapshot().scope !== scope
    )
      return;
    const current = languageCoordinator.getSnapshot();
    if (
      current.phase === "applying" ||
      current.phase === "restarting" ||
      (current.phase === "error" && current.language === language)
    )
      return;
    if (current.phase === "ready" && current.language === language) return;
    void languageCoordinator.apply(language).catch((error: unknown): void => {
      logger.warn("language.reconcile.failed", { error });
    });
  }, [isLoading, language, scope, state.scope, state.phase]);

  if (
    isLoading ||
    state.scope !== scope ||
    (state.phase === "ready" && state.language !== language)
  ) {
    return { phase: "resolving", scope, language, errorCode: null };
  }
  return state;
}
