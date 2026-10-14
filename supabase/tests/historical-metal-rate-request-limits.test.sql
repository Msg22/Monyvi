-- pgTAP test for migration 089: historical_metal_rate_request_limits
BEGIN;
SELECT plan(18);

-- 1. Verify schema elements
SELECT has_schema('private', 'private schema exists');
SELECT has_table('private', 'historical_metal_rate_requests', 'private.historical_metal_rate_requests table exists');
SELECT has_column('private', 'historical_metal_rate_requests', 'id', 'id column exists');
SELECT has_column('private', 'historical_metal_rate_requests', 'user_id', 'user_id column exists');
SELECT has_column('private', 'historical_metal_rate_requests', 'requested_at', 'requested_at column exists');
SELECT has_function('public', 'historical_metal_rate_reserve_request', ARRAY['uuid'], 'reservation function exists with sole p_user_id argument');

-- 2. Verify security and privileges
-- Table must be completely inaccessible to all roles (including service_role), direct access strictly revoked
SELECT table_privs_are(
  'private',
  'historical_metal_rate_requests',
  'service_role',
  ARRAY[]::text[],
  'service_role has no direct table privileges on private.historical_metal_rate_requests'
);

SELECT table_privs_are(
  'private',
  'historical_metal_rate_requests',
  'authenticated',
  ARRAY[]::text[],
  'authenticated has no direct table privileges on private.historical_metal_rate_requests'
);

SELECT table_privs_are(
  'private',
  'historical_metal_rate_requests',
  'anon',
  ARRAY[]::text[],
  'anon has no direct table privileges on private.historical_metal_rate_requests'
);

-- Public RPC executable only by service_role; revoke check for public/anon/authenticated
SELECT ok(
  has_function_privilege('service_role', 'public.historical_metal_rate_reserve_request(uuid)', 'EXECUTE'),
  'service_role has EXECUTE privilege on historical_metal_rate_reserve_request'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.historical_metal_rate_reserve_request(uuid)', 'EXECUTE'),
  'authenticated does NOT have EXECUTE privilege on historical_metal_rate_reserve_request'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.historical_metal_rate_reserve_request(uuid)', 'EXECUTE'),
  'anon does NOT have EXECUTE privilege on historical_metal_rate_reserve_request'
);

-- 3. Set up test users in auth.users as privileged role (postgres/superuser)
CREATE TEMP TABLE test_users (
  id uuid PRIMARY KEY,
  email text
);

INSERT INTO test_users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'user1@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'user2@example.com');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    INSERT INTO auth.users (id, email, role, aud)
    VALUES
      ('11111111-1111-4111-8111-111111111111', 'user1@example.com', 'authenticated', 'authenticated'),
      ('22222222-2222-4222-8222-222222222222', 'user2@example.com', 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 4. Test reservation logic
-- First reservation for user1 (as service_role)
SET LOCAL ROLE service_role;
SELECT results_eq(
  $$ SELECT accepted, remaining, retry_after_seconds FROM public.historical_metal_rate_reserve_request('11111111-1111-4111-8111-111111111111'::uuid) $$,
  $$ VALUES (true, 59, 0) $$,
  'First reservation succeeds with remaining = 59'
);
RESET ROLE;

-- Mutate fixture rows as privileged default role (postgres) to simulate 59 existing requests
INSERT INTO private.historical_metal_rate_requests (user_id, requested_at, created_at, updated_at)
SELECT
  '11111111-1111-4111-8111-111111111111'::uuid,
  clock_timestamp() - (i || ' minutes')::interval,
  clock_timestamp() - (i || ' minutes')::interval,
  clock_timestamp() - (i || ' minutes')::interval
FROM generate_series(1, 59) AS i;

-- 61st reservation for user1 exceeds max 60 -> denied (as service_role)
SET LOCAL ROLE service_role;
SELECT results_eq(
  $$ SELECT accepted, remaining FROM public.historical_metal_rate_reserve_request('11111111-1111-4111-8111-111111111111'::uuid) $$,
  $$ VALUES (false, 0) $$,
  '61st reservation for user1 is denied with accepted = false and remaining = 0'
);

SELECT cmp_ok(
  (SELECT retry_after_seconds FROM public.historical_metal_rate_reserve_request('11111111-1111-4111-8111-111111111111'::uuid)),
  '>',
  0,
  'Denied reservation returns positive retry_after_seconds'
);

-- User2 has independent quota unaffected by User1 (as service_role)
SELECT results_eq(
  $$ SELECT accepted, remaining, retry_after_seconds FROM public.historical_metal_rate_reserve_request('22222222-2222-4222-8222-222222222222'::uuid) $$,
  $$ VALUES (true, 59, 0) $$,
  'User2 reservation succeeds independently with full quota (remaining = 59)'
);
RESET ROLE;

-- 5. Pruning expired requests: age user1 records to <= 1 hour ago as privileged default role (postgres)
UPDATE private.historical_metal_rate_requests
SET requested_at = clock_timestamp() - interval '1 hour'
WHERE user_id = '11111111-1111-4111-8111-111111111111';

-- User1 can reserve again as expired rows (requested_at <= now - 1 hour) are pruned (as service_role)
SET LOCAL ROLE service_role;
SELECT results_eq(
  $$ SELECT accepted, remaining, retry_after_seconds FROM public.historical_metal_rate_reserve_request('11111111-1111-4111-8111-111111111111'::uuid) $$,
  $$ VALUES (true, 59, 0) $$,
  'After window expiration, expired requests are pruned and new reservation is accepted'
);
RESET ROLE;

-- Inspect private table as privileged default role to verify expired rows were deleted
SELECT is(
  (SELECT count(*)::integer FROM private.historical_metal_rate_requests WHERE user_id = '11111111-1111-4111-8111-111111111111' AND requested_at <= clock_timestamp() - interval '1 hour'),
  0,
  'Expired requests were pruned from private.historical_metal_rate_requests'
);

SELECT * FROM finish();
ROLLBACK;
