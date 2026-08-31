import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPushArgs,
  SyncPushResult,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import { getCurrentUserId, supabase } from "../supabase";
import {
  DEDICATED_SYNC_TABLES,
  SYNCABLE_TABLES,
  type SyncableTable,
} from "./config";
import { createSyncTableError } from "./errors";
import {
  assertPushRecordBelongsToCurrentUser,
  fetchOwnedParentIds,
  isSharedSystemCategoryPushRecord,
} from "./ownership-guards";
import { getChildTableConfig, isWritableTable } from "./table-predicates";
import { transformToSupabase } from "./transforms";
import type { SupabaseWriteTable, WritableSupabaseTablesNames } from "./types";

export const GENERIC_SYNC_ERROR_CODES = {
  AUTH_SCOPE_LOST: "sync_push_auth_scope_lost",
  INVALID_CHANGE_ID: "sync_invalid_change_id",
} as const;

function parseChangeId(value: unknown): string {
  const candidate =
    typeof value === "string"
      ? value
      : (value as { readonly id?: unknown } | null)?.id;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(GENERIC_SYNC_ERROR_CODES.INVALID_CHANGE_ID);
  }
  return candidate;
}

function collectDedicatedRejectedIds(
  changes: SyncPushArgs["changes"]
): SyncRejectedIds | undefined {
  const rejectedIds: Record<string, string[]> = {};
  for (const [table, changeSet] of Object.entries(changes)) {
    if (!DEDICATED_SYNC_TABLES.has(table as "financial_action_groups"))
      continue;

    const tableChanges = changeSet as SyncTableChangeSet;
    const tableRejectedIds = [
      ...tableChanges.created.map((record: unknown): string =>
        parseChangeId(record)
      ),
      ...tableChanges.updated.map((record: unknown): string =>
        parseChangeId(record)
      ),
      ...tableChanges.deleted.map((recordId: unknown): string =>
        parseChangeId(recordId)
      ),
    ];
    if (tableRejectedIds.length > 0) {
      rejectedIds[table] = [...new Set(tableRejectedIds)];
    }
  }

  return Object.keys(rejectedIds).length > 0 ? rejectedIds : undefined;
}

function comparePushTableOrder(
  [leftTableName]: readonly [string, unknown],
  [rightTableName]: readonly [string, unknown]
): number {
  const leftChildConfig = getChildTableConfig(leftTableName as SyncableTable);
  const rightChildConfig = getChildTableConfig(rightTableName as SyncableTable);

  if (leftChildConfig?.parentTable === rightTableName) {
    return 1;
  }

  if (rightChildConfig?.parentTable === leftTableName) {
    return -1;
  }

  return 0;
}

function isDeletedRecord(record: unknown): boolean {
  return (record as Record<string, unknown>).deleted === true;
}

function getSupabaseWriteTable(
  table: WritableSupabaseTablesNames
): SupabaseWriteTable {
  return supabase.from(table) as unknown as SupabaseWriteTable;
}

function isPushableRecord(
  table: SyncableTable,
  record: Record<string, unknown>
): boolean {
  return !isSharedSystemCategoryPushRecord(table, record);
}

function getUpsertConflictColumn(table: SyncableTable): "id" | "user_id" {
  return table === "profiles" ? "user_id" : "id";
}

export async function pushChanges(
  database: Database,
  pushArgs: SyncPushArgs
): Promise<SyncPushResult | undefined | void> {
  const dedicatedRejectedIds = collectDedicatedRejectedIds(pushArgs.changes);
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error(GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST);
  }

  const { changes } = pushArgs;
  for (const [tableName, rawTableChanges] of Object.entries(changes).sort(
    comparePushTableOrder
  )) {
    const table = tableName as SyncableTable;
    if (!SYNCABLE_TABLES.includes(tableName as SyncableTable)) {
      continue;
    }
    const tableChanges = rawTableChanges as SyncTableChangeSet;

    if (!isWritableTable(table)) {
      continue;
    }

    const childConfig = getChildTableConfig(table);
    const isChildTable = childConfig !== undefined;

    try {
      const hasActiveChildWrites =
        isChildTable &&
        (tableChanges.created.length > 0 ||
          tableChanges.updated.some((record) => !isDeletedRecord(record)));
      const hasDeletedChildUpdates =
        isChildTable && tableChanges.updated.some(isDeletedRecord);
      const hasChildDeletes = isChildTable && tableChanges.deleted.length > 0;
      const activeParentIds =
        childConfig && hasActiveChildWrites
          ? await fetchOwnedParentIds(database, childConfig.parentTable, userId)
          : null;
      const deleteParentIds =
        childConfig && (hasChildDeletes || hasDeletedChildUpdates)
          ? await fetchOwnedParentIds(
              database,
              childConfig.parentTable,
              userId,
              {
                includeDeleted: true,
              }
            )
          : null;

      const upsertRecords = async (
        records: ReadonlyArray<Record<string, unknown>>
      ): Promise<void> => {
        const pushableRecords = records.filter((record) =>
          isPushableRecord(table, record)
        );
        if (pushableRecords.length === 0) {
          return;
        }

        const transformedRecords = pushableRecords.map((record) => {
          assertPushRecordBelongsToCurrentUser(
            table,
            record,
            userId,
            childConfig,
            isDeletedRecord(record) ? deleteParentIds : activeParentIds
          );
          return transformToSupabase(table, record, userId, isChildTable);
        });

        const { error } = await getSupabaseWriteTable(table).upsert(
          transformedRecords,
          { onConflict: getUpsertConflictColumn(table) }
        );
        if (error) {
          throw createSyncTableError("upsert", table, error);
        }
      };

      const softDeletedUpdates = tableChanges.updated.filter(isDeletedRecord);
      const activeUpdates = tableChanges.updated.filter(
        (record) => !isDeletedRecord(record)
      );

      if (softDeletedUpdates.length > 0) {
        await upsertRecords(softDeletedUpdates);
      }

      if (tableChanges.deleted.length > 0) {
        let query = getSupabaseWriteTable(table).update({
          deleted: true,
          updated_at: new Date().toISOString(),
        });

        if (childConfig && deleteParentIds) {
          query = query.in(childConfig.foreignKey, deleteParentIds);
        } else if (!isChildTable) {
          query = query.eq("user_id", userId);
        }

        const { error } = await query.in("id", tableChanges.deleted);
        if (error) {
          throw createSyncTableError("delete", table, error);
        }
      }

      if (tableChanges.created.length > 0) {
        await upsertRecords(tableChanges.created);
      }

      if (activeUpdates.length > 0) {
        await upsertRecords(activeUpdates);
      }
    } catch (err) {
      logger.error("sync.push.table.failed", err, { table });
      throw err;
    }
  }

  return dedicatedRejectedIds
    ? { experimentalRejectedIds: dedicatedRejectedIds }
    : undefined;
}
