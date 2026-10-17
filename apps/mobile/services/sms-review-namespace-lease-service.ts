import { database } from "@monyvi/db";
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import { assertExpectedCurrentUser } from "./user-data-access";
import { throwIfSmsReviewDraftOperationAborted } from "./sms-review-draft-batch-service";
import {
  acquireSmsReviewNamespaceInWriter,
  assertSmsReviewNamespaceInWriter,
  releaseSmsReviewNamespaceInWriter,
  pruneSmsReviewNamespaceInWriter,
} from "./sms-review-namespace-repository";
import {
  assertSmsReviewNamespaceOperation,
  attachSmsReviewNamespaceAbortCleanup,
  closeSmsReviewNamespaceLease,
  type OwnedSmsReviewQueueLease,
  type SmsReviewNamespaceDisposition,
} from "./sms-review-namespace-state";
import { retainSmsReviewNamespaceLifetime } from "./sms-review-namespace-lifetime";
import { reportSmsNamespaceCleanupFailure } from "./sms-review-namespace-diagnostics";

export type { OwnedSmsReviewQueueLease } from "./sms-review-namespace-state";

function bindAbort(
  lease: OwnedSmsReviewQueueLease,
  signal?: AbortSignal
): void {
  if (!signal) return;
  const abort = (): void => {
    // Revoke authority synchronously, including after parser publication.
    closeSmsReviewNamespaceLease(lease);
    void database
      .write(() =>
        pruneSmsReviewNamespaceInWriter(lease.expectedUserId, lease.queueId)
      )
      .catch((error: unknown) =>
        reportSmsNamespaceCleanupFailure(error, "abort")
      );
  };
  signal.addEventListener("abort", abort, { once: true });
  attachSmsReviewNamespaceAbortCleanup(lease, () =>
    signal.removeEventListener("abort", abort)
  );
  if (signal.aborted) abort();
}

/** Cheap hash guard: auth + in-memory receipt/epoch, no SQLite writer/query. */
export async function assertSmsReviewNamespaceHashCurrent(
  lease: OwnedSmsReviewQueueLease
): Promise<void> {
  assertSmsReviewNamespaceOperation(lease);
  await assertExpectedCurrentUser(lease.expectedUserId);
  assertSmsReviewNamespaceOperation(lease);
}

export async function acquireOwnedSmsReviewQueueNamespace(input: {
  readonly expectedUserId: AccountReviewSession["ownerId"];
  readonly signal?: AbortSignal;
}): Promise<OwnedSmsReviewQueueLease> {
  const lease = await database.write(() =>
    acquireSmsReviewNamespaceInWriter(input)
  );
  try {
    retainSmsReviewNamespaceLifetime(lease);
    bindAbort(lease, input.signal);
    await assertOwnedSmsReviewQueueNamespaceCurrent({
      lease,
      signal: input.signal,
    });
    return lease;
  } catch (error: unknown) {
    try {
      await releaseOwnedSmsReviewQueueNamespace({
        lease,
        disposition: "cancelled",
      });
    } catch (cleanup: unknown) {
      reportSmsNamespaceCleanupFailure(cleanup, "acquire");
    }
    throw error;
  }
}

export function assertOwnedSmsReviewQueueNamespaceCurrent(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly signal?: AbortSignal;
  readonly expectedReviewOperationGeneration?: AccountReviewSession["operationGeneration"];
}): Promise<void> {
  throwIfSmsReviewDraftOperationAborted(input.signal);
  return database.write(() => assertSmsReviewNamespaceInWriter(input));
}

export function releaseOwnedSmsReviewQueueNamespace(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly disposition: SmsReviewNamespaceDisposition;
}): Promise<void> {
  return database.write(() => releaseSmsReviewNamespaceInWriter(input));
}
