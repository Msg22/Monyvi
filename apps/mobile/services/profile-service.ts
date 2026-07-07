/**
 * Profile Service
 *
 * Plain async functions for onboarding-related profile mutations.
 * Each write goes through WatermelonDB's `database.write()`; push-sync
 * to Supabase is non-blocking and happens on the existing cadence.
 *
 * Architecture: Service Layer (Constitution IV) — no React, no hooks.
 *
 * @module profile-service
 */

import {
  Account,
  Profile,
  type AiProcessingConsent,
  type CurrencyType,
  type OnboardingFlags,
  type PreferredLanguageCode,
  database,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { SUPPORTED_CURRENCIES } from "@monyvi/logic";
import {
  changeLanguage,
  getCurrentLanguage,
  type SupportedLanguage,
} from "@/i18n/changeLanguage";
import aiProcessingConsentConfig from "@/config/ai-processing-consent.json";
import {
  createCashAccountWithinWriter,
  getDefaultCashAccountName,
} from "@/services/account-service";
import { clearOnboardingStep } from "@/services/onboarding-cursor-service";
import { supabase } from "@/services/supabase";
import { getCurrentUserDataScope } from "@/services/user-data-access";
import { logger } from "@/utils/logger";

/**
 * Runtime-visible set of supported currency codes. Used to guard the
 * entry to `confirmCurrencyAndOnboard` against an invalid value reaching
 * the atomic write — compile-time `CurrencyType` is insufficient for any
 * path that originates outside the app (deep-links, future API endpoints).
 */
const SUPPORTED_CURRENCY_CODES: ReadonlySet<CurrencyType> = new Set(
  SUPPORTED_CURRENCIES.map((c) => c.code)
);

export const AI_PROCESSING_CONSENT_VERSION = aiProcessingConsentConfig.version;

export interface AiProcessingConsentStatus {
  readonly isConsented: boolean;
  readonly consent: AiProcessingConsent | null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Returns the authenticated user's profile row.
 *
 * Scoped by `user_id` because logout preserves local rows. Querying by userId
 * prevents account switching on the same device from picking up another
 * user's profile.
 *
 * Throws if either the auth session is missing or the profile row is absent
 * (both should not happen after a successful initial pull-sync).
 */
async function getProfile(): Promise<Profile> {
  const scope = await getCurrentUserDataScope();

  const collection = database.get<Profile>("profiles");
  const profiles = await scope
    .queryOwned(collection, Q.where("deleted", Q.notEq(true)))
    .fetch();
  const profile = profiles[0];
  if (!profile) {
    throw new Error(
      "No profile row found. Profile should exist after initial sync."
    );
  }
  return profile;
}

function normalizeAiProcessingConsent(
  consent: unknown
): AiProcessingConsent | null {
  if (typeof consent !== "object" || consent === null) {
    return null;
  }

  const candidate = consent as Partial<AiProcessingConsent>;
  const hasValidRevocation =
    candidate.revokedAt === null || typeof candidate.revokedAt === "string";

  if (
    typeof candidate.version !== "string" ||
    candidate.version !== AI_PROCESSING_CONSENT_VERSION ||
    typeof candidate.consentedAt !== "string" ||
    !hasValidRevocation
  ) {
    return null;
  }

  return {
    version: candidate.version,
    consentedAt: candidate.consentedAt,
    revokedAt: candidate.revokedAt,
  };
}

export function parseAiProcessingConsentRaw(
  rawConsent: string | null | undefined
): AiProcessingConsent | null {
  if (!rawConsent) {
    return null;
  }

  try {
    return normalizeAiProcessingConsent(JSON.parse(rawConsent) as unknown);
  } catch {
    return null;
  }
}

export function isActiveAiProcessingConsent(consent: unknown): boolean {
  const normalizedConsent = normalizeAiProcessingConsent(consent);

  return (
    normalizedConsent !== null &&
    normalizedConsent.version === AI_PROCESSING_CONSENT_VERSION &&
    normalizedConsent.consentedAt.trim().length > 0 &&
    normalizedConsent.revokedAt === null
  );
}

function createAiProcessingConsent(now: Date): AiProcessingConsent {
  return {
    version: AI_PROCESSING_CONSENT_VERSION,
    consentedAt: now.toISOString(),
    revokedAt: null,
  };
}

function serializeAiProcessingConsent(
  consent: AiProcessingConsent
): Record<string, string | null> {
  return {
    version: consent.version,
    consentedAt: consent.consentedAt,
    revokedAt: consent.revokedAt,
  };
}

async function updateRemoteAiProcessingConsent(
  userId: string,
  consent: AiProcessingConsent,
  now: Date
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      ai_processing_consent: serializeAiProcessingConsent(consent),
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .eq("deleted", false);

  if (error) {
    throw error;
  }
}

async function writeLocalAiProcessingConsent(
  profile: Profile,
  rawConsent: string | null
): Promise<void> {
  await database.write(async () => {
    await profile.update((p) => {
      p.aiProcessingConsentRaw = rawConsent ?? undefined;
    });
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Persist the user's chosen language to the profile row AND apply it to the
 * in-memory i18n + RTL state so the UI updates immediately.
 *
 * Service owns both sides of the write per Constitution IV (no business
 * logic in screens). Callers (onboarding, Settings) should NOT call
 * `changeLanguage` themselves — this function is the single entry point.
 *
 * Resolves FR-007.
 */
export async function setPreferredLanguage(
  language: PreferredLanguageCode
): Promise<void> {
  const profile = await getProfile();
  await database.write(async () => {
    await profile.update((p) => {
      p.preferredLanguage = language;
    });
  });
  await changeLanguage(language);
}

/**
 * Persist the user's preferred display currency to the scoped profile row.
 */
export async function setPreferredCurrency(
  currency: CurrencyType
): Promise<void> {
  if (!SUPPORTED_CURRENCY_CODES.has(currency)) {
    throw new Error(
      `setPreferredCurrency: unsupported currency code "${String(currency)}"`
    );
  }

  const profile = await getProfile();
  await database.write(async () => {
    await profile.update((p) => {
      p.preferredCurrency = currency;
    });
  });
}

export async function getAiProcessingConsentStatus(): Promise<AiProcessingConsentStatus> {
  const profile = await getProfile();
  const consent = parseAiProcessingConsentRaw(profile.aiProcessingConsentRaw);
  return {
    consent,
    isConsented: isActiveAiProcessingConsent(consent),
  };
}

export async function grantAiProcessingConsent(
  now: Date = new Date()
): Promise<void> {
  const profile = await getProfile();
  const consent = createAiProcessingConsent(now);
  const previousConsentRaw = profile.aiProcessingConsentRaw ?? null;
  const consentRaw = JSON.stringify(consent);

  await writeLocalAiProcessingConsent(profile, consentRaw);

  try {
    await updateRemoteAiProcessingConsent(profile.userId, consent, now);
  } catch (error) {
    await writeLocalAiProcessingConsent(profile, previousConsentRaw);
    throw error;
  }
}

export async function revokeAiProcessingConsent(
  now: Date = new Date()
): Promise<void> {
  const profile = await getProfile();
  const currentConsent = parseAiProcessingConsentRaw(
    profile.aiProcessingConsentRaw
  );
  if (!currentConsent) {
    return;
  }

  const revokedConsent: AiProcessingConsent = {
    version: currentConsent.version,
    consentedAt: currentConsent.consentedAt,
    revokedAt: now.toISOString(),
  };

  await writeLocalAiProcessingConsent(profile, JSON.stringify(revokedConsent));
  await updateRemoteAiProcessingConsent(profile.userId, revokedConsent, now);
}

/**
 * Flip the `onboarding_completed` flag to true AND clear the per-user
 * AsyncStorage cursor.
 *
 * @deprecated No longer called directly. `confirmCurrencyAndOnboard` now
 *   sets `onboardingCompleted = true` atomically alongside currency, language,
 *   and cash-account creation. This function is retained only until the
 *   remaining callers are migrated. See feature 026 spec.
 *
 * Lifecycle per contract:
 * 1. `database.write()` sets `onboarding_completed = true`.
 * 2. `clearOnboardingStep(userId)` removes `onboarding:<userId>:step`.
 *
 * If step 2 fails, the error is logged but NOT re-thrown. Step 1 is the
 * contract-critical write; the router reads the DB flag, so a stale cursor
 * is harmless.
 *
 * CALLERS MUST await this call before navigating. A rejected promise means
 * the DB write failed; continuing to the dashboard would leave the user
 * with `onboarding_completed = false` and they would re-enter the flow
 * on next launch. See the contract file in `specs/.../contracts/`.
 *
 * Idempotent — safe to call if already completed (no DB write; cursor
 * clear still runs defensively).
 */
export async function completeOnboarding(): Promise<void> {
  const profile = await getProfile();
  const userId = profile.userId;

  if (!profile.onboardingCompleted) {
    await database.write(async () => {
      await profile.update((p) => {
        p.onboardingCompleted = true;
      });
    });
  }

  try {
    await clearOnboardingStep(userId);
  } catch (error) {
    logger.warn(
      "onboarding.completeOnboarding.clearCursor.failed",
      error instanceof Error ? { message: error.message } : { error }
    );
  }
}

/**
 * Flip the setup-guide-dismissed flag on the user's profile.
 *
 * Service-layer wrapper so hooks and components never `database.write()`
 * directly. The write is idempotent — calling this for an already-dismissed
 * profile is a no-op at the DB level (observer re-emit only).
 */
export async function setSetupGuideCompleted(
  completed: boolean
): Promise<void> {
  const profile = await getProfile();
  if (profile.setupGuideCompleted === completed) {
    return;
  }
  await database.write(async () => {
    await profile.update((p) => {
      p.setupGuideCompleted = completed;
    });
  });
}

/**
 * Set a single onboarding flag on the user's profile.
 *
 * Atomicity: reads `profile.onboardingFlags` INSIDE the writer. Reading
 * outside the writer (and relying on a captured snapshot) is a TOCTOU
 * hazard — two concurrent callers starting from the same snapshot would
 * both merge against stale JSON, and the second commit would silently
 * drop the first caller's key.
 *
 * WatermelonDB serializes `database.write()` calls, so the `onboardingFlags`
 * getter inside the writer is guaranteed to reflect any prior committed
 * mutation on this row.
 */
export async function setOnboardingFlag<K extends keyof OnboardingFlags>(
  flagKey: K,
  value: NonNullable<OnboardingFlags[K]>
): Promise<void> {
  const profile = await getProfile();
  await database.write(async () => {
    const current = profile.onboardingFlags;
    const next = { ...current, [flagKey]: value };
    await profile.update((p) => {
      p.onboardingFlagsRaw = JSON.stringify(next);
    });
  });
}

/**
 * Single atomic write that confirms the user's currency choice and completes
 * onboarding. All four mutations happen inside one `database.write()`:
 *
 * 1. Cash account created (or found) via `createCashAccountWithinWriter`
 * 2. `preferredCurrency` set on profile
 * 3. `preferredLanguage` overwritten with the current runtime language
 * 4. `onboardingCompleted` flipped to `true`
 *
 * After the transaction commits, `options.onTransactionCommitted?.()` fires
 * (e.g., to trigger first-run tooltip state). The onboarding cursor is cleared
 * defensively — failure is logged but not re-thrown.
 *
 * Does NOT clear `@monyvi/intro-locale-override` (FR-030).
 *
 * Resolves FR-009, FR-010, FR-011, FR-013, FR-031.
 */
export async function confirmCurrencyAndOnboard(
  currency: CurrencyType,
  options?: {
    readonly onTransactionCommitted?: () => void;
  }
): Promise<{ readonly accountId: string }> {
  // Runtime boundary guard — `CurrencyType` is compile-time only, and any
  // future caller (deep-link, API endpoint, plugin) could feed an
  // unsupported value. Rejecting before the write prevents a partial
  // local-DB state that Supabase's enum constraint would later reject.
  if (!SUPPORTED_CURRENCY_CODES.has(currency)) {
    throw new Error(
      `confirmCurrencyAndOnboard: unsupported currency code "${String(
        currency
      )}"`
    );
  }

  const profile = await getProfile();
  const userId = profile.userId;
  const language: SupportedLanguage = getCurrentLanguage();
  const cashAccountName = getDefaultCashAccountName(language);

  let accountId = "";

  await database.write(async () => {
    // 1. Cash account
    const accountsCollection = database.get<Account>("accounts");
    const result = await createCashAccountWithinWriter(
      userId,
      currency,
      accountsCollection,
      cashAccountName
    );
    accountId = result.accountId;

    // 2–4. Profile mutations in one batch
    await profile.update((p) => {
      p.preferredCurrency = currency;
      p.preferredLanguage = language;
      p.onboardingCompleted = true;
    });
  });

  // Post-commit callback — the DB state is already durably committed by the
  // time we get here, so a throwing callback (e.g. an unrelated setState
  // blowing up downstream) MUST NOT surface as a `confirmCurrencyAndOnboard`
  // rejection. The caller would then see an error toast and believe the
  // write failed, tempting them to retry an already-successful operation.
  try {
    options?.onTransactionCommitted?.();
  } catch (error: unknown) {
    logger.warn(
      "onboarding.confirmCurrencyAndOnboard.onTransactionCommitted.failed",
      error instanceof Error ? { message: error.message } : { error }
    );
  }

  // Defensive cursor clear — non-critical
  try {
    await clearOnboardingStep(userId);
  } catch (error: unknown) {
    logger.warn(
      "onboarding.confirmCurrencyAndOnboard.clearCursor.failed",
      error instanceof Error ? { message: error.message } : { error }
    );
  }

  return { accountId };
}
