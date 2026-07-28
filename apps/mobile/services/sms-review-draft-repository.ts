import {
  database,
  DismissedSmsFingerprint,
  SmsReviewDraftItem,
  SmsReviewQueue,
  Transaction,
  Transfer,
} from "@monyvi/db";
import {
  decodeSmsReviewDraft,
  encodeSmsReviewDraft,
  SmsReviewDraftCodecError,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import { Q, type Collection, type Model } from "@nozbe/watermelondb";
import type { Observable } from "rxjs";

import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";

import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import {
  commitScopedPreparedBatch,
  throwIfSmsReviewDraftOperationAborted,
} from "./sms-review-draft-batch-service";
import { getSavedSmsReviewFingerprints } from "./sms-review-handled-fingerprint-service";

const QUEUE_TABLE = "sms_review_queues";
const ITEM_TABLE = "sms_review_draft_items";
const DISMISSED_TABLE = "dismissed_sms_fingerprints";

export { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";

export interface SmsReviewDraftReadItem {
  readonly draftId: string;
  readonly queueId: string;
  readonly transaction: ParsedSmsTransaction;
  readonly selectionOverride: boolean | null;
  readonly position: number;
  readonly parsedAt: Date;
  readonly updatedAt: Date;
}

export interface SmsReviewQueueSnapshot {
  readonly queueId: string;
  readonly userId: string;
  readonly items: readonly SmsReviewDraftReadItem[];
  readonly itemCount: number;
  readonly earliestParsedAt: Date;
  readonly latestUpdatedAt: Date;
}

export interface MergeSmsReviewDraftsInput {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly expectedUserId: string;
  readonly parsedAt?: Date;
  readonly baselineTransactions?: readonly ParsedSmsTransaction[];
}

export interface MergeSmsReviewDraftsResult {
  readonly insertedCount: number;
  readonly existingCount: number;
  readonly rejectedCount: number;
  readonly reviewableFingerprints: readonly string[];
}

export interface VolatileSmsReviewUndoItem {
  readonly draftId: string;
  readonly userId: string;
  readonly queueId: string;
  readonly smsFingerprint: string;
  readonly transaction: ParsedSmsTransaction;
  readonly selectionOverride: boolean | null;
  readonly position: number;
  readonly parsedAt: Date;
  readonly expiresAt: number;
}

function queueCollection(): Collection<SmsReviewQueue> {
  return database.get<SmsReviewQueue>(QUEUE_TABLE);
}

function itemCollection(): Collection<SmsReviewDraftItem> {
  return database.get<SmsReviewDraftItem>(ITEM_TABLE);
}

function dismissedCollection(): Collection<DismissedSmsFingerprint> {
  return database.get<DismissedSmsFingerprint>(DISMISSED_TABLE);
}

async function fetchOwnedQueues(userId: string): Promise<SmsReviewQueue[]> {
  return queueCollection().query(Q.where("user_id", userId)).fetch();
}

function assertSingleQueue(
  queues: readonly SmsReviewQueue[]
): SmsReviewQueue | null {
  if (queues.length > 1) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.QUEUE_CONFLICT);
  }
  return queues[0] ?? null;
}

async function fetchOwnedItems(
  userId: string,
  queueId?: string
): Promise<SmsReviewDraftItem[]> {
  const conditions = queueId ? [Q.where("queue_id", queueId)] : [];
  return itemCollection()
    .query(
      Q.where("user_id", userId),
      ...conditions,
      Q.sortBy("position", Q.asc),
      Q.sortBy("created_at", Q.asc)
    )
    .fetch();
}

async function fetchDismissedFingerprint(
  userId: string,
  smsFingerprint: string
): Promise<DismissedSmsFingerprint | null> {
  const records = await dismissedCollection()
    .query(
      Q.where("user_id", userId),
      Q.where("sms_fingerprint", smsFingerprint)
    )
    .fetch();
  return records[0] ?? null;
}

function decodeItem(item: SmsReviewDraftItem): SmsReviewDraftReadItem {
  return {
    draftId: item.id,
    queueId: item.queueId,
    transaction: decodeSmsReviewDraft({
      version: item.payloadVersion,
      json: item.payloadJson,
      expectedFingerprint: item.smsFingerprint,
    }),
    selectionOverride: item.selectionOverride ?? null,
    position: item.position,
    parsedAt: item.parsedAt,
    updatedAt: item.updatedAt,
  };
}

