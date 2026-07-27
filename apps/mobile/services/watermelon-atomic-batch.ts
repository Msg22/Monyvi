import type { Model } from "@nozbe/watermelondb";
import { database } from "@monyvi/db";
import { logger } from "@/utils/logger";

/**
 * Commits prepared WatermelonDB models while preserving the adapter boundary.
 * WatermelonDB publishes cache changes and observer notifications after the
 * adapter transaction commits, so those post-commit failures must not be
 * exposed as retryable persistence failures.
 */
export async function commitPreparedBatch(
  operations: readonly Model[]
): Promise<void> {
  const adapter = database.adapter;
  // Keep the original method identity so the shared adapter is restored exactly.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAdapterBatch = adapter.batch;
  let hasAdapterCommitted = false;

  adapter.batch = async (batchOperations): Promise<void> => {
    await originalAdapterBatch.call(adapter, batchOperations);
    hasAdapterCommitted = true;
  };

  try {
    await database.batch([...operations]);
  } catch (error) {
    if (!hasAdapterCommitted) {
      throw error;
    }

    logger.error(
      "WatermelonDB cache publication failed after adapter commit",
      error
    );
  } finally {
    adapter.batch = originalAdapterBatch;
  }
}
