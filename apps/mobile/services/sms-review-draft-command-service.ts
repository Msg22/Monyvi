import type { ParsedSmsTransaction } from "@monyvi/logic";

import {
  discardAllSmsReviewDrafts,
  discardSmsReviewDraft,
  restoreSmsReviewDraft,
  type VolatileSmsReviewUndoItem,
  updateSmsReviewDraftItem,
  updateSmsReviewDraftSelection,
  updateSmsReviewDraftSelections,
} from "./sms-review-draft-repository";

const pendingDraftOperations = new Map<string, Promise<void>>();

function getDraftOperationKey(userId: string, draftId: string): string {
  return `${userId}:${draftId}`;
}

async function runDraftOperation<T>(
  userId: string,
  draftId: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = getDraftOperationKey(userId, draftId);
  const previous = pendingDraftOperations.get(key) ?? Promise.resolve();
  let releaseCurrent: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  pendingDraftOperations.set(key, current);

  await previous;
  try {
    return await operation();
  } finally {
    releaseCurrent?.();
    if (pendingDraftOperations.get(key) === current) {
      pendingDraftOperations.delete(key);
    }
  }
}

async function runDraftOperations<T>(
  userId: string,
  draftIds: readonly string[],
  operation: () => Promise<T>
): Promise<T> {
  const keys = [...new Set(draftIds)]
    .map((draftId) => getDraftOperationKey(userId, draftId))
    .sort();
  const locks = keys.map((key) => {
    const previous = pendingDraftOperations.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    pendingDraftOperations.set(key, current);
    return { current, key, previous, release };
  });

  await Promise.all(locks.map(({ previous }) => previous));
  try {
    return await operation();
  } finally {
    locks.forEach(({ current, key, release }) => {
      release?.();
      if (pendingDraftOperations.get(key) === current) {
        pendingDraftOperations.delete(key);
      }
    });
  }
}

export async function editSmsReviewDraft(
  draftId: string,
  userId: string,
  transaction: ParsedSmsTransaction
): Promise<void> {
  await runDraftOperation(userId, draftId, () =>
    updateSmsReviewDraftItem(draftId, userId, transaction)
  );
}

export async function setSmsReviewDraftSelection(
  draftId: string,
  userId: string,
  selectionOverride: boolean | null
): Promise<void> {
  await runDraftOperation(userId, draftId, () =>
    updateSmsReviewDraftSelection(draftId, userId, selectionOverride)
  );
}

export async function setSmsReviewDraftSelections(
  updates: ReadonlyArray<{
    readonly draftId: string;
    readonly selectionOverride: boolean | null;
  }>,
  userId: string
): Promise<void> {
  await runDraftOperations(
    userId,
    updates.map((update) => update.draftId),
    () => updateSmsReviewDraftSelections(updates, userId)
  );
}

export async function discardOneSmsReviewDraft(
  draftId: string,
  userId: string,
  expectedFingerprint?: string
): Promise<VolatileSmsReviewUndoItem> {
  return runDraftOperation(userId, draftId, () =>
    expectedFingerprint
      ? discardSmsReviewDraft(draftId, userId, expectedFingerprint)
      : discardSmsReviewDraft(draftId, userId)
  );
}

export async function undoSmsReviewDraftDiscard(
  undoItem: VolatileSmsReviewUndoItem
): Promise<boolean> {
  await runDraftOperation(undoItem.userId, undoItem.draftId, () =>
    restoreSmsReviewDraft(undoItem)
  );
  return true;
}

export async function discardEverySmsReviewDraft(
  userId: string,
  queueId: string,
  draftIds: readonly string[]
): Promise<number> {
  return runDraftOperations(userId, draftIds, () =>
    discardAllSmsReviewDrafts(userId, queueId, draftIds)
  );
}
