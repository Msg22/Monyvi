/**
 * #395 T027 pure command/merge primitives. All state is canonical, immutable,
 * caller-scoped and revision-limited; none of this code writes persistence.
 */
import {
  MAX_CANONICAL_UNSIGNED_INTEGER_STRING,
  parseCanonicalUnsignedIntegerString,
} from "../financial-actions/action-contracts";
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewGroup,
  type AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";

export interface ReviewUndoLease {
  readonly token: string;
  readonly previousState: AccountReviewSession;
  readonly afterRemovalGeneration: AccountReviewSession["operationGeneration"];
}

/** Pure, owner-bound category facts captured from a current authenticated
 * local category query. System categories have null userId; user categories
 * must match the exact review owner. No UI category labels are authority. */
export interface AccountReviewCategoryRecord {
  readonly id: string;
  readonly userId?: string | null;
  readonly isSystem: boolean;
  readonly deleted: boolean;
  readonly isHidden?: boolean;
  readonly isInternal?: boolean;
  readonly type: AccountReviewRow["transaction"]["type"] | null;
  readonly displayName: string;
}

export interface AccountReviewCategorySnapshots {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly categories: readonly AccountReviewCategoryRecord[];
}

export interface ReduceAccountReviewCommandInput {
  readonly state: AccountReviewSession;
  readonly command: AccountReviewCommand;
  readonly accountSnapshots: AccountReviewOwnedContext;
  /** Optional for unrelated commands; REQUIRED for category/type edits.
   * The writer must capture/revalidate it under current scoped ownership. */
  readonly categorySnapshots?: AccountReviewCategorySnapshots;
  readonly nextUndoToken: string | null;
  readonly undo: ReviewUndoLease | null;
  /** Service-authored local readiness reconciliation; never a user command. */
  readonly autoSelectReady?: boolean;
  /** Voice volatile intent or SMS's existing nullable selectionOverride=false. */
  readonly manuallyDeselectedRowIds?: ReadonlySet<AccountReviewRow["rowId"]>;
}

export interface AccountReviewCommandResult {
  readonly state: AccountReviewSession;
  readonly affectedRowIds: readonly string[];
  readonly affectedGroupIds: readonly string[];
  readonly reasonCodes: readonly AccountReviewReason[];
  readonly effect: "none" | "persist_sms" | "session_only";
  readonly undoToken: string | null;
}

export interface ReviewTransition {
  readonly rows: readonly AccountReviewRow[];
  readonly groups: readonly AccountReviewGroup[];
  readonly removedEvidenceKeys?: readonly string[];
  readonly affectedRowIds: readonly string[];
  readonly affectedGroupIds: readonly string[];
  readonly undoToken?: string | null;
}

const REVISION_OVERFLOW = "account_review_reducer_revision_overflow";

/** Keep the canonical signed-BIGINT-independent 64-bit limit. */
export function incrementReviewRevision(revision: string): string {
  const parsed = parseCanonicalUnsignedIntegerString(revision);
  const next = BigInt(parsed) + 1n;
  if (next > BigInt(MAX_CANONICAL_UNSIGNED_INTEGER_STRING)) {
    throw new Error(REVISION_OVERFLOW);
  }
  return parseCanonicalUnsignedIntegerString(next.toString());
}

export function isRevisionOverflow(error: unknown): boolean {
  return error instanceof Error && error.message === REVISION_OVERFLOW;
}

export function uniqueReasons(
  reasons: readonly AccountReviewReason[],
  added: AccountReviewReason
): AccountReviewReason[] {
  return [...new Set([...reasons, added])];
}

export function withoutAccountBlocker(
  reasons: readonly AccountReviewReason[]
): AccountReviewReason[] {
  return reasons.filter(
    (reason) =>
      reason !== "account_needed" &&
      reason !== "account_group_unconfirmed" &&
      reason !== "account_identity_uncertain" &&
      reason !== "account_unavailable"
  );
}

export function revisedRow(row: AccountReviewRow): AccountReviewRow {
  return { ...row, revision: incrementReviewRevision(row.revision) };
}

export function rejectReviewCommand(
  state: AccountReviewSession,
  reason: AccountReviewReason
): AccountReviewCommandResult {
  return {
    state,
    reasonCodes: [reason],
    effect: "none",
    undoToken: null,
    affectedRowIds: [],
    affectedGroupIds: [],
  };
}

/**
 * Navigation has its own monotonic review CAS but never creates a business
 * generation, row revision, or Undo-affecting mutation. A same-filter request
 * remains an identity no-op with empty reason codes.
 */
export function acceptReviewFilterTransition(
  session: AccountReviewSession,
  filter: AccountReviewSession["filter"]
): AccountReviewCommandResult {
  if (session.filter === filter) {
    return {
      state: session,
      reasonCodes: [],
      effect: "none",
      undoToken: null,
      affectedRowIds: [],
      affectedGroupIds: [],
    };
  }
  const state = accountReviewSessionSchema.parse({
    ...session,
    filter,
    revision: incrementReviewRevision(session.revision),
  });
  return {
    state,
    reasonCodes: [],
    effect: session.source === "SMS" ? "persist_sms" : "session_only",
    undoToken: null,
    affectedRowIds: [],
    affectedGroupIds: [],
  };
}

export function acceptReviewTransition(
  session: AccountReviewSession,
  next: ReviewTransition
): AccountReviewCommandResult {
  const state = accountReviewSessionSchema.parse({
    ...session,
    rows: next.rows,
    groups: next.groups,
    removedEvidenceKeys:
      next.removedEvidenceKeys ?? session.removedEvidenceKeys,
    revision: incrementReviewRevision(session.revision),
    operationGeneration: incrementReviewRevision(session.operationGeneration),
  });
  return {
    state,
    reasonCodes: [],
    undoToken: next.undoToken ?? null,
    affectedRowIds: [...next.affectedRowIds],
    affectedGroupIds: [...next.affectedGroupIds],
    effect: session.source === "SMS" ? "persist_sms" : "session_only",
  };
}
