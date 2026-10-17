-- #395 T052 C2+H4: children not bound to created owned account; Add bank number.
-- Independent actors per case (no stale frozen snapshots). H4 nonnull expects
-- acceptance + exact persistence (source currently rejects = H4 gap). Source FROZEN.
BEGIN;
SELECT plan(13);

CREATE FUNCTION pg_temp.d4_id(p_n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('6a420000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) VALUES
  (pg_temp.d4_id(1), 'authenticated', 'authenticated', 'sql395-d4-owner@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.d4_id(2), 'authenticated', 'authenticated', 'sql395-d4-foreign@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.d4_id(3), 'authenticated', 'authenticated', 'sql395-d4-a3@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.d4_id(4), 'authenticated', 'authenticated', 'sql395-d4-a4@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.d4_id(5), 'authenticated', 'authenticated', 'sql395-d4-a5@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.d4_id(6), 'authenticated', 'authenticated', 'sql395-d4-a6@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.d4_id(7), 'authenticated', 'authenticated', 'sql395-d4-a7@monyvi.test', 'unused', '{}', '{}');

INSERT INTO public.accounts (id, user_id, name, type, balance, currency, financial_revision, is_default, deleted) VALUES
  (pg_temp.d4_id(101), pg_temp.d4_id(1), 'Owner Bank', 'BANK', 100, 'EGP', 0, true, false),
  (pg_temp.d4_id(102), pg_temp.d4_id(1), 'Owner Cash', 'CASH', 50, 'EGP', 0, false, false),
  (pg_temp.d4_id(104), pg_temp.d4_id(2), 'Foreign unrelated Cash', 'CASH', 9, 'EGP', 0, false, false);

INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level) VALUES
  (pg_temp.d4_id(10), pg_temp.d4_id(1), 'd4-owner1-category', 'D4 Owner1 Category', 'wallet', 1),
  (pg_temp.d4_id(17), pg_temp.d4_id(7), 'd4-owner7-category', 'D4 Owner7 Category', 'wallet', 1);

CREATE FUNCTION pg_temp.d4_account(p_id uuid, p_name text, p_type text DEFAULT 'BANK', p_currency text DEFAULT 'EGP', p_default boolean DEFAULT false) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','account','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object('id',p_id,'name',p_name,'type',p_type,'currency',p_currency,
      'institutionId',null,'providerDisplayName',null,'isDefault',p_default,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false,
      'openingBalanceMinorUnits','0','targetBalanceMinorUnits',null))
