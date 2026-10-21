import type { Database } from "@nozbe/watermelondb";
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";

import { getCurrentUserId } from "../supabase";
import { SYNCABLE_TABLES } from "./config";
import {
  createHistoricalSnapshotPullStrategy,
  type HistoricalRecoveryPullResult,
  createSnapshotRetentionCutoffIso,
  isHistoricalRecoveryRequired,
} from "./historical-recovery";
import { pullMarketRateSnapshots } from "./market-rate-snapshot-pull";
import { emitCategoryReconciliationDiagnostics } from "./dev-category-reconciliation-diagnostics";
import {
  readCategoryCatalogueAttempt,
  type CategoryCatalogueAttempt,
} from "@/services/category-catalogue-service";
import { sealSyncPull } from "./pull-fence";

/**
 * Categories pull extension: the attempt-bound catalogue snapshot of the very
 * pull that produced this result. It is read by the sync invocation that
 * requested the pull and committed only after that synchronize() succeeded.
 */
export interface CataloguePullResultExtension {
  readonly catalogueAttempt?: CategoryCatalogueAttempt;
}
import { pullSnapshotDeletions } from "./snapshot-deletion-pull";
import {
  protectMetalMetadataPullFragments,
  pullCategories,
  pullChildTable,
  pullMetalDedicatedTable,
  pullSnapshotTable,
  pullUserTable,
} from "./pull-strategies";
import {
  getChildTableConfig,
  isServerOwnedUserTable,
  isSnapshotTable,
} from "./table-predicates";
import type {
  AppSyncDatabaseChangeSet,
  ChildTableName,
  SupabaseTablesNames,
  UserOwnedPullTableName,
} from "./types";

const UUID_MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const METAL_DEDICATED_PULL_TABLES = [
  "financial_action_groups",
  "account_financial_effects",
  "metal_action_evidence",
  "metal_lifecycle_events",
  "metal_rate_references",
  "metal_holding_states",
] as const;

type GenericUserOwnedPullTableName = Exclude<
  UserOwnedPullTableName,
  "market_rate_observations"
>;

export const ATOMIC_SYNC_PULL_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_pull_auth_scope_lost",
  INVALID_TABLE_CLASSIFICATION: "sync_pull_invalid_table_classification",
} as const;

/**
 * Pulls the complete market-rate envelope first and uses its fixed server
 * watermark for every other table in the same Watermelon synchronization.
 */
