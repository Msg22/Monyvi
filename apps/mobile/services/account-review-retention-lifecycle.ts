/**
 * #395 T049 - strictly private, owner-scoped lifecycle edits in an EXISTING
 * queue/draft writer. No separate transaction or public sync field.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import * as Crypto from "expo-crypto";
import type {
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
} from "@monyvi/db";

import {
  accountReviewLocalSaveSnapshotSchema,
  parseAccountReviewLocalSaveSnapshot,
  type AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import { reviewBatchSaveWireSchema } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import {
  parseFinancialActionEnvelopeJson,
  hashFinancialActionEnvelope,
  type Sha256Provider,
} from "@monyvi/logic";
import { validateAccountCreateDefaultPayload } from "../../../packages/logic/src/financial-actions/account-create-default";
import { parseAccountCreateDefaultLocalRecoverySnapshotJson } from "../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import { assertExpectedCurrentUser } from "./user-data-access";
import {
  assertReviewSmsBookkeepingAuthority,
  provePrunedSmsTombstones,
  readPhysicalSmsRows,
  type VerifiedPruneReviewRoot,
} from "./account-review-pruned-sms-proof";
const LOCAL_HASH: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};

type Draft = AccountReviewLocalSaveSnapshot["smsDrafts"][number];
type Disposition = NonNullable<
  AccountReviewLocalSaveSnapshot["queuePreimage"]
>["disposition"];

export interface ReviewPrivateLifecycleInput {
  readonly database: Database;
  readonly ownerId: string;
  readonly kind: "discard" | "expire" | "supersede" | "prune_empty";
  readonly queueId?: string;
  readonly draftIds?: ReadonlySet<string>;
  readonly cutoff?: Date;
  readonly queueRemoved?: boolean;
  /** Optional current Save witness; never take old roots from UI state. */
  readonly prune?: Readonly<{
    readonly queue: SmsReviewQueue;
    readonly selectedDrafts: readonly SmsReviewDraftItem[];
    readonly hashProvider: Sha256Provider;
  }>;
}
export interface PreparedReviewPrivateLifecycle {
  /** Root and verified historical-tombstone cache preimages, same batch. */
  readonly cachedRoots: readonly Model[];
  readonly provenOriginalTombstones: readonly SmsReviewDraftItem[];
  readonly prepareOperations: () => readonly Model[];
}

function reject(reason: string): never {
  throw new Error("account_review_private_lifecycle_" + reason);
}
/** Full registered/public immutable tuple. Never trust row.kind to exempt a
 * malformed Add or Review root or use an unchecked hash as deletion authority.
 */
