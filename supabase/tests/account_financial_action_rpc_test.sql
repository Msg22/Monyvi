-- T029/T031 RPC acceptance. Run only against an isolated database with 069 applied.
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
VALUES
 ('018f0c7a-1234-7abc-8def-000000000201', 'authenticated', 'authenticated', 'checkpoint-owner@monyvi.test', 'unused', '{}', '{}'),
 ('018f0c7a-1234-7abc-8def-000000000202', 'authenticated', 'authenticated', 'checkpoint-foreign@monyvi.test', 'unused', '{}', '{}');
INSERT INTO public.accounts (id, user_id, name, type, balance, currency, financial_revision)
VALUES
 ('018f0c7a-1234-7abc-8def-000000000211', '018f0c7a-1234-7abc-8def-000000000201', 'Checkpoint EGP', 'CASH', 100, 'EGP', 0),
 ('018f0c7a-1234-7abc-8def-000000000212', '018f0c7a-1234-7abc-8def-000000000201', 'Checkpoint KWD', 'CASH', 10, 'KWD', 0),
 ('018f0c7a-1234-7abc-8def-000000000213', '018f0c7a-1234-7abc-8def-000000000202', 'Foreign EGP', 'CASH', 100, 'EGP', 0),
 ('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000000201', 'Exhausted', 'CASH', 100, 'EGP', 9223372036854775807);
INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level)
VALUES
 ('018f0c7a-1234-7abc-8def-000000000241', '018f0c7a-1234-7abc-8def-000000000201', 'checkpoint', 'Checkpoint', 'wallet', 1),
 ('018f0c7a-1234-7abc-8def-000000000242', '018f0c7a-1234-7abc-8def-000000000202', 'foreign-checkpoint', 'Foreign', 'wallet', 1);

CREATE FUNCTION pg_temp.transaction_envelope(p_suffix text, p_account text DEFAULT '018f0c7a-1234-7abc-8def-000000000211', p_revision text DEFAULT '0')
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'accountGuards', jsonb_build_array(jsonb_build_object('accountId', p_account, 'expectedRevision', p_revision)),
  'actionId', '018f0c7a-1234-7abc-8def-000000000' || p_suffix,
  'domain', 'transactions', 'domainReferenceId', '018f0c7a-1234-7abc-8def-000000001' || p_suffix,
  'envelopeVersion', 'monyvi.financial-action/v1', 'kind', 'create', 'occurredAt', '2026-09-01T12:00:00.000Z',
  'payload', jsonb_build_object(
   'accountEffects', jsonb_build_array(jsonb_build_object('accountId', p_account, 'amountMinorUnits', '-2500', 'currency', 'EGP')),
   'domainMutation', jsonb_build_object('records', jsonb_build_array(jsonb_build_object(
    'after', jsonb_build_object(
     'accountId', p_account, 'amountMinorUnits', '2500', 'categoryId', '018f0c7a-1234-7abc-8def-000000000241',
     'counterparty', null, 'createdAt', '2026-09-01T12:00:00.000Z', 'currency', 'EGP', 'date', '2026-09-01',
     'deleted', false, 'id', '018f0c7a-1234-7abc-8def-000000001' || p_suffix, 'isDraft', false,
     'linkedAssetId', null, 'linkedDebtId', null, 'linkedRecurringId', null, 'note', null,
     'smsFingerprint', null, 'source', 'MANUAL', 'type', 'EXPENSE'),
    'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create'))),
   'domainRecordRefs', jsonb_build_array('018f0c7a-1234-7abc-8def-000000001' || p_suffix),
   'operationCode', 'transaction.create', 'schemaVersion', 'account.balance-effects/v1'),
  'payloadVersion', 'account.balance-effects/v1', 'userId', '018f0c7a-1234-7abc-8def-000000000201');
$$;

CREATE TEMP TABLE action_inputs (name text PRIMARY KEY, envelope jsonb, payload_json text, payload_hash text);
CREATE TEMP TABLE action_results (name text PRIMARY KEY, outcome jsonb);
INSERT INTO action_inputs(name, envelope) VALUES
 ('accepted', pg_temp.transaction_envelope('301')),
 ('stale', pg_temp.transaction_envelope('302')),
 ('foreign', pg_temp.transaction_envelope('303', '018f0c7a-1234-7abc-8def-000000000213')),
 ('invalid_revision', pg_temp.transaction_envelope('304', '018f0c7a-1234-7abc-8def-000000000211', '01')),
 ('exhausted', pg_temp.transaction_envelope('305', '018f0c7a-1234-7abc-8def-000000000214', '9223372036854775807')),
 ('exhausted_stale', pg_temp.transaction_envelope('310', '018f0c7a-1234-7abc-8def-000000000211', '9223372036854775807')),
 ('hash_mismatch', jsonb_set(pg_temp.transaction_envelope('301'), '{payload,domainMutation,records,0,after,note}', '"different immutable payload"')),
 ('rollback', jsonb_set(jsonb_set(pg_temp.transaction_envelope('306', '018f0c7a-1234-7abc-8def-000000000211', '1'), '{payload,domainMutation,records,0,after,id}', '"018f0c7a-1234-7abc-8def-000000001301"'), '{payload,domainRecordRefs}', '["018f0c7a-1234-7abc-8def-000000001301"]')),
 ('foreign_category', jsonb_set(pg_temp.transaction_envelope('307', '018f0c7a-1234-7abc-8def-000000000211', '1'), '{payload,domainMutation,records,0,after,categoryId}', '"018f0c7a-1234-7abc-8def-000000000242"'));
