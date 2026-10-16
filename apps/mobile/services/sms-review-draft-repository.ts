export { deleteExpiredSmsReviewDrafts } from "./sms-review-namespace-draft-expiry";
import { decodeSmsReviewReadItem as decodeItem } from "./sms-review-namespace-draft-snapshot";
export {
  getSmsReviewDraftQueueSnapshot,
  type SmsReviewDraftReadItem,
  type SmsReviewQueueSnapshot,
} from "./sms-review-namespace-draft-snapshot";
import {
  database,
  DismissedSmsFingerprint,
  SmsReviewDraftItem,
  SmsReviewQueue,
  Transaction,
  Transfer,
} from "@monyvi/db";
import {
  encodeSmsReviewDraft,
  SmsReviewDraftCodecError,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import { Q, type Collection, type Model } from "@nozbe/watermelondb";
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import type { Observable } from "rxjs";

import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";

import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import { commitScopedPreparedBatch } from "./sms-review-draft-batch-service";
import { mergePublishedSmsReviewDrafts } from "./account-review-command-publication";
import { getSavedSmsReviewFingerprints } from "./sms-review-handled-fingerprint-service";
import { getSmsReviewDraftItemsToShiftForRestore } from "./sms-review-draft-restore-position";
import { clearEmptySmsReviewNamespaceInWriter } from "./sms-review-namespace-repository";
import {
  assertSmsReviewNamespaceMerge,
  commitSmsReviewNamespacePublication,
  invalidateSmsReviewNamespace,
} from "./sms-review-namespace-state";

const QUEUE_TABLE = "sms_review_queues";
const ITEM_TABLE = "sms_review_draft_items";
const DISMISSED_TABLE = "dismissed_sms_fingerprints";

export { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";

export interface MergeSmsReviewDraftsInput {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly expectedUserId: string;
  readonly parsedAt?: Date;
  readonly baselineTransactions?: readonly ParsedSmsTransaction[];
  /** The EXACT published canonical session object, never caller-composed data. */
  readonly reviewSession?: AccountReviewSession;
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

export async function getSmsReviewDraftCount(): Promise<number> {
  const scope = await getCurrentUserDataScope();
  return scope.queryOwned(itemCollection()).fetchCount();
}

export async function getHandledSmsReviewFingerprints(
  expectedUserId: string
): Promise<ReadonlySet<string>> {
  await assertExpectedCurrentUser(expectedUserId);
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== expectedUserId) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.USER_SCOPE_CHANGED);
  }
  const [activeItems, dismissedItems] = await Promise.all([
    scope.queryOwned(itemCollection()).fetch(),
    scope.queryOwned(dismissedCollection()).fetch(),
  ]);
  await assertExpectedCurrentUser(expectedUserId);

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

/** Reconcile only this writer's submitted objects, never a queue-wide receipt. */
function settleSubmittedSmsReviewCandidates(
  ownerId: string,
  queueId: string,
  transactions: readonly ParsedSmsTransaction[],
  admittedTransactions: ReadonlySet<ParsedSmsTransaction>,
  representedFingerprints: ReadonlySet<string>,
  handledFingerprints: ReadonlySet<string>
): void {
  const admitted: ParsedSmsTransaction[] = [];
  const terminal: ParsedSmsTransaction[] = [];
  for (const transaction of transactions) {
    const fingerprint = transaction.smsFingerprint;
    if (admittedTransactions.has(transaction)) admitted.push(transaction);
    else if (
      representedFingerprints.has(fingerprint) ||
      handledFingerprints.has(fingerprint)
    )
      terminal.push(transaction);
  }
  commitSmsReviewNamespacePublication(ownerId, queueId, admitted, terminal);
}

export async function mergeSmsReviewDrafts(
  input: MergeSmsReviewDraftsInput
): Promise<MergeSmsReviewDraftsResult> {
  if (input.reviewSession !== undefined) {
    return mergePublishedSmsReviewDrafts(input, input.reviewSession);
  }
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
    assertSmsReviewNamespaceMerge(
      input.expectedUserId,
      queue?.id ?? null,
      input.transactions
    );
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
    const handledFingerprints = new Set([
      ...dismissedFingerprints,
      ...savedFingerprints,
    ]);
    const submitted = encoded.map(({ transaction }) => transaction);
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
          existingItem.payloadVersion !== baselinePayload.version ||
          existingItem.payloadJson !== baselinePayload.json ||
          (payload.version === baselinePayload.version &&
            payload.json === baselinePayload.json)
        ) {
          return [];
        }
        return [{ item: existingItem, payload, transaction }];
      }
    );

    if (uniqueNew.length === 0 && refreshableExisting.length === 0) {
      await assertExpectedCurrentUser(input.expectedUserId);
      assertSmsReviewNamespaceMerge(
        input.expectedUserId,
        queue?.id ?? null,
        input.transactions
      );
      if (queue) {
        settleSubmittedSmsReviewCandidates(
          input.expectedUserId,
          queue.id,
          submitted,
          new Set<ParsedSmsTransaction>(),
          existingFingerprints,
          handledFingerprints
        );
      }
      return {
        insertedCount: 0,
        existingCount: encoded.length,
        rejectedCount,
        reviewableFingerprints,
      };
    }

    assertSmsReviewNamespaceMerge(
      input.expectedUserId,
      queue?.id ?? null,
      input.transactions
    );
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
        // Last synchronous lineage admission after the scoped async auth guard.
        assertSmsReviewNamespaceMerge(
          input.expectedUserId,
          queue?.id ?? null,
          input.transactions
        );
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
    await assertExpectedCurrentUser(input.expectedUserId);
    if (queue) {
      const admitted = new Set([
        ...uniqueNew.map(({ transaction }) => transaction),
        ...refreshableExisting.map(({ transaction }) => transaction),
      ]);
      // Only AFTER the atomic batch succeeds, all exact submitted objects
      // represented by its new/updated draft fingerprints are terminally
      // handled. Unsubmitted siblings sharing a fingerprint remain cancellable.
      const representedFingerprints = new Set([
        ...existingFingerprints,
        ...[...admitted].map((transaction) => transaction.smsFingerprint),
      ]);
      settleSubmittedSmsReviewCandidates(
        input.expectedUserId,
        queue.id,
        submitted,
        admitted,
        representedFingerprints,
        handledFingerprints
      );
    }
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

