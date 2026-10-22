-- #395 independent-session owner/global/seal serialization contract (T045/T066 follow-up).
-- Requires LOCAL PostgreSQL with 090 review + 091 Add applied, plus dblink installed
-- by the root runner. This test does NOT install extensions or change migrations.
-- New tuples remain RED until 090/091 registrations and owner serialization exist.
-- Optional local-only GUC: monyvi.test_dblink_conninfo, supplied by root
-- securely in the same runner session (not in this file, TAP or logs).
-- If unset/blank, use the original dbname/current_user CI connection.
-- Each fixture identity is synthetic, reserved below, and protected by a mutex.
-- External dblink fixture commits are cleaned explicitly; all financial RPCs
-- execute within separate transactions which are ROLLED BACK, even on failure.
BEGIN;
SELECT no_plan();
SELECT ok(
  to_regprocedure('extensions.dblink_connect(text,text)') IS NOT NULL,
  'PREREQUISITE: local extensions.dblink installed before race test (not auto-installed)'
);

CREATE TEMP TABLE race_395_observations (
  name text PRIMARY KEY,
  value text NOT NULL
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.r395_note(p_name text, p_value text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO race_395_observations(name, value)
  VALUES (p_name, COALESCE(p_value,'<null>'))
  ON CONFLICT (name) DO UPDATE SET value=excluded.value;
END;
$$;

CREATE FUNCTION pg_temp.r395_connect(p_name text)
RETURNS void LANGUAGE plpgsql AS $connect$
DECLARE
  -- Supplied only in the local test runner session; never persisted or printed.
  v_conninfo text := current_setting('monyvi.test_dblink_conninfo', true);
  v_privileged boolean;
BEGIN
  IF v_conninfo IS NULL OR btrim(v_conninfo) = '' THEN
    -- Preserve the original trusted/superuser CI connection behavior.
    v_conninfo := 'dbname=' || current_database() || ' user=' || current_user;
  END IF;
  PERFORM extensions.dblink_connect(p_name, v_conninfo);
  -- Runtime backend privilege must be proven by PostgreSQL role attributes,
  -- not inferred from a caller GUC, connection label or current_user alone.
  SELECT result INTO v_privileged FROM extensions.dblink(p_name,
    'SELECT (rolsuper OR rolbypassrls) FROM pg_roles WHERE rolname=current_user'
  ) AS t(result boolean);
  IF v_privileged IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'local_sql395_privileged_runner_required';
  END IF;
  PERFORM extensions.dblink_exec(p_name, 'SET statement_timeout = ''8s''');
  PERFORM extensions.dblink_exec(p_name, 'SET lock_timeout = ''6s''');
  PERFORM extensions.dblink_exec(
    p_name, 'SET idle_in_transaction_session_timeout = ''20s'''
  );
END;
$connect$;

CREATE FUNCTION pg_temp.r395_auth(p_name text, p_owner uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM extensions.dblink_exec(p_name, 'BEGIN');
  PERFORM extensions.dblink_exec(
    p_name, format('SET LOCAL request.jwt.claim.sub = %L', p_owner::text)
  );
  PERFORM extensions.dblink_exec(p_name, format(
    'SET LOCAL request.jwt.claims = %L',
    jsonb_build_object('sub',p_owner,'role','authenticated')::text
  ));
  PERFORM extensions.dblink_exec(p_name, 'SET LOCAL ROLE authenticated');
END;
$$;

CREATE FUNCTION pg_temp.r395_rpc_sql(p_envelope jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_json text;
BEGIN
  v_json := private.financial_action_encode_jsonb_v1(p_envelope);
  RETURN format(
    'SELECT public.apply_account_financial_action_v1(%L,%L)->>''status''',
    v_json, encode(extensions.digest(convert_to(v_json,'UTF8'),'sha256'),'hex')
  );
END;
$$;

CREATE FUNCTION pg_temp.r395_transaction(
  p_id uuid, p_account uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'entity','transaction','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_id,'accountId',p_account,'amountMinorUnits','100',
      'currency','EGP','type','EXPENSE',
      'categoryId','39a70000-0000-4000-8000-000000000401',
      'counterparty',null,'note',null,'date','2026-09-01',
      'source','VOICE','smsFingerprint',null,'isDraft',false,
      'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;

-- Synthetic SQL fixture commitment only: never hash or transmit raw review PII.
-- The pure T046 original-intent projection owns the real digest. PostgreSQL
-- validates this closed 64-hex field as opaque and must never recompute it.
CREATE FUNCTION pg_temp.r395_fixture_digest(p_action uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(extensions.digest(
    convert_to('sql395-frozen-intent-fixture:' || p_action::text,'UTF8'),
    'sha256'),'hex')
$$;

CREATE FUNCTION pg_temp.r395_review(p_action uuid,p_record uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId','39a70000-0000-4000-8000-000000000001',
    'actionId',p_action,'domain','transactions',
    'kind','review_batch_save','domainReferenceId',p_record,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','review.batch-save/v1',
    'accountGuards',jsonb_build_array(jsonb_build_object(
      'accountId','39a70000-0000-4000-8000-000000000102',
      'expectedRevision','0')),
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1','operationCode','review.batch-save',
      'source','VOICE','sessionId','39a70000-0000-4000-8000-000000000901',
      'frozenIntentDigest',pg_temp.r395_fixture_digest(p_action),
      'selectedSourceRefs',jsonb_build_array(jsonb_build_object(
        'rowId','39a70000-0000-4000-8000-000000000501',
        'recordId',p_record,'sourceFingerprint',null)),
      'confirmedGroupRefs','[]'::jsonb,
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','transaction','id',p_record,'expectedAbsent',true)),
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId','39a70000-0000-4000-8000-000000000102',
        'amountMinorUnits','-100','currency','EGP',
        'effectId','39a70000-0000-4000-8000-000000000701')),
      'domainRecordRefs',jsonb_build_array(p_record),
      'domainMutation',jsonb_build_object(
        'records',jsonb_build_array(pg_temp.r395_transaction(
          p_record,'39a70000-0000-4000-8000-000000000102'::uuid))),
      'localSmsBookkeeping','[]'::jsonb))
$$;

CREATE FUNCTION pg_temp.r395_add(p_action uuid,p_created uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId','39a70000-0000-4000-8000-000000000001',
    'actionId',p_action,'domain','accounts','kind','create_with_default',
    'domainReferenceId',p_created,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.create-default/v1','accountGuards','[]'::jsonb,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1',
      'operationCode','account.create-default','defaultIntent',true,
      'expectedDefaultSnapshot',jsonb_build_object(
        'activeAccountIds',jsonb_build_array(
          '39a70000-0000-4000-8000-000000000101',
          '39a70000-0000-4000-8000-000000000102'),
        'defaultAccount',jsonb_build_object(
          'accountId','39a70000-0000-4000-8000-000000000101',
          'isDefault',true)),
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','account','id',p_created,'expectedAbsent',true)),
      'accountEffects','[]'::jsonb,
      'domainRecordRefs',jsonb_build_array(
        '39a70000-0000-4000-8000-000000000101',p_created),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        jsonb_build_object(
          'entity','account','mode','create','expectedUpdatedAt',null,
          'after',jsonb_build_object(
            'id',p_created,'name','Race New Default','type','CASH',
            'currency','EGP','institutionId',null,'providerDisplayName',null,
            'isDefault',true,'createdAt','2026-09-01T12:00:00.000Z',
            'deleted',false,'openingBalanceMinorUnits','0',
            'targetBalanceMinorUnits',null)),
        jsonb_build_object(
          'entity','account_default','mode','update','expectedIsDefault',true,
          'after',jsonb_build_object(
            'id','39a70000-0000-4000-8000-000000000101',
            'isDefault',false))))))
