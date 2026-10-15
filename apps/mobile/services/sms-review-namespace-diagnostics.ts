import { logger } from "@/utils/logger";

export type SmsNamespaceCleanupStage =
  | "acquire"
  | "assembly"
  | "abort"
  | "expiry"
  | "owner_change";

/** No error message, source text, queue/owner identifiers or provider data. */
export function reportSmsNamespaceCleanupFailure(
  error: unknown,
  stage: SmsNamespaceCleanupStage
): void {
  logger.warn("smsReview.namespaceCleanupFailed", {
    reasonCode: "sms_review_namespace_cleanup_failed",
    stage,
    failureKind:
      error instanceof Error && error.name === "AbortError"
        ? "aborted"
        : "failed",
  });
}
