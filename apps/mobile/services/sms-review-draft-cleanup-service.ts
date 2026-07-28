import { deleteExpiredSmsReviewDrafts } from "./sms-review-draft-repository";
import { getCurrentUserDataScope } from "./user-data-access";

export const SMS_REVIEW_DRAFT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupSmsReviewDraftsInput {
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

export async function cleanupExpiredSmsReviewDrafts(
  input: CleanupSmsReviewDraftsInput = {}
): Promise<number> {
  if (input.signal?.aborted) return 0;
  const scope = await getCurrentUserDataScope();
  if (input.signal?.aborted) return 0;
  const now = input.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - SMS_REVIEW_DRAFT_RETENTION_DAYS * DAY_MS
  );
  const deletedCount = await deleteExpiredSmsReviewDrafts(
    scope.userId,
    cutoff,
    input.signal
  );
  return deletedCount;
}
