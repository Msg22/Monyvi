import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const MIGRATION_PATH = "supabase/migrations/069_account_financial_effects.sql";

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("069 account financial-effects cutover", () => {
  it("adds a revision-zero bigint boundary without fabricating history", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toMatch(
      /alter\s+table\s+public\.accounts[\s\S]*add\s+column\s+financial_revision\s+bigint\s+not\s+null\s+default\s+0/i
    );
    expect(sql).toMatch(/financial_revision[\s\S]*9223372036854775807/i);
    expect(sql).not.toMatch(
      /insert\s+into\s+public\.(?:financial_action_groups|account_financial_effects)[^;]*select[^;]*from\s+public\.accounts/i
    );
  });

  it("creates exact immutable owner-bound account effects", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("CREATE TABLE public.account_financial_effects");
    expect(sql).toMatch(/amount_minor_units\s+bigint\s+not\s+null/i);
    expect(sql).toMatch(/accepted_account_revision\s+bigint\s+not\s+null/i);
    expect(sql).toMatch(/reverses_effect_id\s+uuid/i);
    expect(sql).toContain("account_financial_effects_reversal_once_unique");
    expect(sql).toMatch(/is_effective\s+boolean\s+not\s+null/i);
    expect(sql).toMatch(/compensated_at\s+timestamptz/i);
    expect(sql).toMatch(/deleted\s+boolean\s+not\s+null\s+default\s+false/i);
    expect(sql).toMatch(
      /account_financial_effect_domain[\s\S]*domain\s+in\s*\(\s*'accounts'\s*,\s*'metals'\s*,\s*'transactions'/i
    );
    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*user_id\s*,\s*action_id\s*\)[\s\S]*references\s+public\.financial_action_groups\s*\(\s*user_id\s*,\s*action_id\s*\)/i
    );
    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*user_id\s*,\s*account_id\s*\)[\s\S]*references\s+public\.accounts\s*\(\s*user_id\s*,\s*id\s*\)/i
    );
  });

  it("enforces canonical sorted account guards and one effect per guard", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain(
      "DROP CONSTRAINT financial_action_groups_foundation_guards_empty"
    );
    expect(sql).toContain("financial_action_validate_account_guards_v1");
    expect(sql).toContain("financial_action_account_effects_match_guards_v1");
    expect(sql).toMatch(
      /constraint\s+trigger[\s\S]*deferrable\s+initially\s+deferred/i
    );
    expect(sql).toContain("financial_action_account_guards_invalid");
    expect(sql).toContain("financial_action_account_effects_mismatch");
    expect(sql).toMatch(
      /effect\.currency\s+is\s+distinct\s+from\s+account\.currency/i
    );
    expect(sql).toMatch(/effect\.domain\s+is\s+distinct\s+from\s+v_domain/i);
  });

  it("prevents bigint overflow and revision gaps at storage boundaries", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("account_financial_effect_amount_nonzero");
    expect(sql).toContain("account_financial_effect_amount_range");
    expect(sql).toContain("account_financial_effect_revision_positive");
    expect(sql).toContain("account_financial_effect_revision_range");
    expect(sql).toContain("9223372036854775807");
  });

  it("protects balances and revisions while allowing metadata-only account updates", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("account_financial_action_rpc_required");
    expect(sql).toContain("accounts_protect_financial_columns");
    expect(sql).toMatch(
      /new\.balance\s+is\s+distinct\s+from\s+old\.balance[\s\S]*new\.financial_revision\s+is\s+distinct\s+from\s+old\.financial_revision/i
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.recalculate_all_account_balances\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
    );
  });

  it("exposes effects as owner-only read-only rows", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain(
      "ALTER TABLE public.account_financial_effects ENABLE ROW LEVEL SECURITY"
    );
    expect(sql).toMatch(
      /create\s+policy\s+"Users can select own account financial effects"[\s\S]*for\s+select\s+to\s+authenticated[\s\S]*\(select\s+auth\.uid\(\)\)\s*=\s*user_id/i
    );
    expect(sql).toContain(
      "REVOKE ALL ON public.account_financial_effects FROM authenticated"
    );
    expect(sql).toContain(
      "GRANT SELECT ON public.account_financial_effects TO authenticated"
    );
    expect(sql).not.toMatch(/grant\s+all/i);
  });

  it("registers only the approved exact account-effects payload and explicit writer tuples", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain(
      "financial_action_validate_account_balance_effects_payload_v1"
    );
    expect(sql).toContain("account.balance-effects/v1");
    expect(sql).toContain("financial_action_account_operation_registered_v1");
    expect(sql).toMatch(/transactions[\s\S]*transaction\.create/);
    expect(sql).toMatch(/transfers[\s\S]*transfer\.create/);
    expect(sql).not.toMatch(
      /payload_version\s*=\s*'account\.balance-effects\/v[02-9]'/i
    );
  });

  it("activates one authenticated owner-scoped CAS RPC with durable ordered outcomes", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.apply_account_financial_action_v1\s*\(\s*p_payload_json\s+text\s*,\s*p_payload_hash\s+text\s*\)/i
    );
    expect(sql).toContain("PAYLOAD_HASH_MISMATCH");
    expect(sql).toContain("ACCOUNT_REVISION_STALE");
    expect(sql).toContain("INVALID_REVISION");
    expect(sql).toContain("REVISION_EXHAUSTED");
    expect(sql).toMatch(
      /order\s+by\s+account\.id(?:::text)?\s+collate\s+"C"[\s\S]*for\s+update/i
    );
    expect(sql).toMatch(
      /grant\s+execute[\s\S]*apply_account_financial_action_v1[\s\S]*authenticated/i
    );
  });

  it("commits each whitelisted domain mutation with its account effects in the same RPC", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toMatch(
      /'accountEffects'\s*,\s*'domainMutation'\s*,\s*'domainRecordRefs'\s*,\s*'operationCode'\s*,\s*'schemaVersion'/i
    );
    expect(sql).toContain("financial_action_validate_domain_mutation_v1");
    expect(sql).toContain("financial_action_dispatch_domain_mutation_v1");
    expect(sql).toContain("financial_action_apply_account_mutation_v1");
    expect(sql).toContain("financial_action_apply_transaction_mutation_v1");
    expect(sql).toContain("financial_action_apply_transfer_mutation_v1");
    expect(sql).toContain("financial_action_expected_account_effects_v1");
    expect(sql).toMatch(
      /v_expected_effects\s+is\s+distinct\s+from[\s\S]*accountEffects/i
    );
    expect(sql).toContain("financial_action_domain_revision_stale");
    expect(sql).toMatch(
      /perform\s+private\.financial_action_dispatch_domain_mutation_v1[\s\S]*update\s+public\.accounts/i
    );
    expect(sql).not.toMatch(/execute\s+format\s*\(/i);
  });

  it("drains or quarantines every legacy protected-field sync row before cutover", () => {
    const sql = source(MIGRATION_PATH);

    expect(sql).toContain("account_financial_action_cutover_quarantine");
    expect(sql).toContain("legacy_protected_field_write");
    expect(sql).toMatch(
      /revoke\s+all[\s\S]*account_financial_action_cutover_quarantine/i
    );
  });
});