async function verifiedEnvelope(
  root: FinancialActionGroup,
  ownerId: string,
  hashProvider: Sha256Provider
): Promise<ReturnType<typeof parseFinancialActionEnvelopeJson>> {
  if (root.userId !== ownerId || root.deleted)
    reject("root_owner_or_deleted_changed");
  const registry = createAccountReviewFinancialRegistry();
  const envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
  const canonical = await hashFinancialActionEnvelope(
    envelope,
    hashProvider,
    registry
  );
  if (
    root.actionId !== envelope.actionId ||
    root.userId !== envelope.userId ||
    root.domain !== envelope.domain ||
    root.kind !== envelope.kind ||
    root.domainReferenceId !== envelope.domainReferenceId ||
    root.accountGuardsJson !== JSON.stringify(envelope.accountGuards) ||
    canonical.canonicalText !== root.payloadJson ||
    canonical.payloadHash !== root.payloadHash
  )
    reject("immutable_registered_root_changed");
  return envelope;
}
function assertUnrelatedAddPrivateRootValid(
  root: FinancialActionGroup,
  ownerId: string,
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): void {
  try {
    if (
      root.userId !== ownerId ||
      envelope.domain !== "accounts" ||
      envelope.kind !== "create_with_default" ||
      envelope.payloadVersion !== "account.create-default/v1" ||
      typeof root.localRecoverySnapshotJson !== "string"
    )
      reject("invalid_owned_add_private_root");
    const payload = validateAccountCreateDefaultPayload(envelope.payload);
    parseAccountCreateDefaultLocalRecoverySnapshotJson({
      json: root.localRecoverySnapshotJson,
      expectedRoot: {
        actionId: root.actionId,
        ownerId,
        domainReferenceId: root.domainReferenceId,
        payloadHash: root.payloadHash,
        expectedDefaultSnapshot: payload.expectedDefaultSnapshot,
      },
    });
  } catch {
    reject("invalid_add_private_evidence");
  }
}
function parseRootSnapshot(
  root: FinancialActionGroup,
  ownerId: string,
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): VerifiedPruneReviewRoot {
  if (
    root.userId !== ownerId ||
    !root.localRecoverySnapshotJson ||
    envelope.domain !== "transactions" ||
    envelope.kind !== "review_batch_save" ||
    envelope.payloadVersion !== "review.batch-save/v1"
  )
    reject("missing_or_wrong_review_private_root");
  const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
  const snapshot = parseAccountReviewLocalSaveSnapshot({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: root.actionId,
      ownerId,
      sessionId: payload.sessionId,
      source: payload.source,
    },
  });
  return { root, payload, snapshot };
}
function redact(draft: Draft, state: "expired" | "superseded"): Draft {
  return {
    retentionState: state,
    id: draft.id,
    queueId: draft.queueId,
    smsFingerprint: draft.smsFingerprint,
    parsedAt: draft.parsedAt,
    operation: draft.operation,
    expectedPostimageHash: draft.expectedPostimageHash,
  };
}
function transition(
  snapshot: AccountReviewLocalSaveSnapshot,
  input: ReviewPrivateLifecycleInput
): AccountReviewLocalSaveSnapshot | null {
  const originalQueue = snapshot.queuePreimage;
  if (!originalQueue) return null;
  if (
    input.queueId &&
    originalQueue.id !== input.queueId &&
    input.kind !== "supersede"
  )
    return null;
  if (
    input.kind === "supersede" &&
    originalQueue.disposition !== "pruned_empty"
  )
    return null;
  let changed = false;
  const smsDrafts = snapshot.smsDrafts.map((draft): Draft => {
    if (draft.retentionState !== "available") return draft;
    // A newer queue consumes *restoration authority*, not the only sealed
    // original SMS private bytes. Supersede changes queue disposition only.
    const shouldRedact =
      (input.kind === "discard" && input.queueRemoved === true) ||
      (input.kind === "discard" && input.draftIds?.has(draft.id) === true) ||
      (input.kind === "expire" &&
        input.cutoff !== undefined &&
        Date.parse(draft.parsedAt) <= input.cutoff.getTime());
    if (!shouldRedact) return draft;
    changed = true;
    return redact(draft, input.kind === "expire" ? "expired" : "superseded");
  });
  let disposition: Disposition = originalQueue.disposition;
  if (
    input.kind === "supersede" ||
    (input.kind === "discard" &&
      (input.queueRemoved === true || input.draftIds === undefined))
  ) {
    disposition = "superseded";
  } else if (
    input.kind === "prune_empty" &&
    disposition === "present" &&
    input.queueId === originalQueue.id
  ) {
    disposition = "pruned_empty";
  } else if (
    input.kind === "expire" &&
    snapshot.smsDrafts.length > 0 &&
    smsDrafts.every((draft) => draft.retentionState === "expired")
  ) {
    disposition = "expired";
  }
  if (disposition !== originalQueue.disposition) changed = true;
  if (!changed) return null;
  return accountReviewLocalSaveSnapshotSchema.parse({
    ...snapshot,
    smsDrafts,
    queuePreimage: { ...originalQueue, disposition },
  });
}

/**
 * Must be called INSIDE the existing serialized owner writer. Returned
 * prepared root updates are passed into the SAME adapter.batch as draft/queue
 * mutations, and original roots are included in rollback cache snapshots.
 * No fallback if an unresolved owned root has invalid private evidence.
 */