async function removeInvalidItems(
  userId: string,
  invalidItems: readonly SmsReviewDraftItem[]
): Promise<void> {
  if (invalidItems.length === 0) return;

  await assertExpectedCurrentUser(userId);
  await database.write(async (): Promise<void> => {
    await assertExpectedCurrentUser(userId);
    const queue = assertSingleQueue(await fetchOwnedQueues(userId));
    const allItems = await fetchOwnedItems(userId, queue?.id);
    const invalidIds = new Set(invalidItems.map((item) => item.id));
    const currentInvalidItems = allItems.filter((item) => {
      if (!invalidIds.has(item.id)) return false;
      try {
        decodeItem(item);
        return false;
      } catch (error) {
        if (error instanceof SmsReviewDraftCodecError) return true;
        throw error;
      }
    });
    const currentInvalidIds = new Set(
      currentInvalidItems.map((item) => item.id)
    );

    await commitScopedPreparedBatch(
      userId,
      [...currentInvalidItems, ...(queue ? [queue] : [])],
      (): readonly Model[] => {
        const operations: Model[] = currentInvalidItems.map((item) =>
          item.prepareDestroyPermanently()
        );
        if (
          queue &&
          allItems.length > 0 &&
          allItems.every((item) => currentInvalidIds.has(item.id))
        ) {
          operations.push(queue.prepareDestroyPermanently());
        }
        return operations;
      }
    );
  });
}

async function removeOwnedQueueIfEmpty(
  expectedUserId: string,
  expectedQueueId: string
): Promise<void> {
  await database.write(async (): Promise<void> => {
    const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
    if (!queue || queue.id !== expectedQueueId) return;
    const remaining = await fetchOwnedItems(expectedUserId, queue.id);
    if (remaining.length > 0) return;
    await commitScopedPreparedBatch(expectedUserId, [queue], () => [
      queue.prepareDestroyPermanently(),
    ]);
  });
}

export async function getSmsReviewDraftQueueSnapshot(
  expectedUserId: string
): Promise<SmsReviewQueueSnapshot | null> {
  const scope = await getCurrentUserDataScope();
  await assertExpectedCurrentUser(expectedUserId);
  if (scope.userId !== expectedUserId) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.USER_SCOPE_CHANGED);
  }
  const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
  await assertExpectedCurrentUser(expectedUserId);
  if (!queue) return null;
  const records = await fetchOwnedItems(expectedUserId, queue.id);
  const invalid: SmsReviewDraftItem[] = [];
  const items = records.flatMap((record) => {
    try {
      return [decodeItem(record)];
    } catch (error) {
      if (error instanceof SmsReviewDraftCodecError) {
        invalid.push(record);
        return [];
      }
      throw error;
    }
  });

  if (invalid.length > 0) await removeInvalidItems(expectedUserId, invalid);
  await assertExpectedCurrentUser(expectedUserId);
  if (items.length === 0) {
    await removeOwnedQueueIfEmpty(expectedUserId, queue.id);
    return null;
  }
  return {
    queueId: queue.id,
    userId: expectedUserId,
    items,
    itemCount: items.length,
    earliestParsedAt: new Date(
      Math.min(...items.map((item) => item.parsedAt.getTime()))
    ),
    latestUpdatedAt: new Date(
      Math.max(
        queue.updatedAt.getTime(),
        ...items.map((item) => item.updatedAt.getTime())
      )
    ),
  };
}

export async function getSmsReviewDraftCount(): Promise<number> {
  const scope = await getCurrentUserDataScope();
  return scope.queryOwned(itemCollection()).fetchCount();
}

export async function getHandledSmsReviewFingerprints(): Promise<
  ReadonlySet<string>
> {
  const scope = await getCurrentUserDataScope();
  const [activeItems, dismissedItems] = await Promise.all([
    scope.queryOwned(itemCollection()).fetch(),
    scope.queryOwned(dismissedCollection()).fetch(),
  ]);

  return new Set([
    ...activeItems.map((item) => item.smsFingerprint),
    ...dismissedItems.map((item) => item.smsFingerprint),
  ]);
}

export async function observeSmsReviewDraftChanges(
  expectedUserId: string
): Promise<Observable<SmsReviewDraftItem[]>> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== expectedUserId) {
    await assertExpectedCurrentUser(expectedUserId);
  }
  return scope
    .queryOwned(
      itemCollection(),
      Q.sortBy("position", Q.asc),
      Q.sortBy("created_at", Q.asc)
    )
    .observe();
}

