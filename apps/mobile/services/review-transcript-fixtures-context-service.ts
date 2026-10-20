/**
 * #395 review transcript fixtures — current-owner context loader.
 *
 * Loads the SAME owner-scoped account snapshot the shipped review path uses
 * plus the current user's accessible category mapping. No writes, no provider
 * calls, no account creation. A missing category mapping fails closed instead
 * of inventing a category id.
 *
 * @module review-transcript-fixtures-context-service
 */

import { Q } from "@nozbe/watermelondb";
import {
  database,
  type Category,
  type CurrencyType,
  type TransactionType,
} from "@monyvi/db";
import type { AccountReviewRequestContext } from "@monyvi/logic";

import {
  loadAccountReviewAccountSnapshots,
  type AccountReviewLocalAccountSnapshot,
} from "./account-review-read-model-service";
import { getCurrentUserDataScope } from "./user-data-access";

export interface ReviewTranscriptFixtureCategorySummary {
  readonly systemName: string;
  readonly displayName: string;
  readonly type: TransactionType;
}

export interface ReviewTranscriptFixturesContext {
  readonly ownerId: string;
  readonly preferredCurrency: CurrencyType;
  readonly accounts: readonly AccountReviewLocalAccountSnapshot[];
  readonly providerContext: AccountReviewRequestContext;
  readonly categoryIdsBySystemName: ReadonlyMap<string, string>;
  readonly categoryDisplayNamesBySystemName: ReadonlyMap<string, string>;
  readonly fallbackCategorySystemNameByType: ReadonlyMap<
    TransactionType,
    string
  >;
  readonly categories: readonly ReviewTranscriptFixtureCategorySummary[];
}

export type { ReviewTranscriptFixtureRoleInspection } from "@/dev/review-transcript-fixtures/catalog";
export {
  findRoleAccountId,
  inspectReviewTranscriptFixtureRoles,
} from "@/dev/review-transcript-fixtures/catalog";

function buildCategoryIndexes(categories: readonly Category[]): {
  readonly ids: Map<string, string>;
  readonly displayNames: Map<string, string>;
  readonly fallbacks: Map<TransactionType, string>;
  readonly summaries: ReviewTranscriptFixtureCategorySummary[];
} {
  const ids = new Map<string, string>();
  const displayNames = new Map<string, string>();
  const fallbacks = new Map<TransactionType, string>();
  const summaries: ReviewTranscriptFixtureCategorySummary[] = [];
  for (const category of categories) {
    if (category.deleted || category.isHidden || category.isInternal) continue;
    const systemName = category.systemName?.trim();
    const displayName = category.displayName?.trim();
    const type = category.type;
    if (
      !systemName ||
      !displayName ||
      (type !== "EXPENSE" && type !== "INCOME")
    )
      continue;
    // Prefer the accessible system-owned neutral when an owned category
    // happens to share its system name. Never select an arbitrary first row.
    const neutral = type === "EXPENSE" ? "other" : "income_other";
    const isNeutral = category.isSystem && systemName === neutral;
    if (!ids.has(systemName) || isNeutral) {
      ids.set(systemName, category.id);
      displayNames.set(systemName, displayName);
    }
    if (isNeutral) fallbacks.set(type, systemName);
    summaries.push({ systemName, displayName, type });
  }
  return { ids, displayNames, fallbacks, summaries };
}

export async function loadReviewTranscriptFixturesContext(): Promise<ReviewTranscriptFixturesContext> {
  const scope = await getCurrentUserDataScope();
  const snapshots = await loadAccountReviewAccountSnapshots();
  if (scope.userId !== snapshots.ownerId) {
    throw new Error("review_transcript_fixture_owner_changed");
  }
  const categories = await scope
    .queryAccessibleCategories(
      database.get<Category>("categories"),
      Q.where("deleted", false)
    )
    .fetch();
  const indexes = buildCategoryIndexes(categories);
  return {
    ownerId: snapshots.ownerId,
    preferredCurrency: snapshots.preferredCurrency,
    accounts: snapshots.accounts,
    providerContext: snapshots.providerContext,
    categoryIdsBySystemName: indexes.ids,
    categoryDisplayNamesBySystemName: indexes.displayNames,
    fallbackCategorySystemNameByType: indexes.fallbacks,
    categories: indexes.summaries,
  };
}
