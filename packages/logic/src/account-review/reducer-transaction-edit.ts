/**
 * #395 FR-019 Phase A — pure, owner-scoped transaction-field edit transition.
 *
 * No DB, UI, provider, source mutation, category lookup, or Save side effect.
 * The live SMS writer must independently acquire current accessible categories
 * before passing categorySnapshots; omission fails closed for category/type edits.
 */
import Decimal from "decimal.js";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import { getCurrencyPrecision } from "../utils/currency";
import type {
  AccountReviewCommand,
  AccountReviewReason,
  AccountReviewRow,
  AccountReviewSession,
} from "./review-schemas";
import {
  revisedRow,
  type AccountReviewCategoryRecord,
  type ReduceAccountReviewCommandInput,
  type ReviewTransition,
} from "./reducer-primitives";
import { resolveAccountReviewSession } from "./resolution";

type TransactionEdit = Extract<
  AccountReviewCommand,
  { kind: "edit_row_transaction" }
>;

export interface TransactionEditOutcome {
  readonly transition: ReviewTransition | null;
  readonly reason: AccountReviewReason | null;
  /** Identity no-op; no revision, Undo or physical write. */
  readonly unchanged: boolean;
}

function blocked(reason: AccountReviewReason): TransactionEditOutcome {
  return { transition: null, reason, unchanged: false };
}

function unchanged(): TransactionEditOutcome {
  return { transition: null, reason: null, unchanged: true };
}

function accepted(transition: ReviewTransition): TransactionEditOutcome {
  return { transition, reason: null, unchanged: false };
}

/** Category snapshots are pure input, NOT an authorization substitute for the
 * SMS writer's current scoped query. Never use an unbound/UI category label. */
function currentCategory(
  state: AccountReviewSession,
  input: ReduceAccountReviewCommandInput,
  categoryId: string,
  targetType: AccountReviewRow["transaction"]["type"]
): AccountReviewCategoryRecord | null {
  const context = input.categorySnapshots;
  if (!context || context.ownerId !== state.ownerId) return null;
  const matches = context.categories.filter((c) => c.id === categoryId);
  if (matches.length !== 1) return null;
  const category = matches[0];
  if (
    !category ||
    category.deleted ||
    category.isHidden === true ||
    category.isInternal === true ||
    category.type !== targetType ||
    category.displayName.trim().length === 0
  )
    return null;
  // Shared categories must be genuine system rows, not anonymous user rows.
  // Custom rows must belong to the current account-review owner.
  if (category.userId === null || category.userId === undefined) {
    if (!category.isSystem) return null;
  } else if (category.userId !== state.ownerId || category.isSystem) {
    // System identities cannot be forged on an owned custom-category row.
    return null;
  }
  return category;
}

/** Derive numeric storage ONLY when the exact canonical decimal survives the
 * numeric round trip and fits the current confirmed row's currency precision.
 * Never convert the amount, round it, or accept an unchecked modal currency. */
function editedAmount(row: AccountReviewRow, value: string): number | null {
  if (
    row.currency.state !== "known" ||
    row.currency.code !== row.transaction.currency
  )
    return null;
  try {
    const decimal = new Decimal(value);
    if (
      !decimal.isFinite() ||
      !decimal.gt(0) ||
      decimal.gt(MAX_TRANSACTION_AMOUNT) ||
      decimal.decimalPlaces() > getCurrencyPrecision(row.currency.code)
    )
      return null;
    const amount = decimal.toNumber();
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !new Decimal(amount.toString()).eq(decimal)
    )
      return null;
    return amount;
  } catch {
    return null;
  }
}

function removeResolvedReasons(
  previous: AccountReviewRow["reviewReasons"],
  resolvedAmount: boolean,
  resolvedCategory: boolean
): AccountReviewRow["reviewReasons"] {
  return previous.filter(
    (reason) =>
      !(resolvedAmount && reason === "ambiguous_amount") &&
      !(resolvedCategory && reason === "category_needed")
  );
}

/** A field edit cannot silently authorize a previously stale account/source.
 * Use resolver output ONLY as eligibility evidence; never copy its changes
 * to the accepted session or any sibling/group. */
