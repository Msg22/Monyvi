import type {
  ReviewableTransaction,
  TransactionReviewReason as ParserReviewReason,
} from "@monyvi/logic";

export type TransactionReviewReason =
  | "cash_transfer"
  | "low_confidence"
  | "account_needed"
  | "category_needed"
  | "parser_review";

export interface TransactionReviewAccountMatch {
  readonly accountId: string | null;
  readonly matchReason?: string;
}

export interface TransactionReviewMeta {
  readonly isAutoSelectable: boolean;
  readonly reasons: readonly TransactionReviewReason[];
}

export interface TransactionReviewResolutionContext {
  readonly hasCategoryOverride?: boolean;
}

export function resolveEditedAccountMatch<
  TMatch extends TransactionReviewAccountMatch,
>(
  currentMatch: TMatch | undefined,
  editedAccountId: string | null
): {
  readonly accountId: string | null;
  readonly matchReason: TMatch["matchReason"] | "account_name" | "none";
} {
  const hasChangedAccount =
    Boolean(editedAccountId) && editedAccountId !== currentMatch?.accountId;

  return {
    accountId: editedAccountId,
    matchReason: hasChangedAccount
      ? "account_name"
      : (currentMatch?.matchReason ?? "none"),
  };
}

export function getEditedTransactionReviewMeta<
  TMatch extends TransactionReviewAccountMatch,
>(
  originalTransaction: ReviewableTransaction | undefined,
  currentTransaction: ReviewableTransaction,
  currentAccountMatch: TMatch | undefined,
  edits: Pick<ReviewableTransaction, "amount" | "categoryId" | "type"> & {
    readonly accountId: string | null;
  }
): TransactionReviewMeta {
  return getTransactionReviewMeta(
    {
      ...currentTransaction,
      amount: edits.amount,
      categoryId: edits.categoryId,
      type: edits.type,
    },
    resolveEditedAccountMatch(currentAccountMatch, edits.accountId),
    {
      hasCategoryOverride: edits.categoryId !== originalTransaction?.categoryId,
    }
  );
}

const AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.8;
const PARSER_REASON_MAP: Readonly<
  Record<ParserReviewReason, TransactionReviewReason>
> = {
  low_confidence: "low_confidence",
  account_needed: "account_needed",
  category_needed: "category_needed",
  cash_transfer_review: "cash_transfer",
  unsupported_template: "parser_review",
  ambiguous_amount: "parser_review",
  partial_template: "parser_review",
  non_transactional: "parser_review",
};

function addReviewReason(
  reasons: TransactionReviewReason[],
  reason: TransactionReviewReason
): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

export function getTransactionReviewMeta(
  transaction: ReviewableTransaction,
  accountMatch: TransactionReviewAccountMatch | undefined,
  resolutionContext: TransactionReviewResolutionContext = {}
): TransactionReviewMeta {
  const reasons: TransactionReviewReason[] = [];

  if (isAtmWithdrawal(transaction)) {
    addReviewReason(reasons, "cash_transfer");
  }

  if (transaction.confidence <= AUTO_SELECT_CONFIDENCE_THRESHOLD) {
    addReviewReason(reasons, "low_confidence");
  }

  if (!isResolvedAccountMatch(accountMatch)) {
    addReviewReason(reasons, "account_needed");
  }

  if (!transaction.categoryId) {
    addReviewReason(reasons, "category_needed");
  }

  for (const parserReason of transaction.reviewReasons ?? []) {
    if (isResolvedParserReason(parserReason, accountMatch, resolutionContext)) {
      continue;
    }
    addReviewReason(reasons, PARSER_REASON_MAP[parserReason]);
  }

  if (
    transaction.reviewStatus === "needs_review" &&
    (transaction.reviewReasons?.length ?? 0) === 0 &&
    reasons.length === 0
  ) {
    addReviewReason(reasons, "parser_review");
  }

  return {
    isAutoSelectable: reasons.length === 0,
    reasons,
  };
}

function isResolvedParserReason(
  parserReason: ParserReviewReason,
  accountMatch: TransactionReviewAccountMatch | undefined,
  resolutionContext: TransactionReviewResolutionContext
): boolean {
  if (parserReason === "account_needed") {
    return isResolvedAccountMatch(accountMatch);
  }
  if (parserReason === "category_needed") {
    return resolutionContext.hasCategoryOverride === true;
  }
  return false;
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

export function isResolvedAccountMatch(
  accountMatch: TransactionReviewAccountMatch | undefined
): accountMatch is TransactionReviewAccountMatch & {
  readonly accountId: string;
} {
  if (!accountMatch?.accountId) return false;

  return !["default", "first_bank", "none"].includes(
    accountMatch.matchReason ?? "none"
  );
}

function isAtmWithdrawal(transaction: ReviewableTransaction): boolean {
  return (
    "isAtmWithdrawal" in transaction &&
    (transaction as { readonly isAtmWithdrawal?: boolean }).isAtmWithdrawal ===
      true
  );
}
