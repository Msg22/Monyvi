/** #395 T029: one authenticated SMS review command, one durable SQLite batch. */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import {
  reduceAccountReviewCommand,
  autoSelectReadyReviewSession,
  type AccountReviewCommandResult,
  type ReviewUndoLease,
} from "../../../packages/logic/src/account-review/reducer";
import { rejectReviewCommand } from "../../../packages/logic/src/account-review/reducer-primitives";
import type {
  AccountReviewCommand,
  AccountReviewReason,
  AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import type { AccountReviewOwnedContext } from "../../../packages/logic/src/account-review/normalization-types";
import { loadAccountReviewAccountSnapshots } from "./account-review-read-model-service";
import { loadCurrentAccountReviewEditorCategories } from "./account-review-transaction-edit-category-service";
import {
  rehydrateOwnedSmsReviewGraph,
  encodeOwnedSmsReviewRow,
  type OwnedReviewGraph,
} from "./account-review-command-snapshots";
import {
  commitScopedPreparedBatch,
  throwIfSmsReviewDraftOperationAborted,
} from "./sms-review-draft-batch-service";
import {
  AccountReviewUndoLifetimeInvalidatedError,
  beginAccountReviewUndoLifetime,
  currentAccountReviewUndo,
  endAccountReviewUndoLifetime,
  isAccountReviewUndoLifetimeCurrent,
  retainAccountReviewUndo,
  type AccountReviewUndoLifetime,
} from "./account-review-undo-lifetime-service";
import {
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
} from "./user-data-access";

export interface ExecuteSmsAccountReviewCommandInput {
  readonly queueId: string;
  readonly command: AccountReviewCommand;
  /** UI snapshot is advisory only. Always fetch current owned DB accounts. */
  readonly accountSnapshots: AccountReviewOwnedContext;
  readonly nextUndoToken?: string | null;
  /** Revokes queued/uncommitted writers when their facade lifetime ends. */
  readonly signal?: AbortSignal;
}

async function loadCurrentQueue(
  ownerId: string,
  queueId: string
): Promise<SmsReviewQueue> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId) throw new Error("review_owner_changed");
  const queues = await scope
    .queryOwned(database.get<SmsReviewQueue>("sms_review_queues"))
    .fetch();
  const queue = queues[0];
  if (queues.length !== 1 || !queue || queue.id !== queueId)
    throw new Error("account_review_queue_changed");
  return queue;
}

async function loadCurrentDrafts(
  ownerId: string,
  queueId: string
): Promise<SmsReviewDraftItem[]> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId) throw new Error("review_owner_changed");
  const collection = database.get<SmsReviewDraftItem>("sms_review_draft_items");
  const records = await scope
    .queryOwned(
      collection,
      Q.where("queue_id", queueId),
      Q.sortBy("position", Q.asc)
    )
    .fetch();
  if (records.length === 0) throw new Error("account_review_queue_empty");
  return records;
}

/** Row local revisions are independent from global session headers. */
function changedRowIds(
  result: AccountReviewCommandResult,
  graph: OwnedReviewGraph
): ReadonlySet<string> {
  const prior = new Map(graph.session.rows.map((row) => [row.rowId, row]));
  const touched = new Set(result.affectedRowIds);
  for (const row of result.state.rows) {
    const original = prior.get(row.rowId);
    if (!original || JSON.stringify(original) !== JSON.stringify(row))
      touched.add(row.rowId);
  }
  for (const groupId of result.affectedGroupIds) {
    for (const group of [...graph.session.groups, ...result.state.groups]) {
      if (group.groupId !== groupId) continue;
      for (const id of group.linkedRowIds) touched.add(id);
    }
  }
  return touched;
}

