/** #395 T048: physical SMS identity, deduplication and atomic-plan descriptors. */
import { Q, type Database } from "@nozbe/watermelondb";
import type {
  SmsReviewDraftItem,
  SmsReviewQueue,
  Transaction,
  Transfer,
} from "@monyvi/db";
import {
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraftV2,
  serializeCanonicalJsonValue,
  type Sha256Provider,
} from "@monyvi/logic";
import type { FinancialActionLinkedExistingOperation } from "./financial-action-foundation-contracts";
import type { CurrentUserDataScope } from "./user-data-access";
import type { FrozenReviewSave } from "./account-review-save-preparation";

type SmsRow = Extract<
  FrozenReviewSave["selectedRows"][number],
  { source: "SMS" }
>;
export interface PhysicalReviewDraft {
  readonly row: SmsRow;
  readonly draft: SmsReviewDraftItem;
  readonly queue: SmsReviewQueue;
}
export interface SmsSaveScope {
  readonly selected: readonly PhysicalReviewDraft[];
  readonly unsaved: readonly PhysicalReviewDraft[];
  readonly alreadySaved: readonly PhysicalReviewDraft[];
  readonly allOwned: readonly SmsReviewDraftItem[];
  readonly queue: SmsReviewQueue | null;
}
function reject(reason: string): never {
  throw new Error("account_review_sms_" + reason);
}

async function hasOwnedSavedFingerprint(
  db: Database,
  scope: CurrentUserDataScope,
  fingerprint: string
): Promise<boolean> {
  const conditions = [
    Q.where("sms_fingerprint", fingerprint),
    Q.where("deleted", false),
  ];
  const [transactions, transfers] = await Promise.all([
    scope
      .queryOwned(db.get<Transaction>("transactions"), ...conditions)
      .fetch(),
    scope.queryOwned(db.get<Transfer>("transfers"), ...conditions).fetch(),
  ]);
  return transactions.length > 0 || transfers.length > 0;
}

function assertPhysicalOriginal(
  row: SmsRow,
  draft: SmsReviewDraftItem,
  ownerId: string,
  sessionId: string,
  expectedSelected: boolean
): void {
  const decoded = decodeSmsReviewDraftPayload({
    version: draft.payloadVersion,
    json: draft.payloadJson,
    expectedFingerprint: row.sourceFingerprint,
    expectedOwnerId: ownerId,
    expectedSessionId: sessionId,
    selectionOverride: draft.selectionOverride,
  });
  if (
    !decoded.review ||
    decoded.review.row.rowId !== row.rowId ||
    decoded.review.row.revision !== row.revision ||
    JSON.stringify(decoded.transaction) !== JSON.stringify(row.transaction) ||
    decoded.review.row.selected !== expectedSelected
  )
    reject("stored_source_changed");
}

async function ownedQueue(
  db: Database,
  scope: CurrentUserDataScope,
  queueId: string
): Promise<SmsReviewQueue> {
  const queue = await db.get<SmsReviewQueue>("sms_review_queues").find(queueId);
  if (queue.userId !== scope.userId) reject("foreign_queue");
  return queue;
}

export async function inspectSmsForSave(
  db: Database,
  scope: CurrentUserDataScope,
  frozen: FrozenReviewSave
): Promise<SmsSaveScope> {
  if (frozen.intent.source === "VOICE") {
    return {
      selected: [],
      unsaved: [],
      alreadySaved: [],
      allOwned: [],
      queue: null,
    };
  }
  const items = await scope
    .queryOwned(db.get<SmsReviewDraftItem>("sms_review_draft_items"))
    .fetch();
  const selected: PhysicalReviewDraft[] = [];
  let queue: SmsReviewQueue | null = null;
  for (const original of frozen.selectedRows) {
    if (original.source !== "SMS") reject("mixed_source");
    const found = items.filter(
      (item) => item.smsFingerprint === original.sourceFingerprint
    );
    if (found.length !== 1 || !found[0]) reject("physical_draft_missing");
    const draft = found[0];
    const physicalQueue = await ownedQueue(db, scope, draft.queueId);
    if (queue && queue.id !== physicalQueue.id) reject("mixed_queue");
    queue = physicalQueue;
    assertPhysicalOriginal(
      original,
      draft,
      frozen.intent.ownerId,
      frozen.intent.sessionId,
      true
    );
    selected.push({ row: original, draft, queue: physicalQueue });
  }
  const checks = await Promise.all(
    selected.map(({ row }) =>
      hasOwnedSavedFingerprint(db, scope, row.sourceFingerprint)
    )
  );
  return {
    selected,
    unsaved: selected.filter((_item, i) => !checks[i]),
    alreadySaved: selected.filter((_item, i) => checks[i]),
    allOwned: items,
    queue,
  };
}

export async function smsPreimageHash(
  entry: PhysicalReviewDraft,
  provider: Sha256Provider
): Promise<string> {
  const { draft } = entry;
  return provider.digestUtf8(
    serializeCanonicalJsonValue({
      id: draft.id,
      queueId: draft.queueId,
      smsFingerprint: draft.smsFingerprint,
      payloadVersion: String(draft.payloadVersion),
      position: String(draft.position),
      selectionOverride: draft.selectionOverride,
      payloadJson: draft.payloadJson,
      parsedAt: draft.parsedAt.toISOString(),
    })
  );
}