export async function prepareAccountReviewPrivateLifecycle(
  input: ReviewPrivateLifecycleInput
): Promise<PreparedReviewPrivateLifecycle> {
  await assertExpectedCurrentUser(input.ownerId);
  const hashProvider = input.prune?.hashProvider ?? LOCAL_HASH;
  const roots = await input.database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("user_id", input.ownerId), Q.where("deleted", false))
    .fetch();
  const retained: VerifiedPruneReviewRoot[] = [];
  const pending: Array<{
    readonly root: FinancialActionGroup;
    readonly next: AccountReviewLocalSaveSnapshot | null;
  }> = [];
  for (const root of roots) {
    const envelope = await verifiedEnvelope(root, input.ownerId, hashProvider);
    const isTerminal = root.state === "accepted" || root.state === "reconciled";
    if (envelope.kind === "create_with_default") {
      if (!isTerminal || typeof root.localRecoverySnapshotJson === "string")
        assertUnrelatedAddPrivateRootValid(root, input.ownerId, envelope);
      continue;
    }
    if (envelope.kind !== "review_batch_save") {
      // Only genuine, registered, canonical legacy tuples are exempt.
      if (root.localRecoverySnapshotJson !== null)
        reject("unexpected_legacy_private_evidence");
      continue;
    }
    if (typeof root.localRecoverySnapshotJson !== "string") {
      if (!isTerminal) reject("missing_review_private_evidence");
      // A terminal Review with cleared proof cannot authorize an original
      // still present physically. Never infer proof from a kind/state label.
      const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
      if (payload.source === "SMS") {
        const raw = await readPhysicalSmsRows(
          input.database,
          "sms_review_draft_items",
          {
            ownerId: input.ownerId,
            queueId: payload.sessionId,
            requiredDraftIds: payload.localSmsBookkeeping.map(
              (book) => book.draftId
            ),
          }
        );
        if (
          raw.some(
            (item) =>
              item._status === "deleted" &&
              payload.localSmsBookkeeping.some(
                (book) => book.draftId === item.id
              )
          )
        )
          reject("terminal_missing_original_authority");
      }
      continue;
    }
    const verified = parseRootSnapshot(root, input.ownerId, envelope);
    await assertReviewSmsBookkeepingAuthority({
      database: input.database,
      root: verified,
      ownerId: input.ownerId,
      hashProvider,
    });
    retained.push(verified);
    const next = transition(verified.snapshot, input);
    if (next) pending.push({ root, next });
  }

  // Preserve original full-header hashes. An independently changed timestamp
  // is never proof of a legitimate queued writer.
  const allQueues = await input.database
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", input.ownerId))
    .fetch();
  if (allQueues.length > 1) reject("multiple_current_owned_queues");
  const queue = allQueues[0] ?? null;
  const target = retained.filter(
    (record) =>
      record.payload.source === "SMS" &&
      record.snapshot.queuePreimage?.disposition === "present" &&
      record.snapshot.queuePreimage?.id === (input.queueId ?? queue?.id)
  );
  const allLive = queue
    ? await input.database
        .get<SmsReviewDraftItem>("sms_review_draft_items")
        .query(Q.where("user_id", input.ownerId), Q.where("queue_id", queue.id))
        .fetch()
    : [];
  if (
    input.prune &&
    (!queue ||
      input.prune.queue !== queue ||
      queue.id !== input.queueId ||
      input.prune.selectedDrafts.some((draft) => !allLive.includes(draft)))
  )
    reject("prune_current_writer_preimage_changed");

  let historical: readonly SmsReviewDraftItem[] = [];
  if (queue && (target.length > 0 || input.kind === "prune_empty")) {
    // All-dedup with NO prior financial root is valid, but its current
    // selected physical membership must still be complete and free of
    // unaccounted deleted originals.
    historical = await provePrunedSmsTombstones({
      database: input.database,
      ownerId: input.ownerId,
      queue,
      selectedDrafts:
        input.kind === "prune_empty"
          ? (input.prune?.selectedDrafts ?? [])
          : allLive,
      roots: target,
      hashProvider,
    });
  } else if (input.kind === "prune_empty" && input.prune)
    reject("prune_missing_owned_root_or_queue");

  // When original metadata is redacted, destroy its sealed physical tombstone
  // in THIS writer's batch. Expired at the inclusive per-entry parsedAt cutoff.
  const toDestroy = historical.filter((original) => {
    if (input.kind === "prune_empty") return true;
    if (input.kind === "discard" && input.queueRemoved === true) return true;
    if (input.kind === "discard")
      return input.draftIds?.has(original.id) === true;
    // Supersession never destroys historical originals; an old rejected
    // Review retains its sealed SMS proof even when a newer queue exists.
    if (input.kind !== "expire" || !input.cutoff) return false;
    const matches = target.flatMap((item) =>
      item.snapshot.smsDrafts.filter(
        (draft) =>
          draft.id === original.id && draft.operation === "delete_saved"
      )
    );
    return (
      matches.length > 0 &&
      matches.every(
        (draft) => Date.parse(draft.parsedAt) <= input.cutoff!.getTime()
      )
    );
  });
  const destroyedIds = new Set(toDestroy.map((model) => model.id));
  // Review deletion, expiry and supersession must never redact the only
  // evidence for a still-physical historical original. Some callers delete
  // queues without supplying a Save witness; reject orphaning before staging.
  // Device-only tombstones may be invisible to Watermelon's normal owned
  // query, but must never justify a cross-owner/table-wide SMS payload scan.
  // Read only queue identities bound by the owned current queue or an
  // authenticated immutable Review root. Identity-only probes in the reader
  // detect reparented/foreign required originals without loading their bodies.
  const scopedQueueIds = new Set<string>(queue ? [queue.id] : []);
  for (const verified of retained) {
    const id = verified.snapshot.queuePreimage?.id;
    if (id) scopedQueueIds.add(id);
  }
  const allPhysicalDrafts: Array<Readonly<Model["_raw"]>> = [];
  for (const queueId of scopedQueueIds) {
    const requiredDraftIds = new Set<string>();
    for (const verified of retained) {
      if (verified.snapshot.queuePreimage?.id === queueId) {
        verified.snapshot.smsDrafts.forEach((entry) =>
          requiredDraftIds.add(entry.id)
        );
      }
    }
    allPhysicalDrafts.push(
      ...(await readPhysicalSmsRows(input.database, "sms_review_draft_items", {
        ownerId: input.ownerId,
        queueId,
        requiredDraftIds: [...requiredDraftIds],
      }))
    );
  }
  const physicalDeleted = allPhysicalDrafts.filter(
    (item) => item._status === "deleted"
  );
  const remainingFor = (id: string): boolean =>
    physicalDeleted.some((item) => item.id === id && !destroyedIds.has(id));
  for (const { root, next } of pending) {
    if (next === null) continue;
    const original = retained.find(
      (item) => item.root.id === root.id
    )?.snapshot;
    if (!original) reject("missing_pretransition_private_evidence");
    for (const entry of original.smsDrafts) {
      const after = next.smsDrafts.find(
        (candidate) => candidate.id === entry.id
      );
      if (
        entry.retentionState === "available" &&
        after?.retentionState !== "available" &&
        remainingFor(entry.id)
      )
        reject("redaction_leaves_physical_original");
    }
  }
  const isQueueRemoved =
    queue &&
    (input.kind === "prune_empty" ||
      (input.kind === "discard" && input.queueRemoved === true) ||
      (input.kind === "expire" &&
        input.cutoff !== undefined &&
        allLive.every(
          (draft) => draft.parsedAt.getTime() <= input.cutoff!.getTime()
        )));
  const queueIdForRemoval = queue?.id ?? null;
  if (
    isQueueRemoved &&
    queueIdForRemoval !== null &&
    physicalDeleted.some(
      (item) =>
        Object.entries(item).some(
          ([key, value]) => key === "queue_id" && value === queueIdForRemoval
        ) && !destroyedIds.has(item.id)
    )
  )
    reject("queue_removal_leaves_unproven_original");
  // Terminal proof is consumed only when its own old namespace is clean,
  // including physical deleted rows absent from normal owner-scoped queries.
  for (const verified of retained) {
    // A superseding namespace changes ONLY the old queue disposition.
    // Terminal private cleanup belongs to separately proven cleanup writers.
    if (input.kind === "supersede") continue;
    if (
      verified.root.state !== "accepted" &&
      verified.root.state !== "reconciled"
    )
      continue;
    const id = verified.snapshot.queuePreimage?.id;
    const remains =
      id !== undefined &&
      allPhysicalDrafts.some(
        (row) =>
          row._status === "deleted" &&
          Object.entries(row).some(
            ([key, value]) => key === "queue_id" && value === id
          ) &&
          !destroyedIds.has(row.id)
      );
    if (!remains) {
      const index = pending.findIndex(
        (item) => item.root.id === verified.root.id
      );
      if (index >= 0) pending.splice(index, 1);
      pending.push({ root: verified.root, next: null });
    }
  }
  // Supersession consumes the old queue's restoration right by changing
  // only queuePreimage.disposition. Physical deleted originals and unchanged
  // available SMS snapshots remain sealed here; the rejected-Review recovery
  // proof gate separately refuses terminal compensation for that combination.
  const changed = new Map(pending.map((item) => [item.root.id, item]));
  await assertExpectedCurrentUser(input.ownerId);
  return {
    // All contributors need cached snapshot protection against failed batch.
    cachedRoots: [
      ...[...changed.values()].map((item) => item.root),
      ...toDestroy,
    ],
    provenOriginalTombstones: toDestroy,
    prepareOperations: () => [
      ...[...changed.values()].map(({ root, next }) =>
        root.prepareUpdate((candidate) => {
          candidate.localRecoverySnapshotJson =
            next === null ? null : JSON.stringify(next);
        })
      ),
      ...toDestroy.map((row) => row.prepareDestroyPermanently()),
    ],
  };
}
