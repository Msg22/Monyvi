import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPushArgs,
  SyncPushResult,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import { logger } from "@/utils/logger";

import { getCurrentUserId, supabase } from "../supabase";
import { SYNCABLE_TABLES, type SyncableTable } from "./config";
import { createSyncTableError } from "./errors";
import {
  assertPushRecordBelongsToCurrentUser,
  fetchOwnedParentIds,
  isSharedSystemCategoryPushRecord,
} from "./ownership-guards";
import { getChildTableConfig, isWritableTable } from "./table-predicates";
import { transformToSupabase } from "./transforms";
import type { SupabaseWriteTable, WritableSupabaseTablesNames } from "./types";

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

export async function pushChanges(
  database: Database,
  pushArgs: SyncPushArgs
): Promise<SyncPushResult | undefined | void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    logger.debug("sync.push.skippedUnauthenticated");
    return;
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
          return transformToSupabase(
            table,
            record,
            userId,
            isChildTable
          );
        });

        const { error } = await getSupabaseWriteTable(table).upsert(
          transformedRecords,
          { onConflict: "id" }
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
}
