/**
 * #395 authenticated legacy SMS recovery. A V1 queue has no editable
 * revision authority until a coherent first V2 anchor has durably committed.
 */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
} from "@monyvi/db";
import { Q, type Model } from "@nozbe/watermelondb";
import {
  decodeSmsReviewDraftPayload,
  migrateSmsReviewDraftV1ToV2,
} from "../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import type { AccountReviewOwnedContext } from "../../../packages/logic/src/account-review/normalization-types";
import { loadAccountReviewAccountSnapshots } from "./account-review-read-model-service";
import { rehydrateOwnedSmsReviewGraph } from "./account-review-command-snapshots";
import {
  commitScopedPreparedBatch,
  throwIfSmsReviewDraftOperationAborted,
} from "./sms-review-draft-batch-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const LEGACY_GENESIS_REVISION = "1";
const LEGACY_SOURCE_REVISION = "0";

interface CapturedRow {
  readonly id: string;
  readonly fingerprint: string;
  readonly raw: string;
}
interface OwnedQueueRows {
  readonly queue: SmsReviewQueue;
  readonly rows: readonly SmsReviewDraftItem[];
}
interface LegacyPreimages extends OwnedQueueRows {
  readonly queueRaw: string;
  readonly capturedRows: readonly CapturedRow[];
}

export interface LoadOrBootstrapSmsReviewInput {
  readonly expectedOwnerId: string;
  readonly queueId: string;
  readonly signal?: AbortSignal;
}

/** Full raw preimages include all physical IDs, timestamps and retained choices. */
function immutableRaw(model: Model): string {
  const ordered = Object.entries(model._raw).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return JSON.stringify(
    ordered.map(([key, value]) => ({
      key,
      type: value === null ? "null" : typeof value,
      value: value === undefined ? null : value,
    }))
  );
}
function orderedRows(
  rows: readonly SmsReviewDraftItem[]
): SmsReviewDraftItem[] {
  return [...rows].sort(
    (left, right) =>
      left.position - right.position ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}
async function fetchOwnedQueue(
  ownerId: string,
  queueId: string
): Promise<OwnedQueueRows> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId)
    throw new Error("account_review_legacy_actor_changed");
  const queues = await scope
    .queryOwned(database.get<SmsReviewQueue>("sms_review_queues"))
    .fetch();
  const queue = queues[0];
  if (queues.length !== 1 || !queue || queue.id !== queueId)
    throw new Error("account_review_legacy_queue_changed");
  const rows = await scope
    .queryOwned(
      database.get<SmsReviewDraftItem>("sms_review_draft_items"),
      Q.where("queue_id", queueId)
    )
    .fetch();
  if (
    rows.length === 0 ||
    new Set(rows.map((row) => row.smsFingerprint)).size !== rows.length ||
    rows.some((row) => row.userId !== ownerId || row.queueId !== queueId)
  )
    throw new Error("account_review_legacy_membership_changed");
  return { queue, rows: orderedRows(rows) };
}
function assertReadableRows(owned: OwnedQueueRows, ownerId: string): void {
  for (const row of owned.rows) {
    decodeSmsReviewDraftPayload({
      version: row.payloadVersion,
      json: row.payloadJson,
      expectedFingerprint: row.smsFingerprint,
      expectedOwnerId: ownerId,
      expectedSessionId: owned.queue.id,
      selectionOverride: row.selectionOverride,
    });
  }
}
function captured(owned: OwnedQueueRows): LegacyPreimages {
  return {
    ...owned,
    queueRaw: immutableRaw(owned.queue),
    capturedRows: owned.rows.map((row) => ({
      id: row.id,
      fingerprint: row.smsFingerprint,
      raw: immutableRaw(row),
    })),
  };
}
function assertSamePreimages(
  before: LegacyPreimages,
  current: OwnedQueueRows
): void {
  if (
    before.queue.id !== current.queue.id ||
    before.queueRaw !== immutableRaw(current.queue) ||
    before.capturedRows.length !== current.rows.length
  )
    throw new Error("account_review_legacy_preimage_stale");
  for (const [index, old] of before.capturedRows.entries()) {
    const row = current.rows[index];
    if (
      !row ||
      row.id !== old.id ||
      row.smsFingerprint !== old.fingerprint ||
      immutableRaw(row) !== old.raw
    )
      throw new Error("account_review_legacy_preimage_stale");
  }
}
async function assertActorAndSignal(
  input: LoadOrBootstrapSmsReviewInput
): Promise<void> {
  throwIfSmsReviewDraftOperationAborted(input.signal);
  await assertExpectedCurrentUser(input.expectedOwnerId);
  throwIfSmsReviewDraftOperationAborted(input.signal);
}
function anchorPayload(
  row: SmsReviewDraftItem,
  ownerId: string,
  queueId: string,
  preferredCurrency: AccountReviewSession["preferredCurrency"]
): ReturnType<typeof migrateSmsReviewDraftV1ToV2> {
  return migrateSmsReviewDraftV1ToV2({
    version: row.payloadVersion,
    json: row.payloadJson,
    expectedFingerprint: row.smsFingerprint,
    expectedOwnerId: ownerId,
    expectedSessionId: queueId,
    selectionOverride: row.selectionOverride,
    rowId: row.id,
    sourceRevision: LEGACY_SOURCE_REVISION,
    reviewRevision: LEGACY_GENESIS_REVISION,
    operationGeneration: LEGACY_GENESIS_REVISION,
    preferredCurrency,
  });
}
function currentGraph(
  owned: OwnedQueueRows,
  ownerId: string
): AccountReviewSession {
  assertReadableRows(owned, ownerId);
  return rehydrateOwnedSmsReviewGraph(owned.rows, ownerId, owned.queue.id)
    .session;
}