export async function mergeSmsReviewDrafts(
  input: MergeSmsReviewDraftsInput
): Promise<MergeSmsReviewDraftsResult> {
  if (input.transactions.length === 0) {
    return {
      insertedCount: 0,
      existingCount: 0,
      rejectedCount: 0,
      reviewableFingerprints: [],
    };
  }

  const scope = await getCurrentUserDataScope();
  if (scope.userId !== input.expectedUserId) {
    await assertExpectedCurrentUser(input.expectedUserId);
  }

  const encoded: Array<{
    readonly transaction: ParsedSmsTransaction;
    readonly payload: ReturnType<typeof encodeSmsReviewDraft>;
  }> = [];
  let rejectedCount = 0;
  for (const transaction of input.transactions) {
    try {
      encoded.push({
        transaction,
        payload: encodeSmsReviewDraft(transaction),
      });
    } catch (error) {
      if (error instanceof SmsReviewDraftCodecError) {
        rejectedCount += 1;
        continue;
      }
      throw error;
    }
  }

  if (encoded.length === 0) {
    return {
      insertedCount: 0,
      existingCount: 0,
      rejectedCount,
      reviewableFingerprints: [],
    };
  }

  const baselinePayloads = new Map<
    string,
    ReturnType<typeof encodeSmsReviewDraft>
  >();
  for (const transaction of input.baselineTransactions ?? []) {
    try {
      baselinePayloads.set(
        transaction.smsFingerprint,
        encodeSmsReviewDraft(transaction)
      );
    } catch (error) {
      if (!(error instanceof SmsReviewDraftCodecError)) throw error;
    }
  }

  const parsedAt = input.parsedAt ?? new Date();
  return database.write(async (): Promise<MergeSmsReviewDraftsResult> => {
    await assertExpectedCurrentUser(input.expectedUserId);
    const queues = await fetchOwnedQueues(input.expectedUserId);
    const queue = assertSingleQueue(queues);
    const [existingItems, dismissedItems, savedTransactions, savedTransfers] =
      await Promise.all([
        fetchOwnedItems(input.expectedUserId, queue?.id),
        dismissedCollection()
          .query(Q.where("user_id", input.expectedUserId))
          .fetch(),
        scope
          .queryOwned(
            database.get<Transaction>("transactions"),
            Q.where("deleted", false)
          )
          .fetch(),
        scope
          .queryOwned(
            database.get<Transfer>("transfers"),
            Q.where("deleted", false)
          )
          .fetch(),
      ]);
    const existingFingerprints = new Set(
      existingItems.map((item) => item.smsFingerprint)
    );
    const existingItemsByFingerprint = new Map(
      existingItems.map((item) => [item.smsFingerprint, item])
    );
    const dismissedFingerprints = new Set(
      dismissedItems.map((item) => item.smsFingerprint)
    );
    const savedFingerprints = new Set(
      [...savedTransactions, ...savedTransfers]
        .map((record) => record.smsFingerprint)
        .filter((fingerprint): fingerprint is string => Boolean(fingerprint))
    );
    const uniqueEncoded = encoded.filter(
      ({ transaction }, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.transaction.smsFingerprint === transaction.smsFingerprint
        ) === index
    );
    const reviewableFingerprints = uniqueEncoded
      .map(({ transaction }) => transaction.smsFingerprint)
      .filter(
        (fingerprint) =>
          !dismissedFingerprints.has(fingerprint) &&
          !savedFingerprints.has(fingerprint)
      );
    const reviewableSet = new Set(reviewableFingerprints);
    const uniqueNew = uniqueEncoded.filter(
      ({ transaction }) =>
        reviewableSet.has(transaction.smsFingerprint) &&
        !existingFingerprints.has(transaction.smsFingerprint)
    );
    const refreshableExisting = uniqueEncoded.flatMap(
      ({ transaction, payload }) => {
        const existingItem = existingItemsByFingerprint.get(
          transaction.smsFingerprint
        );
        const baselinePayload = baselinePayloads.get(
          transaction.smsFingerprint
        );
        if (
          existingItem === undefined ||
          baselinePayload === undefined ||
          !reviewableSet.has(transaction.smsFingerprint) ||
          existingItem.selectionOverride !== null ||
          existingItem.payloadVersion !== baselinePayload.version ||
          existingItem.payloadJson !== baselinePayload.json ||
          (payload.version === baselinePayload.version &&
            payload.json === baselinePayload.json)
        ) {
          return [];
        }
        return [{ item: existingItem, payload }];
      }
    );

    if (uniqueNew.length === 0 && refreshableExisting.length === 0) {
      return {
        insertedCount: 0,
        existingCount: encoded.length,
        rejectedCount,
        reviewableFingerprints,
      };
    }

    const now = new Date();
    const nextPosition =
      existingItems.reduce((max, item) => Math.max(max, item.position), -1) + 1;
    await commitScopedPreparedBatch(
      input.expectedUserId,
      [
        ...(queue ? [queue] : []),
        ...refreshableExisting.map(({ item }) => item),
      ],
      (): readonly Model[] => {
        const operations: Model[] = [];
        const targetQueue =
          queue ??
          queueCollection().prepareCreate((record) => {
            record.userId = input.expectedUserId;
            record.updatedAt = now;
          });
        if (!queue) {
          operations.push(targetQueue);
        } else {
          operations.push(
            targetQueue.prepareUpdate((record) => {
              record.updatedAt = now;
            })
          );
        }

        refreshableExisting.forEach(({ item, payload }) => {
          operations.push(
            item.prepareUpdate((record) => {
              record.payloadVersion = payload.version;
              record.payloadJson = payload.json;
              record.updatedAt = now;
            })
          );
        });

        uniqueNew.forEach(({ transaction, payload }, index) => {
          operations.push(
            itemCollection().prepareCreate((record) => {
              record.queueId = targetQueue.id;
              record.userId = input.expectedUserId;
              record.smsFingerprint = transaction.smsFingerprint;
              record.payloadVersion = payload.version;
              record.payloadJson = payload.json;
              record.selectionOverride = null;
              record.position = nextPosition + index;
              record.parsedAt = parsedAt;
              record.updatedAt = now;
            })
          );
        });
        return operations;
      }
    );
    return {
      insertedCount: uniqueNew.length,
      existingCount: encoded.length - uniqueNew.length,
      rejectedCount,
      reviewableFingerprints,
    };
  });
}

