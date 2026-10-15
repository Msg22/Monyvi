/** Pure T027 group transitions: preserve original evidenceKey/groupId on edit. */
import { canonicalUuid } from "./schema-primitives";
import { normalizeGroundedIdentity } from "./identity";
import type {
  AccountReviewCommand, AccountReviewGroup, AccountReviewReason,
  AccountReviewRow, AccountReviewSession,
} from "./review-schemas";
import {
  incrementReviewRevision, revisedRow, uniqueReasons,
  withoutAccountBlocker, type ReviewTransition,
} from "./reducer-primitives";

type GroupCommand = Extract<AccountReviewCommand, {
  kind: "confirm_group" | "edit_group" | "remove_group"
}>;

export interface GroupTransitionResult {
  readonly transition: ReviewTransition | null;
  readonly reason: AccountReviewReason | null;
}

function blocked(reason: AccountReviewReason): GroupTransitionResult {
  return { transition: null, reason };
}

function accepted(transition: ReviewTransition): GroupTransitionResult {
  return { transition, reason: null };
}

function findCurrentGroup(
  state: AccountReviewSession, command: GroupCommand
): GroupTransitionResult | AccountReviewGroup {
  const group = state.groups.find((item) => item.groupId === command.groupId);
  if (!group) return blocked("account_group_snapshot_conflict");
  if (group.revision !== command.expectedGroupRevision) {
    return blocked("review_revision_stale");
  }
  return group.status === "removed" ? blocked("account_group_removed") : group;
}

function isBlockedResult(
  value: GroupTransitionResult | AccountReviewGroup
): value is GroupTransitionResult {
  return "transition" in value;
}

/** Never regenerate identity hashes on edits to a persisted temporary group. */
function confirmedGroup(
  group: AccountReviewGroup, command: GroupCommand
): AccountReviewGroup {
  const revision = incrementReviewRevision(group.revision);
  if (command.kind !== "edit_group") {
    return {
      ...group, revision, status: "confirmed",
      confirmedIdentityRevision: revision,
    };
  }
  return {
    ...group, ...command.identity,
    revision, status: "confirmed", confirmedIdentityRevision: revision,
  };
}

function confirmGroupRows(
  rows: readonly AccountReviewRow[], group: AccountReviewGroup,
  revision: string
): AccountReviewRow[] {
  const members = new Set(group.linkedRowIds);
  return rows.map((row): AccountReviewRow => {
    if (!members.has(row.rowId) || row.assignment.state !== "suggested") return row;
    return revisedRow({
      ...row, selected: false,
      assignment: {
        state: "suggested", accountId: null, groupId: group.groupId,
        groupRevision: revision, confirmation: "confirmed",
      },
      reviewReasons: withoutAccountBlocker(row.reviewReasons),
    });
  });
}

function editedNameConflicts(
  state: AccountReviewSession, command: Extract<GroupCommand, { kind: "edit_group" }>
): boolean {
  const wanted = normalizeGroundedIdentity(command.identity.name);
  return state.groups.some((group) =>
    group.groupId !== command.groupId && group.status !== "removed" &&
    normalizeGroundedIdentity(group.name) === wanted
  );
}

function confirmOrEdit(
  state: AccountReviewSession, group: AccountReviewGroup, command: GroupCommand
): GroupTransitionResult {
  if (command.kind === "edit_group" && editedNameConflicts(state, command)) {
    return blocked("account_group_snapshot_conflict");
  }
  if (command.kind === "confirm_group" && group.status === "confirmed") {
    return blocked("review_revision_stale");
  }
  const updated = confirmedGroup(group, command);
  return accepted({
    groups: state.groups.map((item) => item.groupId === group.groupId ? updated : item),
    rows: confirmGroupRows(state.rows, group, updated.revision),
    affectedGroupIds: [group.groupId],
    affectedRowIds: [...group.linkedRowIds],
  });
}

function removedRows(
  rows: readonly AccountReviewRow[], group: AccountReviewGroup
): AccountReviewRow[] {
  const members = new Set(group.linkedRowIds);
  return rows.map((row): AccountReviewRow => {
    if (!members.has(row.rowId)) return row;
    return revisedRow({
      ...row, selected: false,
      assignment: {
        state: "unresolved", accountId: null,
        reasonCode: "account_group_removed", candidateAccountIds: [],
      },
      reviewReasons: uniqueReasons(row.reviewReasons, "account_group_removed")
        .filter((reason) => reason !== "account_group_unconfirmed"),
    });
  });
}

function removeGroup(
  state: AccountReviewSession, group: AccountReviewGroup,
  nextUndoToken: string | null
): GroupTransitionResult {
  if (nextUndoToken !== null && !canonicalUuid.safeParse(nextUndoToken).success) {
    return blocked("review_undo_invalid");
  }
  const updated: AccountReviewGroup = {
    ...group, status: "removed", revision: incrementReviewRevision(group.revision),
  };
  return accepted({
    groups: state.groups.map((item) => item.groupId === group.groupId ? updated : item),
    rows: removedRows(state.rows, group),
    removedEvidenceKeys: [...new Set([...state.removedEvidenceKeys, group.evidenceKey])],
    affectedRowIds: [...group.linkedRowIds],
    affectedGroupIds: [group.groupId],
    undoToken: nextUndoToken,
  });
}

export function reduceGroupCommand(
  state: AccountReviewSession, command: GroupCommand, nextUndoToken: string | null
): GroupTransitionResult {
  const found = findCurrentGroup(state, command);
  if (isBlockedResult(found)) return found;
  return command.kind === "remove_group"
    ? removeGroup(state, found, nextUndoToken)
    : confirmOrEdit(state, found, command);
}
