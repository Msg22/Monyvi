import type {
  SyncPullResult,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import { getCurrentUserId, supabase } from "../supabase";
import { SNAPSHOT_RETENTION_DAYS, SYNCABLE_TABLES } from "./config";
import { createSyncTableError } from "./errors";
import {
  getChildTableConfig,
  isServerOwnedUserTable,
  isSnapshotTable,
} from "./table-predicates";
import { transformFromSupabase } from "./transforms";
import type {
  AppSyncDatabaseChangeSet,
  ChildTableConfig,
  ChildTableName,
  SnapshotTableName,
  UserOwnedPullTableName,
} from "./types";

export const SYNC_PULL_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_pull_auth_scope_lost",
} as const;

async function assertExpectedPullUser(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error(SYNC_PULL_ERROR_CODES.AUTH_SCOPE_LOST);
  }
}

export async function pullMarketRates(
  daysToKeep = 7
): Promise<SyncTableChangeSet> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const { data, error } = await supabase
    .from("market_rates")
    .select("*")
    .gt("created_at", cutoffDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw createSyncTableError("pull", "market_rates", error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const activeRecords = data.map((record) =>
    transformFromSupabase("market_rates", record)
  );

  return {
    created: [],
    updated: activeRecords,
    deleted: [],
  };
}

export async function pullSnapshotTable(
  table: SnapshotTableName,
  userId: string,
  lastSyncDate: string | null
): Promise<SyncTableChangeSet> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SNAPSHOT_RETENTION_DAYS);

    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .gt("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: false });

    if (lastSyncDate) {
      query = query.gt("created_at", lastSyncDate);
    }

    const { data, error } = await query;

    if (error) {
      throw createSyncTableError("pull", table, error);
    }

    if (!data || data.length === 0) {
      return { created: [], updated: [], deleted: [] };
    }

    const activeRecords = data.map((record) =>
      transformFromSupabase(table, record)
    );

    return {
      created: [],
      updated: activeRecords,
      deleted: [],
    };
  } catch (err) {
    logger.error("sync.pull.snapshot.failed", err, { table });
    throw err;
  }
}

export async function pullUserTable(
  table: UserOwnedPullTableName,
  userId: string,
  lastSyncDate: string | null
): Promise<SyncTableChangeSet> {
  let query = supabase.from(table).select("*").eq("user_id", userId);

  if (lastSyncDate) {
    query = query.gt("updated_at", lastSyncDate);
  }

  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", table, error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const deleted = data
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = data
    .filter((record) => record.deleted !== true)
    .map((record) => transformFromSupabase(table, record));

  return {
    created: [],
    updated: activeRecords,
    deleted,
  };
}

export async function pullChildTable(
  table: ChildTableName,
  childConfig: ChildTableConfig,
  userId: string,
  lastSyncDate: string | null
): Promise<SyncTableChangeSet> {
  const parentResult = await supabase
    .from(childConfig.parentTable)
    .select("id")
    .eq("user_id", userId);

  if (parentResult.error) {
    throw createSyncTableError(
      "pull",
      childConfig.parentTable,
      parentResult.error
    );
  }

  if (!parentResult.data || parentResult.data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const ids = parentResult.data.map((p) => p.id);
  let query = supabase.from(table).select("*").in(childConfig.foreignKey, ids);

  if (lastSyncDate) {
    query = query.gt("updated_at", lastSyncDate);
  }

  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", table, error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const deleted = data
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = data
    .filter((record) => record.deleted !== true)
    .map((record) => transformFromSupabase(table, record));

  return {
    created: [],
    updated: activeRecords,
    deleted,
  };
}

export async function pullCategories(
  userId: string,
  lastSyncDate: string | null
): Promise<SyncTableChangeSet> {
  let query = supabase
    .from("categories")
    .select("*")
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (lastSyncDate) {
    query = query.gt("updated_at", lastSyncDate);
  }

  const { data, error } = await query;

  if (error) {
    throw createSyncTableError("pull", "categories", error);
  }

  if (!data || data.length === 0) {
    return { created: [], updated: [], deleted: [] };
  }

  const deleted = data
    .filter((record) => record.deleted === true)
    .map((record) => record.id);

  const activeRecords = data
    .filter((record) => record.deleted !== true)
    .map((record) => transformFromSupabase("categories", record));

  return {
    created: [],
    updated: activeRecords,
    deleted,
  };
}

export async function pullChanges(
  lastPulledAt: number | null,
  expectedUserId: string
): Promise<SyncPullResult> {
  await assertExpectedPullUser(expectedUserId);

  const changes: AppSyncDatabaseChangeSet = {};
  const lastSyncDate = lastPulledAt
    ? new Date(lastPulledAt).toISOString()
    : null;

  for (const table of SYNCABLE_TABLES) {
    const childConfig = getChildTableConfig(table);

    if (table === "market_rates") {
      changes[table] = await pullMarketRates();
    } else if (isSnapshotTable(table)) {
      changes[table] = await pullSnapshotTable(
        table,
        expectedUserId,
        lastSyncDate
      );
    } else if (isServerOwnedUserTable(table)) {
      changes[table] = await pullUserTable(table, expectedUserId, lastSyncDate);
    } else if (table === "categories") {
      changes[table] = await pullCategories(expectedUserId, lastSyncDate);
    } else if (childConfig) {
      changes[table] = await pullChildTable(
        table as ChildTableName,
        childConfig,
        expectedUserId,
        lastSyncDate
      );
    } else {
      changes[table] = await pullUserTable(
        table as UserOwnedPullTableName,
        expectedUserId,
        lastSyncDate
      );
    }
  }

  await assertExpectedPullUser(expectedUserId);

  return {
    changes,
    timestamp: Date.now(),
  };
}
