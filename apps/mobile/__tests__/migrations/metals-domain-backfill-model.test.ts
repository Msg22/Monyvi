import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("068 Metals domain migration and persisted models", () => {
  const migrationPath = "supabase/migrations/068_metals_domain.sql";

  it("keeps the financial foundation before Metals and reserves 069", () => {
    expect(
      source("supabase/migrations/067_financial_action_foundation.sql")
    ).toContain("financial_action_groups");
    expect(() => source(migrationPath)).not.toThrow();
    expect(() =>
      source("supabase/migrations/069_account_financial_effects.sql")
    ).toThrow();
  });

  it("adds exact compatibility-preserving fields and a guarded Gold/Silver-only backfill", () => {
    const sql = source(migrationPath);

    expect(sql).toMatch(/purchase_price_decimal\s+numeric/i);
    expect(sql).toMatch(/purchase_currency\s+text/i);
    expect(sql).toMatch(/acquisition_action_id\s+uuid/i);
    expect(sql).toMatch(/weight_grams_decimal\s+numeric/i);
    expect(sql).toMatch(/purity_code\s+text/i);
    expect(sql).toMatch(/purity_factor_decimal\s+numeric/i);
    expect(sql).toMatch(/purity_catalog_version\s+text/i);
    expect(sql).toMatch(/metal_type\s+IN\s*\(\s*'GOLD'\s*,\s*'SILVER'\s*\)/);
    expect(sql).toMatch(/purchase_price_decimal\s+is\s+null/i);
    expect(sql).toMatch(/weight_grams_decimal\s+is\s+null/i);
    expect(sql).not.toMatch(/Platinum|Palladium/i);
    expect(sql).not.toMatch(/set\s+acquisition_action_id\s*=/i);
    expect(sql).toContain("purchase_price");
    expect(sql).toContain("purity_fraction");
    expect(sql).toMatch(
      /weight_grams\s*=\s*trunc\(\s*metal\.weight_grams\s*,\s*3\s*\)/i
    );
    expect(sql).toContain("'ZAR'");
    expect(sql).not.toContain("'currency:BTC'");
    expect(sql).toMatch(/0\.5833[\s\S]*gold-58333[\s\S]*0\.58333/i);
  });

  it("fails closed on incomplete purity, invalid rates, and unbound action evidence", () => {
    const sql = source(migrationPath);

    expect(sql).toMatch(
      /purity_code\s+is\s+not\s+null[\s\S]*purity_factor_decimal\s+is\s+not\s+null[\s\S]*purity_catalog_version\s+is\s+not\s+null/i
    );
    expect(sql).toMatch(/quality\s*=\s*'valid'/i);
    expect(sql).toMatch(/currency:USD[\s\S]*value_decimal\s*=\s*1/i);
    expect(sql).toMatch(
      /metal_action_evidence[\s\S]*user_id[\s\S]*action_id[\s\S]*holding_id/i
    );
    expect(sql).toMatch(/metal_action_rpc_required/i);
    expect(sql).not.toMatch(
      /REFERENCES public\.assets \(user_id, id\) ON DELETE CASCADE/i
    );
  });

  it("exposes bounded exact observation pages without using a data-derived watermark", () => {
    const sql = source(migrationPath);

    expect(sql).toContain("pull_metal_observations_page_v1");
    expect(sql).toMatch(/statement_timestamp\(\)/i);
    expect(sql).toMatch(/\(observation\.created_at,\s*observation\.id\)\s*>/i);
    expect(sql).toMatch(/observation\.created_at\s*<=\s*v_upper_watermark/i);
    expect(sql).toMatch(/value_decimal[\s\S]*::text/i);
    expect(sql).toMatch(
      /create\s+index\s+market_rate_observations_created_id_idx[\s\S]*\(created_at,\s*id\)/i
    );
    expect(sql).not.toMatch(/max\s*\(\s*created_at\s*\)/i);
  });

  it("creates owner-scoped projections and immutable evidence with canonical revisions", () => {
    const sql = source(migrationPath);

    for (const table of [
      "metal_holding_states",
      "metal_action_evidence",
      "metal_lifecycle_events",
      "metal_rate_references",
      "market_rate_observations",
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
    }
    expect(sql).toMatch(/financial_revision\s+bigint/i);
    expect(sql).toMatch(/expected_holding_revision\s+bigint/i);
    expect(sql).toMatch(/canonical_holding_revision\s+bigint/i);
    expect(sql).toMatch(/unique\s*\(\s*user_id\s*,\s*action_id\s*\)/gi);
    expect(sql).toMatch(
      /unique\s*\(\s*user_id\s*,\s*action_id\s*,\s*role\s*\)/i
    );
    expect(sql).toMatch(/9223372036854775807/);
    expect(sql).toMatch(
      /expected_holding_revision[\s\S]*metal_action_evidence/i
    );
    expect(
      source("supabase/migrations/067_financial_action_foundation.sql")
    ).not.toContain("expected_holding_revision");
  });

  it("enforces RLS, parent ownership, sync columns, and query indexes", () => {
    const sql = source(migrationPath);

    for (const table of [
      "metal_holding_states",
      "metal_action_evidence",
      "metal_lifecycle_events",
      "metal_rate_references",
    ]) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`
      );
      expect(sql).toMatch(
        new RegExp(`${table}[\\s\\S]*\\(SELECT auth\\.uid\\(\\)\\)`, "i")
      );
    }
    expect(sql).toMatch(
      /foreign key\s*\(\s*user_id\s*,\s*holding_id\s*\)\s+references\s+public\.assets/i
    );
    expect(sql).toMatch(
      /foreign key\s*\(\s*user_id\s*,\s*holding_id\s*,\s*effective_event_id\s*\)[\s\S]*references\s+public\.metal_lifecycle_events\s*\(\s*user_id\s*,\s*holding_id\s*,\s*id\s*\)/i
    );
    expect(sql).toMatch(
      /foreign key\s*\(\s*user_id\s*,\s*holding_id\s*,\s*predecessor_event_id\s*\)[\s\S]*references\s+public\.metal_lifecycle_events\s*\(\s*user_id\s*,\s*holding_id\s*,\s*id\s*\)/i
    );
    expect(sql).toMatch(
      /foreign key\s*\(\s*user_id\s*,\s*holding_id\s*,\s*reverses_event_id\s*\)[\s\S]*references\s+public\.metal_lifecycle_events\s*\(\s*user_id\s*,\s*holding_id\s*,\s*id\s*\)/i
    );
    expect(sql).toMatch(
      /join\s+public\.asset_metals[\s\S]*metal\.asset_id\s*=\s*asset\.id/i
    );
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.metal_revision_from_text_v1\(text\)\s+FROM PUBLIC, anon, authenticated/i
    );
    expect(sql).toMatch(
      /metal_holding_states[\s\S]*user_id[\s\S]*status[\s\S]*deleted/i
    );
    expect(sql).toMatch(/metal_rate_references[\s\S]*holding_id/i);
    expect(sql).toMatch(/created_at[\s\S]*updated_at[\s\S]*deleted/i);
  });

  it("registers schema version 27 and persisted-field-only models", () => {
    const schema = source("packages/db/src/schema.ts");
    const migrations = source("packages/db/src/migrations.ts");
    const database = source("packages/db/src/database.ts");
    const index = source("packages/db/src/index.ts");

    expect(schema).toContain("version: 27");
    expect(migrations).toContain("toVersion: 27");
    expect(migrations.indexOf('name: "metal_holding_states"')).toBeLessThan(
      migrations.indexOf("unsafeExecuteSql(METALS_V27_BACKFILL_SQL)")
    );
    expect(migrations).toMatch(
      /insert into "metal_holding_states"[\s\S]*?'synced', ''[\s\S]*?from "assets"/
    );
    for (const model of [
      "MetalHoldingState",
      "MetalActionEvidence",
      "MetalLifecycleEvent",
      "MetalRateReference",
      "MarketRateObservation",
    ]) {
      const modelSource = source(`packages/db/src/models/${model}.ts`);
      expect(database).toContain(model);
      expect(index).toContain(model);
      expect(modelSource).not.toMatch(/calculate|format|parse/i);
    }
    expect(schema).toContain("acquisition_action_id");
    expect(source(migrationPath)).toContain("acquisition_metal");
    expect(source(migrationPath)).toContain("acquisition_purchase_currency");
    expect(schema).toMatch(
      /name:\s*"source",\s*type:\s*"string",\s*isOptional:\s*true/
    );
    expect(source("packages/db/src/models/MetalRateReference.ts")).toContain(
      "source!: string | null"
    );
    expect(source("packages/db/src/models/MarketRateObservation.ts")).toContain(
      "source!: string | null"
    );
  });

  it("keeps every exact decimal and bigint revision as text at the generated boundary", () => {
    const types = source("packages/db/src/supabase-types.ts");

    expect(types).toMatch(
      /market_rate_observations:[\s\S]*value_decimal:\s*string/
    );
    expect(types).toMatch(
      /metal_rate_references:[\s\S]*value_decimal:\s*string/
    );
    expect(types).toMatch(
      /metal_holding_states:[\s\S]*financial_revision:\s*string/
    );
    expect(types).toMatch(
      /metal_action_evidence:[\s\S]*canonical_holding_revision:\s*string\s*\|\s*null/
    );
    expect(types).toMatch(
      /metal_action_evidence:[\s\S]*expected_holding_revision:\s*string\s*\|\s*null/
    );
  });
});