$$;

CREATE FUNCTION pg_temp.r395_legacy(p_action uuid,p_record uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId','39a70000-0000-4000-8000-000000000001',
    'actionId',p_action,'domain','transactions','kind','create',
    'domainReferenceId',p_record,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.balance-effects/v1',
    'accountGuards',jsonb_build_array(jsonb_build_object(
      'accountId','39a70000-0000-4000-8000-000000000101',
      'expectedRevision','0')),
    'payload',jsonb_build_object(
      'schemaVersion','account.balance-effects/v1',
      'operationCode','transaction.create',
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId','39a70000-0000-4000-8000-000000000101',
        'amountMinorUnits','-100','currency','EGP',
        'effectId','39a70000-0000-4000-8000-000000000702')),
      'domainRecordRefs',jsonb_build_array(p_record),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        pg_temp.r395_transaction(
          p_record,'39a70000-0000-4000-8000-000000000101'::uuid)))))
$$;

-- Synthetic canonical account IDs are stable across independent connections.
CREATE FUNCTION pg_temp.r395_uuid(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
 SELECT ('39a70000-0000-4000-8000-' || lpad(p_n::text,12,'0'))::uuid
$$;
-- A genuinely empty-owner review creates one Cash/Bank/Wallet with the SAME
-- creationDefaultSnapshot contract, and BANK has exactly one bank_details child.
CREATE FUNCTION pg_temp.r395_first_review(p_n integer,p_type text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
 u uuid:=pg_temp.r395_uuid(p_n); a uuid:=pg_temp.r395_uuid(p_n*100+11);
 b uuid:=pg_temp.r395_uuid(p_n*100+12); r uuid:=pg_temp.r395_uuid(p_n*100+13);
 act uuid:=pg_temp.r395_uuid(1200+p_n);
 records jsonb; guards jsonb; refs jsonb;
BEGIN
 records:=jsonb_build_array(jsonb_build_object(
   'entity','account','mode','create','expectedUpdatedAt',null,
   'after',jsonb_build_object(
     'id',a,'name','First '||p_type,'type',p_type,'currency','EGP',
     'institutionId',null,'providerDisplayName',null,'isDefault',true,
     'createdAt','2026-09-01T12:00:00.000Z','deleted',false,
     'openingBalanceMinorUnits','0','targetBalanceMinorUnits',null)))
   || (CASE WHEN p_type='BANK' THEN jsonb_build_array(jsonb_build_object(
     'entity','bank_details','mode','create','expectedUpdatedAt',null,
     'after',jsonb_build_object('id',b,'accountId',a,'accountNumber',null,
       'cardLast4','0007','createdAt','2026-09-01T12:00:00.000Z','deleted',false)))
     ELSE '[]'::jsonb END)
   || jsonb_build_array(jsonb_build_object(
     'entity','transaction','mode','create','expectedUpdatedAt',null,
     'after',jsonb_build_object(
       'id',r,'accountId',a,'amountMinorUnits','100','currency','EGP',
       'type','INCOME','categoryId',pg_temp.r395_uuid(398+p_n),
       'counterparty',null,'note',null,'date','2026-09-01',
       'source','VOICE','smsFingerprint',null,'isDraft',false,
       'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
       'createdAt','2026-09-01T12:00:00.000Z','deleted',false)));
 SELECT jsonb_agg(jsonb_build_object('entity',x->>'entity',
    'id',x->'after'->>'id','expectedAbsent',true)
    ORDER BY ((x->>'entity')||':'||(x->'after'->>'id')) COLLATE "C"),
    jsonb_agg(x->'after'->>'id' ORDER BY (x->'after'->>'id') COLLATE "C")
 INTO guards,refs FROM jsonb_array_elements(records) AS t(x);
 RETURN jsonb_build_object(
   'envelopeVersion','monyvi.financial-action/v1','userId',u,'actionId',act,
   'domain','transactions','kind','review_batch_save','domainReferenceId',r,
   'occurredAt','2026-09-01T12:00:00.000Z','payloadVersion','review.batch-save/v1',
   'accountGuards',jsonb_build_array(jsonb_build_object(
     'accountId',a,'expectedRevision','0')),
   'payload',jsonb_build_object(
     'schemaVersion','review.batch-save/v1','operationCode','review.batch-save',
     'source','VOICE','sessionId',pg_temp.r395_uuid(900+p_n),
     'frozenIntentDigest',pg_temp.r395_fixture_digest(act),
     'selectedSourceRefs',jsonb_build_array(jsonb_build_object(
       'rowId',pg_temp.r395_uuid(500+p_n),'recordId',r,'sourceFingerprint',null)),
     'confirmedGroupRefs',jsonb_build_array(jsonb_build_object(
       'groupId',pg_temp.r395_uuid(700+p_n),'revision','1','accountId',a)),
     'createGuards',guards,'accountEffects',jsonb_build_array(jsonb_build_object(
       'accountId',a,'amountMinorUnits','100','currency','EGP',
       'effectId',pg_temp.r395_uuid(800+p_n))),
     'domainRecordRefs',refs,'domainMutation',jsonb_build_object('records',records),
     'localSmsBookkeeping','[]'::jsonb,
     'creationDefaultSnapshot',jsonb_build_object(
       'activeAccountIds','[]'::jsonb,'defaultAccount',null)));
END;
$$;

-- Fixture-shape gates execute without touching independent dblink sessions.
-- Keep Add and the deployed v1 legacy tuple closed and unchanged.
SELECT ok((pg_temp.r395_review(
  pg_temp.r395_uuid(1003),pg_temp.r395_uuid(303))
  ->'payload'->>'frozenIntentDigest') ~ '^[0-9a-f]{64}$',
  'existing-account race Review has the required lowercase digest');
SELECT ok((pg_temp.r395_first_review(5,'BANK')
  ->'payload'->>'frozenIntentDigest') ~ '^[0-9a-f]{64}$',
  'empty-owner BANK race Review has the required lowercase digest');
SELECT ok(
  NOT (pg_temp.r395_add(pg_temp.r395_uuid(1001),pg_temp.r395_uuid(103))
    ->'payload' ? 'frozenIntentDigest')
  AND NOT (pg_temp.r395_legacy(pg_temp.r395_uuid(1004),pg_temp.r395_uuid(304))
    ->'payload' ? 'frozenIntentDigest'),
  'Add and old v1 fixture tuples do not acquire review-only digest');

CREATE FUNCTION pg_temp.r395_remote_pid(p_name text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_pid integer;
BEGIN
  SELECT result INTO STRICT v_pid
  FROM extensions.dblink(p_name,'SELECT pg_backend_pid()') AS t(result integer);
  RETURN v_pid;
END;
$$;

CREATE FUNCTION pg_temp.r395_waits_on(p_waiter integer,p_holder integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_i integer;
BEGIN
  FOR v_i IN 1..12 LOOP
    IF EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE pid=p_waiter AND wait_event_type='Lock')
      AND p_holder=ANY(pg_blocking_pids(p_waiter)) THEN
      RETURN true;
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  RETURN false;
END;
$$;

CREATE FUNCTION pg_temp.r395_wait_other_ready(p_name text, p_max_attempts integer DEFAULT 100)
RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_i integer;
BEGIN
  FOR v_i IN 1..p_max_attempts LOOP
    IF extensions.dblink_is_busy(p_name) = 0 THEN
      RETURN true;
    END IF;
    PERFORM pg_sleep(0.001);
  END LOOP;
  RETURN false;
END;
$$;

-- Single-statement async queries must yield one row and then an empty result.
CREATE FUNCTION pg_temp.r395_take_result(p_name text)
RETURNS text LANGUAGE plpgsql AS $async$
DECLARE
  v_result text;
BEGIN
  IF NOT pg_temp.r395_wait_other_ready(p_name,2000) THEN
    RAISE EXCEPTION USING ERRCODE = '57014', MESSAGE = 'r395_async_timeout';
  END IF;
  SELECT result INTO STRICT v_result
  FROM extensions.dblink_get_result(p_name) AS t(result text);
  IF NOT pg_temp.r395_wait_other_ready(p_name,2000) THEN
    RAISE EXCEPTION USING ERRCODE = '57014', MESSAGE = 'r395_drain_timeout';
  END IF;
  PERFORM result FROM extensions.dblink_get_result(p_name) AS t(result text);
  IF FOUND THEN RAISE EXCEPTION 'r395_unexpected_extra_result'; END IF;
  RETURN v_result;
END;
$async$;

-- Compare actual owner-scoped rows, including defaults, revisions and children.
-- Only synthetic fixture rows are read; no row contents are printed.
CREATE FUNCTION pg_temp.r395_owner_state(p_name text, p_owner uuid)
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

CREATE FUNCTION pg_temp.r395_safe_close(p_name text)
RETURNS void LANGUAGE plpgsql AS $close$
DECLARE
  v_attempt integer;
  v_drained boolean := false;
BEGIN
  IF p_name = ANY(coalesce(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    IF extensions.dblink_is_busy(p_name) = 1 THEN
      PERFORM pg_temp.r395_note('cleanup_error:'||p_name||':pending','57014');
      PERFORM extensions.dblink_cancel_query(p_name);
    END IF;
    FOR v_attempt IN 1..8 LOOP
      EXIT WHEN NOT pg_temp.r395_wait_other_ready(p_name,2000);
      BEGIN
        PERFORM result FROM extensions.dblink_get_result(p_name) AS t(result text);
        IF NOT FOUND AND v_attempt > 1 THEN v_drained := true; EXIT; END IF;
      EXCEPTION WHEN query_canceled OR OTHERS THEN
        -- An error result is consumed; still fetch the final empty result.
        PERFORM pg_temp.r395_note('cleanup_result:'||p_name,SQLSTATE);
      END;
    END LOOP;
    IF v_drained THEN
      PERFORM extensions.dblink_exec(p_name,'ROLLBACK');
    ELSE
      PERFORM pg_temp.r395_note('cleanup_error:'||p_name||':drain','57014');
    END IF;
    PERFORM extensions.dblink_disconnect(p_name);
  END IF;
EXCEPTION WHEN query_canceled OR OTHERS THEN
  PERFORM pg_temp.r395_note('cleanup_error:'||p_name,SQLSTATE);
  BEGIN
    IF p_name = ANY(coalesce(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
      PERFORM extensions.dblink_disconnect(p_name);
    END IF;
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    PERFORM pg_temp.r395_note('cleanup_error:'||p_name||':disconnect',SQLSTATE);
  END;
END;
$close$;

CREATE FUNCTION pg_temp.r395_cleanup(p_owned boolean,p_mutex boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'race_add','race_writer','race_other','race_global','race_seal'
  ] LOOP
    PERFORM pg_temp.r395_safe_close(v_name);
  END LOOP;
  IF p_owned THEN
    BEGIN
      IF NOT ('race_fixture' = ANY(
        COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])
      )) THEN PERFORM pg_temp.r395_connect('race_fixture'); END IF;
      PERFORM extensions.dblink_exec('race_fixture', $cleanup$
        DELETE FROM public.categories
        WHERE id::text LIKE '39a70000-0000-4000-8000-%'
          AND user_id::text LIKE '39a70000-0000-4000-8000-%'
      $cleanup$);
      PERFORM extensions.dblink_exec('race_fixture', $cleanup$
        DELETE FROM public.accounts
        WHERE user_id IN (
          '39a70000-0000-4000-8000-000000000001'::uuid,
          '39a70000-0000-4000-8000-000000000002'::uuid,
          '39a70000-0000-4000-8000-000000000003'::uuid,
          '39a70000-0000-4000-8000-000000000004'::uuid,
          '39a70000-0000-4000-8000-000000000005'::uuid,
          '39a70000-0000-4000-8000-000000000006'::uuid)
      $cleanup$);
      PERFORM extensions.dblink_exec('race_fixture', $cleanup$
        DELETE FROM auth.users
        WHERE id IN (
          '39a70000-0000-4000-8000-000000000001'::uuid,
          '39a70000-0000-4000-8000-000000000002'::uuid,
          '39a70000-0000-4000-8000-000000000003'::uuid,
          '39a70000-0000-4000-8000-000000000004'::uuid,
          '39a70000-0000-4000-8000-000000000005'::uuid,
          '39a70000-0000-4000-8000-000000000006'::uuid)
      $cleanup$);
    EXCEPTION WHEN query_canceled OR OTHERS THEN
      PERFORM pg_temp.r395_note('cleanup_error:fixture',SQLSTATE);
    END;
  END IF;
  PERFORM pg_temp.r395_safe_close('race_fixture');
  IF p_mutex THEN PERFORM pg_advisory_unlock(395,395); END IF;
END;
$$;

-- New 090/091 registration is not yet published; only Root local SQL can
-- advance this suite to Green. dblink missing fails the prerequisite assertion.
-- Test data is inserted from a separate committed fixture connection because
-- independently connected readers cannot see this runner's uncommitted rows.
DO $driver$
DECLARE
  v_mutex boolean := false;
  v_owned boolean := false;
  v_collisions integer;
  v_status text;
  v_other text;
  v_add_pid integer;
  v_writer_pid integer;
  v_other_pid integer;
  v_global_pid integer;
  v_seal_pid integer;
  v_review_pid integer;
  v_privileged_runner boolean;
  v_notes jsonb := '{}'::jsonb;
  v_note record;
  v_phase text := 'fixtures';
  v_zero_before jsonb;
BEGIN
  SELECT (rolsuper OR rolbypassrls) INTO v_privileged_runner
  FROM pg_roles WHERE rolname=current_user;
  IF v_privileged_runner IS DISTINCT FROM true THEN
    PERFORM pg_temp.r395_note('run_error','local_privileged_runner_required');
    RETURN;
  END IF;
  IF to_regprocedure('extensions.dblink_connect(text,text)') IS NULL THEN
    PERFORM pg_temp.r395_note('run_error','local_dblink_missing');
    RETURN;
  END IF;
  v_mutex := pg_try_advisory_lock(395,395);
  IF NOT v_mutex THEN
    PERFORM pg_temp.r395_note('run_error','reserved_fixture_mutex_busy');
    RETURN;
  END IF;
  BEGIN
    SELECT
      (SELECT count(*) FROM auth.users
       WHERE id::text LIKE '39a70000-0000-4000-8000-%')
      +(SELECT count(*) FROM public.accounts
       WHERE id::text LIKE '39a70000-0000-4000-8000-%')
      +(SELECT count(*) FROM public.categories
       WHERE id::text LIKE '39a70000-0000-4000-8000-%')
    INTO v_collisions;
    IF v_collisions<>0 THEN
      RAISE EXCEPTION 'reserved_fixture_id_already_exists';
    END IF;
    -- Empty namespace + mutex alone do not authorize cleanup. Only a
    -- successful atomic auth-user seed makes these synthetic IDs ours.
    PERFORM pg_temp.r395_connect('race_fixture');
    PERFORM extensions.dblink_exec('race_fixture',$seed$
      INSERT INTO auth.users
        (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
      VALUES
        ('39a70000-0000-4000-8000-000000000001','authenticated','authenticated',
         'sql395-race-owner@monyvi.test','unused','{}','{}'),
        ('39a70000-0000-4000-8000-000000000002','authenticated','authenticated',
         'sql395-race-peer@monyvi.test','unused','{}','{}'),
        ('39a70000-0000-4000-8000-000000000003','authenticated','authenticated',
         'sql395-race-cascade@monyvi.test','unused','{}','{}'),
        ('39a70000-0000-4000-8000-000000000004','authenticated','authenticated',
         'sql395-race-first-cash@monyvi.test','unused','{}','{}'),
        ('39a70000-0000-4000-8000-000000000005','authenticated','authenticated',
         'sql395-race-first-bank@monyvi.test','unused','{}','{}'),
        ('39a70000-0000-4000-8000-000000000006','authenticated','authenticated',
         'sql395-race-first-wallet@monyvi.test','unused','{}','{}')
    $seed$);
    v_owned := true;
    PERFORM extensions.dblink_exec('race_fixture',$seed$
      INSERT INTO public.accounts
        (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
      VALUES
        ('39a70000-0000-4000-8000-000000000101',
         '39a70000-0000-4000-8000-000000000001','Race A Default',
         'CASH',100,'EGP',0,true,false),
        ('39a70000-0000-4000-8000-000000000102',
         '39a70000-0000-4000-8000-000000000001','Race A Other',
         'BANK',25,'EGP',0,false,false),
        ('39a70000-0000-4000-8000-000000000201',
         '39a70000-0000-4000-8000-000000000002','Race Peer',
         'CASH',50,'EGP',0,true,false),
        ('39a70000-0000-4000-8000-000000000301',
         '39a70000-0000-4000-8000-000000000003','Race Cascade',
         'CASH',40,'EGP',0,true,false)
    $seed$);
    PERFORM extensions.dblink_exec('race_fixture',$seed$
      INSERT INTO public.categories
        (id,user_id,system_name,display_name,icon,level)
      VALUES ('39a70000-0000-4000-8000-000000000401',
        '39a70000-0000-4000-8000-000000000001',
        'race-review','Race Review','wallet',1),
        ('39a70000-0000-4000-8000-000000000402',
         '39a70000-0000-4000-8000-000000000004',
         'race-first-cash','First Cash','wallet',1),
        ('39a70000-0000-4000-8000-000000000403',
         '39a70000-0000-4000-8000-000000000005',
         'race-first-bank','First Bank','wallet',1),
        ('39a70000-0000-4000-8000-000000000404',
         '39a70000-0000-4000-8000-000000000006',
         'race-first-wallet','First Wallet','wallet',1)
    $seed$);
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM public.accounts
      WHERE id::text LIKE '39a70000-0000-4000-8000-%'
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('fixture_account_count',v_status);

    FOREACH v_status IN ARRAY ARRAY[
      'race_add','race_writer','race_other','race_global','race_seal'
    ] LOOP PERFORM pg_temp.r395_connect(v_status); END LOOP;
    v_add_pid:=pg_temp.r395_remote_pid('race_add');
    v_writer_pid:=pg_temp.r395_remote_pid('race_writer');
    v_other_pid:=pg_temp.r395_remote_pid('race_other');
    v_global_pid:=pg_temp.r395_remote_pid('race_global');
    v_seal_pid:=pg_temp.r395_remote_pid('race_seal');

    -- A: zero-opening Add owns owner1's predicate; disjoint owner1 UPDATE B
    -- must wait, but owner2 UPDATE must finish without owner1 lock contention.
    v_phase := 'A';
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001001'::uuid,
        '39a70000-0000-4000-8000-000000000103'::uuid))
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('add_accept',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001001'::uuid,
        '39a70000-0000-4000-8000-000000000103'::uuid))
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('add_replay',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.financial_action_groups
      WHERE action_id='39a70000-0000-4000-8000-000000001001'::uuid
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('add_root_in_tx',v_status);
    PERFORM pg_temp.r395_auth(
      'race_writer','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM pg_temp.r395_auth(
      'race_other','39a70000-0000-4000-8000-000000000002'::uuid);
    PERFORM extensions.dblink_send_query('race_writer',$q$
      UPDATE public.accounts SET name='Same Owner Passed'
      WHERE id='39a70000-0000-4000-8000-000000000102'::uuid
      RETURNING name
    $q$);
    PERFORM extensions.dblink_send_query('race_other',$q$
      UPDATE public.accounts SET name='Other Owner Passed'
      WHERE id='39a70000-0000-4000-8000-000000000201'::uuid
      RETURNING name
    $q$);
    v_notes := v_notes || jsonb_build_object('same_owner_blocked',
      pg_temp.r395_waits_on(v_writer_pid,v_add_pid)::text);
    v_notes := v_notes || jsonb_build_object('different_owner_progress',
      pg_temp.r395_wait_other_ready('race_other')::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    v_status := pg_temp.r395_take_result('race_writer');
    v_other := pg_temp.r395_take_result('race_other');
    v_notes := v_notes || jsonb_build_object('same_owner_after_release',v_status);
    v_notes := v_notes || jsonb_build_object('different_owner_result',v_other);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');
    PERFORM extensions.dblink_exec('race_other','COMMIT');

    -- B: generic writer first, current-state CAS must re-read AFTER waiting;
    -- it cannot accept an A snapshot after generic A->B default change commits.
    v_phase := 'B';
    PERFORM pg_temp.r395_auth(
      'race_writer','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM extensions.dblink_exec('race_writer',$q$
      UPDATE public.accounts SET is_default=false
      WHERE id='39a70000-0000-4000-8000-000000000101'::uuid
    $q$);
    PERFORM extensions.dblink_exec('race_writer',$q$
      UPDATE public.accounts SET is_default=true
      WHERE id='39a70000-0000-4000-8000-000000000102'::uuid
    $q$);
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM extensions.dblink_send_query('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001002'::uuid,
        '39a70000-0000-4000-8000-000000000104'::uuid)));
    v_notes := v_notes || jsonb_build_object('generic_first_add_waits',
      pg_temp.r395_waits_on(v_add_pid,v_writer_pid)::text);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');
    v_status := pg_temp.r395_take_result('race_add');
    v_notes := v_notes || jsonb_build_object('fresh_default_cas_result',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.accounts
      WHERE id='39a70000-0000-4000-8000-000000000104'::uuid
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('stale_add_absent',v_status);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT id::text FROM public.accounts WHERE is_default
      AND user_id='39a70000-0000-4000-8000-000000000001'::uuid
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('default_after_generic_commit',v_status);
    PERFORM extensions.dblink_exec('race_fixture',$q$
      UPDATE public.accounts SET is_default=false
      WHERE id='39a70000-0000-4000-8000-000000000102'::uuid
    $q$);
    PERFORM extensions.dblink_exec('race_fixture',$q$
      UPDATE public.accounts SET is_default=true
      WHERE id='39a70000-0000-4000-8000-000000000101'::uuid
    $q$);

    -- C: review action holds only account B row; unrelated A upsert should
    -- still wait on shared owner gate. No zero-row waiter is queued here.
    v_phase := 'C';
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    v_review_pid:=v_add_pid;
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_review(
        '39a70000-0000-4000-8000-000000001003'::uuid,
        '39a70000-0000-4000-8000-000000000303'::uuid))
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('review_accept',v_status);
    PERFORM pg_temp.r395_auth(
      'race_writer','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM extensions.dblink_send_query('race_writer',$q$
      INSERT INTO public.accounts
        (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
      VALUES ('39a70000-0000-4000-8000-000000000101',
        '39a70000-0000-4000-8000-000000000001','Disjoint Upsert',
        'CASH',0,'EGP',0,false,false)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name
      RETURNING name
    $q$);
    v_notes := v_notes || jsonb_build_object('upsert_waits_on_review',
      pg_temp.r395_waits_on(v_writer_pid,v_review_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    v_status := pg_temp.r395_take_result('race_writer');
    PERFORM extensions.dblink_exec('race_writer','COMMIT');
    v_notes := v_notes || jsonb_build_object('upsert_after_review_release',v_status);

    -- D: legacy v1 RPC early entry must acquire owner gate before row A locks;
    -- metadata UPDATE B is disjoint, so a wait proves owner-wide serialization.
    v_phase := 'D';
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_legacy(
        '39a70000-0000-4000-8000-000000001004'::uuid,
        '39a70000-0000-4000-8000-000000000304'::uuid))
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('legacy_rpc_accept',v_status);
    PERFORM pg_temp.r395_auth(
      'race_writer','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM extensions.dblink_send_query('race_writer',$q$
      UPDATE public.accounts SET name='Legacy Owner Gate'
      WHERE id='39a70000-0000-4000-8000-000000000102'::uuid
      RETURNING name
    $q$);
    v_notes := v_notes || jsonb_build_object('legacy_early_owner_lock',
      pg_temp.r395_waits_on(v_writer_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    v_status := pg_temp.r395_take_result('race_writer');
    v_notes := v_notes || jsonb_build_object('legacy_writer_after_release',v_status);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');

    -- E: pull-seal FOR UPDATE waits while zero-effect Add holds publication
    -- fence FOR SHARE. Seal transaction is rolled back after the observation.
    v_phase := 'E';
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001005'::uuid,
        '39a70000-0000-4000-8000-000000000105'::uuid))
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('seal_add_accept',v_status);
    PERFORM pg_temp.r395_auth(
      'race_seal','39a70000-0000-4000-8000-000000000002'::uuid);
    PERFORM extensions.dblink_send_query('race_seal',$q$
      SELECT public.seal_sync_pull_v1(
        '1970-01-01T00:00:00.000Z'::timestamptz)::text
    $q$);
    v_notes := v_notes || jsonb_build_object('seal_waits_on_writer',
      pg_temp.r395_waits_on(v_seal_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    v_status := pg_temp.r395_take_result('race_seal');
    v_notes := v_notes || jsonb_build_object('seal_after_release',v_status);
    PERFORM extensions.dblink_exec('race_seal','ROLLBACK');

    -- F: privileged auth.user cascade for *different* owner3 should wait on
    -- global exclusive gate, rather than accidentally sharing A's account lock.
    v_phase := 'F';
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001006'::uuid,
        '39a70000-0000-4000-8000-000000000106'::uuid))
    ) AS t(result text);
    v_notes := v_notes || jsonb_build_object('cascade_add_accept',v_status);
    PERFORM extensions.dblink_exec('race_global','BEGIN');
    PERFORM extensions.dblink_send_query('race_global',$q$
      DELETE FROM auth.users
      WHERE id='39a70000-0000-4000-8000-000000000003'::uuid
      RETURNING id::text
    $q$);
    v_notes := v_notes || jsonb_build_object('global_cascade_excluded',
      pg_temp.r395_waits_on(v_global_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    v_status := pg_temp.r395_take_result('race_global');
    v_notes := v_notes || jsonb_build_object('cascade_after_release',v_status);
    PERFORM extensions.dblink_exec('race_global','ROLLBACK');
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM auth.users
      WHERE id='39a70000-0000-4000-8000-000000000003'::uuid
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('cascade_rollback_preserved_owner',v_status);

    -- G: true empty-owner Review first account uses the same owner lock;
    -- generic insert of a DIFFERENT UUID must block, even with no old row.
    v_phase := 'G';
    PERFORM pg_temp.r395_auth('race_add',pg_temp.r395_uuid(4));
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_first_review(4,'CASH'))) AS t(result text);
    v_notes := v_notes || jsonb_build_object('first_cash_review_accept',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.accounts WHERE
      id='39a70000-0000-4000-8000-000000000411'::uuid
      AND is_default AND type='CASH' AND balance=1
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('first_cash_in_tx_default',v_status);
    PERFORM pg_temp.r395_auth('race_writer',pg_temp.r395_uuid(4));
    PERFORM extensions.dblink_send_query('race_writer',$q$
      INSERT INTO public.accounts
      (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
      VALUES ('39a70000-0000-4000-8000-000000000418',
        '39a70000-0000-4000-8000-000000000004',
        'Independent First Add','CASH',0,'EGP',0,false,false)
      RETURNING name
    $q$);
    v_notes := v_notes || jsonb_build_object('first_cash_empty_owner_lock',
      pg_temp.r395_waits_on(v_writer_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    v_status := pg_temp.r395_take_result('race_writer');
    v_notes := v_notes || jsonb_build_object('first_cash_insert_after_release',v_status);
    PERFORM extensions.dblink_exec('race_writer','ROLLBACK');
    -- H: separate empty-owner BANK/WALLET confirm same shared snapshot
    -- behavior, with BANK child present and Wallet without a bank child.
    v_phase := 'H';
    PERFORM pg_temp.r395_auth('race_add',pg_temp.r395_uuid(5));
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_first_review(5,'BANK'))) AS t(result text);
    v_notes := v_notes || jsonb_build_object('first_bank_review_accept',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.accounts a JOIN public.bank_details b
      ON b.account_id=a.id WHERE a.id='39a70000-0000-4000-8000-000000000511'
      AND a.is_default AND a.type='BANK' AND b.id='39a70000-0000-4000-8000-000000000512'
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('first_bank_default_child',v_status);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    PERFORM pg_temp.r395_auth('race_add',pg_temp.r395_uuid(6));
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_first_review(6,'DIGITAL_WALLET'))) AS t(result text);
    v_notes := v_notes || jsonb_build_object('first_wallet_review_accept',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.accounts a WHERE
      a.id='39a70000-0000-4000-8000-000000000611'
      AND a.is_default AND a.type='DIGITAL_WALLET' AND a.balance=1
      AND NOT EXISTS(SELECT 1 FROM public.bank_details b WHERE b.account_id=a.id)
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('first_wallet_default_no_bank',v_status);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');

    -- I: separate no-op phase; no second waiter can own scope ahead of us.
    v_phase := 'I:zero_row_setup';
    v_zero_before := pg_temp.r395_owner_state('race_fixture',pg_temp.r395_uuid(1));
    PERFORM pg_temp.r395_auth('race_add',pg_temp.r395_uuid(1));
    PERFORM extensions.dblink_exec('race_add',$q$
      UPDATE public.accounts SET name=name
      WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
        AND id='39a70000-0000-4000-8000-000000000999'::uuid
    $q$);
    PERFORM pg_temp.r395_auth('race_other',pg_temp.r395_uuid(1));
    PERFORM extensions.dblink_send_query('race_other',$q$
      WITH changed AS (
        UPDATE public.accounts SET name=name
        WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
          AND id='39a70000-0000-4000-8000-000000000999'::uuid
        RETURNING id
      ) SELECT count(*)::text FROM changed
    $q$);
    v_phase := 'I:zero_row_wait';
    v_notes := v_notes || jsonb_build_object('zero_row_waits',
      pg_temp.r395_waits_on(v_other_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','COMMIT');
    v_phase := 'I:zero_row_result';
    v_other := pg_temp.r395_take_result('race_other');
    v_notes := v_notes || jsonb_build_object('zero_row_affected',v_other);
    v_notes := v_notes || jsonb_build_object('zero_row_unchanged',
      (pg_temp.r395_owner_state('race_other',pg_temp.r395_uuid(1))
        = v_zero_before)::text);
    PERFORM extensions.dblink_exec('race_other','ROLLBACK');

    v_phase := 'final_evidence';
    -- No accepted/stale financial action is ever committed by the race driver.
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM public.financial_action_groups
      WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('committed_action_roots',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM public.account_financial_effects
      WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
    $q$) AS t(result text);
    v_notes := v_notes || jsonb_build_object('committed_financial_effects',v_status);
    v_notes := v_notes || jsonb_build_object('run_completed','true');
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    v_notes := v_notes || jsonb_build_object('run_error',SQLSTATE);
    v_notes := v_notes || jsonb_build_object('run_error_phase',v_phase);
  END;
  -- Restore observations after a caught failure rolls back the driver block.
  FOR v_note IN SELECT key,value FROM jsonb_each_text(v_notes) LOOP
    PERFORM pg_temp.r395_note(v_note.key,v_note.value);
  END LOOP;
  PERFORM pg_temp.r395_cleanup(v_owned,v_mutex);
END;
$driver$;

-- All assertions are observable records from independent dblink backends.
-- Missing extension or remote query error causes explicit TAP failure.
SELECT diag(format('race395 %s=%s',name,value))
FROM race_395_observations
WHERE name IN ('run_error','run_error_phase') OR name LIKE 'cleanup_%'
ORDER BY name;
SELECT is((SELECT value FROM race_395_observations WHERE name='run_completed'),
  'true','race driver completed without query/deadlock/timeout errors');
SELECT is((SELECT value FROM race_395_observations WHERE name='fixture_account_count'),
  '4','fixture-only owner1/owner2/owner3 accounts visible to separate connections');
SELECT is((SELECT value FROM race_395_observations WHERE name='add_accept'),
  'accepted','new zero-effect Add accepted before competing writers');
SELECT is((SELECT value FROM race_395_observations WHERE name='add_replay'),
  'idempotent','replay inside same SQL transaction never reapplies action');
SELECT is((SELECT value FROM race_395_observations WHERE name='add_root_in_tx'),
  '1','accepted action has one root before transaction rollback');
SELECT is((SELECT value FROM race_395_observations WHERE name='same_owner_blocked'),
  'true','disjoint generic account row waits on same-owner Add lock');
SELECT is((SELECT value FROM race_395_observations WHERE name='different_owner_progress'),
  'true','different-owner metadata writer progresses during owner1 Add lock');
SELECT is((SELECT value FROM race_395_observations WHERE name='same_owner_after_release'),
  'Same Owner Passed','blocked same-owner writer resumes without deadlock');
SELECT is((SELECT value FROM race_395_observations WHERE name='different_owner_result'),
  'Other Owner Passed','different-owner writer completed correctly');
SELECT is((SELECT value FROM race_395_observations WHERE name='generic_first_add_waits'),
  'true','Add waits on earlier same-owner generic A->B default writer');
SELECT is((SELECT value FROM race_395_observations WHERE name='fresh_default_cas_result'),
  'stale','after waiting, Add uses fresh logical active/default snapshot');
SELECT is((SELECT value FROM race_395_observations WHERE name='stale_add_absent'),
  '0','stale CAS did not create the proposed account');
SELECT is((SELECT value FROM race_395_observations WHERE name='default_after_generic_commit'),
  '39a70000-0000-4000-8000-000000000102',
  'B remains canonical default after generic transaction wins');
SELECT is((SELECT value FROM race_395_observations WHERE name='review_accept'),
  'accepted','review tuple accepted with one guarded financial account');
SELECT is((SELECT value FROM race_395_observations WHERE name='upsert_waits_on_review'),
  'true','disjoint same-owner generic ON CONFLICT upsert waits on review owner lock');
SELECT is((SELECT value FROM race_395_observations WHERE name='upsert_after_review_release'),
  'Disjoint Upsert','upsert resumed without row-lock inversion or deadlock');
SELECT is((SELECT value FROM race_395_observations WHERE name='zero_row_waits'),
  'true','separate zero-row statement waits on the same owner scope');
SELECT is((SELECT value FROM race_395_observations WHERE name='zero_row_affected'),
  '0','zero-row generic update completes after release with zero affected rows');
SELECT is((SELECT value FROM race_395_observations WHERE name='zero_row_unchanged'),
  'true','zero-row phase preserves exact owned domain/default/revision/root/effect rows');
SELECT is((SELECT value FROM race_395_observations WHERE name='legacy_rpc_accept'),
  'accepted','old v1 transaction RPC remains supported');
SELECT is((SELECT value FROM race_395_observations WHERE name='legacy_early_owner_lock'),
  'true','early legacy financial RPC serializes disjoint same-owner generic row');
SELECT is((SELECT value FROM race_395_observations WHERE name='legacy_writer_after_release'),
  'Legacy Owner Gate','legacy writer resumes without deadlock');
SELECT is((SELECT value FROM race_395_observations WHERE name='seal_add_accept'),
  'accepted','Add acquires publication fence before seal');
SELECT is((SELECT value FROM race_395_observations WHERE name='seal_waits_on_writer'),
  'true','ordinary pull seal waits for complete uncommitted Add publication');
SELECT ok((SELECT value LIKE '1970-01-01%' FROM race_395_observations
  WHERE name='seal_after_release'),
  'seal returns accepted watermark after writer rollback, timezone independent');
SELECT is((SELECT value FROM race_395_observations WHERE name='cascade_add_accept'),
  'accepted','Add acquires global shared gate before privileged cascade');
SELECT is((SELECT value FROM race_395_observations WHERE name='global_cascade_excluded'),
  'true','different-owner privileged auth cascade waits on global exclusive gate');
SELECT is((SELECT value FROM race_395_observations WHERE name='cascade_after_release'),
  '39a70000-0000-4000-8000-000000000003',
  'privileged cascade resumed, then was explicitly rolled back');
SELECT is((SELECT value FROM race_395_observations
  WHERE name='cascade_rollback_preserved_owner'),'1',
  'uncommitted privileged cascade does not delete synthetic owner');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_cash_review_accept'),
  'accepted','new first-Cash review tuple accepted in independent transaction');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_cash_in_tx_default'),
  '1','empty owned account set makes review-created Cash default');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_cash_empty_owner_lock'),
  'true','first-review empty owner predicate blocks concurrent disjoint account insert');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_cash_insert_after_release'),
  'Independent First Add','new same-owner account insert unblocks after review rollback');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_bank_review_accept'),
  'accepted','first BANK review creates under same empty-owner snapshot guard');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_bank_default_child'),
  '1','first BANK review defaults and creates its one owned bank child');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_wallet_review_accept'),
  'accepted','first Wallet review creates under same empty-owner snapshot guard');
SELECT is((SELECT value FROM race_395_observations WHERE name='first_wallet_default_no_bank'),
  '1','first Wallet defaults without fabricated bank_details');

SELECT is((SELECT value FROM race_395_observations WHERE name='committed_action_roots'),
  '0','no race financial root commits to persistent fixture data');
SELECT is((SELECT value FROM race_395_observations WHERE name='committed_financial_effects'),
  '0','no race financial effects commit to persistent fixture data');
SELECT is((SELECT count(*) FROM race_395_observations WHERE name LIKE 'cleanup_error:%'),
  0::bigint,'every external session and committed fixture cleanup reported no error');
SELECT is((SELECT count(*) FROM auth.users
  WHERE id::text LIKE '39a70000-0000-4000-8000-%'),0::bigint,
  'all synthetic auth users were removed from the local fixture');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE id::text LIKE '39a70000-0000-4000-8000-%'),0::bigint,
  'all synthetic accounts were removed from the local fixture');
SELECT is((SELECT count(*) FROM public.categories
  WHERE id::text LIKE '39a70000-0000-4000-8000-%'),0::bigint,
  'synthetic category removed; no persistent test fixture left');
SELECT is((SELECT value FROM race_395_observations WHERE name='run_error'),
  null::text,'no unhandled SQL, timeout, permission or fixture collision error');
SELECT * FROM finish();
ROLLBACK;
