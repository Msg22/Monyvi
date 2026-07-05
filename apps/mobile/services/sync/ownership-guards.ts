import { Q, type Database, type Model } from "@nozbe/watermelondb";

import { createForeignLocalChangeError } from "./errors";
import type { SyncableTable } from "./config";
import type { ChildParentTableName, ChildTableConfig } from "./types";

export async function fetchOwnedParentIds(
  database: Database,
  parentTable: ChildParentTableName,
  userId: string,
  options: { readonly includeDeleted?: boolean } = {}
): Promise<readonly string[]> {
  const conditions = [Q.where("user_id", userId)];
  if (!options.includeDeleted) {
    conditions.push(Q.where("deleted", false));
  }

  const records = await database
    .get<Model>(parentTable)
    .query(...conditions)
    .fetch();

  return records.map((record) => record.id);
}

export function assertPushRecordBelongsToCurrentUser(
  table: SyncableTable,
  record: unknown,
  userId: string,
  childConfig: ChildTableConfig | undefined,
  ownedParentIds: readonly string[] | null
): void {
  const payload = record as Record<string, unknown>;

  if (isSharedSystemCategoryPushRecord(table, payload)) {
    return;
  }

  if (childConfig) {
    const parentId = payload[childConfig.foreignKey];
    if (
      typeof parentId !== "string" ||
      ownedParentIds === null ||
      !ownedParentIds.includes(parentId)
    ) {
      throw createForeignLocalChangeError(table);
    }
    return;
  }

  if (payload.user_id !== userId) {
    throw createForeignLocalChangeError(table);
  }
}

function isSharedSystemCategoryPushRecord(
  table: SyncableTable,
  payload: Record<string, unknown>
): boolean {
  return (
    table === "categories" &&
    payload.is_system === true &&
    (payload.user_id === null || payload.user_id === undefined)
  );
}
