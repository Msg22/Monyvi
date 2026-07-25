import { readFileSync } from "fs";
import path from "path";

function readMigrationSql(): string {
  return readFileSync(
    path.resolve(
      __dirname,
      "../../../../supabase/migrations/061_sms_ai_safeguards.sql"
    ),
    "utf8"
  );
}

function readReconciliationFixSql(): string {
  return readFileSync(
    path.resolve(
      __dirname,
      "../../../../supabase/migrations/062_fix_sms_ai_outcome_reconciliation.sql"
    ),
    "utf8"
  );
}

function readPrivacyAndScanSessionFixSql(): string {
  return readFileSync(
    path.resolve(
      __dirname,
      "../../../../supabase/migrations/064_fix_sms_scan_anchor_and_ledger_privacy.sql"
    ),
    "utf8"
  );
}

function readLedgerFingerprintRemovalSql(): string {
  return readFileSync(
    path.resolve(
      __dirname,
      "../../../../supabase/migrations/065_remove_sms_ai_work_request_fingerprints.sql"
    ),
    "utf8"
  );
}

function readCompletionReplayFixSql(): string {
  return readFileSync(
    path.resolve(
      __dirname,
      "../../../../supabase/migrations/066_make_sms_ai_completion_idempotent.sql"
    ),
    "utf8"
  );
}

