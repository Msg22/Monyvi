/** Compose PR385's bounded historical receipt with #395's protected SDK sync.
 * One actor, one protected synchronize() and no receipt before its ACK writer.
 * This is an internal runner, not another financial recovery protocol.
 */
import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPullResult,
  SyncPushArgs,
  SyncPushResult,
} from "@nozbe/watermelondb/sync";
import { logger } from "@/utils/logger";
import { serializeAccountActionFailureContext } from "./account-action-failure-context";
import { getCurrentUserId } from "../supabase";
import { repairLegacyMetalAdds } from "../legacy-metal-add-repair-service";
import { repairLegacyMetalEdits } from "../legacy-metal-edit-repair-service";
import { pullChanges } from "./atomic-pull-strategies";
import { pushChanges } from "./push-service";
import { hasOwnedUnresolvedFinancialActions } from "./financial-pull-shaping";
import {
  isHistoricalRecoveryRequired,
  markHistoricalRecoveryComplete,
  removeHistoricalRecoveryReceipt,
  type HistoricalRecoveryPullResult,
} from "./historical-recovery";
import type {
  AccountSyncAckCapability,
  DeferredAccountRejection,
} from "./account-sync-ack-scope";

const OWNER_LOCAL_KEY = "__monyvi_sync_owner_user_id";
const LEGACY_CHAIN_UNSAFE = "sync_legacy_metal_chain_unsafe";

/** Exact existing protected writer contract; opaque capability never escapes. */
export interface ProtectedHistoricalSyncHooks {
  readonly synchronize: (input: {
    readonly database: Database;
    readonly expectedOwnerId: string;
    readonly pullChanges: (
      lastPulledAt: number | null
    ) => Promise<SyncPullResult>;
    readonly pushChanges: (
      args: SyncPushArgs,
      capability: AccountSyncAckCapability
    ) => Promise<SyncPushResult | void | undefined>;
  }) => Promise<readonly DeferredAccountRejection[]>;
  readonly applyDeferred: (
    database: Database,
    ownerId: string,
    hints: readonly DeferredAccountRejection[]
  ) => Promise<void>;
  readonly assertOwner: (ownerId: string) => Promise<void>;
}

/** Injectable transport boundary for focused orchestration tests only.
 * Production uses the original #385 helpers and #395 push unmodified.
 */
export interface ProtectedHistoricalSyncHost {
  readonly getOwner: () => Promise<string | null>;
  readonly repairAdds: (
    database: Database,
    userId: string
  ) => Promise<{
    readonly skipped: ReadonlyArray<{
      readonly actionId: string;
      readonly reason: string;
    }>;
  }>;
  readonly repairEdits: (
    database: Database,
    userId: string
  ) => Promise<{
    readonly skipped: ReadonlyArray<{
      readonly actionId: string;
      readonly reason: string;
    }>;
  }>;
  readonly historicalRequired: (
    database: Database,
    userId: string
  ) => Promise<boolean>;
  readonly hasUnresolved: (
    database: Database,
    userId: string
  ) => Promise<boolean>;
  readonly markComplete: (database: Database, userId: string) => Promise<void>;
  readonly removeReceipt: (database: Database, userId: string) => Promise<void>;
  readonly pull: (
    lastPulledAt: number | null,
    userId: string,
    database: Database
  ) => Promise<HistoricalRecoveryPullResult>;
  readonly push: (
    database: Database,
    args: SyncPushArgs,
    userId: string,
    capability: AccountSyncAckCapability
  ) => Promise<SyncPushResult | void | undefined>;
}

const productionHost: ProtectedHistoricalSyncHost = {
  getOwner: getCurrentUserId,
  repairAdds: repairLegacyMetalAdds,
  repairEdits: repairLegacyMetalEdits,
  historicalRequired: isHistoricalRecoveryRequired,
  hasUnresolved: hasOwnedUnresolvedFinancialActions,
  markComplete: markHistoricalRecoveryComplete,
  removeReceipt: removeHistoricalRecoveryReceipt,
  pull: pullChanges,
  push: (database, args, userId, capability) =>
    pushChanges(database, args, userId, undefined, capability),
};

