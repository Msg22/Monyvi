-- #395 H3: SAME-ROW inverse lock-order regression, separate PostgreSQL sessions.
-- Tests actual public RPCs, never a mock/definer shortcut.
-- A preholds coordination locks OUTSIDE canonical_probe; accepted RPC writes
-- remain INSIDE the savepoint and are rolled back before A commits its locks.
-- The fresh v2 namespace must never touch quarantined v1 fixture owners.
-- Compare against frozen 090/091 baseline and candidate using the same file.
-- Runner owns dblink extension, privileged local connection, and migrations.
-- Optional secure local-only GUC: monyvi.test_dblink_conninfo (never printed).
-- No extension install, hosted call or persisted SUT helper.
BEGIN;
SELECT plan(45);
SELECT ok(
  to_regprocedure('extensions.dblink_connect(text,text)') IS NOT NULL,
  'PREREQUISITE: local dblink installed by the runner'
);

CREATE TEMP TABLE h3_observations (
  name text PRIMARY KEY,
  value text NOT NULL
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.h3_note(p_name text, p_value text)
RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  INSERT INTO h3_observations (name, value)
  VALUES (p_name, coalesce(p_value, '<null>'))
  ON CONFLICT (name) DO UPDATE SET value = excluded.value;
END;
$body$;

CREATE FUNCTION pg_temp.h3_id(p_number integer)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $body$
  SELECT ('57c91000-0000-4000-8000-' || lpad(p_number::text, 12, '0'))::uuid
$body$;

CREATE FUNCTION pg_temp.h3_connect(p_name text)
RETURNS void LANGUAGE plpgsql AS $body$
DECLARE
  v_conninfo text := current_setting('monyvi.test_dblink_conninfo', true);
  v_privileged boolean;
BEGIN
  IF v_conninfo IS NULL OR btrim(v_conninfo) = '' THEN
    v_conninfo := 'dbname=' || current_database() || ' user=' || current_user;
  END IF;
  PERFORM extensions.dblink_connect(p_name, v_conninfo);
  SELECT result INTO STRICT v_privileged FROM extensions.dblink(
    p_name, 'SELECT (rolsuper OR rolbypassrls) FROM pg_roles WHERE rolname = current_user'
  ) AS t(result boolean);
  IF v_privileged IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'h3_local_privileged_runner_required';
  END IF;
  PERFORM extensions.dblink_exec(p_name, 'SET statement_timeout = ''8s''');
  PERFORM extensions.dblink_exec(p_name, 'SET lock_timeout = ''6s''');
  PERFORM extensions.dblink_exec(
    p_name, 'SET idle_in_transaction_session_timeout = ''20s'''
  );
END;
$body$;

CREATE FUNCTION pg_temp.h3_auth(p_name text, p_owner uuid)
RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM extensions.dblink_exec(p_name, 'BEGIN');
  PERFORM extensions.dblink_exec(
    p_name, format('SET LOCAL request.jwt.claim.sub = %L', p_owner::text)
  );
  PERFORM extensions.dblink_exec(
    p_name, format(
      'SET LOCAL request.jwt.claims = %L',
      jsonb_build_object('sub', p_owner, 'role', 'authenticated')::text
    )
  );
  PERFORM extensions.dblink_exec(p_name, 'SET LOCAL ROLE authenticated');
END;
$body$;

CREATE FUNCTION pg_temp.h3_hold_owner_locks(p_name text, p_owner uuid)
RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  -- EXACT original 090 keys and RPC order: auth-cascade SHARE, then owner EXCL.
  -- The RPC's own reacquisition is reentrant in this SAME transaction.
  PERFORM extensions.dblink_exec(p_name, format(
    'DO $locks$ BEGIN
       PERFORM pg_catalog.pg_advisory_xact_lock_shared(
         pg_catalog.hashtextextended(%L, 0));
       PERFORM pg_catalog.pg_advisory_xact_lock(
         pg_catalog.hashtextextended(%L, 0));
     END $locks$',
    'global:auth_user_cascade',
    'accounts:owner:' || p_owner::text
  ));
END;
$body$;

CREATE FUNCTION pg_temp.h3_remote_pid(p_name text)
RETURNS integer LANGUAGE plpgsql AS $body$
DECLARE
  v_pid integer;
BEGIN
  SELECT result INTO STRICT v_pid FROM extensions.dblink(
    p_name, 'SELECT pg_backend_pid()'
  ) AS t(result integer);
  RETURN v_pid;
END;
$body$;

CREATE FUNCTION pg_temp.h3_waits_on(
  p_waiter integer, p_holder integer, p_max_attempts integer DEFAULT 250
) RETURNS boolean LANGUAGE plpgsql VOLATILE AS $body$
DECLARE
  v_attempt integer;
BEGIN
  FOR v_attempt IN 1..p_max_attempts LOOP
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE pid = p_waiter AND wait_event_type = 'Lock'
    ) AND p_holder = ANY(pg_blocking_pids(p_waiter)) THEN
      RETURN true;
    END IF;
    PERFORM pg_sleep(0.004); -- bounded readiness POLL, not a fixed phase delay
  END LOOP;
  RETURN false;
END;
$body$;

CREATE FUNCTION pg_temp.h3_wait_finished(
  p_name text, p_max_attempts integer DEFAULT 500
) RETURNS boolean LANGUAGE plpgsql VOLATILE AS $body$
DECLARE
  v_attempt integer;
BEGIN
  FOR v_attempt IN 1..p_max_attempts LOOP
    IF extensions.dblink_is_busy(p_name) = 0 THEN RETURN true; END IF;
    PERFORM pg_sleep(0.004);
  END LOOP;
  RETURN false;
END;
$body$;

