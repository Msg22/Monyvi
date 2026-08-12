export const SMS_REVIEW_DRAFT_ERROR_CODES = {
  QUEUE_CONFLICT: "sms_review_draft_queue_conflict",
  CONFIRMATION_STALE: "sms_review_draft_confirmation_stale",
  ITEM_NOT_FOUND: "sms_review_draft_item_not_found",
  TRANSITION_FAILED: "sms_review_draft_transition_failed",
  USER_SCOPE_CHANGED: "sms_review_draft_user_scope_changed",
  FINGERPRINT_ALREADY_SAVED: "sms_review_draft_fingerprint_already_saved",
} as const;
