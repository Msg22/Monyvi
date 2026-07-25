import type { SupabaseDatabase } from "@monyvi/db";
import type {
  SyncDatabaseChangeSet,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import type { EXCLUDED_TABLES } from "./config";

export type ExcludedTableName = (typeof EXCLUDED_TABLES)[number];
export type SupabaseTablesNames = Exclude<
  keyof SupabaseDatabase["public"]["Tables"],
  ExcludedTableName
>;

export type SnapshotTableName =
  | "daily_snapshot_assets"
  | "daily_snapshot_balance"
  | "daily_snapshot_net_worth";
export type ServerOwnedUserTableName = "sms_ai_negative_outcomes";
export type ReadOnlyTableName =
  | "market_rates"
  | SnapshotTableName
  | ServerOwnedUserTableName;
export type WritableSupabaseTablesNames = Exclude<
  SupabaseTablesNames,
  ReadOnlyTableName
>;
export type SupabaseTableRow<TTable extends SupabaseTablesNames> =
  SupabaseDatabase["public"]["Tables"][TTable]["Row"];
type SupabaseRelationship<TTable extends SupabaseTablesNames> =
  SupabaseDatabase["public"]["Tables"][TTable]["Relationships"][number];
export type ChildTableConfigFor<TTable extends WritableSupabaseTablesNames> =
  SupabaseRelationship<TTable> extends infer Relationship
    ? Relationship extends {
        readonly columns: readonly [infer ColumnName, ...unknown[]];
        readonly referencedRelation: infer ParentTable;
      }
      ? {
          readonly parentTable: Extract<
            ParentTable,
            WritableSupabaseTablesNames
          >;
          readonly foreignKey: Extract<
            ColumnName,
            keyof SupabaseTableRow<TTable>
          >;
        }
      : never
    : never;

export type ChildTableName =
  | "account_sms_senders"
  | "asset_metals"
  | "bank_details";
export type ChildParentTableName = "assets" | "accounts";
export interface ChildTableConfig {
  readonly parentTable: ChildParentTableName;
  readonly foreignKey: string;
}

export type UserOwnedWritableTableName = Exclude<
  WritableSupabaseTablesNames,
  ChildTableName
>;
export type UserOwnedPullTableName =
  | UserOwnedWritableTableName
  | ServerOwnedUserTableName;

export type AppSyncDatabaseChangeSet = SyncDatabaseChangeSet & {
  [TableName in SupabaseTablesNames]?: SyncTableChangeSet;
};

export interface SupabaseWriteQuery extends PromiseLike<{ error: unknown }> {
  eq(column: string, value: string): SupabaseWriteQuery;
  in(column: string, values: readonly string[]): SupabaseWriteQuery;
}

export interface SupabaseWriteTable {
  insert(records: ReadonlyArray<Record<string, unknown>>): PromiseLike<{
    error: unknown;
  }>;
  upsert(
    records: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
    options: { readonly onConflict: string }
  ): PromiseLike<{ error: unknown }>;
  update(values: Record<string, unknown>): SupabaseWriteQuery;
}
