/**
 * WatermelonDB Sync Adapter for Supabase
 * Implements push/pull synchronization between local and cloud databases.
 *
 * Strategy: "Last Write Wins" - most recent updated_at timestamp wins conflicts.
 */

import type { Database } from "@nozbe/watermelondb";
import { synchronize, type SyncPullResult } from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import { pullChanges } from "./sync/atomic-pull-strategies";
import { hasOwnedUnresolvedFinancialActions } from "./sync/financial-pull-shaping";
import {
  isHistoricalRecoveryRequired,
  markHistoricalRecoveryComplete,
} from "./sync/historical-recovery";
import { pushChanges } from "./sync/push-service";
import { getCurrentUserId } from "./supabase";
import { repairLegacyMetalAdds } from "./legacy-metal-add-repair-service";
import { repairLegacyMetalEdits } from "./legacy-metal-edit-repair-service";

export const SYNC_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_auth_scope_lost",
  LEGACY_METAL_CHAIN_UNSAFE: "sync_legacy_metal_chain_unsafe",
} as const;

const SYNC_OWNER_LOCAL_KEY = "__monyvi_sync_owner_user_id";

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

async function assertExpectedSyncUser(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error(SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
  }
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

    const persistedSyncOwner =
      await database.adapter.getLocal(SYNC_OWNER_LOCAL_KEY);
    const historicalRecoveryRequired = await isHistoricalRecoveryRequired(
      database,
      userId
    );
    const shouldForceFullSync =
      forceFullSync ||
      persistedSyncOwner !== userId ||
      historicalRecoveryRequired;

    if (shouldForceFullSync) {
      logger.info("sync.forceFullSyncRequested");
    }

    const doSync = async (): Promise<void> => {
      try {
        const addRepair = await repairLegacyMetalAdds(database, userId);
        for (const skip of addRepair.skipped) {
          logger.warn("sync.legacyMetalAddRepairSkipped", {
            actionId: skip.actionId,
            reason: skip.reason,
          });
        }
        if (addRepair.skipped.some((skip) => skip.reason === "superseded")) {
          throw new Error(SYNC_ERROR_CODES.LEGACY_METAL_CHAIN_UNSAFE);
        }
        const editRepair = await repairLegacyMetalEdits(database, userId);
        for (const skip of editRepair.skipped) {
          logger.warn("sync.legacyMetalEditRepairSkipped", {
            actionId: skip.actionId,
            reason: skip.reason,
          });
        }
        // Withheld canonical evidence requires another complete pull after resolution.
        const hadUnresolvedFinancialActions =
          historicalRecoveryRequired &&
          (await hasOwnedUnresolvedFinancialActions(database, userId));
        await synchronize({
          database,
          pullChanges: async ({ lastPulledAt }): Promise<SyncPullResult> => {
            const effectiveLastPulledAt = shouldForceFullSync
              ? null
              : lastPulledAt;
            return pullChanges(effectiveLastPulledAt ?? null, userId, database);
          },
          pushChanges: ({ changes, lastPulledAt }) =>
            pushChanges(database, { changes, lastPulledAt }, userId),
          sendCreatedAsUpdated: true,
        });
        await assertExpectedSyncUser(userId);
        await database.adapter.setLocal(SYNC_OWNER_LOCAL_KEY, userId);
        await assertExpectedSyncUser(userId);
        if (historicalRecoveryRequired && !hadUnresolvedFinancialActions) {
          await markHistoricalRecoveryComplete(database, userId);
          await assertExpectedSyncUser(userId);
        }
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
