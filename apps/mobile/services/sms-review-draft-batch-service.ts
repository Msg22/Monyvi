import type { Model } from "@nozbe/watermelondb";

import { assertExpectedCurrentUser } from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";

interface CommitScopedPreparedBatchOptions {
  readonly signal?: AbortSignal;
}

export function throwIfSmsReviewDraftOperationAborted(
  signal?: AbortSignal
): void {
  if (!signal?.aborted) return;
  const error = new Error("SMS review draft operation was cancelled.");
  error.name = "AbortError";
  throw error;
}

export async function commitScopedPreparedBatch(
  expectedUserId: string,
  cachedModels: readonly Model[],
  prepareOperations: () => readonly Model[],
  options: CommitScopedPreparedBatchOptions = {}
): Promise<void> {
  throwIfSmsReviewDraftOperationAborted(options.signal);
  await assertExpectedCurrentUser(expectedUserId);
  throwIfSmsReviewDraftOperationAborted(options.signal);

  const snapshots = cachedModels.map((model) =>
    captureCachedModelSnapshot(model)
  );

  try {
    const operations = prepareOperations();
    if (operations.length === 0) return;
    await commitPreparedBatch(operations);
  } catch (error) {
    snapshots.forEach((snapshot) => restoreCachedModelSnapshot(snapshot));
    throw error;
  }
}
