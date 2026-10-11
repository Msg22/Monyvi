import {
  createTable,
  unsafeExecuteSql,
} from "@nozbe/watermelondb/Schema/migrations";

export const metalMetadataEditMigrationSteps = [
  createTable({
    name: "metal_metadata_edit_outcomes",
    columns: [
      { name: "user_id", type: "string", isIndexed: true },
      { name: "holding_id", type: "string", isIndexed: true },
      {
        name: "action_id",
        type: "string",
        isOptional: true,
        isIndexed: true,
      },
      { name: "payload_hash", type: "string" },
      { name: "request_json", type: "string" },
      { name: "status", type: "string" },
      { name: "local_applied_changes_json", type: "string" },
      { name: "applied_changes_json", type: "string", isOptional: true },
      {
        name: "canonical_metadata_json",
        type: "string",
        isOptional: true,
      },
      { name: "occurred_at", type: "number", isIndexed: true },
      { name: "created_at", type: "number" },
      { name: "updated_at", type: "number" },
      { name: "deleted", type: "boolean" },
    ],
  }),
  unsafeExecuteSql(
    'create unique index if not exists "metal_metadata_edit_outcomes_owner_edit_unique" on "metal_metadata_edit_outcomes" ("user_id", "id");create index if not exists "metal_metadata_edit_outcomes_owner_holding_time" on "metal_metadata_edit_outcomes" ("user_id", "holding_id", "occurred_at", "id");'
  ),
];
