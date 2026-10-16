/** #395 T029: one authenticated SMS review command, one durable SQLite batch. */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import {
  reduceAccountReviewCommand,
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
import {
  rehydrateOwnedSmsReviewGraph,
  encodeOwnedSmsReviewRow,
  type OwnedReviewGraph,
} from "./account-review-command-snapshots";
import { commitScopedPreparedBatch } from "./sms-review-draft-batch-service";
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
  guard: () => void
): Promise<void> {
  const updates = durableUpdates(result, graph);
  const now = new Date();
  await commitScopedPreparedBatch(
    ownerId,
    [queue, ...updates.map(({ record }) => record)],
    () => {
      guard();
      return [
        queue.prepareUpdate((item) => {
          item.updatedAt = now;
        }),
        ...updates.map(({ record, row, payload, selectionChanged }) =>
          record.prepareUpdate((item) => {
            item.payloadVersion = payload.version;
            item.payloadJson = payload.json;
            if (selectionChanged) item.selectionOverride = row.selected;
            item.updatedAt = now;
          })
        ),
      ];
    }
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

function invalidatedReason(
  command: AccountReviewCommand
): AccountReviewReason {
  return command.kind === "undo_removal"
    ? "review_undo_invalid"
    : "review_owner_changed";
}

async function executeReviewCommandInWriter(
  input: ExecuteSmsAccountReviewCommandInput,
  lifetime: AccountReviewUndoLifetime
): Promise<AccountReviewCommandResult> {
  const ownerId = input.command.ownerId;
  await assertExpectedCurrentUser(ownerId);
  const queue = await loadCurrentQueue(ownerId, input.queueId);
  const records = await loadCurrentDrafts(ownerId, queue.id);
  const graph = rehydrateOwnedSmsReviewGraph(records, ownerId, queue.id);
  const authority = await loadAccountReviewAccountSnapshots();
  await assertExpectedCurrentUser(ownerId);
  if (
    authority.ownerId !== ownerId ||
    graph.session.ownerId !== ownerId ||
    graph.session.sessionId !== input.command.sessionId
  )
    throw new Error("account_review_current_actor_changed");
  const rejectInvalidated = (): AccountReviewCommandResult =>
    rejectReviewCommand(graph.session, invalidatedReason(input.command));
  if (!isAccountReviewUndoLifetimeCurrent(lifetime))
    return rejectInvalidated();
  const result = reduceAccountReviewCommand({
    state: graph.session,
    command: input.command,
    accountSnapshots: authority,
    nextUndoToken: input.nextUndoToken ?? null,
    undo: currentAccountReviewUndo(lifetime, queue),
  });
  if (result.effect !== "persist_sms") return result;
  try {
    await persistReviewTransition(ownerId, queue, result, graph, () => {
      if (!isAccountReviewUndoLifetimeCurrent(lifetime))
        throw new AccountReviewUndoLifetimeInvalidatedError();
    });
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
  const lifetime = beginAccountReviewUndoLifetime(input.command.ownerId);
  try {
    return await database.write(() => executeReviewCommandInWriter(input, lifetime));
  } finally {
    endAccountReviewUndoLifetime();
  }
}
