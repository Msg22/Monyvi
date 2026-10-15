/** Owned draft snapshot and pin-aware empty cleanup; no codec version changes. */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
} from "@monyvi/db";
import { Q, type Model } from "@nozbe/watermelondb";
import {
  decodeSmsReviewDraft,
  SmsReviewDraftCodecError,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";
import { commitScopedPreparedBatch } from "./sms-review-draft-batch-service";
import { pruneSmsReviewNamespaceInWriter } from "./sms-review-namespace-repository";
import {
  invalidateSmsReviewNamespace,
  observeSmsReviewNamespaceActor,
} from "./sms-review-namespace-state";

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

export function decodeSmsReviewReadItem(
  item: SmsReviewDraftItem
): SmsReviewDraftReadItem {
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

async function ownedRecords(ownerId: string): Promise<{
  readonly queue: SmsReviewQueue | null;
  readonly items: SmsReviewDraftItem[];
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
  const items = queue
    ? await scope
        .queryOwned(
          database.get<SmsReviewDraftItem>("sms_review_draft_items"),
          Q.where("queue_id", queue.id),
          Q.sortBy("position", Q.asc),
          Q.sortBy("created_at", Q.asc)
        )
        .fetch()
    : [];
  await assertExpectedCurrentUser(ownerId);
  return { queue, items };
}

function invalidRecord(record: SmsReviewDraftItem): boolean {
  try {
    decodeSmsReviewReadItem(record);
    return false;
  } catch (error: unknown) {
    if (error instanceof SmsReviewDraftCodecError) return true;
    throw error;
  }
}

async function removeInvalidItems(
  ownerId: string,
  invalid: readonly SmsReviewDraftItem[]
): Promise<void> {
  if (invalid.length === 0) return;
  await database.write(async (): Promise<void> => {
    await assertExpectedCurrentUser(ownerId);
    const { queue, items } = await ownedRecords(ownerId);
    const ids = new Set(invalid.map((item) => item.id));
    const currentInvalid = items.filter(
      (item) => ids.has(item.id) && invalidRecord(item)
    );
    const invalidIds = new Set(currentInvalid.map((item) => item.id));
    const removeQueue =
      queue !== null &&
      items.length > 0 &&
      items.every((item) => invalidIds.has(item.id));
    await commitScopedPreparedBatch(
      ownerId,
      [...currentInvalid, ...(queue ? [queue] : [])],
      () => {
        const operations: Model[] = currentInvalid.map((item) =>
          item.prepareDestroyPermanently()
        );
        if (removeQueue && queue)
          operations.push(queue.prepareDestroyPermanently());
        return operations;
      }
    );
    if (removeQueue && queue) invalidateSmsReviewNamespace(ownerId, queue.id);
  });
}

function decodeRecords(records: readonly SmsReviewDraftItem[]): {
  readonly items: SmsReviewDraftReadItem[];
  readonly invalid: SmsReviewDraftItem[];
} {
  const items: SmsReviewDraftReadItem[] = [];
  const invalid: SmsReviewDraftItem[] = [];
  for (const record of records) {
    try {
      items.push(decodeSmsReviewReadItem(record));
    } catch (error: unknown) {
      if (!(error instanceof SmsReviewDraftCodecError)) throw error;
      invalid.push(record);
    }
  }
  return { items, invalid };
}

export async function getSmsReviewDraftQueueSnapshot(
  expectedUserId: string
): Promise<SmsReviewQueueSnapshot | null> {
  const scope = await getCurrentUserDataScope();
  observeSmsReviewNamespaceActor(scope.userId);
  await assertExpectedCurrentUser(expectedUserId);
  if (scope.userId !== expectedUserId)
    throw new Error(SMS_REVIEW_DRAFT_ERROR_CODES.USER_SCOPE_CHANGED);
  const { queue, items: records } = await ownedRecords(expectedUserId);
  if (!queue) return null;
  const { items, invalid } = decodeRecords(records);
  await removeInvalidItems(expectedUserId, invalid);
  await assertExpectedCurrentUser(expectedUserId);
  if (items.length === 0) {
    await database.write(() =>
      pruneSmsReviewNamespaceInWriter(expectedUserId, queue.id)
    );
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
