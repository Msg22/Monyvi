import {
  CHILD_TABLE_NAMES,
  CHILD_TABLES_MAP,
  SERVER_OWNED_USER_TABLES,
  SNAPSHOT_TABLES,
} from "./config";
import type {
  ChildTableConfig,
  ChildTableName,
  ReadOnlyTableName,
  ServerOwnedUserTableName,
  SnapshotTableName,
  SupabaseTablesNames,
  WritableSupabaseTablesNames,
} from "./types";

export function isSnapshotTable(
  table: SupabaseTablesNames
): table is SnapshotTableName {
  return (SNAPSHOT_TABLES as readonly SupabaseTablesNames[]).includes(table);
}

export function isReadOnlyTable(
  table: SupabaseTablesNames
): table is ReadOnlyTableName {
  return (
    table === "market_rates" ||
    isSnapshotTable(table) ||
    isServerOwnedUserTable(table)
  );
}

export function isServerOwnedUserTable(
  table: SupabaseTablesNames
): table is ServerOwnedUserTableName {
  return (SERVER_OWNED_USER_TABLES as readonly SupabaseTablesNames[]).includes(
    table
  );
}

export function isWritableTable(
  table: SupabaseTablesNames
): table is WritableSupabaseTablesNames {
  return !isReadOnlyTable(table);
}

export function getChildTableConfig(
  table: SupabaseTablesNames
): ChildTableConfig | undefined {
  return CHILD_TABLE_NAMES.includes(table as ChildTableName)
    ? CHILD_TABLES_MAP[table as ChildTableName]
    : undefined;
}
