import { useToast } from "@/components/ui/Toast";
import {
  DEFAULT_CURRENCY,
  detectCurrencyFromTimezone,
} from "@/utils/currency-detection";
import { database, type Profile, type CurrencyType } from "@monyvi/db";
import { SUPPORTED_CURRENCIES } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { queryOwned } from "@/services/user-data-access";
import { setPreferredCurrency as persistPreferredCurrency } from "@/services/profile-service";
import { logger } from "@/utils/logger";
import { redactIdentifierForLog } from "@/utils/logger-redaction";

interface UsePreferredCurrencyResult {
  /** The user's preferred display currency */
  readonly preferredCurrency: CurrencyType;
  /** Update the preferred currency in the profile */
  readonly setPreferredCurrency: (currency: CurrencyType) => Promise<void>;
  readonly isLoading: boolean;
}

interface ObservedPreference {
  readonly userId: string;
  readonly currency: CurrencyType | null;
}

/**
 * Exposes the user's preferred currency (from the Profile record or device locale) and a setter to persist changes.
 *
 * @returns An object containing:
 * - `preferredCurrency`: the resolved currency taken from the Profile's `preferredCurrency` when available, otherwise detected from the device locale (defaults to USD if unavailable or unsupported).
 * - `setPreferredCurrency`: a function that persists the provided currency to the current Profile; it does nothing if no Profile is available.
 * - `isLoading`: `true` while the initial Profile observation is pending, `false` otherwise.
 */
export function usePreferredCurrency(): UsePreferredCurrencyResult {
  const [preference, setPreference] = useState<ObservedPreference | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (isResolvingUser) {
      setPreference(null);
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setPreference(null);
      setIsLoading(false);
      return;
    }

    setPreference(null);
    setIsLoading(true);

    const collection = database.get<Profile>("profiles");
    const subscription = queryOwned(
      collection,
      userId,
      Q.where("deleted", false),
      Q.take(1)
    )
      .observeWithColumns(["preferred_currency"])
      .subscribe({
        next: (profiles) => {
          const profile = profiles[0];
          setPreference(
            profile
              ? { userId, currency: profile.preferredCurrency ?? null }
              : null
          );
          setIsLoading(false);
        },
        error: (err: unknown) => {
          logger.error("preferredCurrency.profile.observe.failed", err, {
            redactedUserId: redactIdentifierForLog(userId),
          });
          setIsLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [userId, isResolvingUser]);

  const currentPreference =
    !isResolvingUser && preference?.userId === userId ? preference : null;

  const preferredCurrency = useMemo<CurrencyType>(() => {
    const currency = currentPreference?.currency;
    if (
      currency &&
      SUPPORTED_CURRENCIES.some((item) => item.code === currency)
    ) {
      return currency;
    }
    // No profile or unsupported currency — detect from device timezone.
    // Falls back to DEFAULT_CURRENCY (USD) if detection returns null.
    return detectCurrencyFromTimezone() ?? DEFAULT_CURRENCY;
  }, [currentPreference?.currency]);

  const setPreferredCurrency = async (
    currency: CurrencyType
  ): Promise<void> => {
    if (!currentPreference) return;
    try {
      await persistPreferredCurrency(currency);
    } catch (error) {
      logger.error("preferredCurrency.save.failed", error);
      showToast({
        type: "error",
        title: "Error",
        message: "Failed to save currency preference",
      });
    }
  };

  return {
    preferredCurrency,
    setPreferredCurrency,
    isLoading,
  };
}
