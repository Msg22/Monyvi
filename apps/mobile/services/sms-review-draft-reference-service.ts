import { Account, Category, database } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";

import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";
import type { SmsReviewDraftReadItem } from "./sms-review-draft-repository";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

export type SmsReviewDraftHardValidationReason =
  | "account_required"
  | "account_unavailable"
  | "category_unavailable";

export interface RevalidatedSmsReviewDraftItem extends SmsReviewDraftReadItem {
  readonly hardValidationReasons: readonly SmsReviewDraftHardValidationReason[];
}

export async function revalidateSmsReviewDraftReferences(
  items: readonly SmsReviewDraftReadItem[],
  expectedUserId: string
): Promise<readonly RevalidatedSmsReviewDraftItem[]> {
  if (items.length === 0) return [];
  const scope = await getCurrentUserDataScope();
  await assertExpectedCurrentUser(expectedUserId);
  if (scope.userId !== expectedUserId) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.USER_SCOPE_CHANGED);
  }
  const [accounts, categories] = await Promise.all([
    scope
      .queryOwned(database.get<Account>("accounts"), Q.where("deleted", false))
      .fetch(),
    scope
      .queryAccessibleCategories(
        database.get<Category>("categories"),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  await assertExpectedCurrentUser(expectedUserId);
  const accountIds = new Set(accounts.map((account) => account.id));
  const categoryIds = new Set(categories.map((category) => category.id));

  return items.map((item) => {
    const reasons: SmsReviewDraftHardValidationReason[] = [];
    if (
      item.transaction.accountId &&
      !accountIds.has(item.transaction.accountId)
    ) {
      reasons.push("account_unavailable");
    }
    if (!categoryIds.has(item.transaction.categoryId)) {
      reasons.push("category_unavailable");
    }
    return { ...item, hardValidationReasons: reasons };
  });
}
