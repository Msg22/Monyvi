import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const MIGRATION_PATH = "supabase/migrations/069_account_financial_effects.sql";

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("069 account financial-effects recovery contracts", () => {
  it("owns one locally generated effect UUID through payload, local row, server row, and pull", () => {
    const logic = source(
      "packages/logic/src/financial-actions/account-balance-effects-registry.ts"
    );
    const command = source(
      "apps/mobile/services/account-balance-command-service.ts"
    );
    const production = source(
      "apps/mobile/services/account-balance-command-production.ts"
    );
    const sql = source(MIGRATION_PATH);
    const pull = source("apps/mobile/services/sync/pull-strategies.ts");

    expect(logic).toContain("effectId");
    expect(command).toContain("effectId");
    expect(production).toMatch(/_raw\.id\s*=\s*input\.effectId/);
    expect(sql).toMatch(
      /accountEffects[\s\S]*ARRAY\[[^\]]*'effectId'[^\]]*\]::text\[\]/
    );
    expect(sql).toMatch(
      /insert\s+into\s+public\.account_financial_effects\s*\(\s*id\s*,/i
    );
    expect(sql).toContain("(effect.value ->> 'effectId')::uuid");
    expect(pull).toContain("account_financial_effects");
  });

  it("returns a verified canonical account snapshot and effect chain for stale recovery", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("account_financial_canonical_snapshot_v1");
    expect(sql).toContain("'balanceMinorUnits'");
    expect(sql).toContain("'currency'");
    expect(sql).toContain("'canonicalRevision'");
    expect(sql).toContain("'canonicalEvidenceHash'");
    expect(sql).toContain("'effectId'");
    expect(sql).toContain("'effectEvidenceHash'");
    expect(sql).toContain("'effectChain'");
  });

  it("preserves durable non-success outcomes during same-ID replay", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toMatch(
      /if\s+v_existing\.server_outcome\s*=\s*'accepted'[\s\S]*'idempotent'[\s\S]*else[\s\S]*v_existing\.outcome_json::jsonb/i
    );
    expect(sql).not.toMatch(
      /return\s+jsonb_set\(\s*v_existing\.outcome_json::jsonb\s*,\s*'\{status\}'[\s\S]*'"idempotent"'/i
    );
  });

  it("classifies expected domain conflicts durably while rethrowing infrastructure failures", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("financial_action_domain_conflict_outcome_v1");
    expect(sql).toContain("financial_action_domain_revision_stale");
    expect(sql).toContain("financial_action_domain_reference_invalid");
    expect(sql).toContain("financial_action_domain_unique_conflict");
    expect(sql).toMatch(/when\s+sqlstate\s+in\s*\(/i);
    expect(sql).toMatch(/else[\s\S]*raise;/i);
  });

  it("uses a monotonic lossless recurring-payment revision instead of timestamp equality", () => {
    const sql = source(MIGRATION_PATH);
    const schema = source("packages/db/src/schema.ts");
    const migrations = source("packages/db/src/migrations.ts");
    const model = source(
      "packages/db/src/models/base/base-recurring-payment.ts"
    );
    const service = source(
      "apps/mobile/services/recurring-payment-financial-action-service.ts"
    );

    expect(sql).toMatch(
      /alter\s+table\s+public\.recurring_payments[\s\S]*add\s+column\s+financial_revision\s+bigint\s+not\s+null\s+default\s+0/i
    );
    expect(sql).toMatch(
      /payment\.financial_revision\s*=\s*private\.financial_action_account_revision_from_text_v1/i
    );
    expect(sql).toMatch(/financial_revision\s*=\s*payment\.financial_revision\s*\+\s*1/i);
    expect(sql).not.toMatch(
      /payment\.updated_at\s*=\s*\(p_record\s*->>\s*'expectedUpdatedAt'\)::timestamptz/i
    );
    expect(schema).toMatch(
      /name:\s*"recurring_payments"[\s\S]*name:\s*"financial_revision"/
    );
    expect(migrations).toMatch(
      /table:\s*"recurring_payments"[\s\S]*name:\s*"financial_revision"/
    );
    expect(model).toContain("financialRevision");
    expect(service).toContain("expectedFinancialRevision");
    expect(service).not.toContain("expectedUpdatedAt: payment.updatedAt");
  });

  it("widens every BTC account-action projection to eight decimal places", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toMatch(
      /alter\s+table\s+public\.accounts[\s\S]*alter\s+column\s+balance\s+type\s+numeric\(20\s*,\s*8\)/i
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.transactions[\s\S]*alter\s+column\s+amount\s+type\s+numeric\(20\s*,\s*8\)/i
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.recurring_payments[\s\S]*alter\s+column\s+amount\s+type\s+numeric\(20\s*,\s*8\)/i
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.transfers[\s\S]*alter\s+column\s+amount\s+type\s+numeric\(20\s*,\s*8\)[\s\S]*alter\s+column\s+converted_amount\s+type\s+numeric\(20\s*,\s*8\)/i
    );
  });

  it("extends rather than erases every active Metals payload registration", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("metals.add/v1");
    expect(sql).toContain("metals.correct/v1");
    expect(sql).toContain("metals.sell/v2");
    expect(sql).toContain("metals.dispose/v1");
    expect(sql).toContain("metals.delete/v1");
    expect(sql).toContain("metals.undo/v1");
  });

  it("backfills the actual Watermelon required-string default to canonical zero", () => {
    const migrations = source("packages/db/src/migrations.ts");

    expect(migrations).toMatch(
      /update\s+accounts\s+set\s+financial_revision\s*=\s*'0'[\s\S]*financial_revision\s+is\s+null[\s\S]*financial_revision\s*=\s*''/i
    );
  });
});
