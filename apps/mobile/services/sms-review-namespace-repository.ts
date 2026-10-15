/** Owned queue identity primitives; callers hold the Watermelon writer. */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import { canonicalUuid } from "../../../packages/logic/src/account-review/schema-primitives";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import { reportSmsNamespaceCleanupFailure } from "./sms-review-namespace-diagnostics";
import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";
import {
  commitScopedPreparedBatch,
  throwIfSmsReviewDraftOperationAborted,
} from "./sms-review-draft-batch-service";
import {
  assertSmsReviewNamespaceOperation,
  assertSmsReviewNamespaceExplicitCommit,
  closeSmsReviewNamespaceLease,
  hasSmsReviewNamespacePin,
  invalidateSmsReviewNamespace,
  isSmsReviewNamespaceReceiptCurrent,
  observeSmsReviewNamespaceActor,
  publishSmsReviewNamespace,
  registerSmsReviewNamespaceLease,
  type OwnedSmsReviewQueueLease,
  type SmsReviewNamespaceDisposition,
} from "./sms-review-namespace-state";

async function assertActor(
  expectedUserId: string,
  signal?: AbortSignal
): Promise<void> {
  throwIfSmsReviewDraftOperationAborted(signal);
  const scope = await getCurrentUserDataScope();
  observeSmsReviewNamespaceActor(scope.userId);
  if (scope.userId !== expectedUserId)
    throw new Error("sms_review_namespace_owner_changed");
  await assertExpectedCurrentUser(expectedUserId);
  throwIfSmsReviewDraftOperationAborted(signal);
}

async function ownedQueue(ownerId: string): Promise<SmsReviewQueue | null> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId)
    throw new Error("sms_review_namespace_owner_changed");
  const queues = await scope
    .queryOwned(database.get<SmsReviewQueue>("sms_review_queues"))
    .fetch();
  if (queues.length > 1)
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.QUEUE_CONFLICT);
  return queues[0] ?? null;
}

async function ownedItemCount(
  ownerId: string,
  queueId: string
): Promise<number> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId)
    throw new Error("sms_review_namespace_owner_changed");
  return scope
    .queryOwned(
      database.get<SmsReviewDraftItem>("sms_review_draft_items"),
      Q.where("queue_id", queueId)
    )
    .fetchCount();
}

export async function pruneSmsReviewNamespaceInWriter(
  ownerId: string,
  queueId: string
): Promise<void> {
  await assertActor(ownerId);
  const queue = await ownedQueue(ownerId);
  if (!queue || queue.id !== queueId) return;
  const count = await ownedItemCount(ownerId, queueId);
  await assertActor(ownerId);
  if (count > 0 || hasSmsReviewNamespacePin(ownerId, queueId)) return;
  await commitScopedPreparedBatch(ownerId, [queue], () => [
    queue.prepareDestroyPermanently(),
  ]);
  invalidateSmsReviewNamespace(ownerId, queueId);
}

async function abandonFailedAcquire(
  lease: OwnedSmsReviewQueueLease
): Promise<void> {
  closeSmsReviewNamespaceLease(lease);
  try {
    await pruneSmsReviewNamespaceInWriter(lease.expectedUserId, lease.queueId);
  } catch (error: unknown) {
    reportSmsNamespaceCleanupFailure(error, "acquire");
    // Never clean a previous owner's local rows after an actor change. An
    // unpinned orphan is eligible for the next successful owned snapshot read.
  }
}

export async function acquireSmsReviewNamespaceInWriter(input: {
  readonly expectedUserId: string;
  readonly signal?: AbortSignal;
}): Promise<OwnedSmsReviewQueueLease> {
  canonicalUuid.parse(input.expectedUserId);
  await assertActor(input.expectedUserId, input.signal);
  const existing = await ownedQueue(input.expectedUserId);
  await assertActor(input.expectedUserId, input.signal);
  const queue =
    existing ??
    database
      .get<SmsReviewQueue>("sms_review_queues")
      .prepareCreate((record) => {
        record.userId = input.expectedUserId;
        record.updatedAt = new Date();
      });
  canonicalUuid.parse(queue.id);
  if (!existing) {
    await commitScopedPreparedBatch(input.expectedUserId, [], () => [queue], {
      signal: input.signal,
    });
  }
  const lease = registerSmsReviewNamespaceLease(input.expectedUserId, queue.id);
  try {
    await assertActor(input.expectedUserId, input.signal);
    return lease;
  } catch (error: unknown) {
    await abandonFailedAcquire(lease);
    throw error;
  }
}