export function reviewRemainingSiblingDrafts(
  frozen: FrozenReviewSave,
  sms: SmsSaveScope,
  createdGroupIds: ReadonlySet<string>
): readonly PhysicalReviewDraft[] {
  const queue = sms.queue;
  if (!queue) return [];
  const selectedIds = new Set(sms.selected.map((item) => item.draft.id));
  return frozen.session.rows.flatMap((row) => {
    if (
      row.selected ||
      row.source !== "SMS" ||
      row.assignment.state !== "suggested" ||
      !createdGroupIds.has(row.assignment.groupId)
    )
      return [];
    const candidates = sms.allOwned.filter(
      (draft) =>
        !selectedIds.has(draft.id) &&
        draft.queueId === queue.id &&
        draft.smsFingerprint === row.sourceFingerprint
    );
    if (candidates.length !== 1 || !candidates[0])
      reject("sibling_draft_changed");
    assertPhysicalOriginal(
      row,
      candidates[0],
      frozen.intent.ownerId,
      frozen.intent.sessionId,
      false
    );
    return [{ row, draft: candidates[0], queue }];
  });
}

export function rebindSiblingOperation(
  entry: PhysicalReviewDraft,
  accountId: string,
  currency: string,
  logicalSessionId: string
): FinancialActionLinkedExistingOperation {
  const original = decodeSmsReviewDraftPayload({
    version: entry.draft.payloadVersion,
    json: entry.draft.payloadJson,
    expectedFingerprint: entry.row.sourceFingerprint,
    expectedOwnerId: entry.queue.userId,
    expectedSessionId: logicalSessionId,
    selectionOverride: entry.draft.selectionOverride,
  });
  if (!original.review || original.review.row.source !== "SMS")
    reject("sibling_v2_required");
  const row = original.review.row;
  const transaction = { ...row.transaction, accountId };
  const review = {
    ...original.review,
    row: {
      ...row,
      transaction,
      assignment: {
        state: "existing" as const,
        accountId,
        origin: "user" as const,
        currency: row.transaction.currency,
        identityRevision: row.revision,
      },
    },
    groups: original.review.groups.filter(
      (group) =>
        group.groupId !==
        (row.assignment.state === "suggested" ? row.assignment.groupId : "")
    ),
  };
  if (currency !== transaction.currency) reject("sibling_currency_changed");
  const encoded = encodeSmsReviewDraftV2({ transaction, review });
  return {
    kind: "update",
    model: entry.draft,
    update: (model) => {
      if (model.id !== entry.draft.id) reject("sibling_identity_changed");
      entry.draft.payloadJson = encoded.json;
    },
  };
}

/**
 * Prove the CURRENT owned queue is wholly consumed by this financial Save.
 * Only this exact bounded case may add the original queue tombstone to the
 * foundation's already-atomic review action. A surviving/rebound/unselected
 * sibling keeps its queue, and the all-dedup action-free path never calls this.
 */
export function smsCleanupOperations(
  sms: SmsSaveScope
): readonly FinancialActionLinkedExistingOperation[] {
  if (!sms.queue) {
    if (sms.selected.length !== 0 || sms.allOwned.length !== 0 ||
        sms.unsaved.length !== 0 || sms.alreadySaved.length !== 0)
      reject("cleanup_queue_missing");
    return [];
  }
  const queue = sms.queue;
  if (queue._preparedState !== null || queue.userId.trim().length === 0)
    reject("cleanup_queue_not_original");
  const selectedIds = sms.selected.map(({ draft }) => draft.id);
  const selectedSet = new Set(selectedIds);
  if (selectedIds.length === 0 || selectedSet.size !== selectedIds.length)
    reject("cleanup_selected_membership");
  const ownedQueueItems = sms.allOwned.filter((draft) =>
    draft.queueId === queue.id
  );
  const allOwnedIds = new Set(sms.allOwned.map((draft) => draft.id));
  if (
    ownedQueueItems.length === 0 ||
    allOwnedIds.size !== sms.allOwned.length ||
    ownedQueueItems.length !== sms.allOwned.length ||
    sms.allOwned.some((draft) => draft.userId !== queue.userId) ||
    sms.selected.some(({ draft, queue: sourceQueue }) =>
      sourceQueue !== queue || draft.userId !== queue.userId ||
      draft.queueId !== queue.id || !allOwnedIds.has(draft.id)
    ) ||
    sms.unsaved.length + sms.alreadySaved.length !== sms.selected.length ||
    [...sms.unsaved, ...sms.alreadySaved].some((entry) =>
      !selectedSet.has(entry.draft.id)
    ) ||
    new Set([...sms.unsaved, ...sms.alreadySaved].map(
      ({ draft }) => draft.id
    )).size !== selectedSet.size
  )
    reject("cleanup_queue_membership_changed");
  const operations: FinancialActionLinkedExistingOperation[] =
    sms.selected.map(({ draft }) => ({
      kind: "markAsDeleted",
      model: draft,
    }));
  if (ownedQueueItems.every((draft) => selectedSet.has(draft.id))) {
    operations.push({ kind: "markAsDeleted", model: queue });
  }
  return operations;
}