/** V2 global headers update; untouched V1 raw bytes are never rewritten. */
function durableUpdates(
  result: AccountReviewCommandResult,
  graph: OwnedReviewGraph
): ReadonlyArray<{
  readonly record: SmsReviewDraftItem;
  readonly row: AccountReviewSession["rows"][number];
  readonly payload: ReturnType<typeof encodeOwnedSmsReviewRow>;
  readonly selectionChanged: boolean;
}> {
  const touched = changedRowIds(result, graph);
  const filterOnly = result.state.filter !== graph.session.filter;
  const prior = new Map(graph.session.rows.map((row) => [row.rowId, row]));
  const updated: Array<{
    readonly record: SmsReviewDraftItem;
    readonly row: AccountReviewSession["rows"][number];
    readonly payload: ReturnType<typeof encodeOwnedSmsReviewRow>;
    readonly selectionChanged: boolean;
  }> = [];
  for (const row of result.state.rows) {
    const record = graph.recordsByRow.get(row.rowId);
    const original = prior.get(row.rowId);
    if (!record || !original) throw new Error("account_review_draft_missing");
    // Filter changes rewrite EVERY V2 header atomically. Historical V1 is
    // decode-only unless a real row/group edit touches it; its filter is
    // projected from the shared authenticated V2 anchor on next read.
    if (record.payloadVersion !== 2 && !touched.has(row.rowId)) continue;
    if (filterOnly && record.payloadVersion !== 2 && touched.has(row.rowId))
      throw new Error("account_review_filter_v1_unexpected_row_change");
    updated.push({
      record,
      row,
      payload: encodeOwnedSmsReviewRow(result.state, row),
      selectionChanged: original.selected !== row.selected,
    });
  }
  if (graph.recordsByRow.size !== result.state.rows.length)
    throw new Error("account_review_row_scope_changed");
  return updated;
}

async function persistReviewTransition(
  ownerId: string,
  queue: SmsReviewQueue,
  result: AccountReviewCommandResult,
  graph: OwnedReviewGraph,
  guard: () => void,
  selectionKind: AccountReviewCommand["kind"] | "auto",
  signal?: AbortSignal
): Promise<void> {
  throwIfSmsReviewDraftOperationAborted(signal);
  const updates = durableUpdates(result, graph);
  const now = new Date();
  await commitScopedPreparedBatch(
    ownerId,
    [queue, ...updates.map(({ record }) => record)],
    () => {
      guard();
      return updates.map(({ record, payload, selectionChanged }) =>
        record.prepareUpdate((item) => {
          item.payloadVersion = payload.version;
          item.payloadJson = payload.json;
          if (selectionChanged) {
            // Existing nullable override is explicit manual intent, not a
            // marker for forced group edits or newly ready automatic rows.
            item.selectionOverride =
              selectionKind === "set_row_selected" ||
              selectionKind === "clear_selection"
                ? false
                : selectionKind === "select_ready" ||
                    selectionKind === "select_row"
                  ? true
                  : null;
          }
          item.updatedAt = now;
        })
      );
    },
    { signal }
  );
}

function retainUndoAfterCommit(
  queue: SmsReviewQueue,
  prior: AccountReviewSession,
  result: AccountReviewCommandResult,
  command: AccountReviewCommand,
  lifetime: AccountReviewUndoLifetime
): void {
  const lease: ReviewUndoLease | null =
    command.kind === "set_filter"
      ? currentAccountReviewUndo(lifetime, queue)
      : command.kind === "remove_group" && result.undoToken
        ? {
            token: result.undoToken,
            previousState: prior,
            afterRemovalGeneration: result.state.operationGeneration,
          }
        : null;
  retainAccountReviewUndo(lifetime, queue, lease);
}

function invalidatedReason(command: AccountReviewCommand): AccountReviewReason {
  return command.kind === "undo_removal"
    ? "review_undo_invalid"
    : "review_owner_changed";
}