UPDATE action_inputs SET envelope = jsonb_set(envelope, '{domainReferenceId}', '"018f0c7a-1234-7abc-8def-000000001301"') WHERE name = 'rollback';

INSERT INTO action_inputs(name, envelope) VALUES ('account_create', jsonb_build_object(
 'accountGuards', '[{"accountId":"018f0c7a-1234-7abc-8def-000000000215","expectedRevision":"0"}]'::jsonb,
 'actionId', '018f0c7a-1234-7abc-8def-000000000308', 'domain', 'accounts',
 'domainReferenceId', '018f0c7a-1234-7abc-8def-000000000215', 'envelopeVersion', 'monyvi.financial-action/v1',
 'kind', 'create', 'occurredAt', '2026-09-01T12:00:00.000Z',
 'payload', jsonb_build_object(
  'accountEffects', '[{"accountId":"018f0c7a-1234-7abc-8def-000000000215","amountMinorUnits":"1000","currency":"EGP"}]'::jsonb,
  'domainMutation', '{"records":[{"after":{"createdAt":"2026-09-01T12:00:00.000Z","currency":"EGP","deleted":false,"id":"018f0c7a-1234-7abc-8def-000000000215","institutionId":null,"isDefault":false,"name":"New account","openingBalanceMinorUnits":"1000","providerDisplayName":null,"targetBalanceMinorUnits":null,"type":"CASH"},"entity":"account","expectedUpdatedAt":null,"mode":"create"}]}'::jsonb,
  'domainRecordRefs', '["018f0c7a-1234-7abc-8def-000000000215"]'::jsonb,
  'operationCode', 'account.create', 'schemaVersion', 'account.balance-effects/v1'),
 'payloadVersion', 'account.balance-effects/v1', 'userId', '018f0c7a-1234-7abc-8def-000000000201'));

INSERT INTO action_inputs(name, envelope) VALUES ('transfer', jsonb_build_object(
 'accountGuards', '[{"accountId":"018f0c7a-1234-7abc-8def-000000000211","expectedRevision":"1"},{"accountId":"018f0c7a-1234-7abc-8def-000000000212","expectedRevision":"0"}]'::jsonb,
 'actionId', '018f0c7a-1234-7abc-8def-000000000309', 'domain', 'transfers',
 'domainReferenceId', '018f0c7a-1234-7abc-8def-000000001309', 'envelopeVersion', 'monyvi.financial-action/v1',
 'kind', 'create', 'occurredAt', '2026-09-01T12:00:00.000Z',
 'payload', jsonb_build_object(
  'accountEffects', '[{"accountId":"018f0c7a-1234-7abc-8def-000000000211","amountMinorUnits":"-100","currency":"EGP"},{"accountId":"018f0c7a-1234-7abc-8def-000000000212","amountMinorUnits":"1234","currency":"KWD"}]'::jsonb,
  'domainMutation', '{"records":[{"after":{"amountMinorUnits":"100","convertedAmountMinorUnits":"1234","createdAt":"2026-09-01T12:00:00.000Z","currency":"EGP","date":"2026-09-01","deleted":false,"exchangeRate":"1.234","fromAccountId":"018f0c7a-1234-7abc-8def-000000000211","id":"018f0c7a-1234-7abc-8def-000000001309","notes":null,"smsFingerprint":null,"toAccountId":"018f0c7a-1234-7abc-8def-000000000212"},"entity":"transfer","expectedUpdatedAt":null,"mode":"create"}]}'::jsonb,
  'domainRecordRefs', '["018f0c7a-1234-7abc-8def-000000001309"]'::jsonb,
  'operationCode', 'transfer.create', 'schemaVersion', 'account.balance-effects/v1'),
 'payloadVersion', 'account.balance-effects/v1', 'userId', '018f0c7a-1234-7abc-8def-000000000201'));