$$;
CREATE FUNCTION pg_temp.d4_bank(p_id uuid, p_account uuid, p_number text DEFAULT null) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','bank_details','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object('id',p_id,'accountId',p_account,'accountNumber',p_number,
      'cardLast4','0007','createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;
CREATE FUNCTION pg_temp.d4_tx(p_id uuid, p_account uuid, p_amount text, p_kind text, p_source text, p_fp text, p_category uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','transaction','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object('id',p_id,'accountId',p_account,'amountMinorUnits',p_amount,
      'currency','EGP','type',p_kind,'categoryId',p_category,'counterparty',null,'note',null,
      'date','2026-09-01','source',p_source,'smsFingerprint',p_fp,'isDraft',false,
      'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;
CREATE FUNCTION pg_temp.d4_guard(p_id uuid, p_rev text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'expectedRevision',p_rev)
$$;
CREATE FUNCTION pg_temp.d4_effect(p_id uuid, p_minor text, p_fx uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'amountMinorUnits',p_minor,'currency','EGP','effectId',p_fx)
$$;
CREATE FUNCTION pg_temp.d4_source(p_row uuid, p_rec uuid, p_fp text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('rowId',p_row,'recordId',p_rec,'sourceFingerprint',p_fp)
$$;
CREATE FUNCTION pg_temp.d4_group(p_acc uuid, p_grp uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_acc,'groupId',p_grp,'revision','1')
$$;
CREATE FUNCTION pg_temp.d4_snap(p_active jsonb, p_default uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('activeAccountIds',p_active,
    'defaultAccount',CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId',p_default,'isDefault',true) END)
$$;
CREATE FUNCTION pg_temp.d4_digest(p_action uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(extensions.digest(convert_to('sql395-d4-frozen:'||p_action::text,'UTF8'),'sha256'),'hex')
$$;

CREATE FUNCTION pg_temp.d4_add_env(p_action uuid, p_owner uuid, p_records jsonb, p_intent boolean, p_snap jsonb, p_guards jsonb, p_effects jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1','userId',p_owner,'actionId',p_action,
    'domain','accounts','kind','create_with_default',
    'domainReferenceId',(SELECT (r.value->'after'->>'id')::uuid FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'entity'='account' AND r.value->>'mode'='create' LIMIT 1),
    'occurredAt','2026-09-01T12:00:00.000Z','payloadVersion','account.create-default/v1',
    'accountGuards',p_guards,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1','operationCode','account.create-default',
      'defaultIntent',p_intent,'expectedDefaultSnapshot',p_snap,
      'createGuards',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity',r.value->>'entity','id',r.value->'after'->>'id','expectedAbsent',true) ORDER BY ((r.value->>'entity')||':'||(r.value->'after'->>'id')) COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'mode'='create'),'[]'::jsonb),
      'accountEffects',p_effects,
      'domainRecordRefs',COALESCE((SELECT jsonb_agg(r.value->'after'->>'id' ORDER BY (r.value->'after'->>'id') COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value)),'[]'::jsonb),
      'domainMutation',jsonb_build_object('records',p_records)))
$$;

CREATE FUNCTION pg_temp.d4_review_env(p_action uuid, p_owner uuid, p_records jsonb, p_guards jsonb, p_effects jsonb, p_selected jsonb, p_groups jsonb, p_snap jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1','userId',p_owner,'actionId',p_action,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',(SELECT (r.value->'after'->>'id')::uuid FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'entity' IN ('transaction','transfer') ORDER BY (r.value->'after'->>'id') COLLATE "C" LIMIT 1),
    'occurredAt','2026-09-01T12:00:00.000Z','payloadVersion','review.batch-save/v1',
    'accountGuards',p_guards,
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1','operationCode','review.batch-save',
      'source','VOICE','sessionId',pg_temp.d4_id(900),
      'frozenIntentDigest',pg_temp.d4_digest(p_action),
      'selectedSourceRefs',p_selected,'confirmedGroupRefs',p_groups,
      'createGuards',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity',r.value->>'entity','id',r.value->'after'->>'id','expectedAbsent',true) ORDER BY ((r.value->>'entity')||':'||(r.value->'after'->>'id')) COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'mode'='create'),'[]'::jsonb),
      'accountEffects',p_effects,
      'domainRecordRefs',COALESCE((SELECT jsonb_agg(r.value->'after'->>'id' ORDER BY (r.value->'after'->>'id') COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value)),'[]'::jsonb),
      'domainMutation',jsonb_build_object('records',p_records),
      'localSmsBookkeeping','[]'::jsonb)
    || CASE WHEN p_snap IS NOT NULL THEN jsonb_build_object('creationDefaultSnapshot',p_snap) ELSE '{}'::jsonb END)
$$;

CREATE FUNCTION pg_temp.d4_use_owner(p_n integer) RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.d4_id(p_n)::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.d4_id(p_n), 'role','authenticated')::text, true);
END;
$$;

-- Only SQLSTATE 22023 is an expected invalid-input rejection.
-- FK, privilege, SQL and other failures propagate instead of passing tests.
CREATE FUNCTION pg_temp.d4_try_apply(p_payload_json text, p_payload_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN public.apply_account_financial_action_v1(p_payload_json, p_payload_hash);
EXCEPTION WHEN SQLSTATE '22023' THEN
  RETURN jsonb_build_object('status','rejected','sqlstate',SQLSTATE);
END;
$$;

CREATE TEMP TABLE d4_inputs (case_name text PRIMARY KEY, owner_n integer, envelope jsonb, payload_json text, payload_hash text);
CREATE TEMP TABLE d4_outcomes (case_name text PRIMARY KEY, outcome jsonb);

-- Positive Add BANK with own child (owner3, empty actor).
INSERT INTO d4_inputs(case_name, owner_n, envelope) VALUES
  ('add_bank_own_child', 3, pg_temp.d4_add_env(pg_temp.d4_id(2001), pg_temp.d4_id(3),
    jsonb_build_array(
      pg_temp.d4_account(pg_temp.d4_id(300), 'Add Bank', 'BANK', 'EGP', true),
      pg_temp.d4_bank(pg_temp.d4_id(301), pg_temp.d4_id(300))),
    false, pg_temp.d4_snap('[]'::jsonb, null), '[]'::jsonb, '[]'::jsonb)),
-- C2a: exactly ONE BANK child targets foreign unrelated CASH 104.
-- Count one is valid: this negative isolates the parent binding alone.
  ('add_child_foreign_parent', 6, pg_temp.d4_add_env(pg_temp.d4_id(2002), pg_temp.d4_id(6),
    jsonb_build_array(
      pg_temp.d4_account(pg_temp.d4_id(302), 'Add Bank Foreign', 'BANK', 'EGP', true),
      pg_temp.d4_bank(pg_temp.d4_id(304), pg_temp.d4_id(104))),
    false, pg_temp.d4_snap('[]'::jsonb, null), '[]'::jsonb, '[]'::jsonb)),
-- Positive Review BANK with own child (owner7, empty actor).
  ('review_bank_own_child', 7, pg_temp.d4_review_env(pg_temp.d4_id(2003), pg_temp.d4_id(7),
    jsonb_build_array(
      pg_temp.d4_account(pg_temp.d4_id(310), 'Review Bank', 'BANK', 'EGP', true),
      pg_temp.d4_bank(pg_temp.d4_id(311), pg_temp.d4_id(310)),
      pg_temp.d4_tx(pg_temp.d4_id(312), pg_temp.d4_id(310), '1000', 'INCOME', 'VOICE', null, pg_temp.d4_id(17))),
    jsonb_build_array(pg_temp.d4_guard(pg_temp.d4_id(310), '0')),
    jsonb_build_array(pg_temp.d4_effect(pg_temp.d4_id(310), '1000', pg_temp.d4_id(410))),
    jsonb_build_array(pg_temp.d4_source(pg_temp.d4_id(610), pg_temp.d4_id(312), null)),
    jsonb_build_array(pg_temp.d4_group(pg_temp.d4_id(310), pg_temp.d4_id(710))),
    pg_temp.d4_snap('[]'::jsonb, null))),
-- C2b: Review with valid child + orphan child (same-owner unrelated CASH 102), owner1.
  ('review_child_unrelated_parent', 1, pg_temp.d4_review_env(pg_temp.d4_id(2004), pg_temp.d4_id(1),
    jsonb_build_array(
      pg_temp.d4_account(pg_temp.d4_id(320), 'Review Bank Unrel', 'BANK', 'EGP', false),
      pg_temp.d4_bank(pg_temp.d4_id(321), pg_temp.d4_id(320)),
      pg_temp.d4_bank(pg_temp.d4_id(322), pg_temp.d4_id(102)),
      pg_temp.d4_tx(pg_temp.d4_id(323), pg_temp.d4_id(320), '1000', 'INCOME', 'VOICE', null, pg_temp.d4_id(10))),
    jsonb_build_array(pg_temp.d4_guard(pg_temp.d4_id(320), '0')),
    jsonb_build_array(pg_temp.d4_effect(pg_temp.d4_id(320), '1000', pg_temp.d4_id(411))),
    jsonb_build_array(pg_temp.d4_source(pg_temp.d4_id(611), pg_temp.d4_id(323), null)),
    jsonb_build_array(pg_temp.d4_group(pg_temp.d4_id(320), pg_temp.d4_id(711))),
    pg_temp.d4_snap(jsonb_build_array(pg_temp.d4_id(101), pg_temp.d4_id(102)), pg_temp.d4_id(101)))),
-- H4a: Add BANK with NONNULL accountNumber (owner4, empty actor). Expect accept+persist.
  ('add_bank_nonnull_number', 4, pg_temp.d4_add_env(pg_temp.d4_id(2005), pg_temp.d4_id(4),
    jsonb_build_array(
      pg_temp.d4_account(pg_temp.d4_id(330), 'Add Bank Number', 'BANK', 'EGP', true),
      pg_temp.d4_bank(pg_temp.d4_id(331), pg_temp.d4_id(330), '1234567890')),
    false, pg_temp.d4_snap('[]'::jsonb, null), '[]'::jsonb, '[]'::jsonb)),
-- H4b: Add BANK with NULL accountNumber (owner5, empty actor). Expect accept.
  ('add_bank_null_number', 5, pg_temp.d4_add_env(pg_temp.d4_id(2006), pg_temp.d4_id(5),
    jsonb_build_array(
      pg_temp.d4_account(pg_temp.d4_id(340), 'Add Bank Null', 'BANK', 'EGP', true),
      pg_temp.d4_bank(pg_temp.d4_id(341), pg_temp.d4_id(340))),
    false, pg_temp.d4_snap('[]'::jsonb, null), '[]'::jsonb, '[]'::jsonb));

UPDATE d4_inputs SET payload_json = private.financial_action_encode_jsonb_v1(envelope);
UPDATE d4_inputs SET payload_hash = encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex');
GRANT SELECT ON d4_inputs TO authenticated;
GRANT SELECT, INSERT ON d4_outcomes TO authenticated;

SELECT pg_temp.d4_use_owner(3);
INSERT INTO d4_outcomes SELECT case_name, pg_temp.d4_try_apply(payload_json, payload_hash) FROM d4_inputs WHERE owner_n = 3;
SELECT pg_temp.d4_use_owner(6);
INSERT INTO d4_outcomes SELECT case_name, pg_temp.d4_try_apply(payload_json, payload_hash) FROM d4_inputs WHERE owner_n = 6;
SELECT pg_temp.d4_use_owner(7);
INSERT INTO d4_outcomes SELECT case_name, pg_temp.d4_try_apply(payload_json, payload_hash) FROM d4_inputs WHERE owner_n = 7;
SELECT pg_temp.d4_use_owner(1);
INSERT INTO d4_outcomes SELECT case_name, pg_temp.d4_try_apply(payload_json, payload_hash) FROM d4_inputs WHERE owner_n = 1;
SELECT pg_temp.d4_use_owner(4);
INSERT INTO d4_outcomes SELECT case_name, pg_temp.d4_try_apply(payload_json, payload_hash) FROM d4_inputs WHERE owner_n = 4;
SELECT pg_temp.d4_use_owner(5);
INSERT INTO d4_outcomes SELECT case_name, pg_temp.d4_try_apply(payload_json, payload_hash) FROM d4_inputs WHERE owner_n = 5;

SELECT is((SELECT outcome->>'status' FROM d4_outcomes WHERE case_name='add_bank_own_child'), 'accepted', 'positive Add BANK with own child accepts');
SELECT is((SELECT outcome->>'status' FROM d4_outcomes WHERE case_name='review_bank_own_child'), 'accepted', 'positive Review BANK with own child accepts');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d4_id(301) AND account_id=pg_temp.d4_id(300)), 1::bigint, 'positive Add child bound to created account');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d4_id(311) AND account_id=pg_temp.d4_id(310)), 1::bigint, 'positive Review child bound to created account');
SELECT ok((SELECT outcome->>'status' = 'rejected'
  AND ((outcome->>'code' = 'INCOMPLETE_GROUP' AND outcome->>'actionId' IS NULL)
    OR outcome->>'sqlstate' = '22023')
  FROM d4_outcomes WHERE case_name='add_child_foreign_parent'),
  'C2a: single foreign-parent child rejected as invalid payload');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d4_id(304) AND account_id=pg_temp.d4_id(104)), 0::bigint, 'C2a: no orphan attached to foreign parent');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d4_id(302)), 0::bigint, 'C2a: rejected Add creates no account');