export async function getOwnedSmsReviewDraftItem(
  draftId: string,
  expectedUserId: string
): Promise<SmsReviewDraftItem> {
  await assertExpectedCurrentUser(expectedUserId);
  const record = await itemCollection().find(draftId);
  if (record.userId !== expectedUserId) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.ITEM_NOT_FOUND);
  }
  return record;
}

export async function updateSmsReviewDraftItem(
  draftId: string,
  expectedUserId: string,
  transaction: ParsedSmsTransaction
): Promise<void> {
  const payload = encodeSmsReviewDraft(transaction);
  await database.write(async (): Promise<void> => {
    const record = await getOwnedSmsReviewDraftItem(draftId, expectedUserId);
    if (record.smsFingerprint !== transaction.smsFingerprint) {
      throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.TRANSITION_FAILED);
    }
    await commitScopedPreparedBatch(expectedUserId, [record], () => [
      record.prepareUpdate((draft) => {
        draft.payloadVersion = payload.version;
        draft.payloadJson = payload.json;
        draft.updatedAt = new Date();
      }),
    ]);
  });
}

export async function updateSmsReviewDraftSelection(
  draftId: string,
  expectedUserId: string,
  selectionOverride: boolean | null
): Promise<void> {
  await database.write(async (): Promise<void> => {
    const record = await getOwnedSmsReviewDraftItem(draftId, expectedUserId);
    await commitScopedPreparedBatch(expectedUserId, [record], () => [
      record.prepareUpdate((draft) => {
        draft.selectionOverride = selectionOverride;
        draft.updatedAt = new Date();
      }),
    ]);
  });
}

async function deleteSmsReviewDraftRecordsInWriter(
  records: readonly SmsReviewDraftItem[],
  expectedUserId: string,
  additionalOperations: readonly Model[] = []
): Promise<void> {
  const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
  const selectedIds = new Set(records.map((record) => record.id));
  const allItems = await fetchOwnedItems(expectedUserId, queue?.id);
  await commitScopedPreparedBatch(
    expectedUserId,
    [...records, ...(queue ? [queue] : [])],
    (): readonly Model[] => {
      const operations: Model[] = [
        ...additionalOperations,
        ...records.map((record) => record.prepareDestroyPermanently()),
      ];
      if (queue && allItems.every((item) => selectedIds.has(item.id))) {
        operations.push(queue.prepareDestroyPermanently());
      }
      return operations;
    }
  );
}

