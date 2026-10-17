/** Owned draft snapshot and pin-aware empty cleanup; no codec version changes. */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import {
  decodeSmsReviewDraftPayload,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import { SMS_REVIEW_DRAFT_ERROR_CODES } from "./sms-review-draft-errors";
import { pruneSmsReviewNamespaceInWriter } from "./sms-review-namespace-repository";
import { observeSmsReviewNamespaceActor } from "./sms-review-namespace-state";

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
    transaction: decodeSmsReviewDraftPayload({
      version: item.payloadVersion,
      json: item.payloadJson,
      expectedFingerprint: item.smsFingerprint,
      expectedOwnerId: item.userId,
      expectedSessionId: item.queueId,
      selectionOverride: item.selectionOverride,
    }).transaction,
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
  // An unreadable V1/V2 draft is recoverable user data: never delete it here.
  const items = records.map(decodeSmsReviewReadItem);
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
