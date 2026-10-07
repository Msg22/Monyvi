-- MIG-079 RED-phase executable regression for missing
-- public.sms_ai_work_requests.request_digest / history_cooldown_seconds
-- (hosted reserve_work_v2 42703 undefined_column, parsed as 503 before DeepSeek).
--
-- Run against LOCAL staging only (never hosted), e.g.:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/sms_ai_request_metadata.test.sql
-- where LOCAL_DB_URL comes from `npx supabase status -o env` on your machine.
-- Do not print or commit that URL: it carries local keys.
--
-- Safety contract:
--   * Everything runs inside ONE transaction ending in ROLLBACK.
--   * The temporary DROP COLUMN only reproduces the missing-columns state;
--     the 079 additive migration repairs it inside the same transaction.
--   * Synthetic local auth user only (inserted into auth.users inside the
--     transaction, rolled back). No real user SMS or financial data touched.
--   * No financial writes: snapshots of transactions/transfers rowcounts are
--     asserted unchanged via a TEMP table that dies with the transaction.
--   * Fails loudly (RAISE EXCEPTION) on any contract violation.
--
-- RED expectation pre-079: psql aborts at the \ir include because
--   079_restore_sms_ai_request_metadata.sql does not exist yet.
-- GREEN expectation post-079: all checks pass, then ROLLBACK leaves no trace.
--
-- Manual test plan (lead-run, local Docker psql; hosted checks post-deploy):
--   1. Schema fields/constraints: sections 2-4 pass (missing reproduced,
--      079 restores nullable TEXT 64-lower-hex digest + integer NOT NULL
--      DEFAULT 0 nonnegative cooldown). Wrong-shape executable coverage
--      (bad DEFAULT 10, bad nullability) is NOT covered here; lead runs
--      actual 079 against those shapes independently.
--   2. Valid reservation/start: sections 6-7 pass (synthetic one-unit
--      reserve_work_v2 returns 5 fields and writes digest/cooldown;
--      mark_provider_started_v3 returns 4 fields and works).
--   3. Direct clients blocked: section 9 fails anon/authenticated calls at
--      the ACL (permission denied) before the function body runs.
--   4. No financial data: section 10 NOTICE shows transactions/transfers
--      rowcounts equal before/after.
--   5. Hosted new scan must be user-controlled (manual, after deploy only):
--      trigger a fresh scan from the app and confirm no 42703/503 before
--      DeepSeek; do not run this file against hosted.

BEGIN;

-- 1. Pre-repair observation: record whether the metadata columns exist now.
DO $note$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_ai_work_requests'
      AND column_name = 'request_digest'
  ) THEN
    RAISE NOTICE 'MIG079 pre-repair: request_digest present';
  ELSE
    RAISE NOTICE 'MIG079 pre-repair: request_digest MISSING (reproduces hosted 42703)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_ai_work_requests'
      AND column_name = 'history_cooldown_seconds'
  ) THEN
    RAISE NOTICE 'MIG079 pre-repair: history_cooldown_seconds present';
  ELSE
    RAISE NOTICE 'MIG079 pre-repair: history_cooldown_seconds MISSING (reproduces hosted 42703)';
  END IF;
END
$note$;

-- 2. Reproduce the missing-columns state inside this transaction only.
ALTER TABLE public.sms_ai_work_requests
  DROP CONSTRAINT IF EXISTS sms_ai_work_requests_request_digest_shape,
  DROP CONSTRAINT IF EXISTS sms_ai_work_requests_history_cooldown_nonnegative;
ALTER TABLE public.sms_ai_work_requests
  DROP COLUMN IF EXISTS request_digest,
  DROP COLUMN IF EXISTS history_cooldown_seconds;

DO $missing$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_ai_work_requests'
      AND column_name IN ('request_digest', 'history_cooldown_seconds')
  ) THEN
    RAISE EXCEPTION 'MIG079 expected both metadata columns to be missing after temporary DROP';
  END IF;
END
$missing$;

