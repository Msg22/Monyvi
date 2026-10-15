-- #395 independent-session owner/global/seal serialization contract (T045/T066 follow-up).
-- Requires a LOCAL PostgreSQL with 088/089 applied AND extensions.dblink installed
-- by the root runner. This test does NOT install extensions or change migrations.
-- The new tuples are deliberately RED against SQL 001-087.
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
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM extensions.dblink_connect(
    p_name, 'dbname=' || current_database() || ' user=' || current_user
  );
  PERFORM extensions.dblink_exec(p_name, 'SET statement_timeout = ''8s''');
  PERFORM extensions.dblink_exec(p_name, 'SET lock_timeout = ''6s''');
  PERFORM extensions.dblink_exec(
    p_name, 'SET idle_in_transaction_session_timeout = ''20s'''
  );
END;
$$;

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

CREATE FUNCTION pg_temp.r395_safe_close(p_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_name = ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[]))
  THEN
    IF extensions.dblink_is_busy(p_name)=1 THEN
      PERFORM extensions.dblink_cancel_query(p_name);
    END IF;
    BEGIN
      PERFORM result FROM extensions.dblink_get_result(p_name) AS t(result text);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- A cancelled query has no trustworthy result; cleanup only.
    END;
    BEGIN
      PERFORM extensions.dblink_exec(p_name,'ROLLBACK');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Disconnect rolls back any remaining open transaction.
    END;
    PERFORM extensions.dblink_disconnect(p_name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.r395_note('cleanup_error:'||p_name,SQLSTATE||':'||SQLERRM);
END;
$$;

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
        WHERE id='39a70000-0000-4000-8000-000000000401'::uuid
          AND user_id='39a70000-0000-4000-8000-000000000001'::uuid
      $cleanup$);
      PERFORM extensions.dblink_exec('race_fixture', $cleanup$
        DELETE FROM public.accounts
        WHERE user_id IN (
          '39a70000-0000-4000-8000-000000000001'::uuid,
          '39a70000-0000-4000-8000-000000000002'::uuid,
          '39a70000-0000-4000-8000-000000000003'::uuid)
      $cleanup$);
      PERFORM extensions.dblink_exec('race_fixture', $cleanup$
        DELETE FROM auth.users
        WHERE id IN (
          '39a70000-0000-4000-8000-000000000001'::uuid,
          '39a70000-0000-4000-8000-000000000002'::uuid,
          '39a70000-0000-4000-8000-000000000003'::uuid)
      $cleanup$);
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_temp.r395_note('cleanup_error:fixture',SQLSTATE||':'||SQLERRM);
    END;
  END IF;
  PERFORM pg_temp.r395_safe_close('race_fixture');
  IF p_mutex THEN PERFORM pg_advisory_unlock(395,395); END IF;
END;
$$;

