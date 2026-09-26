import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import type { SupportedLanguage } from "@/i18n/translation-schema";

function subscribe(listener: () => void): () => void {
  i18n.on("languageChanged", listener);
  return (): void => {
    i18n.off("languageChanged", listener);
  };
}

function getSnapshot(): SupportedLanguage {
  return i18n.language === "ar" ? "ar" : "en";
}

/** Does not suspend, so root initialization can safely run before i18n is ready. */
export function useTranslationLanguage(): SupportedLanguage {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
