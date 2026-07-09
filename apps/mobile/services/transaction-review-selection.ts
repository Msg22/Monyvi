import type { ReviewableTransaction } from "@monyvi/logic";

export type TransactionReviewReason =
  | "cash_transfer"
  | "low_confidence"
  | "account_needed"
  | "category_needed";

export interface TransactionReviewAccountMatch {
  readonly accountId: string | null;
}

export interface TransactionReviewMeta {
  readonly isAutoSelectable: boolean;
  readonly reasons: readonly TransactionReviewReason[];
}

const AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.8;

export function getTransactionReviewMeta(
  transaction: ReviewableTransaction,
  accountMatch: TransactionReviewAccountMatch | undefined
): TransactionReviewMeta {
  const reasons: TransactionReviewReason[] = [];

  if (isAtmWithdrawal(transaction)) {
    reasons.push("cash_transfer");
  }

  if (transaction.confidence <= AUTO_SELECT_CONFIDENCE_THRESHOLD) {
    reasons.push("low_confidence");
  }

  if (!accountMatch?.accountId) {
    reasons.push("account_needed");
  }

  if (!transaction.categoryId) {
    reasons.push("category_needed");
  }

  return {
    isAutoSelectable: reasons.length === 0,
    reasons,
  };
}

export function buildAutoSelectedIndices(
  transactions: readonly ReviewableTransaction[],
  accountMatches: ReadonlyMap<number, TransactionReviewAccountMatch>
): ReadonlySet<number> {
  const selected = new Set<number>();

  transactions.forEach((transaction, index) => {
    if (
      getTransactionReviewMeta(transaction, accountMatches.get(index))
        .isAutoSelectable
    ) {
      selected.add(index);
    }
  });

  return selected;
}

function isAtmWithdrawal(transaction: ReviewableTransaction): boolean {
  return (
    "isAtmWithdrawal" in transaction &&
    (transaction as { readonly isAtmWithdrawal?: boolean }).isAtmWithdrawal ===
      true
  );
}
