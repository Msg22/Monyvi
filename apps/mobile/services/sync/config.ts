import { schema } from "@monyvi/db";

import type {
  ChildTableConfigFor,
  ChildTableName,
  ExcludedTableName,
  ServerOwnedUserTableName,
  SnapshotTableName,
  SupabaseTablesNames,
  WritableSupabaseTablesNames,
} from "./types";

export const DATE_ONLY_COLUMNS = [
  "date",
  "due_date",
  "start_date",
  "end_date",
  "next_due_date",
  "purchase_date",
  "period_start",
  "period_end",
  "snapshot_date",
] as const;

export const TIMESTAMP_COLUMNS = ["created_at", "updated_at"] as const;
export const ALL_DATE_COLUMNS = [
  ...DATE_ONLY_COLUMNS,
  ...TIMESTAMP_COLUMNS,
] as const;

export const PROFILE_NOTIFICATION_SETTINGS_COLUMN = "notification_settings";
export const PROFILE_ONBOARDING_FLAGS_COLUMN = "onboarding_flags";
export const PROFILE_AI_PROCESSING_CONSENT_COLUMN = "ai_processing_consent";

export const EXCLUDED_TABLES = [
  "__InternalSupabase",
  "sms_ai_work_requests",
  "sms_ai_usage_events",
] as const;
export const SNAPSHOT_TABLES = [
  "daily_snapshot_assets",
  "daily_snapshot_balance",
  "daily_snapshot_net_worth",
] as const satisfies readonly SnapshotTableName[];
export const SNAPSHOT_RETENTION_DAYS = 90;
export const SERVER_OWNED_USER_TABLES = [
  "sms_ai_negative_outcomes",
] as const satisfies readonly ServerOwnedUserTableName[];

function defineChildTableMap<
  const TConfig extends Partial<{
    readonly [TTable in WritableSupabaseTablesNames]: ChildTableConfigFor<TTable>;
  }>,
>(config: TConfig): TConfig {
  return config;
}

export const CHILD_TABLES_MAP = defineChildTableMap({
  account_sms_senders: { parentTable: "accounts", foreignKey: "account_id" },
  asset_metals: { parentTable: "assets", foreignKey: "asset_id" },
  bank_details: { parentTable: "accounts", foreignKey: "account_id" },
});

export const CHILD_TABLE_NAMES = Object.keys(
  CHILD_TABLES_MAP
) as ChildTableName[];

export const SYNCABLE_TABLES = Object.keys(schema.tables).filter(
  (table) => !EXCLUDED_TABLES.includes(table as ExcludedTableName)
) as SupabaseTablesNames[];

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];
