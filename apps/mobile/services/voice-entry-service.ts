/**
 * Voice Entry Service
 *
 * Central navigation entry used by onboarding surfaces that cannot directly
 * own Expo Router navigation.
 */

import { router } from "expo-router";

/**
 * Open the unified Add Transaction experience directly in Voice mode.
 *
 * Onboarding voice entry originates from the dashboard, so the default Voice
 * flow origin remains the Home tab when no explicit origin is supplied.
 */
export function openVoiceEntry(): void {
  router.push("/add-transaction?mode=voice");
}
