-- MIG-080 RED-phase executable regression for the missing
-- public.sms_ai_get_availability RPC (hosted GET /sms-ai-availability 503).
--
-- Run against LOCAL staging only (never hosted), e.g.:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/sms_ai_get_availability.test.sql
-- where LOCAL_DB_URL comes from `npx supabase status -o env` on your machine.
-- Do not print or commit that URL: it carries local keys.
--
-- Approved call defaults (lead): 200, 86400, 30, 60, 86400.
--
-- Safety contract:
--   * Everything runs inside ONE transaction ending in ROLLBACK.
--   * The temporary DROP FUNCTION only reproduces the missing-RPC state;
--     the 080 additive migration repairs it inside the same transaction.
--   * No financial writes: the RPC under test only SELECTs usage ledgers
--     (plus a transaction-scoped advisory lock). This file contains no
--     INSERT/UPDATE/DELETE against persistent tables; ledger rowcounts are
--     snapshotted before/after and asserted unchanged via a TEMP table that
--     dies with the transaction.
--   * Fails loudly (RAISE EXCEPTION) on any contract violation.
--
-- RED expectation pre-080: psql aborts at the \ir include because
--   080_restore_sms_ai_get_availability.sql does not exist yet.
-- GREEN expectation post-080: all checks pass, then ROLLBACK leaves no trace.
--
-- Manual test plan (lead-run, local staging psql; hosted checks post-deploy):
--   1. Migration repair: sections 2-4 pass (missing reproduced, 080
--      restores exactly one SECURITY DEFINER function, locked search_path).
--   2. service_role allowed: section 7 returns one row, server_now set,
--      five availability fields NULL for a fresh user.
--   3. anon/authenticated denied: section 9 fails both calls at the ACL
--      (permission denied) before the function body runs.
--   4. Records unchanged: section 10 NOTICE shows ledger rowcounts equal
--      before/after; pre-existing rows (e.g. old Aug-18 usage outside the
--      30-day window) are untouched and still excluded by the RPC.
--   5. Hosted availability 200 (manual, after deploy only): authenticated
--      GET /sms-ai-availability returns a snapshot instead of 503.

BEGIN;

-- 1. Pre-repair observation: record whether the RPC exists right now.
DO $note$
BEGIN
  IF to_regprocedure(
    'public.sms_ai_get_availability(uuid,integer,integer,integer,integer,integer)'
  ) IS NULL THEN
    RAISE NOTICE 'MIG080 pre-repair: sms_ai_get_availability MISSING (reproduces hosted 503)';
  ELSE
    RAISE NOTICE 'MIG080 pre-repair: sms_ai_get_availability present';
  END IF;
END
$note$;

-- 2. Reproduce the missing-RPC state inside this transaction only.
DROP FUNCTION IF EXISTS
  public.sms_ai_get_availability(uuid,integer,integer,integer,integer,integer);

DO $missing$
BEGIN
  IF to_regprocedure(
    'public.sms_ai_get_availability(uuid,integer,integer,integer,integer,integer)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'MIG080 expected the RPC to be missing after temporary DROP';
  END IF;
END
$missing$;

-- 3. Repair inside the same transaction using the additive 080 migration.
\ir ../migrations/080_restore_sms_ai_get_availability.sql

-- 4. Post-repair contract: exactly one such function, definer + locked path.
DO $contract$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure(
    'public.sms_ai_get_availability(uuid,integer,integer,integer,integer,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'MIG080 repair did not restore sms_ai_get_availability';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.sms_ai_get_availability(uuid,integer,integer,integer,integer,integer)'
  )) INTO v_def;

  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'MIG080 function must be SECURITY DEFINER';
  END IF;
  IF v_def NOT LIKE '%SET search_path TO ''public'', ''pg_temp''%' THEN
    RAISE EXCEPTION 'MIG080 function must lock search_path to public, pg_temp';
  END IF;
  IF v_def NOT LIKE '%sms_ai_get_availability is service-role only%' THEN
    RAISE EXCEPTION 'MIG080 function must keep the service_role guard';
  END IF;
END
$contract$;

-- 5. Privileges: denied for anon/authenticated, executable for service_role.
DO $privs$
DECLARE
  v_sig text :=
    'public.sms_ai_get_availability(uuid, integer, integer, integer, integer, integer)';
BEGIN
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG080 anon must not execute sms_ai_get_availability';
  END IF;
  IF has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG080 authenticated must not execute sms_ai_get_availability';
  END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG080 service_role must execute sms_ai_get_availability';
  END IF;
