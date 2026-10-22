/** T027 minimal row/group selection; UI filters and DB writes are not here. */
import type {
  AccountReviewCommand,
  AccountReviewGroup,
  AccountReviewReason,
  AccountReviewRow,
  AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import { resolveAccountReviewSession } from "./resolution";
import { reduceGroupCommand } from "./reducer-groups";
import { revisedRow, type ReviewTransition } from "./reducer-primitives";

type SelectRow = Extract<AccountReviewCommand, { kind: "select_row" }>;
type SelectBatch = Extract<
  AccountReviewCommand,
  {
    kind: "select_ready" | "clear_selection";
  }
>;
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
  return row.reviewReasons.some(
    (reason) =>
      reason !== "account_needed" && reason !== "account_group_unconfirmed"
  );
}

/** The shared resolver validates Cash ownership, currency, distinct endpoints,
 * default origin and evidence. The ORIGINAL row must also retain that proof;
 * a valid transient resolution cannot authorize selection of stale input. */
function hasSatisfiedAtmDestination(
  row: AccountReviewRow,
  groups: readonly AccountReviewGroup[]
): boolean {
  if (row.source !== "SMS" || row.transaction.isAtmWithdrawal !== true)
    return true;
  const destination = row.toAssignment;
  if (destination?.state === "existing") return true;
  if (
    destination?.state !== "suggested" ||
    destination.confirmation !== "confirmed" ||
    row.currency.state !== "known"
  )
    return false;
  const confirmedCurrency = row.currency.code;
  return groups.some(
    (group) =>
      group.groupId === destination.groupId &&
      group.status === "confirmed" &&
      group.type === "CASH" &&
      group.currency === confirmedCurrency &&
      group.revision === destination.groupRevision &&
      group.linkedRowIds.includes(row.rowId)
  );
}

function isReady(
  row: AccountReviewRow,
  groups: readonly AccountReviewGroup[]
): boolean {
  // Existing/confirmed account choices cannot retain an account-only blocker.
  // Pending group clicks use a separate disclosed confirmation path below.
  if (
    row.currency.state !== "known" ||
    row.reviewReasons.length > 0 ||
    !hasSatisfiedAtmDestination(row, groups)
  )
    return false;
  const assignment = row.assignment;
  if (assignment.state === "suggested") {
    return groups.some(
      (group) =>
        group.groupId === assignment.groupId &&
        group.status === "confirmed" &&
        group.revision === assignment.groupRevision &&
        // SMS groups always supply the source; Cash is destination-only for ATM.
        (row.source !== "SMS" || group.type !== "CASH")
    );
  }
  // A pure fresh resolution has already invalidated stale default/account IDs.
  return assignment.state === "existing";
}

/** A resolver refresh is eligibility evidence, NOT the state that the
 * reducer commits. Reject if it would repair source, destination or blockers
 * that would otherwise be left stale in the selected original row. */
function selectionEvidenceUnchanged(
  original: AccountReviewRow,
  refreshed: AccountReviewRow
): boolean {
  return (
    JSON.stringify(original.assignment) ===
      JSON.stringify(refreshed.assignment) &&
    JSON.stringify(original.toAssignment) ===
      JSON.stringify(refreshed.toAssignment) &&
    JSON.stringify(original.reviewReasons) ===
      JSON.stringify(refreshed.reviewReasons)
  );
}

function linkedGroupForSelection(
  session: AccountReviewSession,
  row: AccountReviewRow,
  command: SelectRow
): AccountReviewGroup | null {
  const assignment = row.assignment;
  if (assignment.state !== "suggested") return null;
  const linked = session.groups.find(
    (group) =>
      group.groupId === assignment.groupId &&
      group.linkedRowIds.includes(row.rowId)
  );
  if (!linked) return null;
  if (command.groupId !== null && command.groupId !== linked.groupId)
    return null;
  return linked;
}

function confirmForClick(
  session: AccountReviewSession,
  row: AccountReviewRow,
  command: SelectRow
): SelectionTransitionResult {
  const group = linkedGroupForSelection(session, row, command);
  if (!group) return blocked("account_group_snapshot_conflict");
  if (group.status !== "pending")
    return blocked("account_group_snapshot_conflict");
  if (
    command.groupId !== group.groupId ||
    command.expectedGroupRevision !== group.revision ||
    !command.hasSharedConfirmationDisclosure
  ) {
    return blocked("review_shared_disclosure_required");
  }
  const confirm: Extract<AccountReviewCommand, { kind: "confirm_group" }> = {
    ownerId: command.ownerId,
    sessionId: command.sessionId,
    expectedReviewRevision: command.expectedReviewRevision,
    expectedOperationGeneration: command.expectedOperationGeneration,
    kind: "confirm_group",
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
  };
  const confirmed = reduceGroupCommand(session, confirm, null);
  return confirmed.transition
    ? accepted(confirmed.transition)
    : blocked(confirmed.reason ?? "account_group_snapshot_conflict");
}

function selectExistingOrConfirmed(
  session: AccountReviewSession,
  row: AccountReviewRow,
  command: SelectRow,
  context: AccountReviewOwnedContext
): SelectionTransitionResult {
  if (
    row.assignment.state === "suggested" &&
    command.groupId !== null &&
    (command.groupId !== row.assignment.groupId ||
      command.expectedGroupRevision !== row.assignment.groupRevision)
  ) {
    return blocked("review_revision_stale");
  }
  const refreshed = resolveAccountReviewSession({
    session,
    accountSnapshots: context,
  });
  const current = refreshed.rows.find((item) => item.rowId === row.rowId);
  if (
    !current ||
    !selectionEvidenceUnchanged(row, current) ||
    !isReady(row, session.groups) ||
    !isReady(current, refreshed.groups)
  ) {
    return blocked("account_needed");
  }
  const rows = session.rows.map(
    (item): AccountReviewRow =>
      item.rowId === row.rowId ? revisedRow({ ...item, selected: true }) : item
  );
  return accepted({
    rows,
    groups: session.groups,
    affectedRowIds: [row.rowId],
    affectedGroupIds: [],
  });
}