describe("SMS AI safeguards migration", () => {
  it("creates only privacy-safe synchronized negative outcomes", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(
      /CREATE TABLE public\.sms_ai_negative_outcomes[\s\S]*user_id uuid NOT NULL[\s\S]*sms_fingerprint text NOT NULL[\s\S]*original_received_at timestamptz NOT NULL[\s\S]*strike_count integer NOT NULL[\s\S]*is_terminal boolean NOT NULL[\s\S]*terminal_at timestamptz[\s\S]*last_classified_at timestamptz NOT NULL[\s\S]*deleted boolean NOT NULL DEFAULT false/i
    );
    expect(sql).toMatch(/CHECK \(strike_count BETWEEN 1 AND 3\)/i);
    expect(sql).toMatch(/CHECK \(is_terminal = \(strike_count = 3\)\)/i);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*sms_ai_negative_outcomes[\s\S]*\(user_id, sms_fingerprint\)[\s\S]*WHERE deleted = false/i
    );
    expect(sql).not.toMatch(
      /sms_body|raw_sms|sender_name|merchant|amount|currency|category_id|account_id|card_last/i
    );
  });

  it("allows authenticated users to pull only their outcomes and forbids client writes", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(
      /CREATE POLICY[\s\S]*sms_ai_negative_outcomes[\s\S]*FOR SELECT TO authenticated[\s\S]*\(SELECT auth\.uid\(\)\) = user_id/i
    );
    expect(sql).not.toMatch(
      /CREATE POLICY[\s\S]*sms_ai_negative_outcomes[\s\S]*FOR (?:INSERT|UPDATE|DELETE|ALL) TO authenticated/i
    );
  });

  it("creates server-only idempotency and usage ledgers", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/CREATE TABLE public\.sms_ai_work_requests/i);
    expect(sql).toMatch(/CREATE TABLE public\.sms_ai_usage_events/i);
    expect(sql).toMatch(/UNIQUE \(user_id, capability, request_key\)/i);
    expect(sql).toMatch(/UNIQUE \(request_id\)/i);
    expect(sql).toMatch(/reservation_expires_at timestamptz/i);
    expect(sql).toMatch(/provider_started_at timestamptz/i);
    expect(sql).not.toMatch(
      /CREATE POLICY[\s\S]*(?:sms_ai_work_requests|sms_ai_usage_events)[\s\S]*TO authenticated/i
    );
  });

  it("provides atomic reserve, start, release, completion, and outcome RPCs", () => {
    const sql = readMigrationSql();

    for (const functionName of [
      "sms_ai_reserve_work",
      "sms_ai_mark_provider_started",
      "sms_ai_release_work",
      "sms_ai_complete_work",
      "sms_ai_reconcile_outcomes",
      "sms_ai_cleanup_safeguards",
    ]) {
      expect(sql).toContain(`FUNCTION public.${functionName}`);
    }

    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/reservation_expires_at <= v_now/i);
    expect(sql).toMatch(/LEAST\([^;]*3\)/i);
    expect(sql).toMatch(/ON CONFLICT \(request_id\) DO NOTHING/i);
  });

  it("disambiguates outcome return variables from persisted columns", () => {
    const sql = readReconciliationFixSql();

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.sms_ai_reconcile_outcomes"
    );
    expect(sql).toMatch(/#variable_conflict use_column/i);
  });

  it("hardens deployed safeguard ledgers with digest identity and provider-start checks", () => {
    const sql = readReconciliationFixSql();

    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS request_digest text/i);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS candidate_fingerprints/i);
    expect(sql).toContain("FUNCTION public.sms_ai_reserve_work_v2");
    expect(sql).toContain("FUNCTION public.sms_ai_mark_provider_started_v2");
    expect(sql).toMatch(/idempotency_conflict/i);
    expect(sql).toMatch(/sms_ai_negative_outcomes[\s\S]*is_terminal = true/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
  });

  it("adds lifecycle indexes and a self-contained updated-at trigger", () => {
    const sql = readReconciliationFixSql();

    expect(sql).toMatch(/sms_ai_negative_outcomes_cleanup/i);
    expect(sql).toMatch(/sms_ai_work_requests_cleanup/i);
    expect(sql).toContain(
      "FUNCTION public.set_sms_ai_negative_outcome_updated_at"
    );
    expect(sql).toMatch(
      /EXECUTE FUNCTION public\.set_sms_ai_negative_outcome_updated_at\(\)/i
    );
  });

  it("binds an immutable scan window and removes raw fingerprints from allowance rows", () => {
    const sql = readPrivacyAndScanSessionFixSql();

    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.sms_ai_scan_sessions/i
    );
    expect(sql).toContain("FUNCTION public.sms_ai_resolve_scan_window");
    expect(sql).toMatch(/accepted_scan_started_at timestamptz NOT NULL/i);
    expect(sql).toMatch(
      /UPDATE public\.sms_ai_work_requests[\s\S]*candidate_fingerprints = ARRAY\[\]::text\[\][\s\S]*CREATE TRIGGER scrub_sms_ai_work_request_fingerprints/i
    );
    expect(sql).toContain("FUNCTION public.sms_ai_mark_provider_started_v3");
    expect(sql).toMatch(
      /ALTER TABLE public\.sms_ai_scan_sessions ENABLE ROW LEVEL SECURITY[\s\S]*REVOKE ALL ON public\.sms_ai_scan_sessions FROM PUBLIC, anon, authenticated/i
    );
    expect(sql).toMatch(
      /sms_ai_mark_provider_started_v3\([\s\S]*p_candidate_fingerprints text\[\]/i
    );
  });

  it("anchors active history cooldowns to each scan session's first provider start", () => {
    for (const sql of [
      readMigrationSql(),
      readPrivacyAndScanSessionFixSql(),
      readLedgerFingerprintRemovalSql(),
    ]) {
      expect(sql).toMatch(
        /SELECT min\(history_scan\.first_started_at\)[\s\S]*GROUP BY COALESCE\(work\.scan_session_id, work\.id::text\)[\s\S]*WHERE history_scan\.first_started_at >[\s\S]*make_interval/i
      );
    }
  });

  it("removes the preview compatibility fingerprint column after replacing its writer", () => {
    const sql = readLedgerFingerprintRemovalSql();

    expect(sql).toContain("FUNCTION public.sms_ai_reserve_work_v2");
    expect(sql).not.toMatch(
      /SET[\s\S]{0,200}candidate_fingerprints\s*=\s*p_candidate_fingerprints/i
    );
    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS scrub_sms_ai_work_request_fingerprints[\s\S]*DROP COLUMN IF EXISTS candidate_fingerprints/i
    );
  });

  it("treats an exact completion replay as success without accepting conflicting outcomes", () => {
    const sql = readCompletionReplayFixSql();

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.sms_ai_complete_work"
    );
    expect(sql).toMatch(/status = v_target_status/i);
    expect(sql).toMatch(/decision_code IS NOT DISTINCT FROM p_decision_code/i);
    expect(sql).toMatch(/IF FOUND THEN[\s\S]*RETURN true/i);
  });

  it("schedules trusted cleanup without expiring terminal outcomes", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(
      /UPDATE public\.sms_ai_negative_outcomes[\s\S]*is_terminal = false[\s\S]*original_received_at < v_now - make_interval\(days => p_lookback_days\)/i
    );
    expect(sql).toMatch(
      /cron\.schedule\([\s\S]*sms-ai-safeguard-cleanup[\s\S]*sms_ai_cleanup_safeguards\(30, 35\)/i
    );
  });

  it("restricts safeguard RPC execution to the service role", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.sms_ai_reserve_work/i);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sms_ai_reserve_work[\s\S]*TO service_role/i
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sms_ai_[a-z_]+[\s\S]*TO (?:anon|authenticated|public)/i
    );
  });
});
