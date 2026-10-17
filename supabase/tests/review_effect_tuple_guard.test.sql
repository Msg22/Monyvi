-- #395 T052 M1+M2+H2+FX: deferred zero-effect tuple, closed wrapper keys,
-- source/fingerprint parity, unsupported FX rejection. Isolated accounts per
-- case. Source FROZEN. Authenticated public RPC + direct private validator.
BEGIN;
SELECT plan(15);

CREATE FUNCTION pg_temp.e4_id(p_n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('8c640000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) VALUES
  (pg_temp.e4_id(1), 'authenticated', 'authenticated', 'sql395-e4-owner@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.e4_id(2), 'authenticated', 'authenticated', 'sql395-e4-foreign@monyvi.test', 'unused', '{}', '{}');

INSERT INTO public.accounts (id, user_id, name, type, balance, currency, financial_revision, is_default, deleted) VALUES
  (pg_temp.e4_id(101), pg_temp.e4_id(1), 'Owner EGP', 'BANK', 100, 'EGP', 0, true, false),
  (pg_temp.e4_id(102), pg_temp.e4_id(1), 'Owner Cash', 'CASH', 50, 'EGP', 0, false, false),
  (pg_temp.e4_id(103), pg_temp.e4_id(1), 'ATM Source Bank', 'BANK', 200, 'EGP', 0, false, false),
  (pg_temp.e4_id(105), pg_temp.e4_id(1), 'FX Dst', 'CASH', 30, 'EGP', 0, false, false),
  (pg_temp.e4_id(106), pg_temp.e4_id(1), 'FX USD', 'CASH', 40, 'USD', 0, false, false),
  (pg_temp.e4_id(104), pg_temp.e4_id(2), 'Foreign USD', 'CASH', 9, 'USD', 0, false, false),
  (pg_temp.e4_id(107), pg_temp.e4_id(1), 'Independent Zero Net', 'CASH', 40, 'EGP', 0, false, false),
  (pg_temp.e4_id(108), pg_temp.e4_id(1), 'SMS Source-Mismatch Control', 'CASH', 50, 'EGP', 0, false, false),
  (pg_temp.e4_id(109), pg_temp.e4_id(1), 'SMS Fingerprint-Mismatch Control', 'CASH', 50, 'EGP', 0, false, false);

INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level) VALUES
  (pg_temp.e4_id(10), pg_temp.e4_id(1), 'e4-fixture', 'E4 Fixture', 'wallet', 1);

CREATE FUNCTION pg_temp.e4_tx(p_id uuid, p_account uuid, p_amount text, p_kind text, p_source text, p_fp text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','transaction','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object('id',p_id,'accountId',p_account,'amountMinorUnits',p_amount,
      'currency','EGP','type',p_kind,'categoryId',pg_temp.e4_id(10),'counterparty',null,'note',null,
      'date','2026-09-01','source',p_source,'smsFingerprint',p_fp,'isDraft',false,
      'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;
CREATE FUNCTION pg_temp.e4_transfer(p_id uuid, p_from uuid, p_to uuid, p_amt text, p_conv text, p_cur text, p_rate text, p_fp text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','transfer','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object('id',p_id,'fromAccountId',p_from,'toAccountId',p_to,
      'amountMinorUnits',p_amt,'convertedAmountMinorUnits',p_conv,'exchangeRate',p_rate,
      'currency',p_cur,'date','2026-09-01','notes',null,'smsFingerprint',p_fp,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false))
$$;
CREATE FUNCTION pg_temp.e4_guard(p_id uuid, p_rev text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'expectedRevision',p_rev)
$$;
CREATE FUNCTION pg_temp.e4_effect(p_id uuid, p_minor text, p_cur text, p_fx uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'amountMinorUnits',p_minor,'currency',p_cur,'effectId',p_fx)
$$;
CREATE FUNCTION pg_temp.e4_source(p_row uuid, p_rec uuid, p_fp text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('rowId',p_row,'recordId',p_rec,'sourceFingerprint',p_fp)
$$;
CREATE FUNCTION pg_temp.e4_group(p_acc uuid, p_grp uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_acc,'groupId',p_grp,'revision','1')
$$;
CREATE FUNCTION pg_temp.e4_digest(p_action uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(extensions.digest(convert_to('sql395-e4-frozen:'||p_action::text,'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION pg_temp.e4_snap(p_active jsonb, p_default uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('activeAccountIds',p_active,
    'defaultAccount',CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId',p_default,'isDefault',true) END)
$$;

CREATE FUNCTION pg_temp.e4_review_env(p_action uuid, p_source text, p_records jsonb, p_guards jsonb, p_effects jsonb, p_selected jsonb, p_groups jsonb, p_book jsonb DEFAULT '[]'::jsonb, p_snap jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1','userId',pg_temp.e4_id(1),'actionId',p_action,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',(SELECT (r.value->'after'->>'id')::uuid FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'entity' IN ('transaction','transfer') ORDER BY (r.value->'after'->>'id') COLLATE "C" LIMIT 1),
    'occurredAt','2026-09-01T12:00:00.000Z','payloadVersion','review.batch-save/v1',
    'accountGuards',p_guards,
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1','operationCode','review.batch-save',
      'source',p_source,'sessionId',pg_temp.e4_id(900),
      'frozenIntentDigest',pg_temp.e4_digest(p_action),
      'selectedSourceRefs',p_selected,'confirmedGroupRefs',p_groups,
      'createGuards',COALESCE((SELECT jsonb_agg(jsonb_build_object('entity',r.value->>'entity','id',r.value->'after'->>'id','expectedAbsent',true) ORDER BY ((r.value->>'entity')||':'||(r.value->'after'->>'id')) COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value) WHERE r.value->>'mode'='create'),'[]'::jsonb),
      'accountEffects',p_effects,
      'domainRecordRefs',COALESCE((SELECT jsonb_agg(r.value->'after'->>'id' ORDER BY (r.value->'after'->>'id') COLLATE "C") FROM jsonb_array_elements(p_records) AS r(value)),'[]'::jsonb),
      'domainMutation',jsonb_build_object('records',p_records),
      'localSmsBookkeeping',p_book)
    || CASE WHEN p_snap IS NOT NULL THEN jsonb_build_object('creationDefaultSnapshot',p_snap) ELSE '{}'::jsonb END)
$$;

-- SMS transfer control: frozen T046 requires an SMS fingerprint paired to
-- its selected source row, a bank source/Cash destination and durable selected
-- draft bookkeeping. Server validates the closed bookkeeping metadata.
CREATE FUNCTION pg_temp.e4_sms_book(p_draft uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'draftId',p_draft,'queueId',pg_temp.e4_id(900),
    'snapshotHash',repeat('c',64),
    'expectedReviewRevision','0','operation','delete_saved')
$$;

-- Closed Add wrapper control: independent pure validator, zero opening Cash.
-- No DB root insertion/trigger disablement or fabricated accepted action.
CREATE FUNCTION pg_temp.e4_add_wrapper_payload(p_id uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'schemaVersion','account.create-default/v1',
    'operationCode','account.create-default',
    'defaultIntent',false,
    'expectedDefaultSnapshot',pg_temp.e4_snap('[]'::jsonb,null),
    'createGuards',jsonb_build_array(jsonb_build_object(
      'entity','account','id',p_id,'expectedAbsent',true)),
    'accountEffects','[]'::jsonb,
    'domainRecordRefs',jsonb_build_array(p_id),
    'domainMutation',jsonb_build_object(
      'records',jsonb_build_array(
        jsonb_build_object(
          'entity','account','mode','create','expectedUpdatedAt',null,
          'after',jsonb_build_object(
            'id',p_id,'name','Closed Add Wrapper Cash',
            'type','CASH','currency','EGP',
            'institutionId',null,'providerDisplayName',null,
            'isDefault',true,'createdAt','2026-09-01T12:00:00.000Z',
            'deleted',false,'openingBalanceMinorUnits','0',
            'targetBalanceMinorUnits',null
          )
        )
      )
    )
  )
$$;

CREATE FUNCTION pg_temp.e4_use_owner(p_n integer) RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.e4_id(p_n)::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.e4_id(p_n), 'role','authenticated')::text, true);
END;
$$;

-- Public RPC must not swallow arbitrary SQL, FK or auth errors.
-- Normalize ONLY invalid-envelope SQLSTATE 22023 to a typed rejection.
CREATE FUNCTION pg_temp.e4_try_apply(p_payload_json text, p_payload_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN public.apply_account_financial_action_v1(p_payload_json, p_payload_hash);
EXCEPTION WHEN SQLSTATE '22023' THEN
  RETURN jsonb_build_object('status','rejected','sqlstate',SQLSTATE);
END;
$$;

CREATE TEMP TABLE e4_inputs (case_name text PRIMARY KEY, envelope jsonb, payload_json text, payload_hash text);
CREATE TEMP TABLE e4_outcomes (case_name text PRIMARY KEY, outcome jsonb);

-- Positive Voice expense on 101.
INSERT INTO e4_inputs(case_name, envelope) VALUES
  ('positive_voice', pg_temp.e4_review_env(pg_temp.e4_id(2001), 'VOICE',
    jsonb_build_array(pg_temp.e4_tx(pg_temp.e4_id(310), pg_temp.e4_id(101), '100', 'EXPENSE', 'VOICE', null)),
    jsonb_build_array(pg_temp.e4_guard(pg_temp.e4_id(101), '0')),
    jsonb_build_array(pg_temp.e4_effect(pg_temp.e4_id(101), '-100', 'EGP', pg_temp.e4_id(410))),
    jsonb_build_array(pg_temp.e4_source(pg_temp.e4_id(610), pg_temp.e4_id(310), null)),
    '[]'::jsonb)),
-- H2 positive: valid SMS matched on 102.
  ('sms_matched_positive', pg_temp.e4_review_env(pg_temp.e4_id(2002), 'SMS',
    jsonb_build_array(pg_temp.e4_tx(pg_temp.e4_id(311), pg_temp.e4_id(102), '100', 'EXPENSE', 'SMS', repeat('a', 64))),
    jsonb_build_array(pg_temp.e4_guard(pg_temp.e4_id(102), '0')),
    jsonb_build_array(pg_temp.e4_effect(pg_temp.e4_id(102), '-100', 'EGP', pg_temp.e4_id(411))),
    jsonb_build_array(pg_temp.e4_source(pg_temp.e4_id(611), pg_temp.e4_id(311), repeat('a', 64))),
    '[]'::jsonb)),
-- H2 source negative: change ONLY after.source to VOICE (payload.source SMS).
  ('source_mismatch', pg_temp.e4_review_env(pg_temp.e4_id(2003), 'SMS',
    jsonb_build_array(pg_temp.e4_tx(pg_temp.e4_id(312), pg_temp.e4_id(108), '100', 'EXPENSE', 'VOICE', repeat('a', 64))),
    jsonb_build_array(pg_temp.e4_guard(pg_temp.e4_id(108), '0')),
    jsonb_build_array(pg_temp.e4_effect(pg_temp.e4_id(108), '-100', 'EGP', pg_temp.e4_id(412))),
    jsonb_build_array(pg_temp.e4_source(pg_temp.e4_id(612), pg_temp.e4_id(312), repeat('a', 64))),
    '[]'::jsonb)),
-- H2 FP negative: change ONLY sourceFingerprint (mismatch).
  ('fp_mismatch', pg_temp.e4_review_env(pg_temp.e4_id(2004), 'SMS',
    jsonb_build_array(pg_temp.e4_tx(pg_temp.e4_id(313), pg_temp.e4_id(109), '100', 'EXPENSE', 'SMS', repeat('a', 64))),
    jsonb_build_array(pg_temp.e4_guard(pg_temp.e4_id(109), '0')),
    jsonb_build_array(pg_temp.e4_effect(pg_temp.e4_id(109), '-100', 'EGP', pg_temp.e4_id(413))),
    jsonb_build_array(pg_temp.e4_source(pg_temp.e4_id(613), pg_temp.e4_id(313), repeat('b', 64))),
    '[]'::jsonb)),
-- Positive SMS ATM: Bank 103 EGP to owned Cash 105 EGP, no conversion fields.
  ('fx_same_currency', pg_temp.e4_review_env(pg_temp.e4_id(2005), 'SMS',
    jsonb_build_array(pg_temp.e4_transfer(pg_temp.e4_id(314), pg_temp.e4_id(103), pg_temp.e4_id(105), '2505', null, 'EGP', null, repeat('c',64))),
    jsonb_build_array(
      pg_temp.e4_guard(pg_temp.e4_id(103), '0'),
      pg_temp.e4_guard(pg_temp.e4_id(105), '0')),
    jsonb_build_array(
      pg_temp.e4_effect(pg_temp.e4_id(103), '-2505', 'EGP', pg_temp.e4_id(414)),
      pg_temp.e4_effect(pg_temp.e4_id(105), '2505', 'EGP', pg_temp.e4_id(415))),
    jsonb_build_array(pg_temp.e4_source(pg_temp.e4_id(614), pg_temp.e4_id(314), repeat('c',64))),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.e4_sms_book(pg_temp.e4_id(710))))),
-- FX negative first, then same-source SMS ATM positive: Bank103 revision0
-- remains fresh; only USD destination/conversion fields are different.
-- Pure T046 forbids convertedAmountMinorUnits/exchangeRate for new Review.
  ('fx_cross_currency', pg_temp.e4_review_env(pg_temp.e4_id(2006), 'SMS',
    jsonb_build_array(pg_temp.e4_transfer(pg_temp.e4_id(315), pg_temp.e4_id(103), pg_temp.e4_id(106), '2505', '200', 'EGP', '0.07984', repeat('d',64))),
    jsonb_build_array(
      pg_temp.e4_guard(pg_temp.e4_id(103), '0'),
      pg_temp.e4_guard(pg_temp.e4_id(106), '0')),
    jsonb_build_array(
      pg_temp.e4_effect(pg_temp.e4_id(103), '-2505', 'EGP', pg_temp.e4_id(416)),
      pg_temp.e4_effect(pg_temp.e4_id(106), '200', 'USD', pg_temp.e4_id(417))),
    jsonb_build_array(pg_temp.e4_source(pg_temp.e4_id(615), pg_temp.e4_id(315), repeat('d',64))),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.e4_sms_book(pg_temp.e4_id(711))))),
-- Real zero-net Review: two valid Voice rows, exactly one effect "0", full
-- guard for owned untouched account 107 and category owned by actor 1.
  ('zero_net_positive', pg_temp.e4_review_env(pg_temp.e4_id(2008), 'VOICE',
    jsonb_build_array(
      pg_temp.e4_tx(pg_temp.e4_id(316), pg_temp.e4_id(107), '100', 'INCOME', 'VOICE', null),
      pg_temp.e4_tx(pg_temp.e4_id(317), pg_temp.e4_id(107), '100', 'EXPENSE', 'VOICE', null)),
    jsonb_build_array(pg_temp.e4_guard(pg_temp.e4_id(107), '0')),
    jsonb_build_array(pg_temp.e4_effect(pg_temp.e4_id(107), '0', 'EGP', pg_temp.e4_id(418))),
    jsonb_build_array(
      pg_temp.e4_source(pg_temp.e4_id(616), pg_temp.e4_id(316), null),
      pg_temp.e4_source(pg_temp.e4_id(617), pg_temp.e4_id(317), null)),
    '[]'::jsonb));

UPDATE e4_inputs SET payload_json = private.financial_action_encode_jsonb_v1(envelope);
UPDATE e4_inputs SET payload_hash = encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex');
GRANT SELECT ON e4_inputs TO authenticated;
GRANT SELECT, INSERT ON e4_outcomes TO authenticated;

SELECT pg_temp.e4_use_owner(1);
-- Shared FX source 103 is untouched at this point. Reject the mutated FX
-- variant BEFORE running its same-currency positive control, so an FX
-- rejection can never be explained by a stale source revision.
INSERT INTO e4_outcomes
SELECT case_name, pg_temp.e4_try_apply(payload_json, payload_hash)
FROM e4_inputs WHERE case_name='fx_cross_currency';
INSERT INTO e4_outcomes
SELECT case_name, pg_temp.e4_try_apply(payload_json, payload_hash)
FROM e4_inputs WHERE case_name<>'fx_cross_currency';
-- Force the existing installed 076 deferred effects/root checker now; a
-- successful valid zero effect is a control, not M1's missing negative proof.
SET CONSTRAINTS ALL IMMEDIATE;

SELECT is((SELECT outcome->>'status' FROM e4_outcomes WHERE case_name='positive_voice'), 'accepted', 'positive Voice expense accepts');
SELECT is((SELECT outcome->>'status' FROM e4_outcomes WHERE case_name='sms_matched_positive'), 'accepted', 'H2 positive SMS matched accepts');
SELECT ok((SELECT outcome->>'status' = 'rejected'
  AND ((outcome->>'code' = 'INCOMPLETE_GROUP' AND outcome->>'actionId' IS NULL)
    OR outcome->>'sqlstate' = '22023')
  FROM e4_outcomes WHERE case_name='source_mismatch'),
  'H2: source-only mismatch rejected as invalid payload on untouched account 108');
SELECT ok((SELECT outcome->>'status' = 'rejected'
  AND ((outcome->>'code' = 'INCOMPLETE_GROUP' AND outcome->>'actionId' IS NULL)
    OR outcome->>'sqlstate' = '22023')
  FROM e4_outcomes WHERE case_name='fp_mismatch'),
  'H2: only fingerprint mismatch rejected as invalid payload on untouched account 109');
SELECT is((SELECT outcome->>'status' FROM e4_outcomes WHERE case_name='fx_same_currency'), 'accepted', 'FX same-currency transfer accepts');
SELECT ok((SELECT outcome->>'status' = 'rejected'
  AND ((outcome->>'code' = 'INCOMPLETE_GROUP' AND outcome->>'actionId' IS NULL)
    OR outcome->>'sqlstate' = '22023')
  FROM e4_outcomes WHERE case_name='fx_cross_currency'),
  'FX: mutated-only conversion rejected as invalid payload before same-source positive');
SELECT is((SELECT count(*) FROM public.transfers WHERE id=pg_temp.e4_id(315)), 0::bigint, 'FX: no cross-currency transfer inserted');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.e4_id(105)), 55.05::numeric, 'FX positive: same-currency EGP destination gets 25.05 once');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.e4_id(106)), 40::numeric, 'FX negative: independent USD destination never changes');

-- M2: closed record-wrapper key rule (direct private validator).
SELECT lives_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  (SELECT envelope->'payload' FROM e4_inputs WHERE case_name='positive_voice'),
  pg_temp.e4_id(310)::text), 'M2: valid closed wrapper passes');
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  jsonb_set((SELECT envelope->'payload' FROM e4_inputs WHERE case_name='positive_voice'),
    '{domainMutation,records,0,undocumented}', '"opaque"'),
  pg_temp.e4_id(310)::text),
  '22023', NULL, 'M2: extra wrapper field rejects');