END
$privs$;

-- 6. Snapshot ledger rowcounts before exercising the RPC (TEMP dies with txn).
CREATE TEMP TABLE mig080_ledger_snapshot(
  step text PRIMARY KEY,
  events bigint NOT NULL,
  requests bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO mig080_ledger_snapshot
  SELECT 'before',
    (SELECT count(*) FROM public.sms_ai_usage_events),
    (SELECT count(*) FROM public.sms_ai_work_requests);

-- 7. Service_role behavior: empty user returns all six fields, server_now set,
--    all five availability fields NULL. Direct psql has no JWT, so the role
--    claim is set alongside SET LOCAL ROLE for the guard to see service_role.
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $behavior$
DECLARE
  v_server_now timestamptz;
  v_rolling timestamptz;
  v_burst timestamptz;
  v_history timestamptz;
  v_available_at timestamptz;
  v_reason text;
  v_rows integer;
BEGIN
  SELECT count(*),
    max(server_now),
    max(rolling_available_at),
    max(burst_available_at),
    max(history_cooldown_available_at),
    max(available_at),
    max(reason)
    INTO v_rows,
      v_server_now, v_rolling, v_burst, v_history, v_available_at, v_reason
    FROM public.sms_ai_get_availability(
      gen_random_uuid(), 200, 86400, 30, 60, 86400
    );

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'MIG080 empty-user call must return exactly one row';
  END IF;
  IF v_server_now IS NULL THEN
    RAISE EXCEPTION 'MIG080 server_now must be non-null';
  END IF;
  IF v_rolling IS NOT NULL
    OR v_burst IS NOT NULL
    OR v_history IS NOT NULL
    OR v_available_at IS NOT NULL
    OR v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'MIG080 empty-user call must report five NULL availability fields';
  END IF;
END
$behavior$;

-- 8. Parameter errors: NULL user and non-positive windows are rejected.
DO $params$
BEGIN
  BEGIN
    PERFORM public.sms_ai_get_availability(NULL, 200, 86400, 30, 60, 86400);
    RAISE EXCEPTION 'MIG080 NULL user must be rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Invalid SMS AI availability input%' THEN
      RAISE EXCEPTION 'MIG080 wrong error for NULL user: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.sms_ai_get_availability(gen_random_uuid(), 0, 86400, 30, 60, 86400);
    RAISE EXCEPTION 'MIG080 non-positive window must be rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Invalid SMS AI availability input%' THEN
      RAISE EXCEPTION 'MIG080 wrong error for bad window: %', SQLERRM;
    END IF;
  END;
END
$params$;

RESET ROLE;
RESET request.jwt.claim.role;

-- 9. ACL denial: anon/authenticated direct calls fail before the body runs.
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.sms_ai_get_availability(gen_random_uuid(), 200, 86400, 30, 60, 86400);
    RAISE EXCEPTION 'MIG080 anon call must be denied by ACL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'MIG080 wrong anon denial: %', SQLERRM;
    END IF;
  END;
END
$anon$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $auth$
BEGIN
  BEGIN
    PERFORM public.sms_ai_get_availability(gen_random_uuid(), 200, 86400, 30, 60, 86400);
    RAISE EXCEPTION 'MIG080 authenticated call must be denied by ACL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'MIG080 wrong authenticated denial: %', SQLERRM;
    END IF;
  END;
END
$auth$;
RESET ROLE;

-- 10. Ledger rowcounts unchanged: the RPC wrote nothing.
DO $ledger$
DECLARE
  v_events bigint;
  v_requests bigint;
  v_before_events bigint;
  v_before_requests bigint;
BEGIN
  SELECT count(*) INTO v_events FROM public.sms_ai_usage_events;
  SELECT count(*) INTO v_requests FROM public.sms_ai_work_requests;
  SELECT events, requests INTO v_before_events, v_before_requests
    FROM mig080_ledger_snapshot WHERE step = 'before';

  IF v_events <> v_before_events OR v_requests <> v_before_requests THEN
    RAISE EXCEPTION
      'MIG080 ledger rowcounts changed (events % vs %, requests % vs %)',
      v_events, v_before_events, v_requests, v_before_requests;
  END IF;

  INSERT INTO mig080_ledger_snapshot
    VALUES ('after', v_events, v_requests);
  RAISE NOTICE 'MIG080 ledgers unchanged: events=%, requests=%',
    v_events, v_requests;
END
$ledger$;

-- 11. Leave no trace: the DROP + repair never escape this transaction.
ROLLBACK;
