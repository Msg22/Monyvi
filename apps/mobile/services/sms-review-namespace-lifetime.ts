/** One scoped auth subscription and one retention timer per active namespace. */
import { database } from "@monyvi/db";
import { subscribeToCoordinatedAuthStateChange } from "./supabase";
import { SMS_REVIEW_DRAFT_RETENTION_DAYS } from "./sms-review-draft-retention";
import { pruneSmsReviewNamespaceInWriter } from "./sms-review-namespace-repository";
import { reportSmsNamespaceCleanupFailure } from "./sms-review-namespace-diagnostics";
import {
  installSmsReviewNamespaceLifetime,
  invalidateSmsReviewNamespace,
  observeSmsReviewNamespaceActor,
  type OwnedSmsReviewQueueLease,
} from "./sms-review-namespace-state";

const RETENTION_MS = SMS_REVIEW_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

interface UnrefTimer {
  unref(): unknown;
}

function isUnrefTimer(timer: unknown): timer is UnrefTimer {
  return (
    typeof timer === "object" &&
    timer !== null &&
    "unref" in timer &&
    typeof timer.unref === "function"
  );
}

function allowNodeTestExit(timer: unknown): void {
  if (isUnrefTimer(timer)) timer.unref();
}

function beginRetentionTimer(lease: OwnedSmsReviewQueueLease): () => void {
  const deadline = Date.now() + RETENTION_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      timer = setTimeout(tick, Math.min(remaining, MAX_TIMER_DELAY_MS));
      allowNodeTestExit(timer);
      return;
    }
    invalidateSmsReviewNamespace(lease.expectedUserId, lease.queueId);
    void database
      .write(() =>
        pruneSmsReviewNamespaceInWriter(lease.expectedUserId, lease.queueId)
      )
      .catch((error: unknown) =>
        reportSmsNamespaceCleanupFailure(error, "expiry")
      );
  };
  tick();
  return (): void => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}

export function retainSmsReviewNamespaceLifetime(
  lease: OwnedSmsReviewQueueLease
): void {
  installSmsReviewNamespaceLifetime(lease, () => {
    const stopTimer = beginRetentionTimer(lease);
    try {
      const {
        data: { subscription },
      } = subscribeToCoordinatedAuthStateChange((event, session): void => {
        if (event === "SIGNED_OUT") {
          invalidateSmsReviewNamespace(lease.expectedUserId, lease.queueId);
        } else observeSmsReviewNamespaceActor(session?.user.id ?? null);
        // No DB work inside the auth callback or under a foreign actor.
        // An unpinned empty orphan is pruned on that owner's next scoped read.
      });
      return (): void => {
        stopTimer();
        subscription.unsubscribe();
      };
    } catch (error: unknown) {
      stopTimer();
      throw error;
    }
  });
}
