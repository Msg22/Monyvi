import { useCallback, useEffect, useState } from "react";
import {
  readIntroLocaleOverride,
  persistIntroLocaleOverride,
} from "@/services/intro-flag-service";
import { changeLanguage } from "@/i18n/changeLanguage";
import { logger } from "@/utils/logger";

/**
 * Observes + mutates the device-scoped locale override.
 *
 * Contract: `isLoading` MUST transition from `true` to `false` after the
 * initial AsyncStorage read, regardless of success or failure. A rejected
 * read logs a warning and leaves `override = null` so the caller's UI
 * renders its default locale rather than stalling on a spinner forever.
 */
export function useIntroLocaleOverride(): {
  readonly override: "en" | "ar" | null;
  readonly setOverride: (lang: "en" | "ar") => Promise<void>;
  readonly isLoading: boolean;
} {
  const [override, setOverrideState] = useState<"en" | "ar" | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const value = await readIntroLocaleOverride();
        if (!cancelled) {
          setOverrideState(value);
        }
      } catch (error: unknown) {
        logger.warn(
          "useIntroLocaleOverride.readFailed",
          error instanceof Error ? { message: error.message } : { error }
        );
        // Fall through to the finally block: default `override = null`.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setOverride = useCallback(async (lang: "en" | "ar"): Promise<void> => {
    await changeLanguage(lang, {
      persist: (): Promise<void> => persistIntroLocaleOverride(lang),
    });
    setOverrideState(lang);
  }, []);

  return { override, setOverride, isLoading };
}
