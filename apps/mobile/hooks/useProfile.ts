/**
 * useProfile Hook
 *
 * Observes the current authenticated user's Profile record from WatermelonDB.
 * Only handles data subscription — all presentation logic (initials,
 * display name, avatar URL) lives in `@/utils/profile-helpers`.
 *
 * Follows the same observer pattern as usePreferredCurrency.
 *
 * @module useProfile
 */

import { database, Profile } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";
import { queryOwned } from "@/services/user-data-access";
import { logger } from "@/utils/logger";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

// =============================================================================
// Types
// =============================================================================

interface UseProfileResult {
  /** The raw WatermelonDB Profile record (null while loading or if absent) */
  readonly profile: Profile | null;
  /** True while the initial Profile observation is pending */
  readonly isLoading: boolean;
}

interface ProfileSnapshot {
  readonly profile: Profile | null;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Observes the user's Profile record from WatermelonDB.
 *
 * This hook is intentionally thin — it only subscribes to the profile
 * collection and exposes the raw record + loading state. All presentation
 * logic (display name, initials, avatar URL) should be derived at the
 * call-site using helpers from `@/utils/profile-helpers`.
 *
 * @returns An object with profile and isLoading.
 */
export function useProfile(): UseProfileResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const [profileSnapshot, setProfileSnapshot] = useState<ProfileSnapshot>({
    profile: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setProfileSnapshot({ profile: null });
        setIsLoading(true);
      },
      onSignedOut: () => {
        setProfileSnapshot({ profile: null });
        setIsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setProfileSnapshot({ profile: null });
        setIsLoading(true);

        const collection = database.get<Profile>("profiles");
        const subscription = queryOwned(
          collection,
          currentUserId,
          Q.where("deleted", false),
          Q.take(1)
        )
          .observe()
          .subscribe({
            next: (profiles) => {
              setProfileSnapshot({ profile: profiles[0] ?? null });
              setIsLoading(false);
            },
            error: (err: unknown) => {
              logger.error("profile.observe.failed", err);
              setIsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [isResolvingUser, userId]);

  return {
    profile: profileSnapshot.profile,
    isLoading,
  };
}
