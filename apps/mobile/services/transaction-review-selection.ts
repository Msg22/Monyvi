import type {
  ParsedSmsTransaction,
  ReviewableTransaction,
  TransactionReviewReason as ParserReviewReason,
} from "@monyvi/logic";
import type {
  TransactionReviewMeta,
  TransactionReviewReason,
} from "@/contracts/transaction-review";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";

export type {
  TransactionReviewMeta,
  TransactionReviewReason,
} from "@/contracts/transaction-review";

export interface TransactionReviewAccountMatch {
  readonly accountId: string | null;
  readonly matchReason?: string;
}

export interface TransactionReviewResolutionContext {
  readonly hasCategoryOverride?: boolean;
  readonly hasCashDestinationOverride?: boolean;
}

export function getDurableTransactionOverrides(
  transactions: readonly ReviewableTransaction[]
): ReadonlyMap<number, TransactionEdits> {
  const overrides = new Map<number, TransactionEdits>();
  transactions.forEach((transaction, index) => {
    if (transaction.source !== "SMS") return;
    const smsTransaction = transaction as ParsedSmsTransaction;
    if (
      !transaction.accountId &&
      !smsTransaction.pendingAccount &&
      !smsTransaction.toAccountId &&
      smsTransaction.categoryConfirmed !== true
    ) {
      return;
    }

    overrides.set(index, {
      amount: transaction.amount,
      currency: transaction.currency,
      counterparty: transaction.counterparty,
      categoryId: transaction.categoryId,
      type: transaction.type,
      categoryConfirmed:
        smsTransaction.categoryConfirmed === true ? true : undefined,
      accountId:
        smsTransaction.pendingAccount?.tempId ?? transaction.accountId ?? null,
      accountName: smsTransaction.pendingAccount?.name ?? null,
      accountConfirmed:
        smsTransaction.pendingAccount || transaction.accountId
          ? true
          : undefined,
      toAccountId: smsTransaction.toAccountId,
      toAccountName: smsTransaction.toAccountName,
      toAccountConfirmed: smsTransaction.toAccountId ? true : undefined,
      pendingAccount: smsTransaction.pendingAccount,
    });
  });
  return overrides;
}

export function resolveEditedAccountMatch<
  TMatch extends TransactionReviewAccountMatch,
>(
  currentMatch: TMatch | undefined,
  editedAccountId: string | null,
  isAccountConfirmed = false
): {
  readonly accountId: string | null;
  readonly matchReason: TMatch["matchReason"] | "account_name" | "none";
} {
  const hasChangedAccount =
    Boolean(editedAccountId) && editedAccountId !== currentMatch?.accountId;
  const hasConfirmedFallback =
    isAccountConfirmed &&
    Boolean(editedAccountId) &&
    editedAccountId === currentMatch?.accountId &&
    !isResolvedAccountMatch(currentMatch);

  return {
    accountId: editedAccountId,
    matchReason:
      hasChangedAccount || hasConfirmedFallback
        ? "account_name"
        : (currentMatch?.matchReason ?? "none"),
  };
}

export function getEditedTransactionReviewMeta<
  TMatch extends TransactionReviewAccountMatch,
>(
  currentTransaction: ReviewableTransaction,
  currentAccountMatch: TMatch | undefined,
  edits: Pick<ReviewableTransaction, "amount" | "categoryId" | "type"> & {
    readonly accountId: string | null;
    readonly accountConfirmed?: boolean;
    readonly categoryConfirmed?: boolean;
    readonly toAccountConfirmed?: boolean;
  }
): TransactionReviewMeta {
  return getTransactionReviewMeta(
    {
      ...currentTransaction,
      amount: edits.amount,
      categoryId: edits.categoryId,
      type: edits.type,
    },
    resolveEditedAccountMatch(
      currentAccountMatch,
      edits.accountId,
      edits.accountConfirmed === true
    ),
    {
      hasCategoryOverride: edits.categoryConfirmed === true,
      hasCashDestinationOverride: edits.toAccountConfirmed === true,
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
  ambiguous_amount: "amount_review",
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

  if (
    isAtmWithdrawal(transaction) &&
    resolutionContext.hasCashDestinationOverride !== true
  ) {
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
  if (parserReason === "cash_transfer_review") {
    return resolutionContext.hasCashDestinationOverride === true;
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

const HARD_VALIDATION_REASONS: ReadonlySet<TransactionReviewReason> = new Set([
  "account_needed",
  "category_needed",
  "cash_transfer",
]);

export interface SeedTransactionReviewSelectionInput {
  readonly transactionCount: number;
  readonly previousCount: number;
  readonly currentSelectedIndices: ReadonlySet<number>;
  readonly selectionOverrides: ReadonlyMap<number, boolean | null>;
  readonly autoSelectedIndices: ReadonlySet<number>;
  readonly reviewMetaByIndex: ReadonlyMap<number, TransactionReviewMeta>;
}

export interface SeedTransactionReviewSelectionResult {
  readonly selectedIndices: ReadonlySet<number>;
  readonly clearedHardInvalidIndices: readonly number[];
}

export function seedTransactionReviewSelection(
  input: SeedTransactionReviewSelectionInput
): SeedTransactionReviewSelectionResult {
  const selected =
    input.previousCount === 0
      ? new Set<number>()
      : new Set(input.currentSelectedIndices);
  const clearedHardInvalidIndices: number[] = [];

  for (let index = 0; index < input.transactionCount; index += 1) {
    const override = input.selectionOverrides.get(index);
    const hasHardValidation =
      input.reviewMetaByIndex
        .get(index)
        ?.reasons.some((reason) => HARD_VALIDATION_REASONS.has(reason)) ??
      false;
    if (override === true && hasHardValidation) {
      selected.delete(index);
      clearedHardInvalidIndices.push(index);
    } else if (override === true) {
      selected.add(index);
    } else if (override === false) {
      selected.delete(index);
    } else if (index >= input.previousCount) {
      if (input.autoSelectedIndices.has(index)) selected.add(index);
      else selected.delete(index);
    }
  }

  return { selectedIndices: selected, clearedHardInvalidIndices };
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
