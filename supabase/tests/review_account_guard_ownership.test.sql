-- #395 T052 C1: Review guard/effect set can omit actual financial endpoints.
-- Independent cases on distinct owned accounts with correct expectedRevision.
-- try_apply catches ONLY invalid-envelope SQLSTATE 22023; FK/privilege/SQL errors propagate.
-- Source FROZEN (090 readonly). BEGIN/ROLLBACK; deterministic sql395-c1-*@monyvi.test.
BEGIN;
SELECT plan(15);

CREATE FUNCTION pg_temp.c1_id(p_n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('5f310000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) VALUES
  (pg_temp.c1_id(1), 'authenticated', 'authenticated', 'sql395-c1-owner@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.c1_id(2), 'authenticated', 'authenticated', 'sql395-c1-foreign@monyvi.test', 'unused', '{}', '{}');

INSERT INTO public.accounts (id, user_id, name, type, balance, currency, financial_revision, is_default, deleted) VALUES
  (pg_temp.c1_id(101), pg_temp.c1_id(1), 'Owner Bank', 'BANK', 100, 'EGP', 0, true, false),
  (pg_temp.c1_id(102), pg_temp.c1_id(1), 'Owner Cash', 'CASH', 50, 'EGP', 0, false, false),
  (pg_temp.c1_id(104), pg_temp.c1_id(2), 'Foreign Bank', 'BANK', 9, 'EGP', 0, false, false),
  (pg_temp.c1_id(105), pg_temp.c1_id(1), 'Transfer Src', 'BANK', 200, 'EGP', 0, false, false),
  (pg_temp.c1_id(106), pg_temp.c1_id(1), 'Transfer Dst', 'CASH', 30, 'EGP', 0, false, false),
  (pg_temp.c1_id(107), pg_temp.c1_id(1), 'Zero Net', 'CASH', 40, 'EGP', 0, false, false);

INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level) VALUES
  (pg_temp.c1_id(10), pg_temp.c1_id(1), 'c1-fixture', 'C1 Fixture', 'wallet', 1);

CREATE FUNCTION pg_temp.c1_tx(p_id uuid, p_account uuid, p_amount text, p_kind text, p_source text, p_fp text, p_cat uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','transaction','mode','create','expectedUpdatedAt',null,
    'after', jsonb_build_object('id',p_id,'accountId',p_account,'amountMinorUnits',p_amount,
      'currency','EGP','type',p_kind,'categoryId',p_cat,'counterparty',null,'note',null,
      'date','2026-09-01','source',p_source,'smsFingerprint',p_fp,'isDraft',false,
      'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;
CREATE FUNCTION pg_temp.c1_transfer(p_id uuid, p_from uuid, p_to uuid, p_fp text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','transfer','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object('id',p_id,'fromAccountId',p_from,'toAccountId',p_to,
      'amountMinorUnits','2505','convertedAmountMinorUnits','2505','exchangeRate','1',
      'currency','EGP','date','2026-09-01','notes',null,'smsFingerprint',p_fp,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;
CREATE FUNCTION pg_temp.c1_guard(p_id uuid, p_rev text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'expectedRevision',p_rev)
$$;
CREATE FUNCTION pg_temp.c1_effect(p_id uuid, p_minor text, p_fx uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'amountMinorUnits',p_minor,'currency','EGP','effectId',p_fx)
$$;
CREATE FUNCTION pg_temp.c1_source(p_row uuid, p_rec uuid, p_fp text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('rowId',p_row,'recordId',p_rec,'sourceFingerprint',p_fp)
$$;
CREATE FUNCTION pg_temp.c1_digest(p_action uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(extensions.digest(convert_to('sql395-c1-frozen:'||p_action::text,'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION pg_temp.c1_envelope(p_action uuid, p_owner uuid, p_records jsonb, p_guards jsonb, p_effects jsonb, p_selected jsonb, p_groups jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1','userId',p_owner,'actionId',p_action,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',(SELECT (r.value->'after'->>'id')::uuid FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'entity' IN ('transaction','transfer') ORDER BY (r.value->'after'->>'id') COLLATE "C" LIMIT 1),
    'occurredAt','2026-09-01T12:00:00.000Z','payloadVersion','review.batch-save/v1',
    'accountGuards',p_guards,
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1','operationCode','review.batch-save',
      'source','VOICE','sessionId',pg_temp.c1_id(900),
      'frozenIntentDigest',pg_temp.c1_digest(p_action),
      'selectedSourceRefs',p_selected,'confirmedGroupRefs',p_groups,
      'createGuards',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity',r.value->>'entity','id',r.value->'after'->>'id','expectedAbsent',true) ORDER BY ((r.value->>'entity')||':'||(r.value->'after'->>'id')) COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'mode'='create'),'[]'::jsonb),
      'accountEffects',p_effects,
      'domainRecordRefs',COALESCE((SELECT jsonb_agg(r.value->'after'->>'id' ORDER BY (r.value->'after'->>'id') COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value)),'[]'::jsonb),
      'domainMutation',jsonb_build_object('records',p_records),
      'localSmsBookkeeping','[]'::jsonb))
$$;
CREATE FUNCTION pg_temp.c1_use_owner(p_n integer) RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.c1_id(p_n)::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.c1_id(p_n), 'role','authenticated')::text, true);
END;
$$;
CREATE FUNCTION pg_temp.c1_try_apply(p_payload_json text, p_payload_hash text) RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN public.apply_account_financial_action_v1(p_payload_json, p_payload_hash);
EXCEPTION WHEN SQLSTATE '22023' THEN
  RETURN jsonb_build_object('status', 'rejected', 'code', 'financial_action_invalid_envelope', 'sqlstate', SQLSTATE);
END;
$$;

CREATE TEMP TABLE c1_inputs (case_name text PRIMARY KEY, owner_n integer, envelope jsonb, payload_json text, payload_hash text);
CREATE TEMP TABLE c1_outcomes (case_name text PRIMARY KEY, outcome jsonb);

INSERT INTO c1_inputs(case_name, owner_n, envelope) VALUES
  ('positive_valid', 1, pg_temp.c1_envelope(pg_temp.c1_id(2001), pg_temp.c1_id(1),
    jsonb_build_array(pg_temp.c1_tx(pg_temp.c1_id(310), pg_temp.c1_id(101), '100', 'EXPENSE', 'VOICE', null, pg_temp.c1_id(10))),
    jsonb_build_array(pg_temp.c1_guard(pg_temp.c1_id(101), '0')),
    jsonb_build_array(pg_temp.c1_effect(pg_temp.c1_id(101), '-100', pg_temp.c1_id(410))),
    jsonb_build_array(pg_temp.c1_source(pg_temp.c1_id(610), pg_temp.c1_id(310), null)),
    '[]'::jsonb)),
  ('omit_owned_guard_effect', 1, pg_temp.c1_envelope(pg_temp.c1_id(2002), pg_temp.c1_id(1),
    jsonb_build_array(pg_temp.c1_tx(pg_temp.c1_id(311), pg_temp.c1_id(102), '100', 'EXPENSE', 'VOICE', null, pg_temp.c1_id(10))),
    '[]'::jsonb, '[]'::jsonb,
    jsonb_build_array(pg_temp.c1_source(pg_temp.c1_id(611), pg_temp.c1_id(311), null)),
    '[]'::jsonb)),
  ('omit_foreign_guard_effect', 1, pg_temp.c1_envelope(pg_temp.c1_id(2003), pg_temp.c1_id(1),
    jsonb_build_array(pg_temp.c1_tx(pg_temp.c1_id(312), pg_temp.c1_id(104), '100', 'EXPENSE', 'VOICE', null, pg_temp.c1_id(10))),
    '[]'::jsonb, '[]'::jsonb,
    jsonb_build_array(pg_temp.c1_source(pg_temp.c1_id(612), pg_temp.c1_id(312), null)),
    '[]'::jsonb)),
  ('transfer_missing_endpoint', 1, pg_temp.c1_envelope(pg_temp.c1_id(2004), pg_temp.c1_id(1),
    jsonb_build_array(pg_temp.c1_transfer(pg_temp.c1_id(313), pg_temp.c1_id(105), pg_temp.c1_id(106), null)),
    jsonb_build_array(pg_temp.c1_guard(pg_temp.c1_id(105), '0')),
    jsonb_build_array(pg_temp.c1_effect(pg_temp.c1_id(105), '-2505', pg_temp.c1_id(411))),
    jsonb_build_array(pg_temp.c1_source(pg_temp.c1_id(613), pg_temp.c1_id(313), null)),
    '[]'::jsonb)),
  ('zero_net_missing_guard', 1, pg_temp.c1_envelope(pg_temp.c1_id(2005), pg_temp.c1_id(1),
    jsonb_build_array(
      pg_temp.c1_tx(pg_temp.c1_id(314), pg_temp.c1_id(107), '100', 'INCOME', 'VOICE', null, pg_temp.c1_id(10)),
      pg_temp.c1_tx(pg_temp.c1_id(315), pg_temp.c1_id(107), '100', 'EXPENSE', 'VOICE', null, pg_temp.c1_id(10))),
    '[]'::jsonb, '[]'::jsonb,
    jsonb_build_array(
      pg_temp.c1_source(pg_temp.c1_id(614), pg_temp.c1_id(314), null),
      pg_temp.c1_source(pg_temp.c1_id(615), pg_temp.c1_id(315), null)),
    '[]'::jsonb));

UPDATE c1_inputs SET payload_json = private.financial_action_encode_jsonb_v1(envelope);
UPDATE c1_inputs SET payload_hash = encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex');
GRANT SELECT ON c1_inputs TO authenticated;
GRANT SELECT, INSERT ON c1_outcomes TO authenticated;

SELECT pg_temp.c1_use_owner(1);
INSERT INTO c1_outcomes SELECT case_name, pg_temp.c1_try_apply(payload_json, payload_hash) FROM c1_inputs;

SELECT is((SELECT outcome->>'status' FROM c1_outcomes WHERE case_name='positive_valid'), 'accepted', 'valid review with guard+effect accepts');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.c1_id(101)), 99::numeric, 'positive 100.00 EGP minus 1.00 EGP equals 99.00');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected') OR outcome->>'sqlstate' = '22023' FROM c1_outcomes WHERE case_name='omit_owned_guard_effect'), 'C1a: owned omitted guard/effect must reject');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN (pg_temp.c1_id(311))), 0::bigint, 'C1a: omitted owned guard inserts no transaction');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.c1_id(102)), 50::numeric, 'C1a: omitted owned guard leaves balance unchanged');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.c1_id(102)), 0::bigint, 'C1a: omitted owned guard leaves revision unchanged');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected') OR outcome->>'sqlstate' = '22023' FROM c1_outcomes WHERE case_name='omit_foreign_guard_effect'), 'C1b: foreign omitted guard/effect must reject');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN (pg_temp.c1_id(312))), 0::bigint, 'C1b: no foreign-owned transaction link');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.c1_id(104)), 9::numeric, 'C1b: foreign account balance unchanged');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected') OR outcome->>'sqlstate' = '22023' FROM c1_outcomes WHERE case_name='transfer_missing_endpoint'), 'C1c: transfer missing endpoint guard must reject');
SELECT is((SELECT count(*) FROM public.transfers WHERE id IN (pg_temp.c1_id(313))), 0::bigint, 'C1c: no transfer inserted');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.c1_id(105)), 200::numeric, 'C1c: source balance unchanged');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected') OR outcome->>'sqlstate' = '22023' FROM c1_outcomes WHERE case_name='zero_net_missing_guard'), 'C1d: zero-net missing guard must reject');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN (pg_temp.c1_id(314), pg_temp.c1_id(315))), 0::bigint, 'C1d: no zero-net transactions inserted');
SELECT is((SELECT count(*) FROM public.financial_action_groups WHERE action_id IN (pg_temp.c1_id(2002), pg_temp.c1_id(2003), pg_temp.c1_id(2004), pg_temp.c1_id(2005))), 0::bigint, 'C1: no rejected case creates an action root');
SELECT * FROM finish();
ROLLBACK;