-- 2b. Prove reserve_work_v2 fails without the columns (undefined_column).
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role = 'service_role';
DO $undefined$
DECLARE
  v_digest text := repeat('a', 64);
  v_fp text := repeat('b', 64);
BEGIN
  BEGIN
    PERFORM public.sms_ai_reserve_work_v2(
      gen_random_uuid(), 'mig079-missing-' || gen_random_uuid()::text,
      'sms_full_parse', 'mig079-session', 'incremental',
      1, 0, 0, v_digest, ARRAY[v_fp],
      50, 200, 86400, 30, 60, 0, 300
    );
    RAISE EXCEPTION 'MIG079 reserve_work_v2 must fail while metadata columns are missing';
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'MIG079 reproduced undefined_column while columns missing (hosted 42703)';
  END;
END
$undefined$;
RESET ROLE;
RESET request.jwt.claim.role;

-- 3. Repair inside the same transaction using the additive 079 migration.
\ir ../migrations/079_restore_sms_ai_request_metadata.sql

-- 4. Post-repair contract: exact 2 columns and 2 constraints.
DO $contract$
DECLARE
  v_digest_type text;
  v_digest_nullable text;
  v_cool_type text;
  v_cool_nullable text;
  v_cool_default text;
  v_digest_def text;
  v_cool_def text;
BEGIN
  SELECT data_type, is_nullable INTO v_digest_type, v_digest_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sms_ai_work_requests'
    AND column_name = 'request_digest';
  IF v_digest_type IS NULL THEN
    RAISE EXCEPTION 'MIG079 repair did not restore request_digest';
  END IF;
  IF v_digest_type <> 'text' OR v_digest_nullable <> 'YES' THEN
    RAISE EXCEPTION 'MIG079 request_digest must be nullable TEXT (got % nullable=%)', v_digest_type, v_digest_nullable;
  END IF;

  SELECT data_type, is_nullable, column_default
  INTO v_cool_type, v_cool_nullable, v_cool_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sms_ai_work_requests'
    AND column_name = 'history_cooldown_seconds';
  IF v_cool_type IS NULL THEN
    RAISE EXCEPTION 'MIG079 repair did not restore history_cooldown_seconds';
  END IF;
  IF v_cool_type <> 'integer' OR v_cool_nullable <> 'NO' OR COALESCE(v_cool_default, '') NOT LIKE '%0%' THEN
    RAISE EXCEPTION 'MIG079 history_cooldown_seconds must be integer NOT NULL DEFAULT 0 (got % nullable=% default=%)', v_cool_type, v_cool_nullable, v_cool_default;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_digest_def
  FROM pg_constraint
  WHERE conname = 'sms_ai_work_requests_request_digest_shape';
  IF v_digest_def IS NULL OR v_digest_def NOT LIKE '%^[0-9a-f]{64}$%' THEN
    RAISE EXCEPTION 'MIG079 request_digest shape constraint missing or wrong: %', v_digest_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_cool_def
  FROM pg_constraint
  WHERE conname = 'sms_ai_work_requests_history_cooldown_nonnegative';
  IF v_cool_def IS NULL OR v_cool_def NOT LIKE '%history_cooldown_seconds >= 0%' THEN
    RAISE EXCEPTION 'MIG079 cooldown nonnegative constraint missing or wrong: %', v_cool_def;
  END IF;
END
$contract$;

