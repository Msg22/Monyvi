import { database, type Profile } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { queryOwned } from "./user-data-access";
import type { SupportedLanguage } from "@/i18n/translation-schema";

export interface ProfileLanguageObservation {
  readonly language: SupportedLanguage | null;
  readonly profileExists: boolean;
}

export function observeProfileLanguage(
  userId: string,
  next: (observation: ProfileLanguageObservation) => void,
  error: (reason: unknown) => void
): { readonly unsubscribe: () => void } {
  return queryOwned(
    database.get<Profile>("profiles"),
    userId,
    Q.where("deleted", false),
    Q.take(1)
  )
    .observeWithColumns(["preferred_language"])
    .subscribe({
      next: (profiles): void => {
        const profile = profiles[0];
        next({
          language: profile?.preferredLanguage ?? null,
          profileExists: profile !== undefined,
        });
      },
      error,
    });
}
