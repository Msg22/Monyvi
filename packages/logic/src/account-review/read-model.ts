/**
 * #395 T059 — pure, current-owner account review projection.
 * Session rows are display truth; bulk readiness is previewed exclusively
 * through the existing guarded command reducer, never reimplemented here.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";
import { assertOwnedResolutionContext } from "./resolution-candidates";
import { isAccountReviewRowVisible } from "./reducer-selection";
import { reduceAccountReviewCommand } from "./reducer";

export interface ProjectAccountReviewSessionInput {
  readonly session: AccountReviewSession;
  readonly accountSnapshots: AccountReviewOwnedContext;
}

export interface AccountReviewProjectionSummary {
  readonly totalCount: number;
  readonly distinctNeedsReviewCount: number;
  readonly selectedCount: number;
  readonly pendingGroupCount: number;
  readonly confirmedGroupCount: number;
  readonly defaultAssignmentCount: number;
}

export interface AccountReviewLiveGroupSummary {
  readonly groupId: AccountReviewGroup["groupId"];
  readonly status: AccountReviewGroup["status"];
  readonly liveLinkedRowIds: ReadonlyArray<AccountReviewRow["rowId"]>;
}

export interface AccountReviewReadModel {
  readonly summary: AccountReviewProjectionSummary;
  readonly groupSummaries: readonly AccountReviewLiveGroupSummary[];
  readonly visibleRowIds: ReadonlyArray<AccountReviewRow["rowId"]>;
  readonly readyVisibleRowIds: ReadonlyArray<AccountReviewRow["rowId"]>;
}

interface RowCounts {
  readonly totalCount: number;
  readonly distinctNeedsReviewCount: number;
  readonly selectedCount: number;
  readonly defaultAssignmentCount: number;
}

function countRows(rows: readonly AccountReviewRow[]): RowCounts {
  let distinctNeedsReviewCount = 0;
  let selectedCount = 0;
  let defaultAssignmentCount = 0;
  for (const row of rows) {
    if (row.reviewReasons.length > 0) distinctNeedsReviewCount += 1;
    if (row.selected) selectedCount += 1;
    if (
      row.assignment.state === "existing" &&
      row.assignment.origin === "default"
    ) {
      defaultAssignmentCount += 1;
    }
  }
  return {
    totalCount: rows.length,
    distinctNeedsReviewCount,
    selectedCount,
    defaultAssignmentCount,
  };
}

function isLiveMember(
  row: AccountReviewRow | undefined,
  group: AccountReviewGroup
): boolean {
  return (
    row?.assignment.state === "suggested" &&
    row.assignment.groupId === group.groupId &&
    row.assignment.groupRevision === group.revision &&
    row.assignment.confirmation === group.status
  );
}

function projectGroups(
  session: AccountReviewSession
): readonly AccountReviewLiveGroupSummary[] {
  const byId = new Map(session.rows.map((row) => [row.rowId, row]));
  return session.groups.map((group) => ({
    groupId: group.groupId,
    status: group.status,
    liveLinkedRowIds:
      group.status === "removed"
        ? []
        : group.linkedRowIds.filter((id) => isLiveMember(byId.get(id), group)),
  }));
}

function countGroups(
  groups: readonly AccountReviewLiveGroupSummary[]
): Pick<
  AccountReviewProjectionSummary,
  "pendingGroupCount" | "confirmedGroupCount"
> {
  return {
    pendingGroupCount: groups.filter(
      (group) => group.status === "pending" && group.liveLinkedRowIds.length > 0
    ).length,
    confirmedGroupCount: groups.filter(
      (group) => group.status === "confirmed" && group.liveLinkedRowIds.length > 0
    ).length,
  };
}

/** Invoke the actual selection command without committing its proposed state. */
function previewReadyRowIds(
  session: AccountReviewSession,
  accountSnapshots: AccountReviewOwnedContext
): ReadonlyArray<AccountReviewRow["rowId"]> {
  if (session.saveIntent !== null) return [];
  const command: AccountReviewCommand = {
    kind: "select_ready",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    filter: session.filter,
  };
  const preview = reduceAccountReviewCommand({
    state: session,
    command,
    accountSnapshots,
    nextUndoToken: null,
    undo: null,
  });
  return preview.effect === "none" ? [] : preview.affectedRowIds;
}

/**
 * No persistence, revision increments, group confirmation, Save or mutations.
 * The reducer's guarded select_ready is the sole authority for ready-only IDs.
 */
export function projectAccountReviewSession(
  input: ProjectAccountReviewSessionInput
): AccountReviewReadModel {
  const session = accountReviewSessionSchema.parse(input.session);
  assertOwnedResolutionContext(session, input.accountSnapshots);
  const groupSummaries = projectGroups(session);
  return {
    summary: {
      ...countRows(session.rows),
      ...countGroups(groupSummaries),
    },
    groupSummaries,
    visibleRowIds: session.rows
      .filter((row) => isAccountReviewRowVisible(row, session.filter))
      .map((row) => row.rowId),
    readyVisibleRowIds: previewReadyRowIds(session, input.accountSnapshots),
  };
}
