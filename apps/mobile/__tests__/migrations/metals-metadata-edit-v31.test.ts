import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { CreateTableMigrationStep } from "@nozbe/watermelondb/Schema/migrations";
import { schema } from "../../../../packages/db/src/schema";
import { migrations } from "../../../../packages/db/src/migrations";
import { MetalMetadataEdit } from "../../../../packages/db/src/models/MetalMetadataEdit";

const ROOT = resolve(__dirname, "../../../..");

describe("METALS-363 v31 durable applied-metadata schema", () => {
  it("extends #355 Watermelon version 30 without renumbering it", () => {
    expect(schema.version).toBe(31);
    expect(schema.tables.metal_historical_rate_cache).toBeDefined();
    expect(schema.tables.metal_metadata_edit_outcomes).toBeDefined();
    expect(
      migrations.sortedMigrations
        .map(
          (migration: (typeof migrations.sortedMigrations)[number]) =>
            migration.toVersion
        )
        .slice(-2)
    ).toEqual([30, 31]);

    const metadataMigration = migrations.sortedMigrations.find(
      (migration: (typeof migrations.sortedMigrations)[number]) =>
        migration.toVersion === 31
    );
    const createTableStep = metadataMigration?.steps.find(
      (step): step is CreateTableMigrationStep => step.type === "create_table"
    );
    expect(createTableStep).toBeDefined();
    expect(createTableStep?.schema.name).toBe("metal_metadata_edit_outcomes");
  });

  it("preserves nullable exact snapshot proof in the unpublished #355 cache base", () => {
    const columns = schema.tables.metal_historical_rate_cache?.columns;
    expect(columns?.snapshot_id).toMatchObject({
      type: "string",
      isOptional: true,
    });
    expect(columns?.metal_provider_observed_at).toMatchObject({
      type: "string",
      isOptional: true,
    });
    expect(columns?.currency_provider_observed_at).toMatchObject({
      type: "string",
      isOptional: true,
    });
  });

  it("keeps local provisional evidence nullable before server adjudication", () => {
    const table = schema.tables.metal_metadata_edit_outcomes;
    expect(table?.columns.applied_changes_json.isOptional).toBe(true);
    expect(table?.columns.canonical_metadata_json.isOptional).toBe(true);
    expect(MetalMetadataEdit.table).toBe("metal_metadata_edit_outcomes");
  });

  it("requires SQL 087 server-issued immutable evidence, owner scope and no legacy metadata RPC bypass", () => {
    const sql = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/087_metals_metadata_applied_history.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("CREATE TABLE public.metal_metadata_edit_outcomes");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("metal_metadata_edit_outcomes_immutable");
    expect(sql).toContain(
      "CREATE FUNCTION public.apply_metal_metadata_edit_v1"
    );
    expect(sql).toContain("metal_metadata_edit_payload_hash_mismatch");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.apply_metal_metadata_patch_v1"
    );
    expect(sql).not.toMatch(
      /INSERT INTO public.metal_metadata_edit_outcomes[\s\S]*SELECT[\s\S]*FROM public.assets[\s\S]*backfill/i
    );
  });
});
