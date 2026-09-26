import { database, type Profile } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { queryOwned } from "./user-data-access";
import type { SupportedLanguage } from "@/i18n/translation-schema";

export function observeProfileLanguage(
  userId: string,
  next: (language: SupportedLanguage | null) => void,
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
      next: (profiles): void => next(profiles[0]?.preferredLanguage ?? null),
      error,
    });
}
