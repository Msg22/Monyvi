/** Existing draft-retention policy plus revocation of an expired empty namespace. */
import {
  database,
  type SmsReviewQueue,
  type SmsReviewDraftItem,
} from "@monyvi/db";
import { Q, type Model } from "@nozbe/watermelondb";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import {
  commitScopedPreparedBatch,
  throwIfSmsReviewDraftOperationAborted,
} from "./sms-review-draft-batch-service";

import { invalidateSmsReviewNamespace } from "./sms-review-namespace-state";
import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";
import { prepareAccountReviewPrivateLifecycle } from "./account-review-retention-lifecycle";

async function readExpiryRows(
  ownerId: string,
  cutoff: Date
): Promise<{
  readonly queue: SmsReviewQueue | null;
  readonly expired: SmsReviewDraftItem[];
  readonly allItems: SmsReviewDraftItem[];
}> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId)
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.USER_SCOPE_CHANGED);
  const queues = await scope
    .queryOwned(database.get<SmsReviewQueue>("sms_review_queues"))
    .fetch();
  if (queues.length > 1)
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.QUEUE_CONFLICT);
  const queue = queues[0] ?? null;
  const collection = database.get<SmsReviewDraftItem>("sms_review_draft_items");
  const [expired, allItems] = await Promise.all([
    scope
      .queryOwned(collection, Q.where("parsed_at", Q.lte(cutoff.getTime())))
      .fetch(),
    scope
      .queryOwned(collection, ...(queue ? [Q.where("queue_id", queue.id)] : []))
      .fetch(),
  ]);
  return { queue, expired, allItems };
}

async function clearExpiredEmptyQueue(
  ownerId: string,
  queue: SmsReviewQueue | null,
  allItems: readonly SmsReviewDraftItem[],
  cutoff: Date,
  signal?: AbortSignal
): Promise<void> {
  const removeQueue = queue !== null && allItems.length === 0 &&
    queue.updatedAt.getTime() <= cutoff.getTime();
  const privateRoots = await prepareAccountReviewPrivateLifecycle({
    database, ownerId, kind: "expire", cutoff,
  });
  if (!removeQueue && privateRoots.cachedRoots.length === 0) return;
  throwIfSmsReviewDraftOperationAborted(signal);
  await commitScopedPreparedBatch(
    ownerId,
    [...privateRoots.cachedRoots, ...(removeQueue && queue ? [queue] : [])],
    () => [
      ...privateRoots.prepareOperations(),
      ...(removeQueue && queue ? [queue.prepareDestroyPermanently()] : []),
    ],
    { signal }
  );
  if (removeQueue && queue) invalidateSmsReviewNamespace(ownerId, queue.id);
}

async function removeExpiredRowsInWriter(
  ownerId: string,
  rows: Awaited<ReturnType<typeof readExpiryRows>>,
  cutoff: Date,
  signal?: AbortSignal
): Promise<number> {
  const { queue, expired, allItems } = rows;
  const ids = new Set(expired.map((item) => item.id));
  const removeQueue =
    queue !== null &&
    allItems.length > 0 &&
    allItems.every((item) => ids.has(item.id));
  const privateRoots = await prepareAccountReviewPrivateLifecycle({
    database, ownerId, kind: "expire", cutoff,
  });
  await commitScopedPreparedBatch(
    ownerId,
    [...expired, ...(queue ? [queue] : []), ...privateRoots.cachedRoots],
    () => {
      const operations: Model[] = [
        ...privateRoots.prepareOperations(),
        ...expired.map((item) => item.prepareDestroyPermanently()),
      ];
      if (removeQueue && queue)
        operations.push(queue.prepareDestroyPermanently());
      return operations;
    },
    { signal }
  );
  if (removeQueue && queue) invalidateSmsReviewNamespace(ownerId, queue.id);
  return expired.length;
}

export async function deleteExpiredSmsReviewDrafts(
  expectedUserId: string,
  cutoff: Date,
  signal?: AbortSignal
): Promise<number> {
  throwIfSmsReviewDraftOperationAborted(signal);
  return database.write(async (): Promise<number> => {
    await assertExpectedCurrentUser(expectedUserId);
    throwIfSmsReviewDraftOperationAborted(signal);
    const rows = await readExpiryRows(expectedUserId, cutoff);
    if (rows.expired.length === 0) {
      await clearExpiredEmptyQueue(
        expectedUserId,
        rows.queue,
        rows.allItems,
        cutoff,
        signal
      );
      return 0;
    }
    return removeExpiredRowsInWriter(expectedUserId, rows, cutoff, signal);
  });
}