export async function deleteSmsReviewDraftsInWriter(
  draftIds: readonly string[],
  expectedUserId: string
): Promise<void> {
  await assertExpectedCurrentUser(expectedUserId);
  const records = await Promise.all(
    draftIds.map((draftId) =>
      getOwnedSmsReviewDraftItem(draftId, expectedUserId)
    )
  );
  await deleteSmsReviewDraftRecordsInWriter(records, expectedUserId);
}

export async function deleteResolvedSmsReviewDraftsInWriter(
  draftIds: readonly string[],
  expectedUserId: string,
  financialOperations: readonly Model[] = [],
  alreadySavedBeforePreparation: ReadonlySet<string> = new Set()
): Promise<void> {
  await assertExpectedCurrentUser(expectedUserId);
  const records = await Promise.all(
    draftIds.map((draftId) =>
      getOwnedSmsReviewDraftItem(draftId, expectedUserId)
    )
  );
  const savedFingerprints = await getSavedSmsReviewFingerprints(expectedUserId);
  if (
    records.some(
      (record) =>
        savedFingerprints.has(record.smsFingerprint) &&
        !alreadySavedBeforePreparation.has(record.smsFingerprint)
    )
  ) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.FINGERPRINT_ALREADY_SAVED);
  }
  await deleteSmsReviewDraftRecordsInWriter(
    records,
    expectedUserId,
    financialOperations
  );
}

export async function runSmsReviewDraftWriter<T>(
  action: () => Promise<T>
): Promise<T> {
  return database.write(action);
}

export async function discardSmsReviewDraft(
  draftId: string,
  expectedUserId: string,
  expiresAt: number
): Promise<VolatileSmsReviewUndoItem> {
  return database.write(async (): Promise<VolatileSmsReviewUndoItem> => {
    await assertExpectedCurrentUser(expectedUserId);
    const record = await getOwnedSmsReviewDraftItem(draftId, expectedUserId);
    const transaction = decodeItem(record).transaction;
    const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
    if (!queue || queue.id !== record.queueId) {
      throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.TRANSITION_FAILED);
    }

    const existingDismissed = await fetchDismissedFingerprint(
      expectedUserId,
      record.smsFingerprint
    );
    const allItems = await fetchOwnedItems(expectedUserId, queue.id);
    await commitScopedPreparedBatch(
      expectedUserId,
      [record, queue],
      (): readonly Model[] => {
        const operations: Model[] = [];
        if (!existingDismissed) {
          operations.push(
            dismissedCollection().prepareCreate((dismissed) => {
              dismissed.userId = expectedUserId;
              dismissed.smsFingerprint = record.smsFingerprint;
              dismissed.updatedAt = new Date();
            })
          );
        }
        operations.push(record.prepareDestroyPermanently());
        if (allItems.length === 1) {
          operations.push(queue.prepareDestroyPermanently());
        }
        return operations;
      }
    );

    return {
      draftId: record.id,
      userId: expectedUserId,
      queueId: queue.id,
      smsFingerprint: record.smsFingerprint,
      transaction,
      selectionOverride: record.selectionOverride ?? null,
      position: record.position,
      parsedAt: record.parsedAt,
      expiresAt,
    };
  });
}

