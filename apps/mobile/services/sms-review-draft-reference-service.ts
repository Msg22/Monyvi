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
  | "account_currency_mismatch"
  | "destination_account_unavailable"
  | "destination_account_currency_mismatch"
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
  const accountById = new Map(
    accounts.map((account) => [account.id, account] as const)
  );
  const categoryIds = new Set(categories.map((category) => category.id));

  return items.map((item) => {
    const reasons: SmsReviewDraftHardValidationReason[] = [];
    const pendingAccount = item.transaction.pendingAccount;
    const hasMatchingPendingAccount =
      pendingAccount?.tempId === item.transaction.accountId;
    if (
      item.transaction.accountId &&
      !accountById.has(item.transaction.accountId) &&
      !hasMatchingPendingAccount
    ) {
      reasons.push("account_unavailable");
    }
    const sourceAccountCurrency =
      hasMatchingPendingAccount && pendingAccount
        ? pendingAccount.currency
        : item.transaction.accountId
          ? accountById.get(item.transaction.accountId)?.currency
          : undefined;
    if (
      sourceAccountCurrency &&
      sourceAccountCurrency !== item.transaction.currency
    ) {
      reasons.push("account_currency_mismatch");
    }
    if (
      item.transaction.toAccountId &&
      !accountById.has(item.transaction.toAccountId)
    ) {
      reasons.push("destination_account_unavailable");
    }
    const destinationAccountCurrency = item.transaction.toAccountId
      ? accountById.get(item.transaction.toAccountId)?.currency
      : undefined;
    if (
      destinationAccountCurrency &&
      destinationAccountCurrency !== item.transaction.currency
    ) {
      reasons.push("destination_account_currency_mismatch");
    }
    if (
      item.transaction.isAtmWithdrawal !== true &&
      !categoryIds.has(item.transaction.categoryId)
    ) {
      reasons.push("category_unavailable");
    }
    return { ...item, hardValidationReasons: reasons };
  });
}