CREATE FUNCTION pg_temp.h3_transaction(
  p_record uuid, p_account uuid, p_category uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $body$
  SELECT jsonb_build_object(
    'entity','transaction','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_record,'accountId',p_account,'amountMinorUnits','100',
      'currency','EGP','type','EXPENSE','categoryId',p_category,
      'counterparty',null,'note',null,'date','2026-09-01',
      'source','VOICE','smsFingerprint',null,'isDraft',false,
      'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$body$;

CREATE FUNCTION pg_temp.h3_review_envelope(
  p_owner uuid, p_account uuid, p_action uuid,
  p_record uuid, p_category uuid, p_effect uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $body$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner,'actionId',p_action,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',p_record,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','review.batch-save/v1',
    'accountGuards',jsonb_build_array(jsonb_build_object(
      'accountId',p_account,'expectedRevision','0')),
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1',
      'operationCode','review.batch-save','source','VOICE',
      'sessionId',pg_temp.h3_id(701),
      'frozenIntentDigest',encode(extensions.digest(
        convert_to('sql395-h3-v2-original:' || p_action::text,'UTF8'),
        'sha256'),'hex'),
      'selectedSourceRefs',jsonb_build_array(jsonb_build_object(
        'rowId',pg_temp.h3_id(601),'recordId',p_record,'sourceFingerprint',null)),
      'confirmedGroupRefs','[]'::jsonb,
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','transaction','id',p_record,'expectedAbsent',true)),
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId',p_account,'amountMinorUnits','-100',
        'currency','EGP','effectId',p_effect)),
      'domainRecordRefs',jsonb_build_array(p_record),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        pg_temp.h3_transaction(p_record,p_account,p_category))),
      'localSmsBookkeeping','[]'::jsonb))
$body$;

CREATE FUNCTION pg_temp.h3_legacy_envelope(
  p_owner uuid, p_account uuid, p_action uuid,
  p_record uuid, p_category uuid, p_effect uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $body$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner,'actionId',p_action,
    'domain','transactions','kind','create',
    'domainReferenceId',p_record,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.balance-effects/v1',
    'accountGuards',jsonb_build_array(jsonb_build_object(
      'accountId',p_account,'expectedRevision','0')),
    'payload',jsonb_build_object(
      'schemaVersion','account.balance-effects/v1',
      'operationCode','transaction.create',
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId',p_account,'amountMinorUnits','-100',
        'currency','EGP','effectId',p_effect)),
      'domainRecordRefs',jsonb_build_array(p_record),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        pg_temp.h3_transaction(p_record,p_account,p_category)))))
$body$;

CREATE FUNCTION pg_temp.h3_add_envelope(
  p_owner uuid, p_prior uuid, p_created uuid, p_action uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $body$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner,'actionId',p_action,
    'domain','accounts','kind','create_with_default',
    'domainReferenceId',p_created,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.create-default/v1',
    'accountGuards','[]'::jsonb,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1',
      'operationCode','account.create-default','defaultIntent',true,
      'expectedDefaultSnapshot',jsonb_build_object(
        'activeAccountIds',jsonb_build_array(p_prior),
        'defaultAccount',jsonb_build_object(
          'accountId',p_prior,'isDefault',true)),
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','account','id',p_created,'expectedAbsent',true)),
      'accountEffects','[]'::jsonb,
      'domainRecordRefs',jsonb_build_array(p_prior,p_created),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        jsonb_build_object(
          'entity','account','mode','create','expectedUpdatedAt',null,
          'after',jsonb_build_object(
            'id',p_created,'name','H3 New Default','type','CASH',
            'currency','EGP','institutionId',null,
            'providerDisplayName',null,'isDefault',true,
            'createdAt','2026-09-01T12:00:00.000Z',
            'deleted',false,'openingBalanceMinorUnits','0',
            'targetBalanceMinorUnits',null)),
        jsonb_build_object(
          'entity','account_default','mode','update',
          'expectedIsDefault',true,
          'after',jsonb_build_object(
            'id',p_prior,'isDefault',false))))))
$body$;

CREATE FUNCTION pg_temp.h3_rpc_sql(p_envelope jsonb)
RETURNS text LANGUAGE plpgsql AS $body$
DECLARE
  v_json text;
BEGIN
  v_json := private.financial_action_encode_jsonb_v1(p_envelope);
  RETURN format(
    'SELECT public.apply_account_financial_action_v1(%L, %L)->>''status''',
    v_json,
    encode(extensions.digest(convert_to(v_json,'UTF8'),'sha256'),'hex')
  );
END;
$body$;

-- Single-statement async queries must yield one row and then an empty result.
CREATE FUNCTION pg_temp.h3_take_result(p_name text)
RETURNS text LANGUAGE plpgsql AS $async$
DECLARE
  v_result text;
BEGIN
  IF NOT pg_temp.h3_wait_finished(p_name) THEN
    RAISE EXCEPTION USING ERRCODE = '57014', MESSAGE = 'h3_async_timeout';
  END IF;
  SELECT result INTO STRICT v_result
  FROM extensions.dblink_get_result(p_name) AS t(result text);
  IF NOT pg_temp.h3_wait_finished(p_name) THEN
    RAISE EXCEPTION USING ERRCODE = '57014', MESSAGE = 'h3_drain_timeout';
  END IF;
  PERFORM result FROM extensions.dblink_get_result(p_name) AS t(result text);
  IF FOUND THEN RAISE EXCEPTION 'h3_unexpected_extra_result'; END IF;
  RETURN v_result;
END;
$async$;

