import i18n from "./index";

import { languageCoordinator } from "@/services/language-runtime-service";

export type { SupportedLanguage } from "./translation-schema";
import type { SupportedLanguage } from "./translation-schema";

/**
 * Change the app language and apply RTL if needed.
 *
 * This function:
 * 1. Updates the i18next language
 * 2. Applies RTL layout changes (triggers reload for Arabic)
 *
 * NOTE (feature 024, 2026-04-18): persistence of the user's choice is the
 * CALLER's responsibility — this function no longer writes to AsyncStorage.
 * Onboarding and Settings call `profile-service.setPreferredLanguage(lang)`
 * alongside `changeLanguage(lang)`; that mutation writes to
 * `profiles.preferred_language` (WatermelonDB + Supabase sync). The legacy
 * `LANGUAGE_KEY` is gone (FR-015).
 *
 * NOTE: When switching to/from Arabic, the app will reload (1-2s loading screen).
 * This is a platform limitation and expected behavior.
 *
 * @param lang - Language code ("en" or "ar")
 */
export async function changeLanguage(
  lang: SupportedLanguage,
  options?: { readonly persist?: (isCurrent: () => boolean) => Promise<void> }
): Promise<void> {
  await languageCoordinator.apply(lang, options);
}

/**
 * Get the current app language from i18next.
 *
 * @returns Current language code ("en" or "ar")
 */
export function getCurrentLanguage(): SupportedLanguage {
  return i18n.language === "ar" ? "ar" : "en";
}

/**
 * Check if the current language is Arabic.
 *
 * @returns true if current language is Arabic
 */
export function isArabic(): boolean {
  return getCurrentLanguage() === "ar";
}