async function executeReviewCommandInWriter(
  input: ExecuteSmsAccountReviewCommandInput,
  lifetime: AccountReviewUndoLifetime
): Promise<AccountReviewCommandResult> {
  const ownerId = input.command.ownerId;
  // The lock may be held by an unrelated writer. Recheck cancellation only
  // after this genuine serialized writer begins, and after every awaited read.
  throwIfSmsReviewDraftOperationAborted(input.signal);
  await assertExpectedCurrentUser(ownerId);
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const queue = await loadCurrentQueue(ownerId, input.queueId);
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const records = await loadCurrentDrafts(ownerId, queue.id);
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const graph = rehydrateOwnedSmsReviewGraph(records, ownerId, queue.id);
  const authority = await loadAccountReviewAccountSnapshots();
  throwIfSmsReviewDraftOperationAborted(input.signal);
  // Category edits must prove the current owned/system category within THIS
  // serialized writer; a screen's category map or label has no authority.
  const categorySnapshots =
    input.command.kind === "edit_row_transaction"
      ? (await loadCurrentAccountReviewEditorCategories(ownerId, input.signal))
          .snapshot
      : undefined;
  throwIfSmsReviewDraftOperationAborted(input.signal);
  await assertExpectedCurrentUser(ownerId);
  throwIfSmsReviewDraftOperationAborted(input.signal);
  if (
    authority.ownerId !== ownerId ||
    graph.session.ownerId !== ownerId ||
    graph.session.sessionId !== input.command.sessionId
  )
    throw new Error("account_review_current_actor_changed");
  const rejectInvalidated = (): AccountReviewCommandResult =>
    rejectReviewCommand(graph.session, invalidatedReason(input.command));
  if (!isAccountReviewUndoLifetimeCurrent(lifetime)) return rejectInvalidated();
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const result = reduceAccountReviewCommand({
    state: graph.session,
    command: input.command,
    accountSnapshots: authority,
    categorySnapshots,
    nextUndoToken: input.nextUndoToken ?? null,
    undo: currentAccountReviewUndo(lifetime, queue),
    autoSelectReady: true,
    manuallyDeselectedRowIds: new Set(
      [...graph.recordsByRow]
        .filter(([, record]) => record.selectionOverride === false)
        .map(([rowId]) => rowId)
    ),
  });
  if (result.effect !== "persist_sms") return result;
  try {
    await persistReviewTransition(
      ownerId,
      queue,
      result,
      graph,
      () => {
        throwIfSmsReviewDraftOperationAborted(input.signal);
        if (!isAccountReviewUndoLifetimeCurrent(lifetime))
          throw new AccountReviewUndoLifetimeInvalidatedError();
      },
      input.command.kind,
      input.signal
    );
  } catch (error) {
    if (error instanceof AccountReviewUndoLifetimeInvalidatedError)
      return rejectInvalidated();
    throw error;
  }
  retainUndoAfterCommit(queue, graph.session, result, input.command, lifetime);
  return result;
}

export async function executeSmsAccountReviewCommand(
  input: ExecuteSmsAccountReviewCommandInput
): Promise<AccountReviewCommandResult> {
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const lifetime = beginAccountReviewUndoLifetime(input.command.ownerId);
  try {
    return await database.write(() =>
      executeReviewCommandInWriter(input, lifetime)
    );
  } finally {
    endAccountReviewUndoLifetime();
  }
}

/** Bootstrap readiness within one owned writer, without a public command.
 * Existing false selection overrides are explicit manual opt-outs. */