export interface SmsReviewDraftSelectionUpdate {
  readonly draftId: string;
  readonly selectionOverride: boolean | null;
}

export async function updateSmsReviewDraftSelections(
  updates: readonly SmsReviewDraftSelectionUpdate[],
  expectedUserId: string
): Promise<void> {
  const updatesByDraftId = new Map(
    updates.map((update) => [update.draftId, update.selectionOverride] as const)
  );
  if (updatesByDraftId.size === 0) return;

  await database.write(async (): Promise<void> => {
    const records = await Promise.all(
      [...updatesByDraftId.keys()].map((draftId) =>
        getOwnedSmsReviewDraftItem(draftId, expectedUserId)
      )
    );
    const updatedAt = new Date();
    await commitScopedPreparedBatch(expectedUserId, records, () =>
      records.map((record) =>
        record.prepareUpdate((draft) => {
          draft.selectionOverride = updatesByDraftId.get(record.id) ?? null;
          draft.updatedAt = updatedAt;
        })
      )
    );
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
  if (queue && allItems.every((item) => selectedIds.has(item.id))) {
    invalidateSmsReviewNamespace(expectedUserId, queue.id);
  }
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
  expectedFingerprint?: string
): Promise<VolatileSmsReviewUndoItem> {
  return database.write(async (): Promise<VolatileSmsReviewUndoItem> => {
    await assertExpectedCurrentUser(expectedUserId);
    const matchingRecords = expectedFingerprint
      ? await itemCollection()
          .query(
            Q.where("user_id", expectedUserId),
            Q.where("sms_fingerprint", expectedFingerprint)
          )
          .fetch()
      : [await getOwnedSmsReviewDraftItem(draftId, expectedUserId)];
    const record = matchingRecords[0];
    if (matchingRecords.length !== 1 || !record) {
      throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.ITEM_NOT_FOUND);
    }
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
    if (allItems.length === 1)
      invalidateSmsReviewNamespace(expectedUserId, queue.id);

    return {
      draftId: record.id,
      userId: expectedUserId,
      queueId: queue.id,
      smsFingerprint: record.smsFingerprint,
      transaction,
      selectionOverride: record.selectionOverride ?? null,
      position: record.position,
      parsedAt: record.parsedAt,
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
      if (
        queue &&
        allItems.length > 0 &&
        allItems.every((record) => activeIds.has(record.id))
      ) {
        invalidateSmsReviewNamespace(undoItem.userId, queue.id);
      }
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
    const existingItems = existingQueue
      ? await fetchOwnedItems(undoItem.userId, existingQueue.id)
      : [];
    const shiftedItems = getSmsReviewDraftItemsToShiftForRestore(
      existingItems,
      undoItem.position
    );
    const now = new Date();
    await commitScopedPreparedBatch(
      undoItem.userId,
      [
        ...(existingQueue ? [existingQueue] : []),
        ...shiftedItems,
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
        shiftedItems.forEach((item) => {
          operations.push(
            item.prepareUpdate((record) => {
              record.position += 1;
              record.updatedAt = now;
            })
          );
        });
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
  expectedUserId: string,
  expectedQueueId: string,
  confirmedDraftIds: readonly string[]
): Promise<number> {
  const confirmedDraftIdSet = new Set(confirmedDraftIds);
  if (confirmedDraftIdSet.size !== confirmedDraftIds.length) {
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.CONFIRMATION_STALE);
  }
  if (confirmedDraftIds.length === 0) {
    return database.write(async (): Promise<number> => {
      await clearEmptySmsReviewNamespaceInWriter(
        expectedUserId,
        expectedQueueId
      );
      return 0;
    });
  }

  return database.write(async (): Promise<number> => {
    await assertExpectedCurrentUser(expectedUserId);
    const queue = assertSingleQueue(await fetchOwnedQueues(expectedUserId));
    if (!queue || queue.id !== expectedQueueId) {
      throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.CONFIRMATION_STALE);
    }
    const allItems = await fetchOwnedItems(expectedUserId, queue.id);
    const confirmedItems = allItems.filter((item) =>
      confirmedDraftIdSet.has(item.id)
    );
    if (confirmedItems.length !== confirmedDraftIds.length) {
      throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.CONFIRMATION_STALE);
    }
    const hasRemainingItems = allItems.length > confirmedItems.length;

    const dismissed = await dismissedCollection()
      .query(Q.where("user_id", expectedUserId))
      .fetch();
    const dismissedSet = new Set(
      dismissed.map((record) => record.smsFingerprint)
    );
    const now = new Date();
    await commitScopedPreparedBatch(
      expectedUserId,
      [queue, ...confirmedItems],
      (): readonly Model[] => {
        const operations: Model[] = confirmedItems
          .filter((item) => !dismissedSet.has(item.smsFingerprint))
          .map((item) =>
            dismissedCollection().prepareCreate((record) => {
              record.userId = expectedUserId;
              record.smsFingerprint = item.smsFingerprint;
              record.updatedAt = now;
            })
          );
        operations.push(
          ...confirmedItems.map((item) => item.prepareDestroyPermanently())
        );
        if (!hasRemainingItems)
          operations.push(queue.prepareDestroyPermanently());
        return operations;
      }
    );
    if (!hasRemainingItems)
      invalidateSmsReviewNamespace(expectedUserId, queue.id);
    return confirmedItems.length;
  });
}