-- Compare actual owner-scoped rows, including defaults, revisions and children.
-- Only synthetic fixture rows are read; no row contents are printed.
CREATE FUNCTION pg_temp.h3_owner_state(p_name text, p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql AS $state$
DECLARE
  v_table text;
  v_predicate text;
  v_rows text;
  v_state jsonb := '{}'::jsonb;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'accounts','transactions','transfers','financial_action_groups',
    'account_financial_effects','bank_details','account_sms_senders'
  ] LOOP
    v_predicate := CASE WHEN v_table IN ('bank_details','account_sms_senders')
      THEN format('EXISTS (SELECT 1 FROM public.accounts a
        WHERE a.id=r.account_id AND a.user_id=%L::uuid)',p_owner)
      ELSE format('r.user_id=%L::uuid',p_owner) END;
    SELECT result INTO STRICT v_rows FROM extensions.dblink(p_name,format(
      'SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),
         ''[]''::jsonb)::text FROM public.%I r WHERE %s',v_table,v_predicate
    )) AS t(result text);
    v_state := v_state || jsonb_build_object(v_table,v_rows::jsonb);
  END LOOP;
  RETURN v_state;
END;
$state$;

CREATE FUNCTION pg_temp.h3_safe_close(p_name text)
RETURNS void LANGUAGE plpgsql AS $close$
DECLARE
  v_attempt integer;
  v_drained boolean := false;
