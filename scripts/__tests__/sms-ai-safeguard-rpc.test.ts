import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/061_sms_ai_safeguards.sql"
);
const providerStartRepairMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/063_fix_sms_ai_provider_start_outcomes.sql"
);
const scanAnchorAndPrivacyMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/064_fix_sms_scan_anchor_and_ledger_privacy.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

function readReserveFunction(): string {
  const sql = readMigration();
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.sms_ai_reserve_work"
  );
  const end = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.sms_ai_get_availability"
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return sql.slice(start, end);
}

function readAvailabilityFunction(): string {
  const sql = readMigration();
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.sms_ai_get_availability"
  );
  const end = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.sms_ai_mark_provider_started"
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return sql.slice(start, end);
}

test("serializes combined per-session and rolling reservations", () => {
  const sql = readMigration();

  assert.match(
    sql,
    /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text \|\| ':' \|\| p_capability/
  );
  assert.match(
    sql,
    /scan_session_id = p_scan_session_id[\s\S]*status IN \([\s\S]*'reserved'[\s\S]*'provider_started'[\s\S]*'completed'[\s\S]*'completed_with_provider_error'/
  );
  assert.match(
    sql,
    /sms_ai_usage_events[\s\S]*started_at > v_now - make_interval\(secs => p_rolling_window_seconds\)[\s\S]*UNION ALL[\s\S]*reservation_expires_at > v_now/
  );
});

test("reclaims a stale five-minute reservation without violating request identity", () => {
  const sql = readReserveFunction();

  assert.match(sql, /reservation_expires_at <= v_now/);
  assert.match(
    sql,
    /v_existing\.status = 'reserved'[\s\S]*UPDATE public\.sms_ai_work_requests[\s\S]*WHERE id = v_existing\.id/
  );
  assert.match(
    sql,
    /v_existing\.status = 'reserved'[\s\S]*reservation_expired[\s\S]*status = 'reserved'[\s\S]*RETURN QUERY SELECT v_existing\.id/
  );
  assert.match(sql, /reservation_lease_seconds/);
  assert.match(sql, /v_reclaimed_request_id uuid/);
  assert.match(
    sql,
    /status = 'reserved', decision_code = 'accepted'[\s\S]*WHERE id = v_reclaimed_request_id/
  );
});

test("records exactly one provider-start event and makes post-start replay unavailable", () => {
  const sql = readMigration();

  assert.match(sql, /sms_ai_usage_events_request_once UNIQUE \(request_id\)/);
  assert.match(sql, /ON CONFLICT \(request_id\) DO NOTHING/);
  assert.match(
    sql,
    /v_work\.status IN \('provider_started', 'completed', 'completed_with_provider_error'\)[\s\S]*already_processed_result_unavailable/
  );
  assert.match(sql, /provider_started_at = v_now/);
});

test("uses server time and returns the latest combined availability blocker", () => {
  const sql = readReserveFunction();

  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /GREATEST\(/);
  assert.match(
    sql,
    /rolling_limit[\s\S]*available_at[\s\S]*burst_limit[\s\S]*available_at[\s\S]*history_cooldown/
  );
  assert.match(
    sql,
    /v_first_history_start\s*\+\s*make_interval\(secs => p_history_cooldown_seconds\)/
  );
  assert.match(sql, /SELECT min\(event\.started_at\)/);
  assert.doesNotMatch(sql, /v_active_history_expiry/);
});

test("history cooldown excludes provider work from the current scan session", () => {
  const sql = readReserveFunction();
  const historyCooldownQueries = [
    ...sql.matchAll(
      /SELECT min\(event\.started_at\)[\s\S]*?work\.scan_kind = 'history'[\s\S]*?;/g
    ),
  ];

  assert.ok(historyCooldownQueries.length >= 2);
  for (const [query] of historyCooldownQueries) {
    assert.match(
      query,
      /work\.scan_session_id IS DISTINCT FROM p_scan_session_id/
    );
  }
});

test("keeps safeguard SQL private to trusted Edge service role", () => {
  const sql = readMigration();

  for (const functionName of [
    "sms_ai_reserve_work",
    "sms_ai_mark_provider_started",
    "sms_ai_release_work",
    "sms_ai_complete_work",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}[\\s\\S]*FROM PUBLIC, anon, authenticated`
      )
    );
    assert.match(
      sql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]*TO service_role`
      )
    );
  }
  assert.doesNotMatch(
    sql,
    /rawBody|sms_body|merchant|amount|category_id|account_id/
  );
});

test("provides a read-only server-time availability RPC for full-parser blockers", () => {
  const sql = readMigration();
  const availabilitySql = readAvailabilityFunction();

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.sms_ai_get_availability\(/i
  );
  assert.match(
    availabilitySql,
    /RETURNS TABLE[\s\S]*server_now timestamptz[\s\S]*rolling_available_at timestamptz[\s\S]*burst_available_at timestamptz[\s\S]*history_cooldown_available_at timestamptz[\s\S]*available_at timestamptz[\s\S]*reason text/i
  );
  assert.match(availabilitySql, /clock_timestamp\(\)/i);
  assert.match(availabilitySql, /sms_ai_usage_events/i);
  assert.match(availabilitySql, /status = 'reserved'/i);
  assert.match(availabilitySql, /GREATEST\(/i);
  assert.doesNotMatch(availabilitySql, /INSERT\s+INTO|UPDATE\s+public\./i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.sms_ai_get_availability[\s\S]*FROM PUBLIC, anon, authenticated/i
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.sms_ai_get_availability[\s\S]*TO service_role/i
  );
  assert.doesNotMatch(
    availabilitySql,
    /rawBody|sms_body|sender|merchant|amount|currency|category|account_id|fingerprint/i
  );
});

test("provider-start repair returns terminal peers and authoritative availability", () => {
  const repairSql = readFileSync(providerStartRepairMigrationPath, "utf8");
  const sql = readFileSync(scanAnchorAndPrivacyMigrationPath, "utf8");

  assert.match(
    sql,
    /RETURNS TABLE[\s\S]*started boolean[\s\S]*decision_code text[\s\S]*terminal_fingerprints text\[\][\s\S]*available_at timestamptz/i
  );
  assert.match(sql, /'terminal_outcome'::text[\s\S]*v_terminal_fingerprints/i);
  assert.match(sql, /'history_cooldown'::text[\s\S]*v_available_at/i);
  assert.match(repairSql, /sms_ai_mark_provider_started_v3/i);
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.sms_ai_mark_provider_started_v2/i
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.sms_ai_mark_provider_started_v3[\s\S]*FROM PUBLIC, anon, authenticated/i
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.sms_ai_mark_provider_started_v3[\s\S]*TO service_role/i
  );
});
