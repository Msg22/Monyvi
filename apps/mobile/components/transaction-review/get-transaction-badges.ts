import type { ReviewableTransaction } from "@monyvi/logic";

export type BadgeColor = "amber" | "red" | "blue" | "emerald";

export interface TransactionBadgeData {
  readonly label: string;
  readonly color: BadgeColor;
}

const CONFIDENCE_REVIEW_THRESHOLD = 0.8;

/**
 * Derives presentation badges (tags) for a transaction.
 *
 * Extracts logic out of the UI components, adhering to the Open/Closed Principle (OCP).
 * New transaction sources or parsing metadata can define their own badges here
 * without modifying standard UI rendering loops.
 */
export function getTransactionBadges(
  transaction: ReviewableTransaction,
  hasMissingInfo: boolean
): readonly TransactionBadgeData[] {
  const badges: TransactionBadgeData[] = [];

  // 1. Source-specific transaction tags (e.g., SMS parser metadata)
  if (
    "isAtmWithdrawal" in transaction &&
    transaction.isAtmWithdrawal === true
  ) {
    badges.push({ label: "Cash Withdrawal", color: "amber" });
  }

  const hasParserReviewSignal =
    transaction.reviewStatus === "needs_review" ||
    (transaction.reviewReasons?.length ?? 0) > 0;

  // 2. Generic parser confidence / review metadata
  if (
    transaction.confidence <= CONFIDENCE_REVIEW_THRESHOLD ||
    hasParserReviewSignal
  ) {
    badges.push({ label: "Needs Review", color: "amber" });
  }

  // 3. User-Action Required (Missing core constraints like Account/Category)
  if (hasMissingInfo) {
    badges.push({ label: "Missing Info", color: "red" });
  }

  return badges;
}
