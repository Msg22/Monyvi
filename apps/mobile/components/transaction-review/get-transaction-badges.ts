import type {
  TransactionReviewMeta,
  TransactionReviewReason,
} from "@/services/transaction-review-selection";

export type BadgeColor = "amber" | "red" | "blue" | "emerald";

export interface TransactionBadgeData {
  readonly labelKey: string;
  readonly color: BadgeColor;
}

const REVIEW_REASON_BADGES: Record<
  TransactionReviewReason,
  TransactionBadgeData
> = {
  cash_transfer: { labelKey: "review_badge_cash_transfer", color: "amber" },
  low_confidence: { labelKey: "review_badge_low_confidence", color: "amber" },
  account_needed: { labelKey: "review_badge_account_needed", color: "red" },
  category_needed: { labelKey: "review_badge_category_needed", color: "red" },
};

/**
 * Derives presentation badges (tags) for a transaction.
 *
 * Extracts logic out of the UI components, adhering to the Open/Closed Principle (OCP).
 * New transaction sources or parsing metadata can define their own badges here
 * without modifying standard UI rendering loops.
 */
export function getTransactionBadges(
  hasMissingInfo: boolean,
  reviewMeta: TransactionReviewMeta | undefined,
  isSelected: boolean
): readonly TransactionBadgeData[] {
  const badges: TransactionBadgeData[] = [];

  if (reviewMeta?.isAutoSelectable && isSelected) {
    badges.push({ labelKey: "review_badge_auto_selected", color: "emerald" });
    return badges;
  }

  for (const reason of reviewMeta?.reasons ?? []) {
    badges.push(REVIEW_REASON_BADGES[reason]);
  }

  if (hasMissingInfo) {
    badges.push({ labelKey: "review_badge_missing_info", color: "red" });
  }

  return badges;
}
