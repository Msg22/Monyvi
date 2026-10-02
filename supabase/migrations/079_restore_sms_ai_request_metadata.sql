-- MIG-079: restore the missing public.sms_ai_work_requests request metadata
-- in staging.
--
-- Staging applied 062 without these statements, so hosted
-- sms_ai_reserve_work_v2 fails with 42703 undefined_column
-- (request_digest / history_cooldown_seconds), parsed as 503 before DeepSeek.
-- This additive migration restores exactly the authoritative definition from
-- immutable 062_fix_sms_ai_outcome_reconciliation.sql (columns + constraints
-- lines 84-94) plus a bad-shape guard. No other DDL or data changes: no
-- function changes, indexes, RLS, SMS-body persist, financial rows, or
-- scan-window/model changes.
--
-- Manual test plan (lead-run, local Docker psql; hosted checks post-deploy):
--   1. Schema fields/constraints: supabase/tests/sms_ai_request_metadata.test.sql
--      sections 2-4 pass (missing reproduced, 079 restores nullable TEXT
--      64-lower-hex digest + integer NOT NULL DEFAULT 0 nonnegative cooldown,
--      bad-shape existing stops loudly).
--   2. Valid reservation/start: sections 6-7 pass (synthetic one-unit
--      reserve_work_v2 returns 5 fields and writes digest/cooldown;
--      mark_provider_started_v3 returns 4 fields and works).
--   3. Direct clients blocked: section 9 fails anon/authenticated calls at
--      the ACL (permission denied) before the function body runs.
--   4. No financial data: section 10 NOTICE shows transactions/transfers
--      rowcounts equal before/after; synthetic rows roll back.
--   5. Hosted new scan must be user-controlled (manual, after deploy only):
--      trigger a fresh scan from the app and confirm no 42703/503 before
--      DeepSeek; do not run the SQL test file against hosted.

-- Bind retries to the exact admitted payload without persisting per-message
-- fingerprints in the allowance ledger.
ALTER TABLE public.sms_ai_work_requests
  ADD COLUMN IF NOT EXISTS request_digest text,
  ADD COLUMN IF NOT EXISTS history_cooldown_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.sms_ai_work_requests
  DROP CONSTRAINT IF EXISTS sms_ai_work_requests_request_digest_shape,
  ADD CONSTRAINT sms_ai_work_requests_request_digest_shape
    CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$'),
  DROP CONSTRAINT IF EXISTS sms_ai_work_requests_history_cooldown_nonnegative,
  ADD CONSTRAINT sms_ai_work_requests_history_cooldown_nonnegative
    CHECK (history_cooldown_seconds >= 0);

-- Stop loudly if a pre-existing column/constraint is defined with a bad shape
-- instead of silently keeping the wrong definition.
DO $mig079_guard$
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
  WHERE table_schema = 'public'
    AND table_name = 'sms_ai_work_requests'
    AND column_name = 'request_digest';
  IF v_digest_type IS DISTINCT FROM 'text'
    OR v_digest_nullable IS DISTINCT FROM 'YES'
  THEN
    RAISE EXCEPTION 'MIG079 request_digest has bad shape (got % nullable=%)', v_digest_type, v_digest_nullable;
  END IF;

  SELECT data_type, is_nullable, column_default
  INTO v_cool_type, v_cool_nullable, v_cool_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'sms_ai_work_requests'
    AND column_name = 'history_cooldown_seconds';
  IF v_cool_type IS DISTINCT FROM 'integer'
    OR v_cool_nullable IS DISTINCT FROM 'NO'
    OR v_cool_default IS DISTINCT FROM '0'
  THEN
    RAISE EXCEPTION 'MIG079 history_cooldown_seconds has bad shape (got % nullable=% default=%)', v_cool_type, v_cool_nullable, v_cool_default;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_digest_def
  FROM pg_constraint
  WHERE conname = 'sms_ai_work_requests_request_digest_shape'
    AND conrelid = 'public.sms_ai_work_requests'::regclass;
  IF v_digest_def IS NULL OR v_digest_def NOT LIKE '%^[0-9a-f]{64}$%' THEN
    RAISE EXCEPTION 'MIG079 request_digest constraint has bad shape: %', v_digest_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_cool_def
  FROM pg_constraint
  WHERE conname = 'sms_ai_work_requests_history_cooldown_nonnegative'
    AND conrelid = 'public.sms_ai_work_requests'::regclass;
  IF v_cool_def IS NULL OR v_cool_def NOT LIKE '%history_cooldown_seconds >= 0%' THEN
    RAISE EXCEPTION 'MIG079 cooldown constraint has bad shape: %', v_cool_def;
  END IF;
END
$mig079_guard$;
