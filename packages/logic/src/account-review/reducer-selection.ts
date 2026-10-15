/** T027 minimal row/group selection; UI filters and DB writes are not here. */
import type {
  AccountReviewCommand, AccountReviewGroup, AccountReviewReason,
  AccountReviewRow, AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import { eligibleSourceAccounts } from "./resolution-candidates";
import { reduceGroupCommand } from "./reducer-groups";
import {
  revisedRow, type ReviewTransition,
} from "./reducer-primitives";

type SelectRow = Extract<AccountReviewCommand, { kind: "select_row" }>;
type SelectBatch = Extract<AccountReviewCommand, {
  kind: "select_ready" | "clear_selection"
}>;
type Deselect = Extract<AccountReviewCommand, { kind: "set_row_selected" }>;

export interface SelectionTransitionResult {
  readonly transition: ReviewTransition | null;
  readonly reason: AccountReviewReason | null;
}

function blocked(reason: AccountReviewReason): SelectionTransitionResult {
  return { transition: null, reason };
}

function accepted(transition: ReviewTransition): SelectionTransitionResult {
  return { transition, reason: null };
}

function hardReasonsRemain(row: AccountReviewRow): boolean {
  return row.reviewReasons.some((reason) =>
    reason !== "account_needed" && reason !== "account_group_unconfirmed"
  );
}

function hasAccountChoice(
  row: AccountReviewRow, accounts: AccountReviewOwnedContext
): boolean {
  if (row.currency.state !== "known") return false;
  if (row.assignment.state === "suggested") return false;
  const assignment = row.assignment;
  if (assignment.state !== "existing") return false;
  return eligibleSourceAccounts(accounts.accounts, row.source, row.currency.code)
    .some((account) => account.id === assignment.accountId);
}

function isReady(
  row: AccountReviewRow,
  groups: readonly AccountReviewGroup[],
  accounts: AccountReviewOwnedContext
): boolean {
  if (row.currency.state !== "known" || hardReasonsRemain(row)) return false;
  if (row.source === "SMS" && row.transaction.isAtmWithdrawal &&
      (row.toAssignment === null || row.toAssignment.state === "unresolved")) {
    return false;
  }
  const assignment = row.assignment;
  if (assignment.state === "suggested") {
    return groups.some((group) => group.groupId === assignment.groupId &&
      group.status === "confirmed" && group.revision === assignment.groupRevision);
  }
  return hasAccountChoice(row, accounts);
}

function linkedGroupForSelection(
  session: AccountReviewSession, row: AccountReviewRow,
  command: SelectRow
): AccountReviewGroup | null {
  const assignment = row.assignment;
  if (assignment.state !== "suggested") return null;
  const linked = session.groups.find((group) =>
    group.groupId === assignment.groupId &&
    group.linkedRowIds.includes(row.rowId)
  );
  if (!linked) return null;
  if (command.groupId !== null && command.groupId !== linked.groupId) return null;
  return linked;
}

function confirmForClick(
  session: AccountReviewSession, row: AccountReviewRow,
  command: SelectRow
): SelectionTransitionResult {
  const group = linkedGroupForSelection(session, row, command);
  if (!group) return blocked("account_group_snapshot_conflict");
  if (group.status !== "pending") return blocked("account_group_snapshot_conflict");
  if (command.groupId !== group.groupId ||
      command.expectedGroupRevision !== group.revision ||
      !command.hasSharedConfirmationDisclosure) {
    return blocked("review_shared_disclosure_required");
  }
  const confirm: Extract<AccountReviewCommand, { kind: "confirm_group" }> = {
    ownerId: command.ownerId, sessionId: command.sessionId,
    expectedReviewRevision: command.expectedReviewRevision,
    expectedOperationGeneration: command.expectedOperationGeneration,
    kind: "confirm_group", groupId: group.groupId,
    expectedGroupRevision: group.revision,
  };
  const confirmed = reduceGroupCommand(session, confirm, null);
  return confirmed.transition
    ? accepted(confirmed.transition)
    : blocked(confirmed.reason ?? "account_group_snapshot_conflict");
}

function selectExistingOrConfirmed(
  session: AccountReviewSession, row: AccountReviewRow,
  command: SelectRow, context: AccountReviewOwnedContext
): SelectionTransitionResult {
  if (row.assignment.state === "suggested" && command.groupId !== null &&
      (command.groupId !== row.assignment.groupId ||
        command.expectedGroupRevision !== row.assignment.groupRevision)) {
    return blocked("review_revision_stale");
  }
  if (!isReady(row, session.groups, context)) return blocked("account_needed");
  const rows = session.rows.map((item): AccountReviewRow =>
    item.rowId === row.rowId ? revisedRow({ ...item, selected: true }) : item
  );
  return accepted({
    rows, groups: session.groups, affectedRowIds: [row.rowId],
    affectedGroupIds: [],
  });
}

export function reduceSelectRow(
  session: AccountReviewSession, command: SelectRow,
  context: AccountReviewOwnedContext
): SelectionTransitionResult {
  const row = session.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision) {
    return blocked("review_revision_stale");
  }
  if (row.selected) return blocked("review_revision_stale");
  if (row.assignment.state !== "suggested" ||
      row.assignment.confirmation === "confirmed") {
    return selectExistingOrConfirmed(session, row, command, context);
  }
  if (row.currency.state !== "known" || hardReasonsRemain(row)) {
    return blocked("account_needed");
  }
  const prepared = confirmForClick(session, row, command);
  if (!prepared.transition) return prepared;
  const rows = prepared.transition.rows.map((item): AccountReviewRow =>
    item.rowId === row.rowId ? revisedRow({ ...item, selected: true }) : item
  );
  return accepted({
    ...prepared.transition, rows,
    affectedRowIds: [...new Set([...prepared.transition.affectedRowIds, row.rowId])],
  });
}

export function reduceDeselectRow(
  session: AccountReviewSession, command: Deselect
): SelectionTransitionResult {
  const row = session.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision) {
    return blocked("review_revision_stale");
  }
  if (!row.selected) return blocked("review_revision_stale");
  return accepted({
    rows: session.rows.map((item) =>
      item.rowId === row.rowId ? revisedRow({ ...item, selected: false }) : item
    ),
    groups: session.groups, affectedRowIds: [row.rowId], affectedGroupIds: [],
  });
}

function visibleByFilter(
  row: AccountReviewRow, filter: AccountReviewSession["filter"]
): boolean {
  if (filter === "all") return true;
  if (filter === "selected") return row.selected;
  return row.reviewReasons.length > 0;
}

export function reduceSelectBatch(
  session: AccountReviewSession, command: SelectBatch,
  context: AccountReviewOwnedContext
): SelectionTransitionResult {
  if (command.filter !== session.filter) return blocked("review_revision_stale");
  const chosen = session.rows.filter((row) =>
    visibleByFilter(row, command.filter) &&
    (command.kind === "clear_selection" ? row.selected :
      !row.selected && isReady(row, session.groups, context))
  );
  if (chosen.length === 0) return blocked("review_revision_stale");
  const ids = new Set(chosen.map((row) => row.rowId));
  return accepted({
    rows: session.rows.map((row) => ids.has(row.rowId)
      ? revisedRow({ ...row, selected: command.kind === "select_ready" }) : row),
    groups: session.groups, affectedRowIds: chosen.map((row) => row.rowId),
    affectedGroupIds: [],
  });
}