-- M2 Add's distinct update wrapper rules remain intact; this Add CASH
-- create wrapper has precisely four keys and an otherwise-valid closed payload.
SELECT lives_ok(format(
  'SELECT private.financial_action_validate_account_create_default_payload_v1(%L::jsonb, %L::text)',
  pg_temp.e4_add_wrapper_payload(pg_temp.e4_id(320)),
  pg_temp.e4_id(320)::text), 'M2 Add: valid closed account-create wrapper passes');
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_account_create_default_payload_v1(%L::jsonb, %L::text)',
  jsonb_set(pg_temp.e4_add_wrapper_payload(pg_temp.e4_id(320)),
    '{domainMutation,records,0,undocumented}', '"opaque"'::jsonb),
  pg_temp.e4_id(320)::text),
  '22023', NULL, 'M2 Add: extra outer create-wrapper field rejects');

-- M1 NOT APPLICABLE / UNPROVEN as a malformed-root negative in this
-- public schema: existing root immutable/closed envelope validation rejects
-- payload='{}' with SQLSTATE 22023 BEFORE a zero effect reaches the installed
-- 076 deferred checker. Do not count that unrelated error as 23514 proof,
-- disable security triggers, catch OTHERS, or manufacture a passing assertion.
-- Panel/Root owns a source-level deferred tuple defense review.
-- This legitimate zero-net action DOES exercise the installed checker after
-- SET CONSTRAINTS ALL IMMEDIATE but cannot prove malformed-root rejection.
SELECT is((SELECT outcome->>'status' FROM e4_outcomes WHERE case_name='zero_net_positive'), 'accepted', 'M1 valid control: zero-net Review accepts with complete guard and one zero effect');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id=pg_temp.e4_id(2008) AND amount_minor_units=0), 1::bigint, 'M1 valid control: precisely one posted zero effect, no fabricated nonzero money');

SELECT * FROM finish();
ROLLBACK;
