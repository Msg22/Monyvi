import { useEffect, useState } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { observeProfileLanguage } from "@/services/profile-language-read-model-service";
import type { SupportedLanguage } from "@/i18n/translation-schema";
import { logger } from "@/utils/logger";

interface PreferredLanguageState {
  readonly language: SupportedLanguage | null;
  readonly isLoading: boolean;
  readonly hasError: boolean;
}

export function usePreferredLanguage(): PreferredLanguageState {
  const { userId, isResolvingUser } = useCurrentUser();
  const [snapshot, setSnapshot] = useState<{
    readonly userId: string;
    readonly language: SupportedLanguage | null;
    readonly hasError: boolean;
  } | null>(null);
  useEffect(() => {
    if (isResolvingUser || userId === null) return;
    let cancelled = false;
    const subscription = observeProfileLanguage(
      userId,
      (language): void => {
        if (!cancelled) setSnapshot({ userId, language, hasError: false });
      },
      (error): void => {
        logger.error("language.profile.observe.failed", error);
        if (!cancelled) setSnapshot({ userId, language: null, hasError: true });
      }
    );
    return (): void => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isResolvingUser, userId]);
  const current =
    !isResolvingUser && userId !== null && snapshot?.userId === userId
      ? snapshot
      : null;
  return {
    language: current?.language ?? null,
    isLoading: isResolvingUser || (userId !== null && current === null),
    hasError: current?.hasError ?? false,
  };
}
