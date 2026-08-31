/**
 * WatermelonDB Schema Migrations
 * AUTO-MANAGED by sql-to-watermelon-migration.js
 *
 * Each migration must target the next sequential version.
 * The schema version in schema.ts is auto-resolved from the highest toVersion here.
 *
 * @see https://watermelondb.dev/docs/Advanced/Migrations
 */

import {
  unsafeExecuteSql,
  createTable,
  addColumns,
  schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: "categories",
          columns: [{ name: "usage_count", type: "number" }],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: "transactions",
          columns: [{ name: "counterparty", type: "string", isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: "recurring_payments",
          columns: [{ name: "currency", type: "string" }],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        createTable({
          name: "daily_snapshot_assets",
          columns: [
            { name: "created_at", type: "number" },
            { name: "snapshot_date", type: "number" },
            { name: "total_assets_usd", type: "number" },
            { name: "user_id", type: "string", isIndexed: true },
          ],
        }),
        createTable({
          name: "daily_snapshot_balance",
          columns: [
            { name: "created_at", type: "number" },
            { name: "snapshot_date", type: "number" },
            { name: "total_accounts_usd", type: "number" },
            { name: "user_id", type: "string", isIndexed: true },
          ],
        }),
        createTable({
          name: "daily_snapshot_net_worth",
          columns: [
            { name: "created_at", type: "number" },
            { name: "snapshot_date", type: "number" },
            { name: "total_accounts", type: "number" },
            { name: "total_assets", type: "number" },
            { name: "total_net_worth", type: "number" },
            { name: "user_id", type: "string", isIndexed: true },
          ],
        }),
      ],
    },
    {
      // Migration 026 renamed all _egp → _usd columns in Supabase.
      // WatermelonDB doesn't support renameColumn, so we add the new _usd columns.
      // The old _egp columns remain in SQLite but are ignored by WatermelonDB.
      toVersion: 9,
      steps: [
        addColumns({
          table: "market_rates",
          columns: [
            { name: "aed_usd", type: "number" },
            { name: "aud_usd", type: "number" },
            { name: "bhd_usd", type: "number" },
            { name: "btc_usd", type: "number" },
            { name: "cad_usd", type: "number" },
            { name: "chf_usd", type: "number" },
            { name: "cny_usd", type: "number" },
            { name: "dkk_usd", type: "number" },
            { name: "dzd_usd", type: "number" },
            { name: "egp_usd", type: "number" },
            { name: "eur_usd", type: "number" },
            { name: "gbp_usd", type: "number" },
            { name: "gold_usd_per_gram", type: "number" },
            { name: "hkd_usd", type: "number" },
            { name: "inr_usd", type: "number" },
            { name: "iqd_usd", type: "number" },
            { name: "isk_usd", type: "number" },
            { name: "jod_usd", type: "number" },
            { name: "jpy_usd", type: "number" },
            { name: "kpw_usd", type: "number" },
            { name: "krw_usd", type: "number" },
            { name: "kwd_usd", type: "number" },
            { name: "lyd_usd", type: "number" },
            { name: "mad_usd", type: "number" },
            { name: "myr_usd", type: "number" },
            { name: "nok_usd", type: "number" },
            { name: "nzd_usd", type: "number" },
            { name: "omr_usd", type: "number" },
            { name: "palladium_usd_per_gram", type: "number" },
            { name: "platinum_usd_per_gram", type: "number" },
            { name: "qar_usd", type: "number" },
            { name: "rub_usd", type: "number" },
            { name: "sar_usd", type: "number" },
            { name: "sek_usd", type: "number" },
            { name: "sgd_usd", type: "number" },
            { name: "silver_usd_per_gram", type: "number" },
            { name: "tnd_usd", type: "number" },
            { name: "try_usd", type: "number" },
            { name: "zar_usd", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: "transactions",
          columns: [
            { name: "sms_body_hash", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 11,
      steps: [
        addColumns({
          table: "accounts",
          columns: [{ name: "is_default", type: "boolean" }],
        }),
      ],
    },
    {
      toVersion: 12,
      steps: [
        addColumns({
          table: "transfers",
          columns: [
            { name: "sms_body_hash", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: "budgets",
          columns: [
            { name: "alert_fired_level", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: "budgets",
          columns: [
            { name: "paused_at", type: "string", isOptional: true },
            { name: "pause_intervals", type: "string" },
          ],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        addColumns({
          table: "profiles",
          columns: [{ name: "setup_guide_completed", type: "boolean" }],
        }),
      ],
    },
    {
      toVersion: 16,
      steps: [
        addColumns({
          table: "profiles",
          columns: [
            { name: "preferred_language", type: "string", isOptional: true },
            { name: "slides_viewed", type: "boolean" },
          ],
        }),
      ],
    },
    {
      toVersion: 17,
      steps: [
        addColumns({
          table: "profiles",
          // `isOptional: true` matches the `notification_settings`
          // pattern earlier in this file: server-side the column is
          // `NOT NULL DEFAULT '{}'::JSONB`, but during migration newly-
          // attached rows can briefly hold an empty string before the
          // first sync materializes the JSON default. The getter
          // tolerates an empty value and returns `{}`. Marking this
          // optional documents the intent: "the column is empty here
          // is OK; the getter handles it" (round-2 review #18).
          columns: [
            { name: "onboarding_flags", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 18,
      steps: [
        addColumns({
          table: "transactions",
          columns: [
            { name: "sms_fingerprint", type: "string", isOptional: true },
          ],
        }),
        addColumns({
          table: "transfers",
          columns: [
            { name: "sms_fingerprint", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 19,
      steps: [
        unsafeExecuteSql(
          'create index if not exists "transactions_sms_fingerprint" on "transactions" ("sms_fingerprint");'
        ),
        unsafeExecuteSql(
          'create index if not exists "transfers_sms_fingerprint" on "transfers" ("sms_fingerprint");'
        ),
      ],
    },
    {
      toVersion: 20,
      steps: [
        unsafeExecuteSql(
          'delete from "bank_details" where coalesce("deleted", 0) != 1 and exists (select 1 from "bank_details" as "older_bank_details" where "older_bank_details"."account_id" = "bank_details"."account_id" and coalesce("older_bank_details"."deleted", 0) != 1 and ("older_bank_details"."created_at" < "bank_details"."created_at" or ("older_bank_details"."created_at" = "bank_details"."created_at" and "older_bank_details"."id" < "bank_details"."id")));'
        ),
        unsafeExecuteSql(
          'create unique index if not exists "bank_details_one_active_per_account" on "bank_details" ("account_id") where coalesce("deleted", 0) != 1;'
        ),
      ],
    },
    {
      toVersion: 21,
      steps: [
        addColumns({
          table: "accounts",
          columns: [
            { name: "institution_id", type: "string", isOptional: true },
            {
              name: "provider_display_name",
              type: "string",
              isOptional: true,
            },
          ],
        }),
        createTable({
          name: "account_sms_senders",
          columns: [
            { name: "account_id", type: "string", isIndexed: true },
            { name: "created_at", type: "number" },
            { name: "deleted", type: "boolean" },
            { name: "normalized_sender_name", type: "string", isIndexed: true },
            { name: "sender_name", type: "string" },
            { name: "updated_at", type: "number" },
          ],
        }),
        unsafeExecuteSql(
          `update "accounts"
set
  "provider_display_name" = (
    select trim("bank_details"."bank_name")
    from "bank_details"
    where "bank_details"."account_id" = "accounts"."id"
      and coalesce("bank_details"."deleted", 0) != 1
      and "bank_details"."bank_name" is not null
      and trim("bank_details"."bank_name") != ''
    order by "bank_details"."created_at" asc
    limit 1
  ),
  "_status" = case
    when "_status" = 'created' then 'created'
    when "_status" = 'deleted' then 'deleted'
    else 'updated'
  end,
  "_changed" = case
    when "_status" = 'created' then "_changed"
    when "_status" = 'deleted' then "_changed"
    when "_changed" is null or "_changed" = '' then 'provider_display_name'
    when instr(',' || "_changed" || ',', ',provider_display_name,') > 0 then "_changed"
    else "_changed" || ',provider_display_name'
  end
where ("provider_display_name" is null or trim("provider_display_name") = '')
  and coalesce("accounts"."deleted", 0) != 1
  and exists (
    select 1
    from "bank_details"
    where "bank_details"."account_id" = "accounts"."id"
      and coalesce("bank_details"."deleted", 0) != 1
      and "bank_details"."bank_name" is not null
      and trim("bank_details"."bank_name") != ''
  );`
        ),
        unsafeExecuteSql(
          `insert or ignore into "account_sms_senders" (
  "id",
  "account_id",
  "sender_name",
  "normalized_sender_name",
  "created_at",
  "updated_at",
  "deleted",
  "_status",
  "_changed"
)
select
  "deduped_senders"."id",
  "deduped_senders"."account_id",
  "deduped_senders"."sender_name",
  "deduped_senders"."normalized_sender_name",
  "deduped_senders"."created_at",
  "deduped_senders"."updated_at",
  0,
  "deduped_senders"."sync_status",
  ''
from (
  select
    min("legacy_senders"."id") as "id",
    "legacy_senders"."account_id",
    min("legacy_senders"."sender_name") as "sender_name",
    lower("legacy_senders"."sender_name") as "normalized_sender_name",
    min("legacy_senders"."created_at") as "created_at",
    max("legacy_senders"."updated_at") as "updated_at",
    case
      when max("legacy_senders"."should_sync") = 1 then 'created'
      else 'synced'
    end as "sync_status"
  from (
    select
      "bank_details"."id",
      "bank_details"."account_id",
      replace(replace(replace(replace(replace(trim(replace(replace(replace("bank_details"."sms_sender_name", char(9), ' '), char(10), ' '), char(13), ' ')), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ') as "sender_name",
      coalesce("bank_details"."created_at", strftime('%s', 'now') * 1000) as "created_at",
      coalesce("bank_details"."updated_at", strftime('%s', 'now') * 1000) as "updated_at",
      case
        when "accounts"."_status" = 'created' then 1
        when coalesce("bank_details"."_status", 'synced') != 'synced' then 1
        else 0
      end as "should_sync"
    from "bank_details"
    join "accounts" on "accounts"."id" = "bank_details"."account_id"
    where coalesce("bank_details"."deleted", 0) != 1
      and coalesce("accounts"."deleted", 0) != 1
      and "bank_details"."sms_sender_name" is not null
      and trim("bank_details"."sms_sender_name") != ''
  ) as "legacy_senders"
  group by
    "legacy_senders"."account_id",
    lower("legacy_senders"."sender_name")
) as "deduped_senders";`
        ),
        unsafeExecuteSql(
          'create unique index if not exists "account_sms_senders_one_active_normalized" on "account_sms_senders" ("account_id", "normalized_sender_name") where coalesce("deleted", 0) != 1;'
        ),
      ],
    },
    {
      toVersion: 22,
      steps: [
        unsafeExecuteSql(
          `update "bank_details"
set "card_last_4" = case
  when "card_last_4" is null then null
  when trim(cast("card_last_4" as text)) glob '[0-9][0-9][0-9][0-9]' then cast(trim(cast("card_last_4" as text)) as integer)
  when trim(cast("card_last_4" as text)) glob '[0-9][0-9][0-9]' then cast(trim(cast("card_last_4" as text)) as integer)
  when trim(cast("card_last_4" as text)) glob '[0-9][0-9]' then cast(trim(cast("card_last_4" as text)) as integer)
  when trim(cast("card_last_4" as text)) glob '[0-9]' then cast(trim(cast("card_last_4" as text)) as integer)
  else null
end;`
        ),
      ],
    },
    {
      toVersion: 23,
      steps: [
        addColumns({
          table: "profiles",
          columns: [
            {
              name: "ai_processing_consent",
              type: "string",
              isOptional: true,
            },
          ],
        }),
      ],
    },
    {
      toVersion: 24,
      steps: [
        createTable({
          name: "sms_ai_negative_outcomes",
          columns: [
            { name: "user_id", type: "string", isIndexed: true },
            { name: "sms_fingerprint", type: "string", isIndexed: true },
            { name: "original_received_at", type: "string" },
            { name: "strike_count", type: "number" },
            { name: "is_terminal", type: "boolean" },
            { name: "terminal_at", type: "string", isOptional: true },
            { name: "last_classified_at", type: "string" },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
            { name: "deleted", type: "boolean" },
          ],
        }),
      ],
    },
    {
      toVersion: 25,
      steps: [
        createTable({
          name: "sms_review_queues",
          columns: [
            { name: "user_id", type: "string", isIndexed: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
        createTable({
          name: "sms_review_draft_items",
          columns: [
            { name: "queue_id", type: "string", isIndexed: true },
            { name: "user_id", type: "string", isIndexed: true },
            { name: "sms_fingerprint", type: "string", isIndexed: true },
            { name: "payload_version", type: "number" },
            { name: "payload_json", type: "string" },
            {
              name: "selection_override",
              type: "boolean",
              isOptional: true,
            },
            { name: "position", type: "number" },
            { name: "parsed_at", type: "number", isIndexed: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
        createTable({
          name: "dismissed_sms_fingerprints",
          columns: [
            { name: "user_id", type: "string", isIndexed: true },
            { name: "sms_fingerprint", type: "string", isIndexed: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 26,
      steps: [
        createTable({
          name: "financial_action_groups",
          columns: [
            { name: "action_id", type: "string", isIndexed: true },
            { name: "user_id", type: "string", isIndexed: true },
            { name: "domain", type: "string" },
            { name: "kind", type: "string" },
            { name: "domain_reference_id", type: "string", isIndexed: true },
            { name: "payload_json", type: "string" },
            { name: "payload_hash", type: "string" },
            {
              name: "expected_account_revision",
              type: "string",
              isOptional: true,
            },
            { name: "state", type: "string" },
            { name: "server_outcome", type: "string", isOptional: true },
            { name: "outcome_json", type: "string", isOptional: true },
            { name: "rejection_code", type: "string", isOptional: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
            { name: "deleted", type: "boolean" },
          ],
        }),
      ],
    },
  ],
});