UPDATE action_inputs SET payload_json = private.financial_action_encode_jsonb_v1(envelope);
UPDATE action_inputs SET payload_hash = encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex');
GRANT SELECT ON action_inputs TO authenticated;
GRANT SELECT, INSERT ON action_results TO authenticated;
SELECT set_config('request.jwt.claim.sub', '018f0c7a-1234-7abc-8def-000000000201', true);
SELECT set_config('request.jwt.claims', '{"sub":"018f0c7a-1234-7abc-8def-000000000201","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok($$INSERT INTO action_results SELECT name, public.apply_account_financial_action_v1(payload_json, payload_hash) FROM action_inputs WHERE name = 'accepted'$$, 'authenticated RPC commits complete transaction action');
SELECT is((SELECT outcome->>'status' FROM action_results WHERE name='accepted'), 'accepted', 'complete action accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 75::numeric, 'balance changed once');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 1::bigint, 'revision advanced once');
SELECT is((SELECT count(*) FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001301'), 1::bigint, 'domain record committed');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000301'), 1::bigint, 'effect committed');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM action_inputs WHERE name='accepted'), 'idempotent', 'identical delivery replays');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 75::numeric, 'replay changes no balance');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM action_inputs WHERE name='hash_mismatch'), 'PAYLOAD_HASH_MISMATCH', 'same ID with different payload rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,repeat('0',64))->>'code' FROM action_inputs WHERE name='accepted'), 'PAYLOAD_HASH_MISMATCH', 'forged payload digest rejected');
SELECT lives_ok($$INSERT INTO action_results SELECT name, public.apply_account_financial_action_v1(payload_json,payload_hash) FROM action_inputs WHERE name='stale'$$, 'stale contender returns durable outcome');
SELECT is((SELECT outcome->>'status' FROM action_results WHERE name='stale'), 'stale', 'only first expected-revision contender wins');
SELECT is((SELECT outcome->>'canonicalHoldingActionId' FROM action_results WHERE name='stale'), null::text, 'account conflict fabricates no holding winner');
SELECT is((SELECT outcome->'canonicalAccounts'->0->>'canonicalRevision' FROM action_results WHERE name='stale'), '1', 'stale response contains canonical revision');
SELECT is((SELECT is_effective FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000302'), false, 'losing effect never financially active');
SELECT is((SELECT count(*) FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001302'), 0::bigint, 'losing domain record absent');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM action_inputs WHERE name='stale'), 'idempotent', 'stale delivery replays durable outcome');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM action_inputs WHERE name='foreign'), 'NOT_OWNED', 'foreign account rejected by owner check');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM action_inputs WHERE name='invalid_revision'), 'INVALID_REVISION', 'invalid revision rejected before cast');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM action_inputs WHERE name='exhausted'), 'REVISION_EXHAUSTED', 'maximum revision cannot overflow');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM action_inputs WHERE name='exhausted_stale'), 'REVISION_EXHAUSTED', 'maximum expected revision cannot overflow stale evidence');
SELECT throws_ok($$SELECT public.apply_account_financial_action_v1(payload_json,payload_hash) FROM action_inputs WHERE name='rollback'$$, '23505', null, 'duplicate domain record fails complete action');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 75::numeric, 'failed domain insertion rolls back balance');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000306'), 0::bigint, 'failed domain insertion retains no effect');
SELECT throws_ok($$SELECT public.apply_account_financial_action_v1(payload_json,payload_hash) FROM action_inputs WHERE name='foreign_category'$$, '42501', null, 'foreign linked category rejected inside definer RPC');
SELECT lives_ok($$INSERT INTO action_results SELECT name, public.apply_account_financial_action_v1(payload_json,payload_hash) FROM action_inputs WHERE name='account_create'$$, 'accounts-domain opening balance accepted');
SELECT is((SELECT outcome->>'status' FROM action_results WHERE name='account_create'), 'accepted', 'new account action accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000215'), 10::numeric, 'opening account balance exact');
SELECT lives_ok($$INSERT INTO action_results SELECT name, public.apply_account_financial_action_v1(payload_json,payload_hash) FROM action_inputs WHERE name='transfer'$$, 'two-account cross-currency transfer commits');
SELECT is((SELECT outcome->>'status' FROM action_results WHERE name='transfer'), 'accepted', 'transfer accepted');
SELECT is((SELECT outcome->'accountRevisions'->0->>'accountId' FROM action_results WHERE name='transfer'), '018f0c7a-1234-7abc-8def-000000000211', 'account outcomes sorted source first');
SELECT is((SELECT outcome->'accountRevisions'->1->>'accountId' FROM action_results WHERE name='transfer'), '018f0c7a-1234-7abc-8def-000000000212', 'account outcomes sorted destination second');
SELECT is((SELECT converted_amount FROM public.transfers WHERE id='018f0c7a-1234-7abc-8def-000000001309'), 1.234::numeric, 'converted amount uses destination currency scale');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000212'), 11.234::numeric, 'destination receives exact KWD minor units');
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE', 'all deferred action/effect constraints hold');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.financial_action_groups WHERE action_id='018f0c7a-1234-7abc-8def-000000000306'), 0::bigint, 'rollback leaves no action root');
SELECT * FROM finish();
ROLLBACK;
