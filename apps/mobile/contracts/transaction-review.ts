export type TransactionReviewReason =
  | "cash_transfer"
  | "low_confidence"
  | "account_needed"
  | "category_needed"
  | "amount_review"
  | "parser_review";

export interface TransactionReviewMeta {
  readonly isAutoSelectable: boolean;
  readonly reasons: readonly TransactionReviewReason[];
}
