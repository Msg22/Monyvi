-- Issue #321 verification resend limiter contract.
-- Runs inside a transaction and rolls back all fixtures.

BEGIN;
SELECT no_plan();

DO $schema$
BEGIN
  IF to_regclass('public.email_verification_resend_limits') IS NULL THEN
    RAISE EXCEPTION 'email_verification_resend_limits table is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_verification_resend_limits'
      AND column_name IN ('email', 'raw_email')
  ) THEN
    RAISE EXCEPTION 'resend limiter must not persist raw email';
  END IF;
END
$schema$;
SELECT pass('limiter schema stores no raw email');

DO $privileges$
DECLARE
  v_functions text[] := ARRAY[
    'public.email_verification_register_initial_send(text,text)',
    'public.email_verification_reserve_resend(text,text,integer,integer,integer,integer)',
    'public.email_verification_finalize_resend(text,uuid)',
    'public.email_verification_release_resend(text,uuid)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_functions LOOP
    IF has_function_privilege('anon', v_sig, 'EXECUTE')
      OR has_function_privilege('authenticated', v_sig, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'anon/authenticated must not execute %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must execute %', v_sig;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.email_verification_resend_limits', 'SELECT')
    OR has_table_privilege('authenticated', 'public.email_verification_resend_limits', 'SELECT')
  THEN
    RAISE EXCEPTION 'limiter table must not be directly readable';
  END IF;
END
$privileges$;
SELECT pass('limiter table/functions are service-role only');

CREATE TEMP TABLE issue321_fixture(
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  email_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO issue321_fixture
VALUES (gen_random_uuid(), 'verify-321@example.com', repeat('a', 64));

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  confirmation_sent_at,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  user_id,
  'authenticated',
  'authenticated',
  email,
  '',
  clock_timestamp(),
  NULL,
  '{}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
FROM issue321_fixture;

GRANT SELECT ON issue321_fixture TO service_role;

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $initial$
DECLARE
  v_registered boolean;
  v_email_key text;
  v_count integer;
BEGIN
  SELECT email_key INTO v_email_key FROM issue321_fixture;

  SELECT public.email_verification_register_initial_send(
    v_email_key,
    'verify-321@example.com'
  ) INTO v_registered;

  IF NOT v_registered THEN
    RAISE EXCEPTION 'initial send registration must succeed for pending user';
  END IF;

  SELECT resend_count INTO v_count
  FROM public.email_verification_resend_limits
  WHERE email_key = v_email_key;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'initial send must not consume a resend';
  END IF;
END
$initial$;
SELECT pass('initial signup send registers without consuming a resend');

DO $cooldown$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO v_result
  FROM public.email_verification_reserve_resend(
    repeat('a', 64),
    'verify-321@example.com',
    120,
    86400,
    3,
    30
  );

  IF v_result.accepted OR v_result.decision_code <> 'cooldown' THEN
    RAISE EXCEPTION 'original send must enforce two-minute cooldown';
  END IF;
  IF v_result.available_at IS NULL THEN
    RAISE EXCEPTION 'cooldown must provide available_at';
  END IF;
END
$cooldown$;
SELECT pass('original send enforces the two-minute cooldown');

UPDATE public.email_verification_resend_limits
SET last_sent_at = clock_timestamp() - interval '121 seconds'
WHERE email_key = repeat('a', 64);

DO $three_resends$
DECLARE
  v_result record;
  v_finalized boolean;
  i integer;
  v_count integer;
BEGIN
  FOR i IN 1..3 LOOP
    SELECT * INTO v_result
    FROM public.email_verification_reserve_resend(
      repeat('a', 64),
      'verify-321@example.com',
      120,
      86400,
      3,
      30
    );

    IF NOT v_result.accepted OR v_result.reservation_id IS NULL THEN
      RAISE EXCEPTION 'resend % must reserve successfully: %', i, v_result.decision_code;
    END IF;

    SELECT public.email_verification_finalize_resend(
      repeat('a', 64),
      v_result.reservation_id
    ) INTO v_finalized;

    IF NOT v_finalized THEN
      RAISE EXCEPTION 'resend % must finalize', i;
    END IF;

    IF public.email_verification_finalize_resend(
      repeat('a', 64),
      v_result.reservation_id
    ) THEN
      RAISE EXCEPTION 'finalize must be idempotent';
    END IF;

    UPDATE public.email_verification_resend_limits
    SET last_sent_at = clock_timestamp() - interval '121 seconds'
    WHERE email_key = repeat('a', 64);
  END LOOP;

  SELECT resend_count INTO v_count
  FROM public.email_verification_resend_limits
  WHERE email_key = repeat('a', 64);

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'expected exactly three finalized resends, got %', v_count;
  END IF;

  SELECT * INTO v_result
  FROM public.email_verification_reserve_resend(
    repeat('a', 64),
    'verify-321@example.com',
    120,
    86400,
    3,
    30
  );

  IF v_result.accepted OR v_result.decision_code <> 'limit' THEN
    RAISE EXCEPTION 'fourth resend must be denied by the 24-hour limit';
  END IF;
END
$three_resends$;
SELECT pass('three resends succeed and the fourth is denied');

DO $window_reset$
DECLARE
  v_result record;
  v_released boolean;
BEGIN
  UPDATE public.email_verification_resend_limits
  SET window_started_at = clock_timestamp() - interval '25 hours',
      last_sent_at = clock_timestamp() - interval '25 hours',
      resend_count = 3,
      reservation_id = NULL,
      reserved_at = NULL
  WHERE email_key = repeat('a', 64);

  SELECT * INTO v_result
  FROM public.email_verification_reserve_resend(
    repeat('a', 64),
    'verify-321@example.com',
    120,
    86400,
    3,
    30
  );

  IF NOT v_result.accepted THEN
    RAISE EXCEPTION 'expired 24-hour window must reset allowance';
  END IF;

  SELECT public.email_verification_release_resend(
    repeat('a', 64),
    v_result.reservation_id
  ) INTO v_released;

  IF NOT v_released THEN
    RAISE EXCEPTION 'reserved resend must be releasable';
  END IF;

  IF (SELECT resend_count FROM public.email_verification_resend_limits
      WHERE email_key = repeat('a', 64)) <> 0 THEN
    RAISE EXCEPTION 'release must not consume a resend';
  END IF;
END
$window_reset$;
SELECT pass('24-hour window resets and explicit release does not consume a resend');

DO $concurrency$
DECLARE
  v_first record;
  v_second record;
  v_released boolean;
BEGIN
  SELECT * INTO v_first
  FROM public.email_verification_reserve_resend(
    repeat('a', 64),
    'verify-321@example.com',
    120,
    86400,
    3,
    30
  );

  IF NOT v_first.accepted THEN
    RAISE EXCEPTION 'first reservation must be accepted';
  END IF;

  SELECT * INTO v_second
  FROM public.email_verification_reserve_resend(
    repeat('a', 64),
    'verify-321@example.com',
    120,
    86400,
    3,
    30
  );

  IF v_second.accepted OR v_second.decision_code <> 'busy' THEN
    RAISE EXCEPTION 'concurrent reservation must be denied as busy';
  END IF;

  SELECT public.email_verification_release_resend(
    repeat('a', 64),
    v_first.reservation_id
  ) INTO v_released;
END
$concurrency$;
SELECT pass('concurrent resend reservation is denied');

DO $stale_reservation$
DECLARE
  v_result record;
BEGIN
  UPDATE public.email_verification_resend_limits
  SET reservation_id = gen_random_uuid(),
      reserved_at = clock_timestamp() - interval '31 seconds',
      last_sent_at = NULL
  WHERE email_key = repeat('a', 64);

  SELECT * INTO v_result
  FROM public.email_verification_reserve_resend(
    repeat('a', 64),
    'verify-321@example.com',
    120,
    86400,
    3,
    30
  );

  IF v_result.accepted OR v_result.decision_code <> 'cooldown' THEN
    RAISE EXCEPTION
      'stale ambiguous reservation must consume a slot and enforce cooldown';
  END IF;

  IF (SELECT resend_count FROM public.email_verification_resend_limits
      WHERE email_key = repeat('a', 64)) <> 1 THEN
    RAISE EXCEPTION 'stale ambiguous reservation must consume exactly one slot';
  END IF;
END
$stale_reservation$;
SELECT pass('ambiguous stale reservation fails closed and consumes one slot');

RESET ROLE;
RESET request.jwt.claim.role;

SELECT * FROM finish();
ROLLBACK;