export async function restoreSmsReviewDraft(
  undoItem: VolatileSmsReviewUndoItem
): Promise<void> {
  const payload = encodeSmsReviewDraft(undoItem.transaction);
  await database.write(async (): Promise<void> => {
    await assertExpectedCurrentUser(undoItem.userId);
    const active = await itemCollection()
      .query(
        Q.where("user_id", undoItem.userId),
        Q.where("sms_fingerprint", undoItem.smsFingerprint)
      )
      .fetch();
    const dismissed = await fetchDismissedFingerprint(
      undoItem.userId,
      undoItem.smsFingerprint
    );
    const savedFingerprints = await getSavedSmsReviewFingerprints(
      undoItem.userId
    );
    if (savedFingerprints.has(undoItem.smsFingerprint)) {
      const queue = assertSingleQueue(await fetchOwnedQueues(undoItem.userId));
      const allItems = await fetchOwnedItems(undoItem.userId, queue?.id);
      const activeIds = new Set(active.map((record) => record.id));
      await commitScopedPreparedBatch(
        undoItem.userId,
        [
          ...active,
          ...(dismissed ? [dismissed] : []),
          ...(queue ? [queue] : []),
        ],
        (): readonly Model[] => {
          const operations: Model[] = [
            ...active.map((record) => record.prepareDestroyPermanently()),
          ];
          if (dismissed) {
            operations.push(dismissed.prepareDestroyPermanently());
          }
          if (
            queue &&
            allItems.length > 0 &&
            allItems.every((record) => activeIds.has(record.id))
          ) {
            operations.push(queue.prepareDestroyPermanently());
          }
          return operations;
        }
      );
      return;
    }
    if (active.length > 0) {
      if (dismissed) {
        await commitScopedPreparedBatch(undoItem.userId, [dismissed], () => [
          dismissed.prepareDestroyPermanently(),
        ]);
      }
      return;
    }

    const existingQueue = assertSingleQueue(
      await fetchOwnedQueues(undoItem.userId)
    );
    const now = new Date();
    await commitScopedPreparedBatch(
      undoItem.userId,
      [
        ...(existingQueue ? [existingQueue] : []),
        ...(dismissed ? [dismissed] : []),
      ],
      (): readonly Model[] => {
        const queue =
          existingQueue ??
          queueCollection().prepareCreate((record) => {
            record.userId = undoItem.userId;
            record.updatedAt = now;
          });
        const operations: Model[] = [];
        if (!existingQueue) {
          operations.push(queue);
        } else {
          operations.push(
            queue.prepareUpdate((record) => {
              record.updatedAt = now;
            })
          );
        }
        operations.push(
          itemCollection().prepareCreate((record) => {
            record.queueId = queue.id;
            record.userId = undoItem.userId;
            record.smsFingerprint = undoItem.smsFingerprint;
            record.payloadVersion = payload.version;
            record.payloadJson = payload.json;
            record.selectionOverride = undoItem.selectionOverride;
            record.position = undoItem.position;
            record.parsedAt = undoItem.parsedAt;
            record.updatedAt = now;
          })
        );
        if (dismissed) {
          operations.push(dismissed.prepareDestroyPermanently());
        }
        return operations;
      }
    );
  });
}

export async function discardAllSmsReviewDrafts(
  expectedUserId: string
): Promise<number> {
  return database.write(async (): Promise<number> => {
    await assertExpectedCurrentUser(expectedUserId);
    const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
    if (!queue) return 0;
    const items = await fetchOwnedItems(expectedUserId, queue.id);
    if (items.length === 0) {
      await commitScopedPreparedBatch(expectedUserId, [queue], () => [
        queue.prepareDestroyPermanently(),
      ]);
      return 0;
    }

    const dismissed = await dismissedCollection()
      .query(Q.where("user_id", expectedUserId))
      .fetch();
    const dismissedSet = new Set(
      dismissed.map((record) => record.smsFingerprint)
    );
    const now = new Date();
    await commitScopedPreparedBatch(
      expectedUserId,
      [queue, ...items],
      (): readonly Model[] => {
        const operations: Model[] = items
          .filter((item) => !dismissedSet.has(item.smsFingerprint))
          .map((item) =>
            dismissedCollection().prepareCreate((record) => {
              record.userId = expectedUserId;
              record.smsFingerprint = item.smsFingerprint;
              record.updatedAt = now;
            })
          );
        operations.push(
          ...items.map((item) => item.prepareDestroyPermanently()),
          queue.prepareDestroyPermanently()
        );
        return operations;
      }
    );
    return items.length;
  });
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
    const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
    const [expired, allItems] = await Promise.all([
      itemCollection()
        .query(
          Q.where("user_id", expectedUserId),
          Q.where("parsed_at", Q.lte(cutoff.getTime()))
        )
        .fetch(),
      fetchOwnedItems(expectedUserId, queue?.id),
    ]);
    if (expired.length === 0) return 0;
    const expiredIds = new Set(expired.map((item) => item.id));
    await commitScopedPreparedBatch(
      expectedUserId,
      [...expired, ...(queue ? [queue] : [])],
      (): readonly Model[] => {
        const operations: Model[] = expired.map((item) =>
          item.prepareDestroyPermanently()
        );
        if (
          queue &&
          allItems.length > 0 &&
          allItems.every((item) => expiredIds.has(item.id))
        ) {
          operations.push(queue.prepareDestroyPermanently());
        }
        return operations;
      },
      { signal }
    );
    return expired.length;
  });
}
