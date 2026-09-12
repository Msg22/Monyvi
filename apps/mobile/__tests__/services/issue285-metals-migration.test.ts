import fs from "fs";
import path from "path";

describe("issue #285 post-068 migration contract", () => {
  it("uses reserved migration 070 and installs the reconciliation hardening", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../../supabase/migrations/070_metals_reconciliation_hardening.sql"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("saleDate");
    expect(sql).toContain("'INVALID_LINK'");
    expect(sql).toContain("canonicalHolding");
    expect(sql).toContain("purchase_date");
    expect(sql).toContain("item_form");
    expect(sql).not.toContain("metal_sale_before_acquisition");
  });

  it("uses migration 071 to replay accepted actions before sale-date checks and share the holding lock with metadata", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../../supabase/migrations/071_metals_canonical_group_reconciliation.sql"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf8");
    const hashIndex = sql.indexOf("extensions.digest");
    const actionLockIndex = sql.indexOf("pg_advisory_xact_lock");
    const replayIndex = sql.indexOf("SELECT * INTO v_existing", actionLockIndex);
    const acceptedReplayIndex = sql.indexOf(
      "v_existing.state = 'accepted'",
      replayIndex
    );
    const saleDateIndex = sql.indexOf(
      "IF v_envelope ->> 'kind' = 'sell'",
      actionLockIndex
    );
    const metadataWrapperIndex = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.apply_metal_metadata_patch_v1"
    );
    const metadataLockIndex = sql.indexOf(
      "pg_advisory_xact_lock",
      metadataWrapperIndex
    );
    expect(sql).toContain("financial_action_canonical_json_v1");
    expect(hashIndex).toBeGreaterThan(0);
    expect(actionLockIndex).toBeGreaterThan(hashIndex);
    expect(replayIndex).toBeGreaterThan(actionLockIndex);
    expect(acceptedReplayIndex).toBeGreaterThan(replayIndex);
    expect(saleDateIndex).toBeGreaterThan(acceptedReplayIndex);
    expect(metadataWrapperIndex).toBeGreaterThan(saleDateIndex);
    expect(metadataLockIndex).toBeGreaterThan(metadataWrapperIndex);
    expect(sql).toContain("canonicalActionGroup");
    expect(sql).toContain("financial_action_groups");
    expect(sql).toContain("metal_action_evidence");
    expect(sql).toContain("metal_lifecycle_events");
    expect(sql).toContain("metal_rate_references");
    expect(sql).not.toMatch(/CREATE\s+TABLE|ADD\s+COLUMN/i);
  });
});
