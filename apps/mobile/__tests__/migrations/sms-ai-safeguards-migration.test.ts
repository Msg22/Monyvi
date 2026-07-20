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
