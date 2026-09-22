/**
 * AsyncStorage key constants.
 *
 * Centralises every key used across the app so that readers/writers
 * are always in sync and typos become compile-time errors.
 *
 * @module storage-keys
 */

/**
 * Per-user onboarding-step cursor (feature 024).
 *
 * Full key format is `onboarding:<userId>:step` — this constant is only the
 * namespace prefix. Read/write goes through `services/onboarding-cursor-service.ts`
 * which handles the userId interpolation. Kept here only for discoverability
 * — there should be no direct AsyncStorage callers outside the cursor service.
 */
export const ONBOARDING_CURSOR_PREFIX = "onboarding";

// =============================================================================
// Pre-auth device flags (NOT cleared on logout)
// =============================================================================

/** Set to `"true"` once the user has completed or explicitly skipped the pre-auth pitch on this device. */
export const INTRO_SEEN_KEY = "@monyvi/intro-seen";

/** Explicit language preference selected on any pre-auth surface (pitch, auth, or Currency step). Device-scoped — persists across sign-up/sign-out. */
export const INTRO_LOCALE_OVERRIDE_KEY = "@monyvi/intro-locale-override";

/** Device-scoped transport cursor for the last fully applied market-rate publication. */
export const MARKET_RATE_PUBLICATION_CHECKPOINT_KEY =
  "@monyvi/market-rates/publication-checkpoint/v1";
