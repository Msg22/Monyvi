import { tableSchema } from "@nozbe/watermelondb";

export const METAL_HISTORICAL_RATE_CACHE_TABLES = [
  tableSchema({
    name: "metal_historical_rate_cache",
    unsafeSql: (sql: string): string =>
      sql +
      'create unique index if not exists "metal_historical_rate_cache_owner_provider_date_unique" on "metal_historical_rate_cache" ("user_id", "provider_key", "rate_date");',
    columns: [
      { name: "user_id", type: "string", isIndexed: true },
      { name: "provider_key", type: "string", isIndexed: true },
      { name: "rate_date", type: "string", isIndexed: true },
      { name: "resolution", type: "string" },
      { name: "gold_usd_per_troy_ounce_decimal", type: "string" },
      { name: "silver_usd_per_troy_ounce_decimal", type: "string" },
      { name: "gold_usd_per_pure_gram_decimal", type: "string" },
      { name: "silver_usd_per_pure_gram_decimal", type: "string" },
      { name: "currencies_usd_per_unit_json", type: "string" },
      {
        name: "provider_response_timestamp",
        type: "string",
        isOptional: true,
      },
      { name: "fetched_at", type: "number" },
      { name: "response_digest", type: "string" },
      { name: "source", type: "string" },
      { name: "quality", type: "string" },
      { name: "contract_version", type: "number" },
      { name: "created_at", type: "number" },
      { name: "updated_at", type: "number" },
    ],
  }),
] as const;