export function reduceSelectRow(
  session: AccountReviewSession,
  command: SelectRow,
  context: AccountReviewOwnedContext
): SelectionTransitionResult {
  const row = session.rows.find((item) => item.rowId === command.rowId);
  if (!row) return blocked("account_unavailable");
  if (row.revision !== command.expectedRowRevision) {
    return blocked("review_revision_stale");
  }
  if (row.selected) return blocked("review_revision_stale");
  if (
    row.assignment.state !== "suggested" ||
    row.assignment.confirmation === "confirmed"
  ) {
    return selectExistingOrConfirmed(session, row, command, context);
  }
  // Inspect fresh ownership/default/destination eligibility *before* a
  // disclosed click confirms a pending shared source group.
  const refreshed = resolveAccountReviewSession({
    session,
    accountSnapshots: context,
  });
  const current = refreshed.rows.find((item) => item.rowId === row.rowId);
  if (
    !current ||
    !selectionEvidenceUnchanged(row, current) ||
    row.currency.state !== "known" ||
    current.currency.state !== "known" ||
    hardReasonsRemain(row) ||
    hardReasonsRemain(current) ||
    !hasSatisfiedAtmDestination(row, session.groups) ||
    !hasSatisfiedAtmDestination(current, refreshed.groups)
  ) {
    return blocked("account_needed");
  }
  const prepared = confirmForClick(session, row, command);
  if (!prepared.transition) return prepared;
  const rows = prepared.transition.rows.map(
    (item): AccountReviewRow =>
      item.rowId === row.rowId ? revisedRow({ ...item, selected: true }) : item
  );
  return accepted({
    ...prepared.transition,
    rows,
    affectedRowIds: [
      ...new Set([...prepared.transition.affectedRowIds, row.rowId]),
    ],
  });
}

export function reduceDeselectRow(
  session: AccountReviewSession,
  command: Deselect
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
    groups: session.groups,
    affectedRowIds: [row.rowId],
    affectedGroupIds: [],
  });
}

/** Shared exact filter membership for canonical bulk commands and pure views. */
export function isAccountReviewRowVisible(
  row: AccountReviewRow,
  filter: AccountReviewSession["filter"]
): boolean {
  if (filter === "all") return true;
  if (filter === "selected") return row.selected;
  return row.reviewReasons.length > 0;
}

/** Reuse exactly the guarded bulk eligibility for automatic readiness. */
export function readyAccountReviewRowIds(
  session: AccountReviewSession,
  context: AccountReviewOwnedContext
): ReadonlyArray<AccountReviewRow["rowId"]> {
  const refreshed = resolveAccountReviewSession({
    session,
    accountSnapshots: context,
  });
  const refreshedById = new Map(refreshed.rows.map((row) => [row.rowId, row]));
  return session.rows.flatMap((original) => {
    const current = refreshedById.get(original.rowId);
    return current &&
      selectionEvidenceUnchanged(original, current) &&
      isReady(original, session.groups) &&
      isReady(current, refreshed.groups)
      ? [original.rowId]
      : [];
  });
}

/** Automatic selection NEVER confirms groups and honors explicit opt-outs. */
export function autoSelectReadyTransition(
  session: AccountReviewSession,
  context: AccountReviewOwnedContext,
  manuallyDeselected: ReadonlySet<AccountReviewRow["rowId"]>
): ReviewTransition | null {
  const eligible = new Set(readyAccountReviewRowIds(session, context));
  const newlyReady = session.rows.filter(
    (row) =>
      !row.selected &&
      eligible.has(row.rowId) &&
      !manuallyDeselected.has(row.rowId)
  );
  if (newlyReady.length === 0) return null;
  const ids = new Set(newlyReady.map((row) => row.rowId));
  return {
    rows: session.rows.map((row) =>
      ids.has(row.rowId) ? revisedRow({ ...row, selected: true }) : row
    ),
    groups: session.groups,
    affectedRowIds: newlyReady.map((row) => row.rowId),
    affectedGroupIds: [],
  };
}

export function reduceSelectBatch(
  session: AccountReviewSession,
  command: SelectBatch,
  context: AccountReviewOwnedContext
): SelectionTransitionResult {
  if (command.filter !== session.filter)
    return blocked("review_revision_stale");
  // Recheck the whole owned snapshot once, then select only ready visible IDs.
  // Ineligible rows are skipped; a wholly ineligible batch remains a no-op.
  const readyIds = new Set(
    command.kind === "select_ready"
      ? readyAccountReviewRowIds(session, context)
      : []
  );
  const chosen = session.rows.filter(
    (row) =>
      isAccountReviewRowVisible(row, command.filter) &&
      (command.kind === "clear_selection"
        ? row.selected
        : !row.selected && readyIds.has(row.rowId))
  );
  if (chosen.length === 0) return blocked("review_revision_stale");
  const ids = new Set(chosen.map((row) => row.rowId));
  return accepted({
    rows: session.rows.map((row) =>
      ids.has(row.rowId)
        ? revisedRow({ ...row, selected: command.kind === "select_ready" })
        : row
    ),
    groups: session.groups,
    affectedRowIds: chosen.map((row) => row.rowId),
    affectedGroupIds: [],
  });
}
