import type { Model } from "@nozbe/watermelondb";

import { assertExpectedCurrentUser } from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";

interface CommitScopedPreparedBatchOptions {
  readonly signal?: AbortSignal;
  readonly cachedModels?: readonly Model[];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("SMS review draft operation was cancelled.");
  error.name = "AbortError";
  throw error;
}

export async function commitScopedPreparedBatch(
  expectedUserId: string,
  prepareOperations: () => readonly Model[],
  options: CommitScopedPreparedBatchOptions = {}
): Promise<void> {
  throwIfAborted(options.signal);
  await assertExpectedCurrentUser(expectedUserId);
  throwIfAborted(options.signal);

  const snapshots = (options.cachedModels ?? []).map(
    captureCachedModelSnapshot
  );

  try {
    const operations = prepareOperations();
    if (operations.length === 0) return;
    await commitPreparedBatch(operations);
  } catch (error) {
    snapshots.forEach(restoreCachedModelSnapshot);
    throw error;
  }
}