export async function pullChanges(
  lastPulledAt: number | null,
  expectedUserId: string,
  database?: Database
): Promise<HistoricalRecoveryPullResult & CataloguePullResultExtension> {
  await assertExpectedPullUser(expectedUserId);
  const historicalRecoveryRequired =
    database !== undefined &&
    lastPulledAt === null &&
    (await isHistoricalRecoveryRequired(database, expectedUserId));
  const snapshotRetentionCutoffIso = historicalRecoveryRequired
    ? createSnapshotRetentionCutoffIso()
    : null;

  const lastSyncDate =
    lastPulledAt === null ? null : new Date(lastPulledAt).toISOString();
  const marketStart =
    lastSyncDate === null ? null : { createdAt: lastSyncDate, id: UUID_MAX };
  const marketPull = await pullMarketRateSnapshots(marketStart);
  const { upperWatermark } = marketPull;
  await sealSyncPull(upperWatermark);
  const snapshotDeletions = await pullSnapshotDeletions(
    lastSyncDate,
    upperWatermark
  );
  let catalogueAttempt: CategoryCatalogueAttempt | null = null;
  const changes: AppSyncDatabaseChangeSet = {
    market_rates: marketPull.changes.market_rates,
    market_rate_observations: marketPull.changes.market_rate_observations,
  };

  for (const table of SYNCABLE_TABLES) {
    if (table === "market_rates" || table === "market_rate_observations") {
      continue;
    }

    if (isSnapshotTable(table)) {
      const activeChanges =
        snapshotRetentionCutoffIso === null
          ? await pullSnapshotTable(
              table,
              expectedUserId,
              lastSyncDate,
              upperWatermark
            )
          : await pullSnapshotTable(
              table,
              expectedUserId,
              lastSyncDate,
              upperWatermark,
              snapshotRetentionCutoffIso
            );
      changes[table] = {
        ...activeChanges,
        deleted: [...snapshotDeletions[table]],
      };
      continue;
    }

    if (isServerOwnedUserTable(table)) {
      changes[table] = await pullUserTable(
        table,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
      continue;
    }

    if (table === "categories") {
      // Categories are always pulled as a complete window: the shared
      // updated_at cursor belongs to another backend after a source switch and
      // cannot express a same-host reseed.
      changes.categories = await pullCategories(
        expectedUserId,
        null,
        upperWatermark
      );
      // The attempt travels with the result of this very pull, so the sync
      // invocation that requested it can commit exactly that attempt after its
      // own synchronize() succeeded. Nothing is staged globally.
      const attempt = readCategoryCatalogueAttempt(changes.categories);
      if (attempt !== null) catalogueAttempt = attempt;
      // Dev-only diagnostic: compares the local categories with a complete
      // server snapshot taken at this boundary. It never replaces or mutates
      // the real change set, the sync checkpoint or the applied sync output,
      // and it never throws.
      await emitCategoryReconciliationDiagnostics({
        database,
        userId: expectedUserId,
        upperWatermark,
      });
      continue;
    }

    if (isChildTableName(table)) {
      const childConfig = getChildTableConfig(table);
      if (!childConfig) {
        throw new Error(
          ATOMIC_SYNC_PULL_ERROR_CODES.INVALID_TABLE_CLASSIFICATION
        );
      }
      changes[table] = await pullChildTable(
        table,
        childConfig,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
      continue;
    }

    if (isGenericUserOwnedPullTableName(table)) {
      changes[table] = await pullUserTable(
        table,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
      continue;
    }

    throw new Error(ATOMIC_SYNC_PULL_ERROR_CODES.INVALID_TABLE_CLASSIFICATION);
  }

  let holdingStateChanges: SyncTableChangeSet | null = null;
  for (const table of METAL_DEDICATED_PULL_TABLES) {
    const dedicatedChanges = await pullMetalDedicatedTable(
      table,
      expectedUserId,
      lastSyncDate,
      upperWatermark,
      database
    );
    changes[table] = dedicatedChanges;
    if (table === "metal_holding_states") {
      holdingStateChanges = dedicatedChanges;
    }
  }

  if (changes.assets && holdingStateChanges) {
    changes.assets = protectMetalMetadataPullFragments(
      changes.assets,
      holdingStateChanges
    );
  }

  await assertExpectedPullUser(expectedUserId);

  return {
    changes,
    timestamp: Date.parse(upperWatermark),
    ...(catalogueAttempt === null ? {} : { catalogueAttempt }),
    ...(snapshotRetentionCutoffIso === null
      ? {}
      : {
          experimentalStrategy: createHistoricalSnapshotPullStrategy(
            expectedUserId,
            snapshotRetentionCutoffIso,
            upperWatermark
          ),
        }),
  };
}

async function assertExpectedPullUser(expectedUserId: string): Promise<void> {
  if ((await getCurrentUserId()) !== expectedUserId) {
    throw new Error(ATOMIC_SYNC_PULL_ERROR_CODES.AUTH_SCOPE_LOST);
  }
}

function isChildTableName(table: SupabaseTablesNames): table is ChildTableName {
  return (
    table === "account_sms_senders" ||
    table === "asset_metals" ||
    table === "bank_details"
  );
}

function isGenericUserOwnedPullTableName(
  table: SupabaseTablesNames
): table is GenericUserOwnedPullTableName {
  return (
    table !== "market_rates" &&
    table !== "market_rate_observations" &&
    table !== "categories" &&
    !isSnapshotTable(table) &&
    !isServerOwnedUserTable(table) &&
    !isChildTableName(table)
  );
}