function preserveSelectedIfReady(
  state: AccountReviewSession,
  proposed: AccountReviewRow,
  input: ReduceAccountReviewCommandInput
): boolean {
  if (!proposed.selected) return false;
  if (proposed.reviewReasons.length > 0 || proposed.currency.state !== "known")
    return false;
  if (
    proposed.assignment.state === "unresolved" ||
    (proposed.assignment.state === "suggested" &&
      proposed.assignment.confirmation !== "confirmed")
  )
    return false;
  if (
    proposed.source === "SMS" &&
    proposed.transaction.isAtmWithdrawal &&
    proposed.toAssignment?.state !== "existing"
  )
    return false;
  const candidate: AccountReviewSession = {
    ...state,
    rows: state.rows.map((row) =>
      row.rowId === proposed.rowId ? proposed : row
    ),
  };
  const fresh = resolveAccountReviewSession({
    session: candidate,
    accountSnapshots: input.accountSnapshots,
  }).rows.find((row) => row.rowId === proposed.rowId);
  return (
    !!fresh &&
    fresh.selected &&
    JSON.stringify(fresh.assignment) === JSON.stringify(proposed.assignment) &&
    JSON.stringify(fresh.toAssignment) ===
      JSON.stringify(proposed.toAssignment) &&
    JSON.stringify(fresh.currency) === JSON.stringify(proposed.currency) &&
    JSON.stringify(fresh.reviewReasons) ===
      JSON.stringify(proposed.reviewReasons)
  );
}

export function reduceTransactionEdit(
  state: AccountReviewSession,
  command: TransactionEdit,
  input: ReduceAccountReviewCommandInput
): TransactionEditOutcome {
  const row = state.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_group_snapshot_conflict");
  if (row.revision !== command.expectedRowRevision)
    return blocked("review_revision_stale");
  if (row.source !== state.source) return blocked("review_source_changed");

  const patch = command.patch;
  // SMS modal offers neither type nor note changes. Its ATM variant also
  // hides merchant and category, which remain outside its editable surface.
  if (
    row.source === "SMS" &&
    (patch.type !== undefined ||
      patch.note !== undefined ||
      (row.transaction.isAtmWithdrawal === true &&
        (patch.counterparty !== undefined || patch.categoryId !== undefined)))
  ) {
    return blocked("account_group_snapshot_conflict");
  }

  const targetType = patch.type ?? row.transaction.type;
  // Type changes, like category changes, require current type-compatible
  // category authority. They cannot be authorized by old screen/map data.
  const requiresCategory =
    patch.categoryId !== undefined ||
    (patch.type !== undefined && patch.type !== row.transaction.type);
  const category = requiresCategory
    ? currentCategory(
        state,
        input,
        patch.categoryId ?? row.transaction.categoryId,
        targetType
      )
    : null;
  if (requiresCategory && category === null) return blocked("category_needed");

  let amount = row.transaction.amount;
  if (patch.amountDecimal !== undefined) {
    const checked = editedAmount(row, patch.amountDecimal);
    if (checked === null) return blocked("ambiguous_amount");
    amount = checked;
  }
  const nextAmountDecimal = patch.amountDecimal ?? row.amountDecimal;
  const nextReasons = removeResolvedReasons(
    row.reviewReasons,
    patch.amountDecimal !== undefined,
    category !== null
  );
  const nextCategoryId = category?.id ?? row.transaction.categoryId;
  const nextCategoryName =
    category?.displayName ?? row.transaction.categoryDisplayName;

  const nextRow: AccountReviewRow =
    row.source === "VOICE"
      ? {
          ...row,
          amountDecimal: nextAmountDecimal,
          reviewReasons: nextReasons,
          transaction: {
            ...row.transaction,
            amount,
            categoryId: nextCategoryId,
            categoryDisplayName: nextCategoryName,
            ...(patch.counterparty !== undefined
              ? { counterparty: patch.counterparty }
              : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
            ...(patch.note !== undefined ? { note: patch.note } : {}),
          },
        }
      : {
          ...row,
          amountDecimal: nextAmountDecimal,
          reviewReasons: nextReasons,
          transaction: {
            ...row.transaction,
            amount,
            categoryId: nextCategoryId,
            categoryDisplayName: nextCategoryName,
            ...(patch.counterparty !== undefined
              ? { counterparty: patch.counterparty }
              : {}),
            ...(category !== null ? { categoryConfirmed: true } : {}),
          },
        };

  // Identical values with no outstanding blocker are a genuine no-op. In
  // contrast, confirming the same amount can resolve ambiguous_amount.
  if (
    nextRow.amountDecimal === row.amountDecimal &&
    JSON.stringify(nextRow.transaction) === JSON.stringify(row.transaction) &&
    JSON.stringify(nextRow.reviewReasons) === JSON.stringify(row.reviewReasons)
  ) {
    return unchanged();
  }

  const retained = preserveSelectedIfReady(state, nextRow, input);
  const finalRow = revisedRow({
    ...nextRow,
    selected: row.selected && retained,
  });
  return accepted({
    rows: state.rows.map((item) =>
      item.rowId === row.rowId ? finalRow : item
    ),
    groups: state.groups,
    affectedRowIds: [row.rowId],
    affectedGroupIds: [],
  });
}
