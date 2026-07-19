/**
 * WatermelonDB Sync Adapter for Supabase
 * Implements push/pull synchronization between local and cloud databases.
 *
 * Strategy: "Last Write Wins" - most recent updated_at timestamp wins conflicts.
 */

import type { Database } from "@nozbe/watermelondb";
import { synchronize, type SyncPullResult } from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import { pullChanges } from "./sync/pull-strategies";
import { pushChanges } from "./sync/push-service";
import { getCurrentUserId } from "./supabase";

// Module-level sync lock tracks in-flight sync to prevent concurrent synchronize() calls.
// If syncDatabase is called while one is already running, the second call returns it.
let activeSyncPromise: Promise<void> | null = null;

/**
 * Returns the currently in-flight sync promise, if any.
 * Used by the logout service to await an active sync before resetting the database.
 */
export function getActiveSyncPromise(): Promise<void> | null {
  return activeSyncPromise;
}

/**
 * Synchronize WatermelonDB with Supabase.
 * Call this after app start and periodically.
 *
 * @param database - The WatermelonDB database instance
 * @param forceFullSync - If true, ignores lastPulledAt and fetches all data (use after data clear)
 */
export async function syncDatabase(
  database: Database,
  forceFullSync = false
): Promise<void> {
  if (activeSyncPromise) {
    logger.debug("sync.alreadyInProgress");
    return activeSyncPromise;
  }

  activeSyncPromise = (async (): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) {
      logger.debug("sync.skippedUnauthenticated");
      return;
    }

    if (forceFullSync) {
      logger.info("sync.forceFullSyncRequested");
    }

    const doSync = async (): Promise<void> => {
      try {
        await synchronize({
          database,
          pullChanges: async ({ lastPulledAt }): Promise<SyncPullResult> => {
            const effectiveLastPulledAt = forceFullSync ? null : lastPulledAt;
            return pullChanges(effectiveLastPulledAt ?? null);
          },
          pushChanges: async ({ changes, lastPulledAt }) => {
            await pushChanges(database, { changes, lastPulledAt });
          },
          sendCreatedAsUpdated: true,
        });
        logger.debug("sync.completed");
      } catch (error) {
        const errorMessage = String(error);
        if (errorMessage.includes("Concurrent synchronization")) {
          logger.warn("sync.concurrentSyncAborted");
          return;
        }
        logger.error("sync.failed", error);
        throw error;
      }
    };

    await doSync();
  })().finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}

/**
 * Get the last sync timestamp.
 */
export function getLastSyncTimestamp(): number | null {
  return null;
}