SELECT is((SELECT count(*) FROM public.financial_action_groups WHERE action_id=pg_temp.d4_id(2002)), 0::bigint, 'C2a: rejected Add creates no root');
SELECT ok((SELECT outcome->>'status' = 'rejected'
  AND ((outcome->>'code' = 'INCOMPLETE_GROUP' AND outcome->>'actionId' IS NULL)
    OR outcome->>'sqlstate' = '22023')
  FROM d4_outcomes WHERE case_name='review_child_unrelated_parent'),
  'C2b: extra same-owner Cash-parent child rejected as invalid payload');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d4_id(322) AND account_id=pg_temp.d4_id(102)), 0::bigint, 'C2b: no orphan attached to unrelated parent');
SELECT ok((SELECT outcome->>'status' FROM d4_outcomes WHERE case_name='add_bank_nonnull_number') = 'accepted'
  AND (SELECT account_number FROM public.bank_details WHERE id=pg_temp.d4_id(331)) = '1234567890',
  'H4a: nonnull accountNumber accepts and persists exact number');
SELECT is((SELECT outcome->>'status' FROM d4_outcomes WHERE case_name='add_bank_null_number'), 'accepted', 'H4b: null accountNumber accepts');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d4_id(341) AND account_number IS NULL), 1::bigint, 'H4b: null accountNumber persisted');
SELECT * FROM finish();
ROLLBACK;
