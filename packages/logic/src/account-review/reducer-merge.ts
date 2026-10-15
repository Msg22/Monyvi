/**
 * T027 pure late arrivals. Current user decisions and original group evidence
 * keys are authoritative over repeated parser snapshots of the same session.
 */
import { normalizeGroundedIdentity } from "./identity";
import {
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewSession,
} from "./review-schemas";
import {
  incrementReviewRevision, revisedRow, uniqueReasons,
} from "./reducer-primitives";

export interface MergeAccountReviewLateRowsInput {
  readonly current: AccountReviewSession;
  readonly incoming: AccountReviewSession;
}

function sameGroupIdentity(
  current: AccountReviewGroup, incoming: AccountReviewGroup
): boolean {
  return current.evidenceKey === incoming.evidenceKey &&
    current.groupId === incoming.groupId &&
    current.currency === incoming.currency && current.type === incoming.type &&
    current.institutionId === incoming.institutionId &&
    current.cardLast4 === incoming.cardLast4 &&
    normalizeGroundedIdentity(current.name) === normalizeGroundedIdentity(incoming.name) &&
    (current.providerDisplayName === null
      ? incoming.providerDisplayName === null
      : incoming.providerDisplayName !== null &&
        normalizeGroundedIdentity(current.providerDisplayName) ===
          normalizeGroundedIdentity(incoming.providerDisplayName)) &&
    JSON.stringify(current.senderNames.map(normalizeGroundedIdentity).sort()) ===
      JSON.stringify(incoming.senderNames.map(normalizeGroundedIdentity).sort());
}

function detachNewEvidence(
  row: AccountReviewRow, reason: AccountReviewReason
): AccountReviewRow {
  return {
    ...row, selected: false, hasUserAccountOverride: false,
    assignment: {
      state: "unresolved", accountId: null,
      reasonCode: reason, candidateAccountIds: [],
    },
    reviewReasons: uniqueReasons(row.reviewReasons, reason)
      .filter((code) => code !== "account_group_unconfirmed"),
  };
}

function importNewSourceRow(row: AccountReviewRow): AccountReviewRow {
  if (row.assignment.state === "existing") {
    return detachNewEvidence(row, "account_needed");
  }
  return {
    ...row, selected: false, hasUserAccountOverride: false,
    hasUserCurrencyOverride: false,
  };
}

function withLiveAssignment(
  row: AccountReviewRow, group: AccountReviewGroup,
  fromCurrent: boolean
): AccountReviewRow {
  const patched: AccountReviewRow = {
    ...row, selected: fromCurrent ? row.selected : false,
    assignment: {
      state: "suggested", accountId: null, groupId: group.groupId,
      groupRevision: group.revision, confirmation:
        group.status === "confirmed" ? "confirmed" : "pending",
    },
    reviewReasons: group.status === "confirmed"
      ? row.reviewReasons.filter((reason) => reason !== "account_group_unconfirmed")
      : uniqueReasons(row.reviewReasons, "account_group_unconfirmed"),
  };
  return fromCurrent ? revisedRow(patched) : patched;
}

function extendLiveGroup(
  current: AccountReviewGroup,
  incoming: AccountReviewGroup,
  newIds: readonly string[]
): AccountReviewGroup {
  const revision = incrementReviewRevision(current.revision);
  return {
    ...current, revision,
    confirmedIdentityRevision: current.status === "confirmed" ? revision : null,
    linkedRowIds: [...new Set([...current.linkedRowIds, ...newIds])].sort(),
    suggestionRefs: [...new Set([...current.suggestionRefs, ...incoming.suggestionRefs])]
      .sort(),
  };
}

interface MergeAccumulator {
  readonly rows: readonly AccountReviewRow[];
  readonly groups: readonly AccountReviewGroup[];
}

