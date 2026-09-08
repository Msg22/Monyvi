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
});
