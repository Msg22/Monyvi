/**
 * Intro Flag Service
 *
 * AsyncStorage wrapper for device-scoped pre-auth flags that control the
 * intro / pitch experience and locale override.
 *
 * These flags are NOT user-specific and are NOT cleared on logout. They
 * survive sign-up / sign-out cycles because they represent device-level
 * preferences (FR-030).
 *
 * Architecture: Service Layer (Constitution IV) — plain async functions,
 * no React, no hooks.
 *
 * Error policy: every read returns a safe default (`false` / `null`) when
 * AsyncStorage rejects, every write logs + swallows. Callers that need to
 * surface a write failure can wrap in their own try/catch; the defaults
 * here exist so the pitch / language-switcher code paths never latch
 * `isLoading=true` forever on a transient storage hiccup.
 *
 * @module intro-flag-service
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  INTRO_LOCALE_OVERRIDE_KEY,
  INTRO_SEEN_KEY,
} from "@/constants/storage-keys";
import { logger } from "@/utils/logger";
import type { SupportedLanguage } from "@/i18n/translation-schema";

/** Required durability before a language transition can restart the app. */
export async function persistIntroLocaleOverride(
  language: SupportedLanguage
): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_LOCALE_OVERRIDE_KEY, language);
  } catch (error: unknown) {
    logger.warn("language.override.persist.failed", errorPayload(error));
    throw error;
  }
}

// =============================================================================
// Types
// =============================================================================

/** Valid locale override values stored in AsyncStorage. */
type IntroLocale = "en" | "ar";

const VALID_LOCALES: ReadonlySet<IntroLocale> = new Set<IntroLocale>([
  "en",
  "ar",
]);

// =============================================================================
// Internal helpers
// =============================================================================

/** Convert the `unknown` caught value into a logger-ready payload. */
function errorPayload(error: unknown): Record<string, unknown> {
  return error instanceof Error ? { message: error.message } : { error };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Read the intro-seen flag.
 *
 * Returns `true` only when the stored value is exactly `"true"`.
 * Returns `false` for absent keys, unexpected values, or storage errors.
 */
export async function readIntroSeen(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(INTRO_SEEN_KEY);
    return value === "true";
  } catch (error: unknown) {
    logger.warn(
      "[intro-flag] Failed to read intro-seen flag",
      errorPayload(error)
    );
    return false;
  }
}

/**
 * Persist the intro-seen flag. Idempotent — writing `"true"` when already
 * present is a no-op at the storage layer. Best-effort: a write failure is
 * logged but not rethrown, so the pitch-completion code path is never
 * blocked by a transient storage error.
 */
export async function markIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "true");
  } catch (error: unknown) {
    logger.warn(
      "[intro-flag] Failed to write intro-seen flag",
      errorPayload(error)
    );
  }
}

/**
 * Read the locale override chosen on a pre-auth surface.
 *
 * Returns the stored locale if it is a valid `"en"` | `"ar"` value, or
 * `null` when absent / invalid / on storage error. Callers treat `null`
 * as "use system locale".
 */
export async function readIntroLocaleOverride(): Promise<IntroLocale | null> {
  try {
    const raw = await AsyncStorage.getItem(INTRO_LOCALE_OVERRIDE_KEY);
    if (raw === null) return null;
    return VALID_LOCALES.has(raw as IntroLocale) ? (raw as IntroLocale) : null;
  } catch (error: unknown) {
    logger.warn(
      "[intro-flag] Failed to read intro-locale-override",
      errorPayload(error)
    );
    return null;
  }
}

/**
 * Persist the locale override. Device-scoped — survives logout (FR-030).
 * There is intentionally no `clearIntroLocaleOverride` export; the override
 * persists forever. Best-effort: a write failure is logged but not
 * rethrown, so the language-switch UI interaction is never blocked.
 */
export async function setIntroLocaleOverride(lang: IntroLocale): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_LOCALE_OVERRIDE_KEY, lang);
  } catch (error: unknown) {
    logger.warn(
      "[intro-flag] Failed to write intro-locale-override",
      errorPayload(error)
    );
  }
}
