import { Q, type Database, type Model } from "@nozbe/watermelondb";

import { createForeignLocalChangeError } from "./errors";
import type { SyncableTable } from "./config";
import type { ChildParentTableName, ChildTableConfig } from "./types";

export const METALS_ACTION_FRAGMENT_COLUMNS = {
  assets: [
    "purchase_price_decimal",
    "purchase_currency",
    "acquisition_action_id",
  ],
  asset_metals: [
    "weight_grams_decimal",
    "purity_code",
    "purity_factor_decimal",
    "purity_catalog_version",
  ],
} as const;

const UUID_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function isSharedSystemCategoryPushRecord(
  table: SyncableTable,
  payload: Record<string, unknown>
): boolean {
  return (
    table === "categories" &&
    typeof payload.id === "string" &&
    UUID_ID_PATTERN.test(payload.id) &&
    payload.is_system === true &&
    (payload.user_id === null || payload.user_id === undefined)
  );
}

export function stripMetalActionFragments(
  table: SyncableTable,
  record: Record<string, unknown>
): Record<string, unknown> {
  const protectedColumns =
    METALS_ACTION_FRAGMENT_COLUMNS[
      table as keyof typeof METALS_ACTION_FRAGMENT_COLUMNS
    ];
  if (!protectedColumns) {
    return { ...record };
  }

  return Object.fromEntries(
    Object.entries(record).filter(
      ([column]) => !(protectedColumns as readonly string[]).includes(column)
    )
  );
}
