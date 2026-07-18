import type {
  TransactionReviewMeta,
  TransactionReviewReason,
} from "@/contracts/transaction-review";

export type BadgeColor = "amber" | "red" | "blue" | "emerald";

export interface TransactionBadgeData {
  readonly labelKey: string;
  readonly color: BadgeColor;
}

const BADGE_PRIORITY: Readonly<Record<string, number>> = {
  review_badge_review_account: 0,
  review_badge_review_category: 1,
  review_badge_review_amount: 2,
  review_badge_review_cash_account: 3,
  review_badge_missing_info: 4,
  review_badge_review_details: 5,
  review_badge_auto_selected: 6,
};

const REVIEW_REASON_BADGES: Record<
  TransactionReviewReason,
  TransactionBadgeData
> = {
  cash_transfer: {
    labelKey: "review_badge_review_cash_account",
    color: "amber",
  },
  low_confidence: {
    labelKey: "review_badge_review_details",
    color: "amber",
  },
  account_needed: {
    labelKey: "review_badge_review_account",
    color: "red",
  },
  category_needed: {
    labelKey: "review_badge_review_category",
    color: "red",
  },
  amount_review: {
    labelKey: "review_badge_review_amount",
    color: "amber",
  },
  parser_review: {
    labelKey: "review_badge_review_details",
    color: "amber",
  },
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

export function getPrimaryTransactionBadge(
  hasMissingInfo: boolean,
  reviewMeta: TransactionReviewMeta | undefined,
  isSelected: boolean
): TransactionBadgeData | undefined {
  return [...getTransactionBadges(hasMissingInfo, reviewMeta, isSelected)].sort(
    (left, right) =>
      (BADGE_PRIORITY[left.labelKey] ?? Number.MAX_SAFE_INTEGER) -
      (BADGE_PRIORITY[right.labelKey] ?? Number.MAX_SAFE_INTEGER)
  )[0];
}
