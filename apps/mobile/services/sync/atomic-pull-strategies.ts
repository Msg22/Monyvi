import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPullResult,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { getCurrentUserId } from "../supabase";
import { SYNCABLE_TABLES } from "./config";
import { pullMarketRateSnapshots } from "./market-rate-snapshot-pull";
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
): Promise<SyncPullResult> {
  await assertExpectedPullUser(expectedUserId);

  const lastSyncDate =
    lastPulledAt === null ? null : new Date(lastPulledAt).toISOString();
  const marketStart =
    lastSyncDate === null
      ? null
      : { createdAt: lastSyncDate, id: UUID_MAX };
  const marketPull = await pullMarketRateSnapshots(marketStart);
  const { upperWatermark } = marketPull;
  const changes: AppSyncDatabaseChangeSet = {
    market_rates: marketPull.changes.market_rates,
    market_rate_observations:
      marketPull.changes.market_rate_observations,
  };

  for (const table of SYNCABLE_TABLES) {
    if (table === "market_rates" || table === "market_rate_observations") {
      continue;
    }

    if (isSnapshotTable(table)) {
      changes[table] = await pullSnapshotTable(
        table,
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
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
      changes.categories = await pullCategories(
        expectedUserId,
        lastSyncDate,
        upperWatermark
      );
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

    throw new Error(
      ATOMIC_SYNC_PULL_ERROR_CODES.INVALID_TABLE_CLASSIFICATION
    );
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
  };
}

async function assertExpectedPullUser(
  expectedUserId: string
): Promise<void> {
  if ((await getCurrentUserId()) !== expectedUserId) {
    throw new Error(ATOMIC_SYNC_PULL_ERROR_CODES.AUTH_SCOPE_LOST);
  }
}

function isChildTableName(
  table: SupabaseTablesNames
): table is ChildTableName {
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