export async function assertSmsReviewNamespaceInWriter(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly signal?: AbortSignal;
  readonly expectedReviewOperationGeneration?: AccountReviewSession["operationGeneration"];
}): Promise<void> {
  const { lease } = input;
  await assertActor(lease.expectedUserId, input.signal);
  assertSmsReviewNamespaceOperation(
    lease,
    input.expectedReviewOperationGeneration
  );
  const queue = await ownedQueue(lease.expectedUserId);
  await assertActor(lease.expectedUserId, input.signal);
  if (!queue || queue.id !== lease.queueId) {
    invalidateSmsReviewNamespace(lease.expectedUserId, lease.queueId);
    throw new Error("sms_review_namespace_replaced");
  }
  assertSmsReviewNamespaceOperation(
    lease,
    input.expectedReviewOperationGeneration
  );
}

async function canReleaseOwnedLease(
  lease: OwnedSmsReviewQueueLease
): Promise<boolean> {
  try {
    const scope = await getCurrentUserDataScope();
    observeSmsReviewNamespaceActor(scope.userId);
    if (scope.userId === lease.expectedUserId) {
      await assertExpectedCurrentUser(lease.expectedUserId);
      return true;
    }
  } catch (error: unknown) {
    observeSmsReviewNamespaceActor(null);
    reportSmsNamespaceCleanupFailure(error, "owner_change");
  }
  closeSmsReviewNamespaceLease(lease);
  return false;
}

async function releaseCurrentLease(
  lease: OwnedSmsReviewQueueLease,
  disposition: SmsReviewNamespaceDisposition
): Promise<void> {
  if (disposition === "published") {
    publishSmsReviewNamespace(lease);
    return;
  }
  if (disposition === "committed") {
    assertSmsReviewNamespaceExplicitCommit(lease);
    const count = await ownedItemCount(lease.expectedUserId, lease.queueId);
    await assertActor(lease.expectedUserId);
    if (count === 0) throw new Error("sms_review_namespace_not_committed");
    // Retire this explicitly committed caller's receipt only, never other
    // published results sharing the same owned queue.
    closeSmsReviewNamespaceLease(lease);
    return;
  }
  closeSmsReviewNamespaceLease(lease);
  await pruneSmsReviewNamespaceInWriter(lease.expectedUserId, lease.queueId);
}

async function releaseRetiredLease(
  lease: OwnedSmsReviewQueueLease,
  disposition: SmsReviewNamespaceDisposition
): Promise<void> {
  closeSmsReviewNamespaceLease(lease);
  if (disposition === "published")
    throw new Error("sms_review_namespace_stale");
  if (disposition === "cancelled" || disposition === "no_accepted_rows") {
    // Authenticated same-UUID, empty, unpinned cleanup remains safe even after
    // actor invalidation has already closed this operation's receipt.
    await pruneSmsReviewNamespaceInWriter(lease.expectedUserId, lease.queueId);
  }
}

export async function releaseSmsReviewNamespaceInWriter(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly disposition: SmsReviewNamespaceDisposition;
}): Promise<void> {
  const { lease, disposition } = input;
  if (!(await canReleaseOwnedLease(lease))) {
    if (disposition === "published")
      throw new Error("sms_review_namespace_stale");
    return;
  }
  const queue = await ownedQueue(lease.expectedUserId);
  await assertActor(lease.expectedUserId);
  if (
    !queue ||
    queue.id !== lease.queueId ||
    !isSmsReviewNamespaceReceiptCurrent(lease)
  ) {
    await releaseRetiredLease(lease, disposition);
    return;
  }
  await releaseCurrentLease(lease, disposition);
}

/** Explicit empty-review reset. It cannot remove an unconfirmed populated queue. */
export async function clearEmptySmsReviewNamespaceInWriter(
  ownerId: string,
  expectedQueueId: string,
  signal?: AbortSignal
): Promise<void> {
  await assertActor(ownerId, signal);
  const queue = await ownedQueue(ownerId);
  if (!queue || queue.id !== expectedQueueId) return;
  const count = await ownedItemCount(ownerId, expectedQueueId);
  await assertActor(ownerId, signal);
  if (count !== 0) return;
  await commitScopedPreparedBatch(
    ownerId,
    [queue],
    () => [queue.prepareDestroyPermanently()],
    { signal }
  );
  invalidateSmsReviewNamespace(ownerId, expectedQueueId);
}