export async function initializeSmsAccountReviewReadySelection(input: {
  readonly ownerId: string;
  readonly queueId: string;
  readonly expectedSession: AccountReviewSession;
  readonly signal?: AbortSignal;
}): Promise<AccountReviewSession> {
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const lifetime = beginAccountReviewUndoLifetime(input.ownerId);
  try {
    return await database.write(async (): Promise<AccountReviewSession> => {
      throwIfSmsReviewDraftOperationAborted(input.signal);
      await assertExpectedCurrentUser(input.ownerId);
      throwIfSmsReviewDraftOperationAborted(input.signal);
      const queue = await loadCurrentQueue(input.ownerId, input.queueId);
      const records = await loadCurrentDrafts(input.ownerId, queue.id);
      throwIfSmsReviewDraftOperationAborted(input.signal);
      const graph = rehydrateOwnedSmsReviewGraph(
        records,
        input.ownerId,
        queue.id
      );
      if (
        JSON.stringify(graph.session) !==
          JSON.stringify(input.expectedSession) ||
        !isAccountReviewUndoLifetimeCurrent(lifetime)
      )
        throw new Error("review_revision_stale");
      // An unconsumed removal lease must remain usable; do not mutate the
      // generation or any other rows behind its strict undo preimage.
      if (currentAccountReviewUndo(lifetime, queue)) return graph.session;
      const snapshots = await loadAccountReviewAccountSnapshots();
      throwIfSmsReviewDraftOperationAborted(input.signal);
      await assertExpectedCurrentUser(input.ownerId);
      if (snapshots.ownerId !== input.ownerId)
        throw new Error("review_owner_changed");
      const manual = new Set(
        [...graph.recordsByRow]
          .filter(([, record]) => record.selectionOverride === false)
          .map(([rowId]) => rowId)
      );
      const result = autoSelectReadyReviewSession(
        graph.session,
        snapshots,
        manual
      );
      if (result.effect === "persist_sms") {
        await persistReviewTransition(
          input.ownerId,
          queue,
          result,
          graph,
          () => {
            throwIfSmsReviewDraftOperationAborted(input.signal);
            if (!isAccountReviewUndoLifetimeCurrent(lifetime))
              throw new AccountReviewUndoLifetimeInvalidatedError();
          },
          "auto",
          input.signal
        );
      }
      return result.state;
    });
  } finally {
    endAccountReviewUndoLifetime();
  }
}

/** Revoke only the matching transient SMS Undo, never delete durable drafts. */
export async function discardSmsAccountReviewRemovedSuggestion(input: {
  readonly ownerId: string;
  readonly queueId: string;
  readonly sessionId: string;
  readonly groupId: string;
  readonly expectedReviewRevision: string;
  readonly expectedOperationGeneration: string;
  readonly undoToken: string | null;
  readonly signal?: AbortSignal;
}): Promise<void> {
  throwIfSmsReviewDraftOperationAborted(input.signal);
  const lifetime = beginAccountReviewUndoLifetime(input.ownerId);
  try {
    await database.write(async (): Promise<void> => {
      throwIfSmsReviewDraftOperationAborted(input.signal);
      await assertExpectedCurrentUser(input.ownerId);
      const queue = await loadCurrentQueue(input.ownerId, input.queueId);
      const records = await loadCurrentDrafts(input.ownerId, queue.id);
      throwIfSmsReviewDraftOperationAborted(input.signal);
      const session = rehydrateOwnedSmsReviewGraph(
        records,
        input.ownerId,
        queue.id
      ).session;
      if (
        !isAccountReviewUndoLifetimeCurrent(lifetime) ||
        session.sessionId !== input.sessionId ||
        session.revision !== input.expectedReviewRevision ||
        session.operationGeneration !== input.expectedOperationGeneration ||
        !session.groups.some(
          (group) =>
            group.groupId === input.groupId &&
            group.status === "removed" &&
            session.removedEvidenceKeys.includes(group.evidenceKey)
        )
      )
        throw new Error("review_undo_invalid");
      const lease = currentAccountReviewUndo(lifetime, queue);
      const targetGroup = session.groups.find(
        (group) => group.groupId === input.groupId
      );
      const matchesLease =
        lease !== null &&
        lease.afterRemovalGeneration === session.operationGeneration &&
        lease.previousState.ownerId === input.ownerId &&
        lease.previousState.sessionId === input.sessionId &&
        lease.previousState.groups.some(
          (before) =>
            before.groupId === input.groupId &&
            before.status !== "removed" &&
            before.evidenceKey === targetGroup?.evidenceKey
        );
      if (
        input.undoToken !== null &&
        (!matchesLease || lease?.token !== input.undoToken)
      )
        throw new Error("review_undo_invalid");
      await assertExpectedCurrentUser(input.ownerId);
      throwIfSmsReviewDraftOperationAborted(input.signal);
      if (!isAccountReviewUndoLifetimeCurrent(lifetime))
        throw new AccountReviewUndoLifetimeInvalidatedError();
      // Even a freshly mounted view without the old token must revoke a
      // matching lease. A different group's lease survives this discard.
      if (matchesLease) retainAccountReviewUndo(lifetime, queue, null);
    });
  } finally {
    endAccountReviewUndoLifetime();
  }
}
