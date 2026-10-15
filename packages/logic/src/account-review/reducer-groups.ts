/** Pure T027 group transitions: preserve original evidenceKey/groupId on edit. */
import { canonicalUuid } from "./schema-primitives";
import { normalizeGroundedIdentity } from "./identity";
import { resolveAccountReviewSession } from "./resolution";
import type { AccountReviewOwnedContext } from "./normalization-types";
import type {
  AccountReviewCommand,
  AccountReviewGroup,
  AccountReviewReason,
  AccountReviewRow,
  AccountReviewSession,
} from "./review-schemas";
import {
  incrementReviewRevision,
  revisedRow,
  uniqueReasons,
  withoutAccountBlocker,
  type ReviewTransition,
} from "./reducer-primitives";

type GroupCommand = Extract<
  AccountReviewCommand,
  {
    kind: "confirm_group" | "edit_group" | "remove_group";
  }
>;

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
  state: AccountReviewSession,
  command: GroupCommand
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
  group: AccountReviewGroup,
  command: GroupCommand
): AccountReviewGroup {
  const revision = incrementReviewRevision(group.revision);
  if (command.kind !== "edit_group") {
    return {
      ...group,
      revision,
      status: "confirmed",
      confirmedIdentityRevision: revision,
    };
  }
  return {
    ...group,
    ...command.identity,
    revision,
    status: "confirmed",
    confirmedIdentityRevision: revision,
  };
}

/** Reconfirming a compatible nickname-only edit cannot uncheck an otherwise
 * valid previously selected row. A changed type/provider/card/sender identity
 * remains material and continues to clear every linked selection. */
function isNicknameOnlyReconfirmation(
  group: AccountReviewGroup,
  command: GroupCommand
): boolean {
  if (
    command.kind !== "edit_group" ||
    !command.reconfirm ||
    group.status !== "confirmed"
  )
    return false;
  const identity = command.identity;
  return (
    identity.type === group.type &&
    identity.institutionId === group.institutionId &&
    identity.providerDisplayName === group.providerDisplayName &&
    identity.cardLast4 === group.cardLast4 &&
    identity.senderNames.length === group.senderNames.length &&
    identity.senderNames.every(
      (name, index) => name === group.senderNames[index]
    )
  );
}

/** Resolve *current owned* account eligibility before retaining a checkbox.
 * A stale selected member must reject the entire edit, not silently preserve
 * its original invalid Cash/source assignment or rewrite unrelated rows.
 * The resolved session is proof only: no row or group is copied from it. */
function selectedMembersStillEligible(
  state: AccountReviewSession,
  group: AccountReviewGroup,
  context: AccountReviewOwnedContext | undefined
): boolean {
  const members = new Set(group.linkedRowIds);
  const checked = state.rows.filter(
    (row) => row.selected && members.has(row.rowId)
  );
  if (checked.length === 0) return true;
  if (context === undefined) return false;
  const refreshed = resolveAccountReviewSession({
    session: state,
    accountSnapshots: context,
  });
  const freshById = new Map(refreshed.rows.map((row) => [row.rowId, row]));
  return checked.every((row) => {
    const current = freshById.get(row.rowId);
    if (current === undefined || !current.selected) return false;
    return (
      JSON.stringify(current.assignment) === JSON.stringify(row.assignment) &&
      JSON.stringify(current.toAssignment) ===
        JSON.stringify(row.toAssignment) &&
      JSON.stringify(current.reviewReasons) ===
        JSON.stringify(row.reviewReasons) &&
      JSON.stringify(current.currency) === JSON.stringify(row.currency)
    );
  });
}

function confirmGroupRows(
  rows: readonly AccountReviewRow[],
  group: AccountReviewGroup,
  revision: string,
  retainValidSelections: boolean
): AccountReviewRow[] {
  const members = new Set(group.linkedRowIds);
  return rows.map((row): AccountReviewRow => {
    if (!members.has(row.rowId) || row.assignment.state !== "suggested")
      return row;
    const retainSelection =
      retainValidSelections &&
      row.selected &&
      row.assignment.groupId === group.groupId &&
      row.assignment.groupRevision === group.revision &&
      row.assignment.confirmation === "confirmed" &&
      row.currency.state === "known" &&
      row.currency.code === group.currency &&
      row.reviewReasons.length === 0 &&
      (row.source !== "SMS" ||
        row.transaction.isAtmWithdrawal !== true ||
        row.toAssignment?.state === "existing");
    return revisedRow({
      ...row,
      selected: retainSelection,
      assignment: {
        state: "suggested",
        accountId: null,
        groupId: group.groupId,
        groupRevision: revision,
        confirmation: "confirmed",
      },
      reviewReasons: withoutAccountBlocker(row.reviewReasons),
    });
  });
}