-- 4b. Invalid metadata rejected by the restored constraints.
DO $invalid$
BEGIN
  BEGIN
    INSERT INTO public.sms_ai_work_requests (
      user_id, request_key, capability, unit_count, payload_bytes,
      estimated_input_tokens, status, decision_code,
      request_digest, history_cooldown_seconds
    ) VALUES (
      gen_random_uuid(), 'mig079-bad-' || gen_random_uuid()::text,
      'sms_full_parse', 1, 0, 0, 'refused', 'rolling_limit',
      'NOT-HEX', 0
    );
    RAISE EXCEPTION 'MIG079 bad digest must be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'MIG079 bad digest rejected as expected';
  END;

  BEGIN
    INSERT INTO public.sms_ai_work_requests (
      user_id, request_key, capability, unit_count, payload_bytes,
      estimated_input_tokens, status, decision_code,
      request_digest, history_cooldown_seconds
    ) VALUES (
      gen_random_uuid(), 'mig079-bad-' || gen_random_uuid()::text,
      'sms_full_parse', 1, 0, 0, 'refused', 'rolling_limit',
      NULL, -1
    );
    RAISE EXCEPTION 'MIG079 negative cooldown must be rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'MIG079 negative cooldown rejected as expected';
  END;
END
$invalid$;

-- 5. Snapshot financial rowcounts before exercising RPCs (TEMP dies with txn).
CREATE TEMP TABLE mig079_fin_snapshot(
  step text PRIMARY KEY,
  transactions bigint NOT NULL,
  transfers bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO mig079_fin_snapshot
  SELECT 'before',
    (SELECT count(*) FROM public.transactions),
    (SELECT count(*) FROM public.transfers);

-- 5b. Synthetic local auth user inside this transaction only.
DO $user$
DECLARE
  v_uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_uid, 'mig079+' || v_uid::text || '@example.invalid');
  PERFORM set_config('mig079.uid', v_uid::text, true);
  RAISE NOTICE 'MIG079 synthetic user %', v_uid;
END
$user$;

-- 6. Valid synthetic one-unit reservation returns 5 fields, writes digest/cooldown.
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $reserve$
DECLARE
  v_uid uuid := current_setting('mig079.uid')::uuid;
  v_digest text := repeat('a', 64);
  v_fp text := repeat('b', 64);
  v_request_id uuid;
  v_accepted boolean;
  v_decision text;
  v_available_at timestamptz;
  v_is_replay boolean;
  v_stored_digest text;
  v_stored_cool integer;
BEGIN
  SELECT request_id, accepted, decision_code, available_at, is_replay
  INTO v_request_id, v_accepted, v_decision, v_available_at, v_is_replay
  FROM public.sms_ai_reserve_work_v2(
    v_uid, 'mig079-key-' || gen_random_uuid()::text,
    'sms_full_parse', 'mig079-session', 'incremental',
    1, 128, 64, v_digest, ARRAY[v_fp],
    50, 200, 86400, 30, 60, 0, 300
  );

  IF v_request_id IS NULL OR v_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'MIG079 valid reservation must be accepted (got % %)', v_request_id, v_decision;
  END IF;
  IF v_decision <> 'accepted' THEN
    RAISE EXCEPTION 'MIG079 valid reservation decision must be accepted (got %)', v_decision;
  END IF;

  SELECT request_digest, history_cooldown_seconds
  INTO v_stored_digest, v_stored_cool
  FROM public.sms_ai_work_requests WHERE id = v_request_id;
  IF v_stored_digest <> v_digest OR v_stored_cool <> 0 THEN
    RAISE EXCEPTION 'MIG079 reservation must write digest/cooldown (got %/%)', v_stored_digest, v_stored_cool;
  END IF;

  PERFORM set_config('mig079.request_id', v_request_id::text, true);
  PERFORM set_config('mig079.fp', v_fp, true);
  RAISE NOTICE 'MIG079 reservation accepted %', v_request_id;
END
$reserve$;

-- 7. mark_provider_started_v3 returns 4 fields and works.
DO $start$
DECLARE
  v_request_id uuid := current_setting('mig079.request_id')::uuid;
  v_fp text := current_setting('mig079.fp');
  v_started boolean;
  v_decision text;
  v_terminals text[];
  v_available_at timestamptz;
