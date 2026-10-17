/**
 * #395 FR-019: current authenticated, accessible, active category authority
 * shared by the real SMS writer, the Voice memory bridge and the controlled
 * editor's option presentation. UI choices never authorize a saved category.
 */
import { database, type Category } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import type { AccountReviewCategorySnapshots } from "../../../packages/logic/src/account-review/reducer-primitives";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

export interface OwnedReviewEditorCategories {
  readonly snapshot: AccountReviewCategorySnapshots;
  /** Already scoped records for the EXISTING category selector presentation. */
  readonly records: readonly Category[];
}

function assertLive(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("account_review_category_load_cancelled");
  error.name = "AbortError";
  throw error;
}

function permittedCategory(
  category: Category,
  expectedOwnerId: string
): boolean {
  if (
    category.deleted ||
    category.isHidden ||
    category.isInternal ||
    category.displayName.trim().length === 0 ||
    (category.type !== "EXPENSE" && category.type !== "INCOME")
  )
    return false;
  if (category.userId === null || category.userId === undefined)
    return category.isSystem === true;
  return category.userId === expectedOwnerId && category.isSystem === false;
}

export async function loadCurrentAccountReviewEditorCategories(
  expectedOwnerId: string,
  signal?: AbortSignal
): Promise<OwnedReviewEditorCategories> {
  assertLive(signal);
  const scope = await getCurrentUserDataScope();
  assertLive(signal);
  if (scope.userId !== expectedOwnerId) throw new Error("review_owner_changed");

  // The query itself is restricted to current-user categories and shared
  // system categories; the postread checks defend against stale native rows.
  const fetched = await scope
    .queryAccessibleCategories(
      database.get<Category>("categories"),
      Q.where("deleted", false),
      Q.where("is_hidden", false),
      Q.where("is_internal", false)
    )
    .fetch();
  assertLive(signal);
  await assertExpectedCurrentUser(expectedOwnerId);
  assertLive(signal);

  const records = fetched.filter((category) =>
    permittedCategory(category, expectedOwnerId)
  );
  const ids = new Set<string>();
  for (const category of records) {
    if (ids.has(category.id))
      throw new Error("account_review_category_snapshot_conflict");
    ids.add(category.id);
  }
  const snapshot: AccountReviewCategorySnapshots = {
    ownerId: expectedOwnerId,
    categories: records.map((category) => ({
      id: category.id,
      userId: category.userId ?? null,
      isSystem: category.isSystem,
      deleted: category.deleted,
      isHidden: category.isHidden,
      isInternal: category.isInternal,
      type: category.type ?? null,
      displayName: category.displayName,
    })),
  };
  return { snapshot, records };
}
