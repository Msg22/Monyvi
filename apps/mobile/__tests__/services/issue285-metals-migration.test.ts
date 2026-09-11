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

  it("uses migration 071 to validate before sale-date checks and return a complete winner group", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../../supabase/migrations/071_metals_canonical_group_reconciliation.sql"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf8");
    const hashIndex = sql.indexOf("extensions.digest");
    const lockIndex = sql.indexOf("pg_advisory_xact_lock");
    const saleDateIndex = sql.indexOf("saleDate", lockIndex);
    expect(sql).toContain("financial_action_canonical_json_v1");
    expect(hashIndex).toBeGreaterThan(0);
    expect(lockIndex).toBeGreaterThan(hashIndex);
    expect(saleDateIndex).toBeGreaterThan(lockIndex);
    expect(sql).toContain("canonicalActionGroup");
    expect(sql).toContain("financial_action_groups");
    expect(sql).toContain("metal_action_evidence");
    expect(sql).toContain("metal_lifecycle_events");
    expect(sql).toContain("metal_rate_references");
    expect(sql).not.toMatch(/CREATE\s+TABLE|ADD\s+COLUMN/i);
  });
});