BEGIN
  SELECT started, decision_code, terminal_fingerprints, available_at
  INTO v_started, v_decision, v_terminals, v_available_at
  FROM public.sms_ai_mark_provider_started_v3(v_request_id, ARRAY[v_fp]);

  IF v_started IS NOT TRUE THEN
    RAISE EXCEPTION 'MIG079 provider start must succeed (got %)', v_decision;
  END IF;
  IF v_decision <> 'provider_started' THEN
    RAISE EXCEPTION 'MIG079 provider start decision must be provider_started (got %)', v_decision;
  END IF;
  RAISE NOTICE 'MIG079 provider started %', v_request_id;
END
$start$;

-- 8. Invalid request identity rejected before any write.
DO $badparams$
DECLARE
  v_uid uuid := current_setting('mig079.uid')::uuid;
BEGIN
  BEGIN
    PERFORM public.sms_ai_reserve_work_v2(
      v_uid, 'mig079-bad-' || gen_random_uuid()::text,
      'sms_full_parse', 'mig079-session', 'incremental',
      1, 0, 0, 'BAD-DIGEST', ARRAY[repeat('c', 64)],
      50, 200, 86400, 30, 60, 0, 300
    );
    RAISE EXCEPTION 'MIG079 bad digest reservation must be rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Invalid SMS AI request identity input%' THEN
      RAISE EXCEPTION 'MIG079 wrong error for bad digest: %', SQLERRM;
    END IF;
  END;
END
$badparams$;

RESET ROLE;
RESET request.jwt.claim.role;

-- 9. ACL denial: anon/authenticated direct calls fail before the body runs.
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.sms_ai_reserve_work_v2(
      gen_random_uuid(), 'x', 'sms_full_parse', 's', 'incremental',
      1, 0, 0, repeat('a', 64), ARRAY[repeat('b', 64)],
      50, 200, 86400, 30, 60, 0, 300
    );
    RAISE EXCEPTION 'MIG079 anon reserve must be denied by ACL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'MIG079 wrong anon denial: %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.sms_ai_mark_provider_started_v3(gen_random_uuid(), ARRAY[repeat('b', 64)]);
    RAISE EXCEPTION 'MIG079 anon start must be denied by ACL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'MIG079 wrong anon start denial: %', SQLERRM;
    END IF;
  END;
END
$anon$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $auth$
BEGIN
  BEGIN
    PERFORM public.sms_ai_reserve_work_v2(
      gen_random_uuid(), 'x', 'sms_full_parse', 's', 'incremental',
      1, 0, 0, repeat('a', 64), ARRAY[repeat('b', 64)],
      50, 200, 86400, 30, 60, 0, 300
    );
    RAISE EXCEPTION 'MIG079 authenticated reserve must be denied by ACL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'MIG079 wrong authenticated denial: %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.sms_ai_mark_provider_started_v3(gen_random_uuid(), ARRAY[repeat('b', 64)]);
    RAISE EXCEPTION 'MIG079 authenticated start must be denied by ACL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'MIG079 wrong authenticated start denial: %', SQLERRM;
    END IF;
  END;
END
$auth$;
RESET ROLE;

-- 10. Financial rowcounts unchanged: the RPCs wrote no financial records.
DO $fin$
DECLARE
  v_tx bigint;
  v_tr bigint;
  v_before_tx bigint;
  v_before_tr bigint;
BEGIN
  SELECT count(*) INTO v_tx FROM public.transactions;
  SELECT count(*) INTO v_tr FROM public.transfers;
  SELECT transactions, transfers INTO v_before_tx, v_before_tr
    FROM mig079_fin_snapshot WHERE step = 'before';

  IF v_tx <> v_before_tx OR v_tr <> v_before_tr THEN
    RAISE EXCEPTION
      'MIG079 financial rowcounts changed (tx % vs %, tr % vs %)',
      v_tx, v_before_tx, v_tr, v_before_tr;
  END IF;

  INSERT INTO mig079_fin_snapshot VALUES ('after', v_tx, v_tr);
  RAISE NOTICE 'MIG079 financials unchanged: tx=%, tr=%', v_tx, v_tr;
END
$fin$;

-- 11. Leave no trace: the DROP + repair + synthetic rows never escape this transaction.
ROLLBACK;
