/** Volatile Undo: current-generation-only restoration, never a queue payload. */
import { canonicalUuid } from "./schema-primitives";
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewSession,
} from "./review-schemas";
import {
  incrementReviewRevision,
  revisedRow,
  type ReviewTransition,
  type ReviewUndoLease,
} from "./reducer-primitives";

export interface UndoTransitionResult {
  readonly transition: ReviewTransition | null;
  readonly reason: AccountReviewReason | null;
}

function invalidUndo(): UndoTransitionResult {
  return { transition: null, reason: "review_undo_invalid" };
}

function hasMatchingScope(
  current: AccountReviewSession,
  previous: AccountReviewSession
): boolean {
  return (
    current.ownerId === previous.ownerId &&
    current.source === previous.source &&
    current.sessionId === previous.sessionId &&
    current.sourceRevision === previous.sourceRevision
  );
}

/** The only permitted edits between these snapshots are the actual
 * removal's row revision/selection/assignment effects. */
function touchedRowMatchesRemoval(
  now: AccountReviewRow,
  old: AccountReviewRow
): boolean {
  if (
    now.assignment.state !== "unresolved" ||
    now.assignment.reasonCode !== "account_group_removed" ||
    now.selected ||
    now.revision !== incrementReviewRevision(old.revision)
  )
    return false;
  return (
    JSON.stringify(now.transaction) === JSON.stringify(old.transaction) &&
    now.amountDecimal === old.amountDecimal &&
    now.sourceRef === old.sourceRef &&
    now.sourceFingerprint === old.sourceFingerprint &&
    JSON.stringify(now.accountEvidence) ===
      JSON.stringify(old.accountEvidence) &&
    JSON.stringify(now.currency) === JSON.stringify(old.currency) &&
    now.hasUserAccountOverride === old.hasUserAccountOverride &&
    now.hasUserCurrencyOverride === old.hasUserCurrencyOverride
  );
}

function unchangedOutsideRemoval(
  current: AccountReviewSession,
  previous: AccountReviewSession,
  group: AccountReviewGroup
): boolean {
  const linked = new Set(group.linkedRowIds);
  if (
    current.rows.length !== previous.rows.length ||
    current.groups.length !== previous.groups.length
  )
    return false;
  return (
    previous.rows.every((row) => {
      const now = current.rows.find((item) => item.rowId === row.rowId);
      return (
        now !== undefined &&
        (linked.has(row.rowId)
          ? touchedRowMatchesRemoval(now, row)
          : JSON.stringify(row) === JSON.stringify(now))
      );
    }) &&
    previous.groups.every((item) => {
      const now = current.groups.find(
        (candidate) => candidate.groupId === item.groupId
      );
      return (
        now !== undefined &&
        (item.groupId === group.groupId ||
          JSON.stringify(item) === JSON.stringify(now))
      );
    })
  );
}

function removedGroupForUndo(
  current: AccountReviewSession,
  previous: AccountReviewSession
): AccountReviewGroup | null {
  const candidates = previous.groups.filter((group) => {
    const currentGroup = current.groups.find(
      (item) => item.groupId === group.groupId
    );
    return (
      group.status !== "removed" &&
      currentGroup?.status === "removed" &&
      currentGroup.evidenceKey === group.evidenceKey &&
      current.removedEvidenceKeys.includes(group.evidenceKey) &&
      !previous.removedEvidenceKeys.includes(group.evidenceKey)
    );
  });
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function restoredGroup(
  previous: AccountReviewGroup,
  current: AccountReviewGroup
): AccountReviewGroup {
  const revision = incrementReviewRevision(current.revision);
  return {
    ...previous,
    revision,
    confirmedIdentityRevision:
      previous.status === "confirmed" ? revision : null,
  };
}

function restoredRows(
  current: AccountReviewSession,
  previous: AccountReviewSession,
  group: AccountReviewGroup
): AccountReviewRow[] {
  const linked = new Set(group.linkedRowIds);
  return current.rows.map((row): AccountReviewRow => {
    if (!linked.has(row.rowId)) return row;
    const before = previous.rows.find((item) => item.rowId === row.rowId);
    if (!before) throw new Error("account_review_reducer_undo_missing_row");
    return revisedRow({
      ...before,
      assignment: {
        state: "suggested",
        accountId: null,
        groupId: group.groupId,
        groupRevision: group.revision,
        confirmation: group.status === "confirmed" ? "confirmed" : "pending",
      },
      revision: row.revision,
    });
  });
}

export function reduceUndoRemoval(
  current: AccountReviewSession,
  command: Extract<AccountReviewCommand, { kind: "undo_removal" }>,
  undo: ReviewUndoLease | null
): UndoTransitionResult {
  if (
    !undo ||
    undo.token !== command.undoToken ||
    !canonicalUuid.safeParse(undo.token).success ||
    undo.afterRemovalGeneration !== current.operationGeneration ||
    !accountReviewSessionSchema.safeParse(undo.previousState).success ||
    !hasMatchingScope(current, undo.previousState)
  )
    return invalidUndo();
  const previous = undo.previousState;
  // Filter navigation spends the review CAS revision but NOT the business
  // generation. Only the removal may have advanced the latter. Even after
  // All → Needs → All, a later business edit cannot forge this generation.
  const removalRevision = incrementReviewRevision(previous.revision);
  if (
    BigInt(current.revision) < BigInt(removalRevision) ||
    incrementReviewRevision(previous.operationGeneration) !==
      current.operationGeneration
  )
    return invalidUndo();
  const priorGroup = removedGroupForUndo(current, previous);
  if (!priorGroup || !unchangedOutsideRemoval(current, previous, priorGroup)) {
    return invalidUndo();
  }
  const now = current.groups.find((g) => g.groupId === priorGroup.groupId);
  if (!now) return invalidUndo();
  const restored = restoredGroup(priorGroup, now);
  const rows = restoredRows(current, previous, restored);
  return {
    reason: null,
    transition: {
      rows,
      groups: current.groups.map((group) =>
        group.groupId === restored.groupId ? restored : group
      ),
      removedEvidenceKeys: current.removedEvidenceKeys.filter(
        (key) => key !== restored.evidenceKey
      ),
      affectedRowIds: [...priorGroup.linkedRowIds],
      affectedGroupIds: [priorGroup.groupId],
    },
  };
}