/** One in-flight promise remains visible to logout through sync.ts. */
export function createProtectedHistoricalSync(
  hooks: ProtectedHistoricalSyncHooks,
  host: ProtectedHistoricalSyncHost = productionHost
): {
  readonly getActiveSyncPromise: () => Promise<void> | null;
  readonly syncDatabase: (
    database: Database,
    forceFullSync?: boolean
  ) => Promise<void>;
} {
  let activeSyncPromise: Promise<void> | null = null;
  const syncDatabase = (
    database: Database,
    forceFullSync = false
  ): Promise<void> => {
    if (activeSyncPromise) {
      logger.debug("sync.alreadyInProgress");
      return activeSyncPromise;
    }
    activeSyncPromise = (async (): Promise<void> => {
      const userId = await host.getOwner();
      if (!userId) {
        logger.debug("sync.skippedUnauthenticated");
        return;
      }
      const persistedOwner = await database.adapter.getLocal(OWNER_LOCAL_KEY);
      const historicalRequired = await host.historicalRequired(
        database,
        userId
      );
      const forceFull =
        forceFullSync || persistedOwner !== userId || historicalRequired;
      if (forceFull) logger.info("sync.forceFullSyncRequested");

      try {
        const adds = await host.repairAdds(database, userId);
        for (const skip of adds.skipped)
          logger.warn("sync.legacyMetalAddRepairSkipped", skip);
        if (adds.skipped.some((skip) => skip.reason === "superseded"))
          throw new Error(LEGACY_CHAIN_UNSAFE);
        const edits = await host.repairEdits(database, userId);
        for (const skip of edits.skipped)
          logger.warn("sync.legacyMetalEditRepairSkipped", skip);

        // Initial unresolved evidence withholds this attempt's receipt even
        // if the protected SDK writer/reconciliation settles it meanwhile.
        const startedUnresolved =
          historicalRequired && (await host.hasUnresolved(database, userId));
        if (startedUnresolved)
          logger.warn("sync.historicalRecoveryReceiptWithheld");

        const deferred = await hooks.synchronize({
          database,
          expectedOwnerId: userId,
          pullChanges: (lastPulledAt) =>
            host.pull(forceFull ? null : lastPulledAt, userId, database),
          pushChanges: (args, capability) =>
            host.push(database, args, userId, capability),
        });
        await hooks.applyDeferred(database, userId, deferred);
        await hooks.assertOwner(userId);
        await database.adapter.setLocal(OWNER_LOCAL_KEY, userId);
        await hooks.assertOwner(userId);

        if (historicalRequired && !startedUnresolved) {
          // The ACK writer has now succeeded. Later-created unresolved work
          // also keeps the receipt absent rather than hiding held evidence.
          const remainsUnresolved = await host.hasUnresolved(database, userId);
          await hooks.assertOwner(userId);
          if (!remainsUnresolved) {
            await host.markComplete(database, userId);
            try {
              await hooks.assertOwner(userId);
            } catch (error) {
              // Only the captured owner's attempt-local receipt is invalidated.
              await host.removeReceipt(database, userId);
              throw error;
            }
          }
        }
        logger.debug("sync.completed");
      } catch (error) {
        if (String(error).includes("Concurrent synchronization")) {
          logger.warn("sync.concurrentSyncAborted");
          return;
        }
        if (__DEV__) {
          const diagnostic = serializeAccountActionFailureContext(error);
          if (diagnostic !== null) logger.debug(diagnostic);
        }
        logger.error("sync.failed", error);
        throw error;
      }
    })().finally(() => {
      activeSyncPromise = null;
    });
    return activeSyncPromise;
  };
  return {
    syncDatabase,
    getActiveSyncPromise: () => activeSyncPromise,
  };
}