function mergeExistingGroup(
  state: MergeAccumulator,
  prior: AccountReviewGroup, incoming: AccountReviewGroup,
  newIds: readonly string[], removed: boolean
): MergeAccumulator {
  if (newIds.length === 0) return state;
  if (removed || prior.status === "removed" ||
      !sameGroupIdentity(prior, incoming)) {
    const reason = removed || prior.status === "removed"
      ? "account_group_removed" : "account_group_snapshot_conflict";
    return {
      ...state,
      rows: state.rows.map((row) => newIds.includes(row.rowId)
        ? detachNewEvidence(row, reason) : row),
    };
  }
  const extended = extendLiveGroup(prior, incoming, newIds);
  const affected = new Set([...prior.linkedRowIds, ...newIds]);
  return {
    groups: state.groups.map((group) =>
      group.groupId === prior.groupId ? extended : group
    ),
    rows: state.rows.map((row) => {
      if (!affected.has(row.rowId) || row.assignment.state !== "suggested") return row;
      return withLiveAssignment(row, extended, !newIds.includes(row.rowId));
    }),
  };
}

function importGroup(
  state: MergeAccumulator,
  incoming: AccountReviewGroup, newIds: readonly string[]
): MergeAccumulator {
  if (newIds.length === 0) return state;
  const fresh: AccountReviewGroup = {
    ...incoming, linkedRowIds: [...newIds].sort(),
    status: "pending", confirmedIdentityRevision: null,
  };
  return {
    groups: [...state.groups, fresh],
    rows: state.rows.map((row) => newIds.includes(row.rowId) &&
      row.assignment.state === "suggested"
      ? withLiveAssignment(row, fresh, false) : row),
  };
}

function reconcileGroups(
  current: AccountReviewSession, incoming: AccountReviewSession,
  newRows: readonly AccountReviewRow[]
): MergeAccumulator {
  let state: MergeAccumulator = {
    rows: [...current.rows, ...newRows], groups: [...current.groups],
  };
  const newIds = new Set(newRows.map((row) => row.rowId));
  for (const group of incoming.groups) {
    const linkedNew = group.linkedRowIds.filter((id) => newIds.has(id));
    if (linkedNew.length === 0) continue;
    const prior = current.groups.find((item) => item.groupId === group.groupId);
    const removed = current.removedEvidenceKeys.includes(group.evidenceKey);
    state = prior
      ? mergeExistingGroup(state, prior, group, linkedNew, removed)
      : removed
        ? {
          ...state, rows: state.rows.map((row) => linkedNew.includes(row.rowId)
            ? detachNewEvidence(row, "account_group_removed") : row),
        }
        : importGroup(state, group, linkedNew);
  }
  return state;
}

function orphanSafe(
  state: MergeAccumulator, newIds: ReadonlySet<string>
): AccountReviewRow[] {
  return state.rows.map((row) => {
    if (!newIds.has(row.rowId) || row.assignment.state !== "suggested") return row;
    const assignment = row.assignment;
    const group = state.groups.find((item) =>
      item.groupId === assignment.groupId && item.status !== "removed"
    );
    return group?.linkedRowIds.includes(row.rowId)
      ? row : detachNewEvidence(row, "account_group_snapshot_conflict");
  });
}

/** A distinct owner, source, or logical session is never merged. */
export function mergeAccountReviewLateRows(
  input: MergeAccountReviewLateRowsInput
): AccountReviewSession {
  const current = accountReviewSessionSchema.parse(input.current);
  const incoming = accountReviewSessionSchema.parse(input.incoming);
  if (current.ownerId !== incoming.ownerId ||
      current.source !== incoming.source ||
      current.sessionId !== incoming.sessionId) {
    throw new Error("account_review_late_merge_scope_mismatch");
  }
  // A frozen selected-save intent must never be rebased on late provider data.
  if (current.saveIntent !== null) return current;
  const known = new Set(current.rows.map((row) => row.rowId));
  const newRows = incoming.rows.filter((row) => !known.has(row.rowId))
    .map(importNewSourceRow);
  if (newRows.length === 0) return current;
  const changed = reconcileGroups(current, incoming, newRows);
  const newIds = new Set(newRows.map((row) => row.rowId));
  return accountReviewSessionSchema.parse({
    ...current, rows: orphanSafe(changed, newIds), groups: changed.groups,
    revision: incrementReviewRevision(current.revision),
    operationGeneration: incrementReviewRevision(current.operationGeneration),
  });
}