-- New 001-087 registration does NOT exist: only root-run local 088/089 can
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
BEGIN
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
    -- From here on any fixture inserts belong only to this invocation.
    v_owned := true;
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
         'sql395-race-cascade@monyvi.test','unused','{}','{}')
    $seed$);
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
        'race-review','Race Review','wallet',1)
    $seed$);
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM public.accounts
      WHERE id::text LIKE '39a70000-0000-4000-8000-%'
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('fixture_account_count',v_status);

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
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001001'::uuid,
        '39a70000-0000-4000-8000-000000000103'::uuid))
    ) AS t(result text);
    PERFORM pg_temp.r395_note('add_accept',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001001'::uuid,
        '39a70000-0000-4000-8000-000000000103'::uuid))
    ) AS t(result text);
    PERFORM pg_temp.r395_note('add_replay',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.financial_action_groups
      WHERE action_id='39a70000-0000-4000-8000-000000001001'::uuid
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('add_root_in_tx',v_status);
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
    PERFORM pg_temp.r395_note('same_owner_blocked',
      pg_temp.r395_waits_on(v_writer_pid,v_add_pid)::text);
    PERFORM pg_temp.r395_note('different_owner_progress',
      (extensions.dblink_is_busy('race_other')=0)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status
      FROM extensions.dblink_get_result('race_writer') AS t(result text);
    SELECT result INTO v_other
      FROM extensions.dblink_get_result('race_other') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_writer') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_other') AS t(result text);
    PERFORM pg_temp.r395_note('same_owner_after_release',v_status);
    PERFORM pg_temp.r395_note('different_owner_result',v_other);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');
    PERFORM extensions.dblink_exec('race_other','COMMIT');

    -- B: generic writer first, current-state CAS must re-read AFTER waiting;
    -- it cannot accept an A snapshot after generic A->B default change commits.
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
    PERFORM pg_temp.r395_note('generic_first_add_waits',
      pg_temp.r395_waits_on(v_add_pid,v_writer_pid)::text);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');
    SELECT result INTO v_status
      FROM extensions.dblink_get_result('race_add') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_add') AS t(result text);
    PERFORM pg_temp.r395_note('fresh_default_cas_result',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_add',$q$
      SELECT count(*)::text FROM public.accounts
      WHERE id='39a70000-0000-4000-8000-000000000104'::uuid
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('stale_add_absent',v_status);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT id::text FROM public.accounts WHERE is_default
      AND user_id='39a70000-0000-4000-8000-000000000001'::uuid
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('default_after_generic_commit',v_status);
    PERFORM extensions.dblink_exec('race_fixture',$q$
      UPDATE public.accounts SET is_default=false
      WHERE id='39a70000-0000-4000-8000-000000000102'::uuid
    $q$);
    PERFORM extensions.dblink_exec('race_fixture',$q$
      UPDATE public.accounts SET is_default=true
      WHERE id='39a70000-0000-4000-8000-000000000101'::uuid
    $q$);

    -- C: review action holds only account B row; unrelated A upsert should
    -- still wait on shared owner gate. Zero-row UPDATE is observed separately.
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    v_review_pid:=v_add_pid;
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_review(
        '39a70000-0000-4000-8000-000000001003'::uuid,
        '39a70000-0000-4000-8000-000000000303'::uuid))
    ) AS t(result text);
    PERFORM pg_temp.r395_note('review_accept',v_status);
    PERFORM pg_temp.r395_auth(
      'race_writer','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM pg_temp.r395_auth(
      'race_other','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM extensions.dblink_send_query('race_writer',$q$
      INSERT INTO public.accounts
        (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
      VALUES ('39a70000-0000-4000-8000-000000000101',
        '39a70000-0000-4000-8000-000000000001','Disjoint Upsert',
        'CASH',0,'EGP',0,false,false)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name
      RETURNING name
    $q$);
    PERFORM extensions.dblink_send_query('race_other',$q$
      WITH changed AS (
        UPDATE public.accounts SET name=name
        WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
          AND id='39a70000-0000-4000-8000-000000000999'::uuid
        RETURNING id
      ) SELECT count(*)::text FROM changed
    $q$);
    PERFORM pg_temp.r395_note('upsert_waits_on_review',
      pg_temp.r395_waits_on(v_writer_pid,v_review_pid)::text);
    PERFORM pg_temp.r395_note('zero_row_progress',
      (extensions.dblink_is_busy('race_other')=0)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status
      FROM extensions.dblink_get_result('race_writer') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_writer') AS t(result text);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');
    SELECT result INTO v_other
      FROM extensions.dblink_get_result('race_other') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_other') AS t(result text);
    PERFORM pg_temp.r395_note('upsert_after_review_release',v_status);
    PERFORM pg_temp.r395_note('zero_row_affected',v_other);
    PERFORM extensions.dblink_exec('race_other','ROLLBACK');

    -- D: legacy v1 RPC early entry must acquire owner gate before row A locks;
    -- metadata UPDATE B is disjoint, so a wait proves owner-wide serialization.
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_legacy(
        '39a70000-0000-4000-8000-000000001004'::uuid,
        '39a70000-0000-4000-8000-000000000304'::uuid))
    ) AS t(result text);
    PERFORM pg_temp.r395_note('legacy_rpc_accept',v_status);
    PERFORM pg_temp.r395_auth(
      'race_writer','39a70000-0000-4000-8000-000000000001'::uuid);
    PERFORM extensions.dblink_send_query('race_writer',$q$
      UPDATE public.accounts SET name='Legacy Owner Gate'
      WHERE id='39a70000-0000-4000-8000-000000000102'::uuid
      RETURNING name
    $q$);
    PERFORM pg_temp.r395_note('legacy_early_owner_lock',
      pg_temp.r395_waits_on(v_writer_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status
      FROM extensions.dblink_get_result('race_writer') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_writer') AS t(result text);
    PERFORM pg_temp.r395_note('legacy_writer_after_release',v_status);
    PERFORM extensions.dblink_exec('race_writer','COMMIT');

    -- E: pull-seal FOR UPDATE waits while zero-effect Add holds publication
    -- fence FOR SHARE. Seal transaction is rolled back after the observation.
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001005'::uuid,
        '39a70000-0000-4000-8000-000000000105'::uuid))
    ) AS t(result text);
    PERFORM pg_temp.r395_note('seal_add_accept',v_status);
    PERFORM pg_temp.r395_auth(
      'race_seal','39a70000-0000-4000-8000-000000000002'::uuid);
    PERFORM extensions.dblink_send_query('race_seal',$q$
      SELECT public.seal_sync_pull_v1(
        '1970-01-01T00:00:00.000Z'::timestamptz)::text
    $q$);
    PERFORM pg_temp.r395_note('seal_waits_on_writer',
      pg_temp.r395_waits_on(v_seal_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status
      FROM extensions.dblink_get_result('race_seal') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_seal') AS t(result text);
    PERFORM pg_temp.r395_note('seal_after_release',v_status);
    PERFORM extensions.dblink_exec('race_seal','ROLLBACK');

    -- F: privileged auth.user cascade for *different* owner3 should wait on
    -- global exclusive gate, rather than accidentally sharing A's account lock.
    PERFORM pg_temp.r395_auth(
      'race_add','39a70000-0000-4000-8000-000000000001'::uuid);
    SELECT result INTO v_status FROM extensions.dblink('race_add',
      pg_temp.r395_rpc_sql(pg_temp.r395_add(
        '39a70000-0000-4000-8000-000000001006'::uuid,
        '39a70000-0000-4000-8000-000000000106'::uuid))
    ) AS t(result text);
    PERFORM pg_temp.r395_note('cascade_add_accept',v_status);
    PERFORM extensions.dblink_exec('race_global','BEGIN');
    PERFORM extensions.dblink_send_query('race_global',$q$
      DELETE FROM auth.users
      WHERE id='39a70000-0000-4000-8000-000000000003'::uuid
      RETURNING id::text
    $q$);
    PERFORM pg_temp.r395_note('global_cascade_excluded',
      pg_temp.r395_waits_on(v_global_pid,v_add_pid)::text);
    PERFORM extensions.dblink_exec('race_add','ROLLBACK');
    SELECT result INTO v_status
      FROM extensions.dblink_get_result('race_global') AS t(result text);
    PERFORM result FROM extensions.dblink_get_result('race_global') AS t(result text);
    PERFORM pg_temp.r395_note('cascade_after_release',v_status);
    PERFORM extensions.dblink_exec('race_global','ROLLBACK');
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM auth.users
      WHERE id='39a70000-0000-4000-8000-000000000003'::uuid
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('cascade_rollback_preserved_owner',v_status);

    -- No accepted/stale financial action is ever committed by the race driver.
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM public.financial_action_groups
      WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('committed_action_roots',v_status);
    SELECT result INTO v_status FROM extensions.dblink('race_fixture',$q$
      SELECT count(*)::text FROM public.account_financial_effects
      WHERE user_id='39a70000-0000-4000-8000-000000000001'::uuid
    $q$) AS t(result text);
    PERFORM pg_temp.r395_note('committed_financial_effects',v_status);
    PERFORM pg_temp.r395_note('run_completed','true');
  EXCEPTION WHEN OTHERS THEN
    -- Preserve an explicit TAP failure rather than claiming Green on error.
    PERFORM pg_temp.r395_note('run_error',SQLSTATE||':'||SQLERRM);
  END;
  PERFORM pg_temp.r395_cleanup(v_owned,v_mutex);
END;
$driver$;

-- All assertions are observable records from independent dblink backends.
-- Missing extension or remote query error causes explicit TAP failure.
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
SELECT ok((SELECT value IN ('true','false') FROM race_395_observations
  WHERE name='zero_row_progress'),
  'zero-row statement scheduling observed; owner-lock wait is permitted');
SELECT is((SELECT value FROM race_395_observations WHERE name='zero_row_affected'),
  '0','zero-row generic update performed no mutation');
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
