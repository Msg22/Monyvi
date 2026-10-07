import * as Localization from "expo-localization";
import { I18nManager, Platform } from "react-native";
import { reloadAppAsync } from "expo";
import type { SupportedLanguage } from "@/i18n/translation-schema";

export function normalizeLayoutDirection(language: SupportedLanguage): void {
  const isRTL = language === "ar";
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.documentElement.lang = language;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }
}

export function needsLayoutReload(language: SupportedLanguage): boolean {
  return Platform.OS !== "web" && I18nManager.isRTL !== (language === "ar");
}

export async function reloadLayout(): Promise<void> {
  await reloadAppAsync("Apply selected language direction");
}

/**
 * Apply RTL layout and reload the app bundle.
 *
 * This function updates the I18nManager RTL setting and triggers a JS bundle reload
 * via Expo's current-bundle reload API. Native reload lets Yoga mirror all
 * flex-direction row layouts.
 *
 * @param isArabic - Whether to enable RTL (Arabic) or LTR (English)
 *
 * NOTE: This causes a brief (~1-2s) loading screen. This is expected behavior
 * and aligns with platform limitations. Cannot be avoided for proper RTL support.
 */
export async function applyRTL(isArabic: boolean): Promise<void> {
  const language = isArabic ? "ar" : "en";
  normalizeLayoutDirection(language);
  if (needsLayoutReload(language)) await reloadLayout();
}

/**
 * Get the device's default language code.
 *
 * @returns ISO 639-1 language code (e.g., "en", "ar")
 */
export function getDeviceLanguage(): string {
  return Localization.getLocales()[0]?.languageCode ?? "en";
}

/**
 * Check if the device language is Arabic.
 *
 * @returns true if device language is Arabic
 */
export function isDeviceLanguageArabic(): boolean {
  return getDeviceLanguage() === "ar";
}
