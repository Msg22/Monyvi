import { Q, type Database } from "@nozbe/watermelondb";
import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import { z } from "zod";

import {
  DEDICATED_SYNC_TABLES,
  PULL_ONLY_SHARED_TABLES,
  SYNCABLE_TABLES,
  type SyncableTable,
} from "./config";
import { createForeignLocalChangeError } from "./errors";
import {
  fetchOwnedParentIds,
  isSharedSystemCategoryPushRecord,
} from "./ownership-guards";
import { getChildTableConfig, isWritableTable } from "./table-predicates";

const DeletedOwnershipSchema = z.array(
  z.object({
    id: z.string().min(1),
    parent_id: z.string().min(1).optional(),
  })
);

const ChangeIdSchema = z.object({ id: z.string().min(1) });
const DeletedIdsSchema = z.array(z.string().min(1));

export interface OwnedPushChanges {
  readonly changes: SyncPushArgs["changes"];
  readonly rejectedIds: SyncRejectedIds | undefined;
  readonly tombstoneParentIds: ReadonlyMap<string, readonly string[]>;
}

interface OwnedDeletedChanges {
  readonly ids: ReadonlySet<string>;
  readonly parentIds: readonly string[];
}

interface PartitionedTableChanges {
  readonly changes: SyncTableChangeSet;
  readonly rejectedIds: string[];
  readonly parentIds: readonly string[];
}

interface ScopedTableChanges extends PartitionedTableChanges {
  readonly name: string;
}

interface PartitionedRecords {
  readonly owned: SyncTableChangeSet["created"];
  readonly rejected: string[];
}

function partitionRecords(
  records: SyncTableChangeSet["created"],
  isOwned: (record: Record<string, unknown>) => boolean
): PartitionedRecords {
  const classified = records.map((record) => ({
    record,
    id: ChangeIdSchema.parse(record).id,
    isOwned: isOwned(record),
  }));
  return {
    owned: classified.filter((item) => item.isOwned).map((item) => item.record),
    rejected: classified.filter((item) => !item.isOwned).map((item) => item.id),
  };
}

/**
 * Ordinary queries exclude Watermelon tombstones. This narrowly scoped SQL read
 * proves deletion ownership from persisted rows, including tombstoned parents.
 * Identifiers come only from the sync whitelist; user values stay parameterized.
 */
async function fetchOwnedDeletedChanges(
  database: Database,
  table: SyncableTable,
  userId: string
): Promise<OwnedDeletedChanges> {
  const child = getChildTableConfig(table);
  const sql = child
    ? `SELECT child.id, child."${child.foreignKey}" AS parent_id FROM "${table}" AS child JOIN "${child.parentTable}" AS parent ON child."${child.foreignKey}" = parent.id WHERE child._status = ? AND parent.user_id = ?`
    : `SELECT id FROM "${table}" WHERE _status = ? AND user_id = ?`;
  const rows: unknown = await database
    .get(table)
    .query(Q.unsafeSqlQuery(sql, ["deleted", userId]))
    .unsafeFetchRaw();
  const parsed = DeletedOwnershipSchema.parse(rows);
  return {
    ids: new Set(parsed.map((row) => row.id)),
    parentIds: [
      ...new Set(
        parsed.flatMap((row) => (row.parent_id ? [row.parent_id] : []))
      ),
    ],
  };
}

async function ownedRecordPredicate(
  database: Database,
  table: SyncableTable,
  changes: SyncTableChangeSet,
  userId: string
): Promise<(record: Record<string, unknown>) => boolean> {
  const child = getChildTableConfig(table);
  if (!child) {
    return (record): boolean => {
      if (isSharedSystemCategoryPushRecord(table, record)) return true;
      if (record.user_id === userId) return true;
      if (DEDICATED_SYNC_TABLES.has(table)) return false;
      if (
        typeof record.user_id !== "string" ||
        record.user_id.trim().length === 0
      ) {
        throw createForeignLocalChangeError(table);
      }
      return false;
    };
  }
  const records = [...changes.created, ...changes.updated];
  const activeParentIds = records.some((record) => record.deleted !== true)
    ? new Set(await fetchOwnedParentIds(database, child.parentTable, userId))
    : new Set<string>();
  const deletedParentIds = records.some((record) => record.deleted === true)
    ? new Set(
        await fetchOwnedParentIds(database, child.parentTable, userId, {
          includeDeleted: true,
        })
      )
    : new Set<string>();
  return (record): boolean => {
    const parentId = record[child.foreignKey];
    if (typeof parentId !== "string" || parentId.trim().length === 0) {
      throw createForeignLocalChangeError(table);
    }
    return (record.deleted === true ? deletedParentIds : activeParentIds).has(
      parentId
    );
  };
}

async function partitionTableChanges(
  database: Database,
  table: SyncableTable,
  changes: SyncTableChangeSet,
  userId: string
): Promise<PartitionedTableChanges> {
  const isOwned = await ownedRecordPredicate(database, table, changes, userId);
  const created = partitionRecords(changes.created, isOwned);
  const updated = partitionRecords(changes.updated, isOwned);
  const deletedIds = DeletedIdsSchema.parse(changes.deleted);
  const deleted =
    deletedIds.length > 0 && !DEDICATED_SYNC_TABLES.has(table)
      ? await fetchOwnedDeletedChanges(database, table, userId)
      : { ids: new Set<string>(), parentIds: [] };
  return {
    changes: {
      created: created.owned,
      updated: updated.owned,
      deleted: deletedIds.filter((id) => deleted.ids.has(id)),
    },
    rejectedIds: [
      ...new Set([
        ...created.rejected,
        ...updated.rejected,
        ...deletedIds.filter((id) => !deleted.ids.has(id)),
      ]),
    ],
    parentIds: deleted.parentIds,
  };
}

/** Scope every push strategy before RPCs, transformations, or acknowledgement. */
export async function scopePushChangesToUser(
  database: Database,
  input: SyncPushArgs["changes"],
  userId: string
): Promise<OwnedPushChanges> {
  // Watermelon's opaque change-map type loses its table value type in entries().
  const entries = await Promise.all(
    Object.entries(input).map(
      async ([name, rawTableChanges]): Promise<ScopedTableChanges> => {
        const tableChanges = rawTableChanges as SyncTableChangeSet;
        const table = name as SyncableTable;
        const managed =
          !PULL_ONLY_SHARED_TABLES.has(name) &&
          ((SYNCABLE_TABLES.includes(table) && isWritableTable(table)) ||
            DEDICATED_SYNC_TABLES.has(name));
        const partition = managed
          ? await partitionTableChanges(database, table, tableChanges, userId)
          : { changes: tableChanges, rejectedIds: [], parentIds: [] };
        return { name, ...partition };
      }
    )
  );
  const rejected = entries.filter((entry) => entry.rejectedIds.length > 0);
  return {
    changes: Object.fromEntries(
      entries.map((entry) => [entry.name, entry.changes])
    ),
    rejectedIds:
      rejected.length > 0
        ? Object.fromEntries(
            rejected.map((entry) => [entry.name, entry.rejectedIds])
          )
        : undefined,
    tombstoneParentIds: new Map(
      entries.map((entry) => [entry.name, entry.parentIds])
    ),
  };
}