BEGIN
  IF p_name = ANY(coalesce(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    IF extensions.dblink_is_busy(p_name) = 1 THEN
      PERFORM pg_temp.h3_note('cleanup_error:'||p_name||':pending','57014');
      PERFORM extensions.dblink_cancel_query(p_name);
    END IF;
    FOR v_attempt IN 1..8 LOOP
      EXIT WHEN NOT pg_temp.h3_wait_finished(p_name);
      BEGIN
        PERFORM result FROM extensions.dblink_get_result(p_name) AS t(result text);
        IF NOT FOUND AND v_attempt > 1 THEN v_drained := true; EXIT; END IF;
      EXCEPTION WHEN query_canceled OR OTHERS THEN
        -- An error result is consumed; still fetch the final empty result.
        PERFORM pg_temp.h3_note('cleanup_result:'||p_name,SQLSTATE);
      END;
    END LOOP;
    IF v_drained THEN
      PERFORM extensions.dblink_exec(p_name,'ROLLBACK');
    ELSE
      PERFORM pg_temp.h3_note('cleanup_error:'||p_name||':drain','57014');
    END IF;
    PERFORM extensions.dblink_disconnect(p_name);
  END IF;
EXCEPTION WHEN query_canceled OR OTHERS THEN
  PERFORM pg_temp.h3_note('cleanup_error:'||p_name,SQLSTATE);
  BEGIN
    IF p_name = ANY(coalesce(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
      PERFORM extensions.dblink_disconnect(p_name);
    END IF;
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    PERFORM pg_temp.h3_note('cleanup_error:'||p_name||':disconnect',SQLSTATE);
  END;
END;
$close$;

CREATE FUNCTION pg_temp.h3_cleanup(p_owned boolean, p_mutex boolean)
RETURNS void LANGUAGE plpgsql AS $body$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'h3_actor','h3_writer','h3_other','h3_zero','h3_cascade'
  ] LOOP
    PERFORM pg_temp.h3_safe_close(v_name);
  END LOOP;
  IF p_owned THEN
    BEGIN
      IF NOT ('h3_fixture' = ANY(coalesce(
        extensions.dblink_get_connections(), ARRAY[]::text[]
      ))) THEN
        PERFORM pg_temp.h3_connect('h3_fixture');
      END IF;
      -- The savepoint rollbacks must eliminate every speculative Add root.
      -- Cleanup owns ONLY the six v2 auth users, six original accounts and
      -- two categories; it never deletes an immutable action or its effects.
      -- Clear categories/accounts, then users with exact UUID+email guards.
      PERFORM extensions.dblink_exec('h3_fixture','BEGIN');
      PERFORM extensions.dblink_exec('h3_fixture', $cleanup$
        WITH owned(id, email) AS (
          VALUES
            ('57c91000-0000-4000-8000-000000000001'::uuid, 'sql395-h3-v2-1@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000002'::uuid, 'sql395-h3-v2-2@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000003'::uuid, 'sql395-h3-v2-3@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000004'::uuid, 'sql395-h3-v2-4@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000005'::uuid, 'sql395-h3-v2-5@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000006'::uuid, 'sql395-h3-v2-6@monyvi.test')
        )
        DELETE FROM public.categories AS category
        USING owned
        WHERE category.user_id = owned.id
          AND category.id IN (
            '57c91000-0000-4000-8000-000000000801'::uuid,
            '57c91000-0000-4000-8000-000000000805'::uuid
          )
          AND EXISTS (
            SELECT 1 FROM auth.users AS u
            WHERE u.id = owned.id AND u.email = owned.email
          )
      $cleanup$);
      PERFORM extensions.dblink_exec('h3_fixture', $cleanup$
        WITH owned(id, email) AS (
          VALUES
            ('57c91000-0000-4000-8000-000000000001'::uuid, 'sql395-h3-v2-1@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000002'::uuid, 'sql395-h3-v2-2@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000003'::uuid, 'sql395-h3-v2-3@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000004'::uuid, 'sql395-h3-v2-4@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000005'::uuid, 'sql395-h3-v2-5@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000006'::uuid, 'sql395-h3-v2-6@monyvi.test')
        )
        DELETE FROM public.accounts AS account
        USING owned
        WHERE account.user_id = owned.id
          AND account.id IN (
            '57c91000-0000-4000-8000-000000000101'::uuid,
            '57c91000-0000-4000-8000-000000000102'::uuid,
            '57c91000-0000-4000-8000-000000000103'::uuid,
            '57c91000-0000-4000-8000-000000000104'::uuid,
            '57c91000-0000-4000-8000-000000000105'::uuid,
            '57c91000-0000-4000-8000-000000000106'::uuid
          )
          AND EXISTS (
            SELECT 1 FROM auth.users AS u
            WHERE u.id = owned.id AND u.email = owned.email
          )
      $cleanup$);
      PERFORM extensions.dblink_exec('h3_fixture', $cleanup$
        WITH owned(id, email) AS (
          VALUES
            ('57c91000-0000-4000-8000-000000000001'::uuid, 'sql395-h3-v2-1@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000002'::uuid, 'sql395-h3-v2-2@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000003'::uuid, 'sql395-h3-v2-3@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000004'::uuid, 'sql395-h3-v2-4@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000005'::uuid, 'sql395-h3-v2-5@monyvi.test'),
            ('57c91000-0000-4000-8000-000000000006'::uuid, 'sql395-h3-v2-6@monyvi.test')
        )
        DELETE FROM auth.users AS u
        USING owned
        WHERE u.id = owned.id AND u.email = owned.email
      $cleanup$);
      PERFORM extensions.dblink_exec('h3_fixture','COMMIT');
    EXCEPTION WHEN query_canceled OR OTHERS THEN
      PERFORM pg_temp.h3_note('cleanup_error:fixture', SQLSTATE);
      BEGIN
        PERFORM extensions.dblink_exec('h3_fixture','ROLLBACK');
      EXCEPTION WHEN query_canceled OR OTHERS THEN
        PERFORM pg_temp.h3_note('cleanup_error:rollback', SQLSTATE);
      END;
    END;
  END IF;
  PERFORM pg_temp.h3_safe_close('h3_fixture');
  IF p_mutex THEN PERFORM pg_advisory_unlock(395, 392); END IF;
END;
$body$;

-- Remote temp helper is CREATED IN h3_cascade; never assume runner pg_temp
-- functions are accessible across dblink sessions.
DO $driver$
DECLARE
  v_mutex boolean := false;
  v_owned boolean := false;
  v_privileged boolean;
  v_collisions integer;
  v_i integer;
  v_case text;
  v_owner uuid;
  v_prior uuid;
  v_new uuid;
  v_action uuid;
  v_record uuid;
  v_effect uuid;
  v_category uuid;
  v_actor_pid integer;
  v_waiter_pid integer;
  v_writer_conn text;
  v_writer_sql text;
  v_envelope jsonb;
  v_status text;
  v_root text;
  v_state text;
  v_release text;
  v_probe_clean text;
  v_writer_value text;
  v_deadlock_timeout_ms integer;
  v_lock_timeout_ms integer;
  v_notes jsonb := '{}'::jsonb;
  v_note record;
  v_phase text := 'fixtures';
  v_first_state text;
  v_first_phase text;
  v_zero_before jsonb;
BEGIN
  PERFORM pg_temp.h3_note('run_error', 'not_completed');
  SELECT (rolsuper OR rolbypassrls) INTO v_privileged
  FROM pg_roles WHERE rolname = current_user;
  IF v_privileged IS DISTINCT FROM true THEN
    PERFORM pg_temp.h3_note('run_error','local_privileged_runner_required');
    RETURN;
  END IF;
  IF to_regprocedure('extensions.dblink_connect(text,text)') IS NULL THEN
    PERFORM pg_temp.h3_note('run_error','local_dblink_missing');
    RETURN;
  END IF;
  v_mutex := pg_try_advisory_lock(395, 392);
  IF NOT v_mutex THEN
    PERFORM pg_temp.h3_note('run_error','reserved_h3_fixture_mutex_busy');
    RETURN;
  END IF;
  BEGIN
    -- This probe owns none of the previous 57c90000 fixtures. Existing
    -- v2 IDs, email addresses, orphaned effects or immutable roots fail
    -- before seeding; never try to erase someone else's test leftovers.
    SELECT
      (SELECT count(*) FROM auth.users
       WHERE id::text LIKE '57c91000-0000-4000-8000-%'
          OR email LIKE 'sql395-h3-v2-%@monyvi.test')
      +(SELECT count(*) FROM public.accounts
        WHERE id::text LIKE '57c91000-0000-4000-8000-%'
           OR user_id::text LIKE '57c91000-0000-4000-8000-%')
      +(SELECT count(*) FROM public.categories
        WHERE id::text LIKE '57c91000-0000-4000-8000-%'
           OR user_id::text LIKE '57c91000-0000-4000-8000-%')
      +(SELECT count(*) FROM public.financial_action_groups
        WHERE id::text LIKE '57c91000-0000-4000-8000-%'
           OR user_id::text LIKE '57c91000-0000-4000-8000-%'
           OR action_id::text LIKE '57c91000-0000-4000-8000-%')
      +(SELECT count(*) FROM public.account_financial_effects
        WHERE id::text LIKE '57c91000-0000-4000-8000-%'
           OR user_id::text LIKE '57c91000-0000-4000-8000-%'
           OR action_id::text LIKE '57c91000-0000-4000-8000-%')
      +(SELECT count(*) FROM public.transactions
        WHERE id::text LIKE '57c91000-0000-4000-8000-%'
           OR user_id::text LIKE '57c91000-0000-4000-8000-%')
    INTO v_collisions;
    IF v_collisions <> 0 THEN
      RAISE EXCEPTION 'h3_reserved_fixture_id_collision';
    END IF;

    PERFORM pg_temp.h3_connect('h3_fixture');
    -- Remote COMMITTED fixtures: separate dblink backends must see them.
    PERFORM extensions.dblink_exec('h3_fixture', $seed$
      INSERT INTO auth.users
        (id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data)
      SELECT
        ('57c91000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
        'authenticated','authenticated',
        'sql395-h3-v2-' || n::text || '@monyvi.test',
        'unused', '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1,6) AS g(n)
    $seed$);
    v_owned := true;
    PERFORM extensions.dblink_exec('h3_fixture', $seed$
      INSERT INTO public.accounts
        (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
      SELECT
        ('57c91000-0000-4000-8000-' || lpad((100+n)::text,12,'0'))::uuid,
        ('57c91000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
        'H3 Prior ' || n::text,'CASH',0,'EGP',0,true,false
      FROM generate_series(1,6) AS g(n)
    $seed$);
    PERFORM extensions.dblink_exec('h3_fixture', $seed$
      INSERT INTO public.categories
        (id,user_id,system_name,display_name,icon,level)
      VALUES
        ('57c91000-0000-4000-8000-000000000801',
         '57c91000-0000-4000-8000-000000000001',
         'h3-review','H3 Review','wallet',1),
        ('57c91000-0000-4000-8000-000000000805',
         '57c91000-0000-4000-8000-000000000005',
         'h3-legacy','H3 Legacy','wallet',1)
    $seed$);
    SELECT result INTO STRICT v_status FROM extensions.dblink(
      'h3_fixture',
      'SELECT count(*)::text FROM public.accounts WHERE id::text LIKE ''57c91000-0000-4000-8000-%'''
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('fixture_count', v_status);

    FOREACH v_case IN ARRAY ARRAY[
      'h3_actor','h3_writer','h3_other','h3_zero','h3_cascade'
    ] LOOP
      PERFORM pg_temp.h3_connect(v_case);
    END LOOP;
    -- Read ACTUAL PostgreSQL deadlock_timeout, rather than assuming the
    -- default 1s. A's bounded lock timeout must be STRICTLY SHORTER.
    SELECT result INTO STRICT v_deadlock_timeout_ms
    FROM extensions.dblink('h3_actor',
      'SELECT (extract(epoch FROM current_setting(''deadlock_timeout'')::interval) * 1000)::integer'
    ) AS t(result integer);
    IF v_deadlock_timeout_ms <= 1 THEN
      RAISE EXCEPTION 'h3_deadlock_timeout_too_low_for_safe_probe';
    END IF;
    v_lock_timeout_ms := least(750, v_deadlock_timeout_ms - 1);
    PERFORM extensions.dblink_exec('h3_cascade', $remote$
      CREATE FUNCTION pg_temp.h3_delete_user(p_owner uuid)
      RETURNS text LANGUAGE plpgsql AS $delete$
      BEGIN
        DELETE FROM auth.users WHERE id = p_owner;
        IF NOT FOUND THEN RETURN 'not_found'; END IF;
        RETURN 'deleted';
      EXCEPTION WHEN foreign_key_violation THEN
        RETURN 'fk_restricted';
      END;
      $delete$
    $remote$);

    -- Keep the five inverse-order protocols independent of the no-op phase.
    FOR v_i IN 1..5 LOOP
      v_owner := pg_temp.h3_id(v_i);
      v_prior := pg_temp.h3_id(100+v_i);
      v_new := pg_temp.h3_id(200+v_i);
      v_action := pg_temp.h3_id(1000+v_i);
      v_record := pg_temp.h3_id(400+v_i);
      v_effect := pg_temp.h3_id(500+v_i);
      v_category := pg_temp.h3_id(800+v_i);
      v_case := CASE v_i
        WHEN 1 THEN 'review_update'
        WHEN 2 THEN 'add_soft_delete'
        WHEN 3 THEN 'add_upsert'
        WHEN 4 THEN 'add_auth_delete'
        ELSE 'legacy_update'
      END;

      v_phase := v_case || ':setup';
      PERFORM pg_temp.h3_auth('h3_actor',v_owner);
      PERFORM pg_temp.h3_hold_owner_locks('h3_actor',v_owner);
      -- Exact runtime deadlock_timeout is inspected once above; any 55P03
      -- or 40P01 is an unequivocal failure, not a valid alternate outcome.
      PERFORM extensions.dblink_exec('h3_actor', format(
        'SET LOCAL lock_timeout = %L', v_lock_timeout_ms::text || 'ms'
      ));
      v_actor_pid := pg_temp.h3_remote_pid('h3_actor');

      IF v_i = 1 THEN
        v_phase := 'peer_progress';
        PERFORM pg_temp.h3_auth('h3_other',pg_temp.h3_id(6));
        PERFORM extensions.dblink_send_query('h3_other', format(
          'UPDATE public.accounts SET name=%L WHERE id=%L::uuid
           RETURNING name::text',
          'H3 peer updated', pg_temp.h3_id(106)::text
        ));
        v_status := pg_temp.h3_take_result('h3_other');
        v_notes := v_notes || jsonb_build_object('peer_progress',v_status);
        PERFORM extensions.dblink_exec('h3_other','ROLLBACK');
      END IF;

      v_phase := v_case || ':writer_wait';
      IF v_i = 4 THEN
        v_writer_conn := 'h3_cascade';
        -- A privileged auth DELETE must acquire global EXCLUSIVE before the
        -- auth tuple, or the RPC's later root FK lock can invert the order.
        PERFORM extensions.dblink_exec(v_writer_conn,'BEGIN');
        v_writer_sql := format(
          'SELECT pg_temp.h3_delete_user(%L::uuid)',v_owner::text
        );
      ELSE
        v_writer_conn := 'h3_writer';
        PERFORM pg_temp.h3_auth(v_writer_conn,v_owner);
        v_writer_sql := CASE v_i
          WHEN 1 THEN format(
            'UPDATE public.accounts SET name=%L
             WHERE user_id=%L::uuid AND id=%L::uuid RETURNING name::text',
            'H3 review metadata',v_owner::text,v_prior::text
          )
          WHEN 2 THEN format(
            'UPDATE public.accounts SET deleted=true
             WHERE user_id=%L::uuid AND id=%L::uuid
             RETURNING CASE WHEN deleted THEN %L ELSE %L END',
            v_owner::text,v_prior::text,'soft_deleted','not_deleted'
          )
          WHEN 3 THEN format(
            'INSERT INTO public.accounts
               (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
             VALUES (%L::uuid,%L::uuid,%L,%L,0,%L,0,false,false)
             ON CONFLICT (id) DO UPDATE SET name=excluded.name
             RETURNING name::text',
            v_prior::text,v_owner::text,'H3 upsert','CASH','EGP'
          )
          ELSE format(
            'UPDATE public.accounts SET name=%L
             WHERE user_id=%L::uuid AND id=%L::uuid RETURNING name::text',
            'H3 legacy metadata',v_owner::text,v_prior::text
          )
        END;
      END IF;
      v_waiter_pid := pg_temp.h3_remote_pid(v_writer_conn);
      PERFORM extensions.dblink_send_query(v_writer_conn,v_writer_sql);
      v_notes := v_notes || jsonb_build_object(
        v_case || ':writer_blocked',
        pg_temp.h3_waits_on(v_waiter_pid,v_actor_pid)::text
      );
      -- B has already attempted the same-row operation. A holds auth SHARE
      -- and the original owner EXCL locks from BEFORE this savepoint.
      -- The real public RPC's action/effects/default changes remain transient.
      PERFORM extensions.dblink_exec('h3_actor','SAVEPOINT canonical_probe');

      v_envelope := CASE
        WHEN v_i=1 THEN pg_temp.h3_review_envelope(
          v_owner,v_prior,v_action,v_record,v_category,v_effect)
        WHEN v_i=5 THEN pg_temp.h3_legacy_envelope(
          v_owner,v_prior,v_action,v_record,v_category,v_effect)
        ELSE pg_temp.h3_add_envelope(v_owner,v_prior,v_new,v_action)
      END;
      v_phase := v_case || ':rpc';
      v_status := 'not_executed';
      BEGIN
        SELECT result INTO STRICT v_status FROM extensions.dblink(
          'h3_actor', pg_temp.h3_rpc_sql(v_envelope)
        ) AS t(result text);
      EXCEPTION WHEN query_canceled OR OTHERS THEN
        -- Record only SQLSTATE; 55P03, 40P01, and every other error FAILS
        -- the accepted assertion. Do not normalize a timeout to "stale".
        v_status := 'sqlstate:' || SQLSTATE;
        v_first_state := coalesce(v_first_state,SQLSTATE);
        v_first_phase := coalesce(v_first_phase,v_phase);
      END;
      v_notes := v_notes || jsonb_build_object(v_case || ':rpc_status',v_status);

      v_phase := v_case || ':postimages';
      v_root := 'false';
      v_state := 'false';
      IF v_status = 'accepted' THEN
        SELECT result INTO STRICT v_root FROM extensions.dblink(
          'h3_actor',format(
            'SELECT (count(*)=1)::text FROM public.financial_action_groups
             WHERE user_id=%L::uuid AND action_id=%L::uuid
               AND state=''accepted'' AND server_outcome=''accepted''',
            v_owner::text,v_action::text
          )
        ) AS t(result text);
        IF v_i IN (1,5) THEN
          SELECT result INTO STRICT v_state FROM extensions.dblink(
            'h3_actor',format(
              'SELECT (
                (SELECT financial_revision=1 AND balance=-1 FROM public.accounts
                 WHERE user_id=%L::uuid AND id=%L::uuid)
                AND (SELECT count(*)=1 FROM public.account_financial_effects
                     WHERE user_id=%L::uuid AND action_id=%L::uuid
                       AND amount_minor_units=-100 AND currency=''EGP''
                       AND accepted_account_revision=1 AND is_effective)
              )::text',
              v_owner::text,v_prior::text,v_owner::text,v_action::text
            )
          ) AS t(result text);
        ELSE
          SELECT result INTO STRICT v_state FROM extensions.dblink(
            'h3_actor',format(
              'SELECT (
                (SELECT is_default=false AND balance=0 AND financial_revision=0
                 FROM public.accounts
                 WHERE user_id=%L::uuid AND id=%L::uuid)
                AND (SELECT is_default=true AND financial_revision=0 AND balance=0
                     FROM public.accounts
                     WHERE user_id=%L::uuid AND id=%L::uuid)
                AND (SELECT count(*)=0 FROM public.account_financial_effects
                     WHERE user_id=%L::uuid AND action_id=%L::uuid)
              )::text',
              v_owner::text,v_prior::text,v_owner::text,v_new::text,
              v_owner::text,v_action::text
            )
          ) AS t(result text);
        END IF;
      END IF;
      v_notes := v_notes || jsonb_build_object(v_case || ':root_visible',v_root);
      v_notes := v_notes || jsonb_build_object(v_case || ':state_visible',v_state);

      v_phase := v_case || ':probe_rollback';
      -- Every canonical mutation was observed INSIDE canonical_probe.
      -- Roll back that subtransaction, including accepted zero-opening Add
      -- roots, WITHOUT deleting or changing an immutable financial root.
      PERFORM extensions.dblink_exec(
        'h3_actor','ROLLBACK TO SAVEPOINT canonical_probe'
      );
      PERFORM extensions.dblink_exec(
        'h3_actor','RELEASE SAVEPOINT canonical_probe'
      );
      -- Read the actor's own state after rollback, before outer COMMIT.
      -- Prior account/default/revision must remain; no probe-created root,
      -- effect, transaction or default account may survive.
      SELECT result INTO STRICT v_probe_clean FROM extensions.dblink(
        'h3_actor',format(
          'SELECT (
            NOT EXISTS (
              SELECT 1 FROM public.financial_action_groups
              WHERE user_id=%L::uuid)
            AND NOT EXISTS (
              SELECT 1 FROM public.account_financial_effects
              WHERE user_id=%L::uuid)
            AND NOT EXISTS (
              SELECT 1 FROM public.transactions
              WHERE user_id=%L::uuid)
            AND NOT EXISTS (
              SELECT 1 FROM public.accounts
              WHERE user_id=%L::uuid AND id=%L::uuid)
            AND EXISTS (
              SELECT 1 FROM public.accounts
              WHERE user_id=%L::uuid AND id=%L::uuid
                AND is_default=true AND deleted=false
                AND financial_revision=0 AND balance=0)
            AND (
              SELECT count(*)=1 FROM public.accounts
              WHERE user_id=%L::uuid)
          )::text',
          v_owner::text,
          v_owner::text,
          v_owner::text,
          v_owner::text,v_new::text,
          v_owner::text,v_prior::text,
          v_owner::text
        )
      ) AS t(result text);
      IF v_probe_clean IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'h3_savepoint_probe_mutations_survived_rollback';
      END IF;
      -- Undoing RPC-only locks must NOT let B proceed early: preheld A
      -- coordination locks remain the real blocker until outer COMMIT.
      IF NOT pg_temp.h3_waits_on(v_waiter_pid,v_actor_pid) THEN
        RAISE EXCEPTION 'h3_preheld_locks_lost_before_outer_commit';
      END IF;
      v_release := extensions.dblink_exec('h3_actor','COMMIT');
      v_notes := v_notes || jsonb_build_object(v_case || ':actor_release',v_release);

      v_phase := v_case || ':writer_result';
      v_writer_value := pg_temp.h3_take_result(v_writer_conn);
      v_notes := v_notes || jsonb_build_object(v_case || ':writer_finished','true');
      v_notes := v_notes || jsonb_build_object(v_case || ':writer_result',v_writer_value);
      PERFORM extensions.dblink_exec(v_writer_conn,'ROLLBACK');
    END LOOP;

    -- No competing upsert is queued in this separate zero-row phase.
    v_phase := 'zero_row:setup';
    v_owner := pg_temp.h3_id(1);
    v_zero_before := pg_temp.h3_owner_state('h3_fixture',v_owner);
    PERFORM pg_temp.h3_auth('h3_actor',v_owner);
    PERFORM extensions.dblink_exec('h3_actor',format(
      'UPDATE public.accounts SET name=name WHERE user_id=%L::uuid AND id=%L::uuid',
      v_owner::text,pg_temp.h3_id(999)::text
    ));
    v_actor_pid := pg_temp.h3_remote_pid('h3_actor');
    PERFORM pg_temp.h3_auth('h3_zero',v_owner);
    v_waiter_pid := pg_temp.h3_remote_pid('h3_zero');
    PERFORM extensions.dblink_send_query('h3_zero',format(
      'WITH changed AS (
         UPDATE public.accounts SET name=name
         WHERE user_id=%L::uuid AND id=%L::uuid RETURNING id
       ) SELECT count(*)::text FROM changed',
      v_owner::text,pg_temp.h3_id(999)::text
    ));
    v_phase := 'zero_row:wait';
    v_notes := v_notes || jsonb_build_object('zero_row_waits',
      pg_temp.h3_waits_on(v_waiter_pid,v_actor_pid)::text);
    PERFORM extensions.dblink_exec('h3_actor','COMMIT');
    v_phase := 'zero_row:result';
    v_status := pg_temp.h3_take_result('h3_zero');
    v_notes := v_notes || jsonb_build_object('zero_row_progress',v_status);
    v_notes := v_notes || jsonb_build_object('zero_row_unchanged',
      (pg_temp.h3_owner_state('h3_zero',v_owner) = v_zero_before)::text);
    PERFORM extensions.dblink_exec('h3_zero','ROLLBACK');
    v_notes := v_notes || jsonb_build_object('run_error',coalesce(v_first_state,'none'));
    v_notes := v_notes || jsonb_build_object('run_completed','true');
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    v_first_state := coalesce(v_first_state,SQLSTATE);
    v_first_phase := coalesce(v_first_phase,v_phase);
    v_notes := v_notes || jsonb_build_object('run_error',v_first_state);
  END;
  -- Variables survive the protected block's rollback; observation rows do not.
  FOR v_note IN SELECT key,value FROM jsonb_each_text(v_notes) LOOP
    PERFORM pg_temp.h3_note(v_note.key,v_note.value);
  END LOOP;
  IF v_first_phase IS NOT NULL THEN
    PERFORM pg_temp.h3_note('run_error_phase',v_first_phase);
  END IF;
  PERFORM pg_temp.h3_cleanup(v_owned,v_mutex);
END;
$driver$;

-- Every RPC must accept while B is waiting; root/revision/effect/default
-- postimages were observed INSIDE A's savepoint only. ROLLBACK TO removes
-- those mutations; outer COMMIT releases preheld coordination locks.
SELECT diag(format('h3 %s=%s',name,value))
FROM h3_observations
WHERE name='run_error_phase' OR (name='run_error' AND value<>'none')
  OR name LIKE 'cleanup_%'
ORDER BY name;
SELECT is((SELECT value FROM h3_observations WHERE name='run_completed'),
  'true','h3 five real two-backend same-row protocols completed');
SELECT is((SELECT value FROM h3_observations WHERE name='run_error'),
  'none','h3 protocol has no unexpected SQL errors');
SELECT is((SELECT value FROM h3_observations WHERE name='fixture_count'),
  '6','six committed synthetic owned accounts were visible remotely');
SELECT is((SELECT value FROM h3_observations WHERE name='peer_progress'),
  'H3 peer updated','unrelated owner can write while A holds owner gate');
SELECT is((SELECT value FROM h3_observations WHERE name='zero_row_waits'),
  'true','zero-row same-owner statement waits before domain tuple work');
SELECT is((SELECT value FROM h3_observations WHERE name='zero_row_progress'),
  '0','zero-row statement completes with zero affected rows after release');
SELECT is((SELECT value FROM h3_observations WHERE name='zero_row_unchanged'),
  'true','zero-row phase preserves exact owned domain/default/revision/root/effect rows');

-- Each case retains SEVEN hard assertions (5 × 7 = 35).
-- No 55P03 / 40P01 / rejected / stale / generic RPC error counts as accepted.
-- A's observed root/state is temporary; actor_release=COMMIT proves only
-- lock release after rollback-to-savepoint, NOT action durability.
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:writer_blocked'),
  'true','review: authenticated UPDATE waits behind A on SAME account');
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:rpc_status'),
  'accepted','review: valid RPC must acquire row before B without deadlock/timeout');
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:root_visible'),
  'true','review: accepted action root visible inside A savepoint only');
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:state_visible'),
  'true','review: revision and one effect are truly posted within transaction');
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:actor_release'),
  'COMMIT','review: outer COMMIT follows immutable-effect savepoint rollback');
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:writer_finished'),
  'true','review: same-row writer finishes when actor releases owner gate');
SELECT is((SELECT value FROM h3_observations WHERE name='review_update:writer_result'),
  'H3 review metadata','review: waited authenticated UPDATE succeeds afterward');

SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:writer_blocked'),
  'true','Add soft delete: same-owner metadata writer visibly waits');
SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:rpc_status'),
  'accepted','Add soft delete: zero-opening CAS RPC accepts without 55P03/40P01');
SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:root_visible'),
  'true','Add soft delete: accepted root exists only inside A savepoint');
SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:state_visible'),
  'true','Add soft delete: default clear/create revision0 and zero effects agree');
SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:actor_release'),
  'COMMIT','Add soft delete: outer COMMIT after probe rollback unblocks UPDATE');
SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:writer_finished'),
  'true','Add soft delete: generic writer completes after actor COMMIT');
SELECT is((SELECT value FROM h3_observations WHERE name='add_soft_delete:writer_result'),
  'soft_deleted','Add soft delete: prior nondefault account soft-delete completes');

SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:writer_blocked'),
  'true','Add upsert: ON CONFLICT UPDATE shares owner serialization gate');
SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:rpc_status'),
  'accepted','Add upsert: valid default CAS RPC cannot hit lock error');
SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:root_visible'),
  'true','Add upsert: accepted root visible inside A savepoint, not committed');
SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:state_visible'),
  'true','Add upsert: exact prior/new default and zero effects are valid');
SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:actor_release'),
  'COMMIT','Add upsert: outer COMMIT after probe rollback releases waiter');
SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:writer_finished'),
  'true','Add upsert: competing writer finishes after actor commit');
SELECT is((SELECT value FROM h3_observations WHERE name='add_upsert:writer_result'),
  'H3 upsert','Add upsert: ON CONFLICT existing-row UPDATE succeeds');

SELECT is((SELECT value FROM h3_observations WHERE name='add_auth_delete:writer_blocked'),
  'true','Auth delete: DELETE of the SAME owner waits on global shared gate');
SELECT is((SELECT value FROM h3_observations WHERE name='add_auth_delete:rpc_status'),
  'accepted','Auth delete: root auth FK acquisition must not deadlock with DELETE');
SELECT is((SELECT value FROM h3_observations WHERE name='add_auth_delete:root_visible'),
  'true','Auth delete: accepted root visible inside A savepoint only');
SELECT is((SELECT value FROM h3_observations WHERE name='add_auth_delete:state_visible'),
  'true','Auth delete: default CAS and metadata-only root remain complete');
SELECT is((SELECT value FROM h3_observations WHERE name='add_auth_delete:actor_release'),
  'COMMIT','Auth delete: outer COMMIT after rollback releases auth gate');
SELECT is((SELECT value FROM h3_observations WHERE name='add_auth_delete:writer_finished'),
  'true','Auth delete: privileged DELETE finishes after global gate release');
SELECT ok((SELECT value IN ('deleted','fk_restricted')
           FROM h3_observations WHERE name='add_auth_delete:writer_result'),
  'Auth delete: only expected cascade or legitimate FK restriction; no deadlock');

SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:writer_blocked'),
  'true','legacy: same-row authenticated UPDATE waits on early owner gate');
SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:rpc_status'),
  'accepted','legacy: original v1 RPC must not be broken by new owner gate');
SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:root_visible'),
  'true','legacy: accepted legacy root visible inside A savepoint only');
SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:state_visible'),
  'true','legacy: original v1 revision/effect posted once inside transaction');
SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:actor_release'),
  'COMMIT','legacy: outer COMMIT follows immutable-effect savepoint rollback');
SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:writer_finished'),
  'true','legacy: concurrent writer finishes after actor release');
SELECT is((SELECT value FROM h3_observations WHERE name='legacy_update:writer_result'),
  'H3 legacy metadata','legacy: metadata update completes after accepted RPC');

SELECT is((SELECT count(*) FROM h3_observations WHERE name LIKE 'cleanup_error:%'),
  0::bigint,'all dblink connections and v2 fixtures cleaned without root DELETE');
SELECT is((
  SELECT count(*) FROM auth.users
  WHERE id IN (
    pg_temp.h3_id(1),pg_temp.h3_id(2),pg_temp.h3_id(3),
    pg_temp.h3_id(4),pg_temp.h3_id(5),pg_temp.h3_id(6)
  )
),0::bigint,'all six v2 synthetic owners deleted after savepoint-only RPC probes');

SELECT * FROM finish();
ROLLBACK;
