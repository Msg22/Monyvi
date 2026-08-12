import { deleteExpiredSmsReviewDrafts } from "./sms-review-draft-repository";
import { getCurrentUserDataScope } from "./user-data-access";
import { getSmsReviewDraftExpiryCutoff } from "./sms-review-draft-retention";

export { SMS_REVIEW_DRAFT_RETENTION_DAYS } from "./sms-review-draft-retention";

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
  const cutoff = getSmsReviewDraftExpiryCutoff(input.now ?? new Date());
  const deletedCount = await deleteExpiredSmsReviewDrafts(
    scope.userId,
    cutoff,
    input.signal
  );
  return deletedCount;
}