/** The current session fixes owner and group currency; institutionId, not
 * the provider display label or account type, scopes known-provider nicknames. */
function editedNameConflicts(
  state: AccountReviewSession,
  edited: AccountReviewGroup,
  command: Extract<GroupCommand, { kind: "edit_group" }>
): boolean {
  const wanted = normalizeGroundedIdentity(command.identity.name);
  return state.groups.some(
    (group) =>
      group.groupId !== edited.groupId &&
      group.status !== "removed" &&
      group.currency === edited.currency &&
      group.institutionId === command.identity.institutionId &&
      normalizeGroundedIdentity(group.name) === wanted
  );
}

function confirmOrEdit(
  state: AccountReviewSession,
  group: AccountReviewGroup,
  command: GroupCommand,
  context: AccountReviewOwnedContext | undefined
): GroupTransitionResult {
  // Active SMS groups always assign the source, never an ATM Cash destination.
  // A grounded Voice Cash group remains valid.
  const type =
    command.kind === "edit_group" ? command.identity.type : group.type;
  if (state.source === "SMS" && type === "CASH") {
    return blocked("account_group_snapshot_conflict");
  }
  if (
    command.kind === "edit_group" &&
    editedNameConflicts(state, group, command)
  ) {
    return blocked("account_group_snapshot_conflict");
  }
  if (command.kind === "confirm_group" && group.status === "confirmed") {
    return blocked("review_revision_stale");
  }
  const retainValidSelections = isNicknameOnlyReconfirmation(group, command);
  if (
    retainValidSelections &&
    !selectedMembersStillEligible(state, group, context)
  ) {
    return blocked("account_unavailable");
  }
  const updated = confirmedGroup(group, command);
  return accepted({
    groups: state.groups.map((item) =>
      item.groupId === group.groupId ? updated : item
    ),
    rows: confirmGroupRows(
      state.rows,
      group,
      updated.revision,
      retainValidSelections
    ),
    affectedGroupIds: [group.groupId],
    affectedRowIds: [...group.linkedRowIds],
  });
}

function removedRows(
  rows: readonly AccountReviewRow[],
  group: AccountReviewGroup
): AccountReviewRow[] {
  const members = new Set(group.linkedRowIds);
  return rows.map((row): AccountReviewRow => {
    if (!members.has(row.rowId)) return row;
    return revisedRow({
      ...row,
      selected: false,
      assignment: {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_group_removed",
        candidateAccountIds: [],
      },
      reviewReasons: uniqueReasons(
        row.reviewReasons,
        "account_group_removed"
      ).filter((reason) => reason !== "account_group_unconfirmed"),
    });
  });
}

function removeGroup(
  state: AccountReviewSession,
  group: AccountReviewGroup,
  nextUndoToken: string | null
): GroupTransitionResult {
  // Every removal must be reversible with a valid transient, caller-issued lease.
  if (
    nextUndoToken === null ||
    !canonicalUuid.safeParse(nextUndoToken).success
  ) {
    return blocked("review_undo_invalid");
  }
  const updated: AccountReviewGroup = {
    ...group,
    status: "removed",
    revision: incrementReviewRevision(group.revision),
  };
  return accepted({
    groups: state.groups.map((item) =>
      item.groupId === group.groupId ? updated : item
    ),
    rows: removedRows(state.rows, group),
    removedEvidenceKeys: [
      ...new Set([...state.removedEvidenceKeys, group.evidenceKey]),
    ],
    affectedRowIds: [...group.linkedRowIds],
    affectedGroupIds: [group.groupId],
    undoToken: nextUndoToken,
  });
}

export function reduceGroupCommand(
  state: AccountReviewSession,
  command: GroupCommand,
  nextUndoToken: string | null,
  context?: AccountReviewOwnedContext
): GroupTransitionResult {
  const found = findCurrentGroup(state, command);
  if (isBlockedResult(found)) return found;
  return command.kind === "remove_group"
    ? removeGroup(state, found, nextUndoToken)
    : confirmOrEdit(state, found, command, context);
}