/**
 * Prove every owned frozen V1 row can migrate through the canonical V1-to-V2
 * converter before the first anchor becomes durable. A V1 payload that is
 * readable but V2-incompatible must reject without a half bootstrap.
 */
function assertProspectiveMigration(
  owned: OwnedQueueRows,
  ownerId: string,
  preferredCurrency: AccountReviewSession["preferredCurrency"]
): void {
  for (const row of owned.rows) {
    if (row.payloadVersion === 2) continue;
    const payload = migrateSmsReviewDraftV1ToV2({
      version: row.payloadVersion,
      json: row.payloadJson,
      expectedFingerprint: row.smsFingerprint,
      expectedOwnerId: ownerId,
      expectedSessionId: owned.queue.id,
      selectionOverride: row.selectionOverride,
      rowId: row.id,
      sourceRevision: LEGACY_SOURCE_REVISION,
      reviewRevision: LEGACY_GENESIS_REVISION,
      operationGeneration: LEGACY_GENESIS_REVISION,
      preferredCurrency,
    });
    decodeSmsReviewDraftPayload({
      ...payload,
      expectedFingerprint: row.smsFingerprint,
      expectedOwnerId: ownerId,
      expectedSessionId: owned.queue.id,
      selectionOverride: row.selectionOverride,
    });
  }
}

async function commitAnchor(
  input: LoadOrBootstrapSmsReviewInput,
  owned: OwnedQueueRows,
  before: LegacyPreimages,
  snapshots: AccountReviewOwnedContext
): Promise<AccountReviewSession> {
  const anchor = owned.rows[0];
  if (!anchor) throw new Error("account_review_legacy_anchor_missing");
  const payload = anchorPayload(
    anchor,
    input.expectedOwnerId,
    input.queueId,
    snapshots.preferredCurrency
  );
  await assertActorAndSignal(input);
  assertSamePreimages(before, owned);
  await commitScopedPreparedBatch(
    input.expectedOwnerId,
    [anchor],
    () => {
      throwIfSmsReviewDraftOperationAborted(input.signal);
      assertSamePreimages(before, owned);
      return [
        anchor.prepareUpdate((draft) => {
          draft.payloadVersion = payload.version;
          draft.payloadJson = payload.json;
          draft.updatedAt = new Date();
        }),
      ];
    },
    { signal: input.signal }
  );
  return currentGraph(owned, input.expectedOwnerId);
}

/** One serialized writer establishes the only initial persisted revision. */
async function commitLegacyAnchor(
  input: LoadOrBootstrapSmsReviewInput,
  before: LegacyPreimages
): Promise<AccountReviewSession> {
  return database.write(async (): Promise<AccountReviewSession> => {
    await assertActorAndSignal(input);
    const owned = await fetchOwnedQueue(input.expectedOwnerId, input.queueId);
    await assertActorAndSignal(input);
    if (owned.rows.some((row) => row.payloadVersion === 2))
      return currentGraph(owned, input.expectedOwnerId);
    assertSamePreimages(before, owned);
    assertReadableRows(owned, input.expectedOwnerId);
    const snapshots = await loadAccountReviewAccountSnapshots();
    await assertActorAndSignal(input);
    if (snapshots.ownerId !== input.expectedOwnerId)
      throw new Error("account_review_legacy_actor_changed");
    assertProspectiveMigration(
      owned,
      input.expectedOwnerId,
      snapshots.preferredCurrency
    );
    return commitAnchor(input, owned, before, snapshots);
  });
}

/** Public-to-app only: never expose a draft preimage token or preview CAS. */
export async function loadOrBootstrapOwnedSmsReviewSession(
  input: LoadOrBootstrapSmsReviewInput
): Promise<AccountReviewSession> {
  await assertActorAndSignal(input);
  const owned = await fetchOwnedQueue(input.expectedOwnerId, input.queueId);
  assertReadableRows(owned, input.expectedOwnerId);
  await assertActorAndSignal(input);
  if (owned.rows.some((row) => row.payloadVersion === 2))
    return currentGraph(owned, input.expectedOwnerId);
  return commitLegacyAnchor(input, captured(owned));
}
