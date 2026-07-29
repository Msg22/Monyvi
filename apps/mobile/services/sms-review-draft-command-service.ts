import type { ParsedSmsTransaction } from "@monyvi/logic";

import {
  discardAllSmsReviewDrafts,
  discardSmsReviewDraft,
  restoreSmsReviewDraft,
  type VolatileSmsReviewUndoItem,
  updateSmsReviewDraftItem,
  updateSmsReviewDraftSelection,
} from "./sms-review-draft-repository";

export async function editSmsReviewDraft(
  draftId: string,
  userId: string,
  transaction: ParsedSmsTransaction
): Promise<void> {
  await updateSmsReviewDraftItem(draftId, userId, transaction);
}

export async function setSmsReviewDraftSelection(
  draftId: string,
  userId: string,
  selectionOverride: boolean | null
): Promise<void> {
  await updateSmsReviewDraftSelection(draftId, userId, selectionOverride);
}

export async function discardOneSmsReviewDraft(
  draftId: string,
  userId: string
): Promise<VolatileSmsReviewUndoItem> {
  return discardSmsReviewDraft(draftId, userId);
}

export async function undoSmsReviewDraftDiscard(
  undoItem: VolatileSmsReviewUndoItem
): Promise<boolean> {
  await restoreSmsReviewDraft(undoItem);
  return true;
}

export async function discardEverySmsReviewDraft(
  userId: string,
  queueId: string,
  draftIds: readonly string[]
): Promise<number> {
  return discardAllSmsReviewDrafts(userId, queueId, draftIds);
}
