export const SMS_REVIEW_DRAFT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function getSmsReviewDraftExpiryCutoff(now: Date): Date {
  return new Date(now.getTime() - SMS_REVIEW_DRAFT_RETENTION_DAYS * DAY_MS);
}

export function isSmsReviewDraftExpired(
  parsedAt: Date,
  nowMs: number = Date.now()
): boolean {
  return parsedAt.getTime() <= nowMs - SMS_REVIEW_DRAFT_RETENTION_DAYS * DAY_MS;
}
