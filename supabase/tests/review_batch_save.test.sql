-- #395 T045: strict selected-review financial action. Expected RED on 001-087:
-- the new tuple is not registered, so positive assertions must fail, not skip.
-- Isolated pgTAP fixture: existing public RPC, legacy canonical JSON encoder/hash.
BEGIN;
SELECT no_plan();

CREATE FUNCTION pg_temp.r395_id(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('39a50000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

INSERT INTO auth.users
  (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
VALUES
  (pg_temp.r395_id(1), 'authenticated', 'authenticated', 'sql395-review-owner@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.r395_id(2), 'authenticated', 'authenticated', 'sql395-review-foreign@monyvi.test', 'unused', '{}', '{}');

INSERT INTO public.accounts
  (id, user_id, name, type, balance, currency, financial_revision, is_default, deleted)
VALUES
  (pg_temp.r395_id(101), pg_temp.r395_id(1), 'Existing Bank', 'BANK', 100, 'EGP', 0, true, false),
  (pg_temp.r395_id(102), pg_temp.r395_id(1), 'Cash Destination', 'CASH', 75, 'EGP', 0, false, false),
  (pg_temp.r395_id(103), pg_temp.r395_id(1), 'Tombstoned ID', 'BANK', 0, 'EGP', 0, false, true),
  (pg_temp.r395_id(104), pg_temp.r395_id(2), 'Foreign ID', 'BANK', 9, 'EGP', 0, false, false),
  (pg_temp.r395_id(105), pg_temp.r395_id(1), 'Legacy Baseline', 'CASH', 50, 'EGP', 0, false, false);

INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level)
VALUES
  (pg_temp.r395_id(10), pg_temp.r395_id(1), 'review-fixture', 'Review Fixture', 'wallet', 1),
  (pg_temp.r395_id(11), pg_temp.r395_id(2), 'foreign-review-fixture', 'Foreign Fixture', 'wallet', 1);

-- Produce the exact persisted mutation field vocabulary; no ad-hoc SQL RPC.
CREATE FUNCTION pg_temp.r395_transaction(
  p_id uuid, p_account uuid, p_amount text, p_kind text, p_source text,
  p_fingerprint text, p_category uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'entity', 'transaction', 'mode', 'create', 'expectedUpdatedAt', null,
    'after', jsonb_build_object(
      'id', p_id, 'accountId', p_account, 'amountMinorUnits', p_amount,
      'currency', 'EGP', 'type', p_kind, 'categoryId', p_category,
      'counterparty', null, 'note', null, 'date', '2026-09-01',
      'source', p_source, 'smsFingerprint', p_fingerprint, 'isDraft', false,
      'linkedAssetId', null, 'linkedDebtId', null, 'linkedRecurringId', null,
      'createdAt', '2026-09-01T12:00:00.000Z', 'deleted', false))
$$;

CREATE FUNCTION pg_temp.r395_transfer(
  p_id uuid, p_from uuid, p_to uuid, p_fingerprint text
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity', 'transfer', 'mode', 'create',
    'expectedUpdatedAt', null, 'after', jsonb_build_object(
      'id', p_id, 'fromAccountId', p_from, 'toAccountId', p_to,
      'amountMinorUnits', '2505', 'convertedAmountMinorUnits', '2505',
      'exchangeRate', '1', 'currency', 'EGP', 'date', '2026-09-01',
      'notes', null, 'smsFingerprint', p_fingerprint,
      'createdAt', '2026-09-01T12:00:00.000Z', 'deleted', false))
$$;

CREATE FUNCTION pg_temp.r395_account(p_id uuid, p_name text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity', 'account', 'mode', 'create',
    'expectedUpdatedAt', null, 'after', jsonb_build_object(
      'id', p_id, 'name', p_name, 'type', 'BANK', 'currency', 'EGP',
      'institutionId', null, 'providerDisplayName', null,
      'isDefault', false, 'createdAt', '2026-09-01T12:00:00.000Z',
      'deleted', false, 'openingBalanceMinorUnits', '0',
      'targetBalanceMinorUnits', null))
$$;

CREATE FUNCTION pg_temp.r395_sender(p_id uuid, p_account uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity', 'account_sms_sender', 'mode', 'create',
    'expectedUpdatedAt', null, 'after', jsonb_build_object(
      'id', p_id, 'accountId', p_account, 'senderName', 'QNB',
      'normalizedSenderName', 'qnb',
      'createdAt', '2026-09-01T12:00:00.000Z', 'deleted', false))
$$;

CREATE FUNCTION pg_temp.r395_bank(p_id uuid, p_account uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity', 'bank_details', 'mode', 'create',
    'expectedUpdatedAt', null, 'after', jsonb_build_object(
      'id', p_id, 'accountId', p_account, 'accountNumber', null,
      'cardLast4', '0007',
      'createdAt', '2026-09-01T12:00:00.000Z', 'deleted', false))
$$;

CREATE FUNCTION pg_temp.r395_guard(p_id uuid, p_revision text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId', p_id, 'expectedRevision', p_revision)
$$;

CREATE FUNCTION pg_temp.r395_effect(p_id uuid, p_minor text, p_effect uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId', p_id, 'amountMinorUnits', p_minor,
    'currency', 'EGP', 'effectId', p_effect)
$$;

CREATE FUNCTION pg_temp.r395_source(p_row uuid, p_record uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('rowId', p_row, 'recordId', p_record,
    'sourceFingerprint', p_fingerprint)
$$;

CREATE FUNCTION pg_temp.r395_bookkeeping(p_draft uuid, p_queue uuid, p_op text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('draftId', p_draft, 'queueId', p_queue,
    'snapshotHash', repeat('a', 64), 'expectedReviewRevision', '1',
    'operation', p_op)
$$;

CREATE FUNCTION pg_temp.r395_review_envelope(
  p_action uuid, p_source text, p_records jsonb, p_guards jsonb,
  p_effects jsonb, p_selected jsonb, p_groups jsonb, p_bookkeeping jsonb
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion', 'monyvi.financial-action/v1',
    'userId', pg_temp.r395_id(1), 'actionId', p_action,
    'domain', 'transactions', 'kind', 'review_batch_save',
    'domainReferenceId', (
      SELECT (r.value->'after'->>'id')::uuid
      FROM jsonb_array_elements(p_records) AS r(value)
      WHERE r.value->>'entity' IN ('transaction', 'transfer')
      ORDER BY (r.value->'after'->>'id') COLLATE "C" LIMIT 1),
    'occurredAt', '2026-09-01T12:00:00.000Z',
    'payloadVersion', 'review.batch-save/v1',
    'accountGuards', p_guards,
    'payload', jsonb_build_object(
      'schemaVersion', 'review.batch-save/v1', 'operationCode', 'review.batch-save',
      'source', p_source, 'sessionId', pg_temp.r395_id(900),
      'selectedSourceRefs', p_selected, 'confirmedGroupRefs', p_groups,
      'createGuards', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('entity', r.value->>'entity',
          'id', r.value->'after'->>'id', 'expectedAbsent', true)
          ORDER BY ((r.value->>'entity') || ':' || (r.value->'after'->>'id')) COLLATE "C")
        FROM jsonb_array_elements(p_records) AS r(value)
        WHERE r.value->>'mode' = 'create'), '[]'::jsonb),
      'accountEffects', p_effects,
      'domainRecordRefs', COALESCE((
        SELECT jsonb_agg(r.value->'after'->>'id'
          ORDER BY (r.value->'after'->>'id') COLLATE "C")
        FROM jsonb_array_elements(p_records) AS r(value)), '[]'::jsonb),
      'domainMutation', jsonb_build_object('records', p_records),
      'localSmsBookkeeping', p_bookkeeping))
$$;

-- Legacy positive-control tuple copied through the *existing* v1 fields.
CREATE FUNCTION pg_temp.r395_legacy(p_action uuid, p_record uuid, p_minor text,
  p_revision text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'accountGuards', jsonb_build_array(
      pg_temp.r395_guard(pg_temp.r395_id(105), p_revision)),
    'actionId', p_action, 'domain', 'transactions',
    'domainReferenceId', p_record,
    'envelopeVersion', 'monyvi.financial-action/v1', 'kind', 'create',
    'occurredAt', '2026-09-01T12:00:00.000Z',
    'payloadVersion', 'account.balance-effects/v1',
    'userId', pg_temp.r395_id(1),
    'payload', jsonb_build_object(
      'schemaVersion', 'account.balance-effects/v1',
      'operationCode', 'transaction.create',
      'domainRecordRefs', jsonb_build_array(p_record),
      'domainMutation', jsonb_build_object('records', jsonb_build_array(
        pg_temp.r395_transaction(p_record, pg_temp.r395_id(105),
          '100', 'EXPENSE', 'VOICE', null, pg_temp.r395_id(10)))),
      'accountEffects', jsonb_build_array(
        pg_temp.r395_effect(pg_temp.r395_id(105), p_minor, pg_temp.r395_id(1201)))))
$$;

CREATE TEMP TABLE review_inputs (
  case_name text PRIMARY KEY, envelope jsonb NOT NULL,
  payload_json text, payload_hash text
);
CREATE TEMP TABLE review_outcomes (case_name text PRIMARY KEY, outcome jsonb);

INSERT INTO review_inputs(case_name, envelope) VALUES
  ('legacy_positive', pg_temp.r395_legacy(pg_temp.r395_id(1101), pg_temp.r395_id(1001), '-100', '0')),
  ('legacy_zero_rejected', pg_temp.r395_legacy(pg_temp.r395_id(1102), pg_temp.r395_id(1002), '0', '1')),
  ('zero_net', pg_temp.r395_review_envelope(pg_temp.r395_id(1103), 'VOICE',
    jsonb_build_array(
      pg_temp.r395_transaction(pg_temp.r395_id(110), pg_temp.r395_id(101), '2001', 'INCOME', 'VOICE', null, pg_temp.r395_id(10)),
      pg_temp.r395_transaction(pg_temp.r395_id(111), pg_temp.r395_id(101), '2001', 'EXPENSE', 'VOICE', null, pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(101), '0')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(101), '0', pg_temp.r395_id(1203))),
    jsonb_build_array(
      pg_temp.r395_source(pg_temp.r395_id(610), pg_temp.r395_id(110), null),
      pg_temp.r395_source(pg_temp.r395_id(611), pg_temp.r395_id(111), null)),
    '[]'::jsonb, '[]'::jsonb)),
  ('new_bank_selected', pg_temp.r395_review_envelope(pg_temp.r395_id(1104), 'SMS',
    jsonb_build_array(
      pg_temp.r395_account(pg_temp.r395_id(200), 'Suggested QNB'),
      pg_temp.r395_sender(pg_temp.r395_id(201), pg_temp.r395_id(200)),
      pg_temp.r395_bank(pg_temp.r395_id(202), pg_temp.r395_id(200)),
      pg_temp.r395_transaction(pg_temp.r395_id(210), pg_temp.r395_id(200), '2001', 'INCOME', 'SMS', repeat('1', 64), pg_temp.r395_id(10)),
      pg_temp.r395_transaction(pg_temp.r395_id(211), pg_temp.r395_id(200), '501', 'EXPENSE', 'SMS', repeat('2', 64), pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(200), '0')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(200), '1500', pg_temp.r395_id(1204))),
    jsonb_build_array(
      pg_temp.r395_source(pg_temp.r395_id(612), pg_temp.r395_id(210), repeat('1', 64)),
      pg_temp.r395_source(pg_temp.r395_id(613), pg_temp.r395_id(211), repeat('2', 64))),
    jsonb_build_array(jsonb_build_object('groupId', pg_temp.r395_id(701),
      'revision', '1', 'accountId', pg_temp.r395_id(200))),
    jsonb_build_array(
      pg_temp.r395_bookkeeping(pg_temp.r395_id(800), pg_temp.r395_id(810), 'delete_saved'),
      pg_temp.r395_bookkeeping(pg_temp.r395_id(801), pg_temp.r395_id(810), 'delete_saved'),
      pg_temp.r395_bookkeeping(pg_temp.r395_id(802), pg_temp.r395_id(810), 'rebind_remaining')))),
  ('atm_transfer', pg_temp.r395_review_envelope(pg_temp.r395_id(1105), 'SMS',
    jsonb_build_array(pg_temp.r395_transfer(pg_temp.r395_id(212),
      pg_temp.r395_id(101), pg_temp.r395_id(102), repeat('3',64))),
    jsonb_build_array(
      pg_temp.r395_guard(pg_temp.r395_id(101), '1'),
      pg_temp.r395_guard(pg_temp.r395_id(102), '0')),
    jsonb_build_array(
      pg_temp.r395_effect(pg_temp.r395_id(101), '-2505', pg_temp.r395_id(1205)),
      pg_temp.r395_effect(pg_temp.r395_id(102), '2505', pg_temp.r395_id(1206))),
    jsonb_build_array(pg_temp.r395_source(
      pg_temp.r395_id(614), pg_temp.r395_id(212), repeat('3',64))),
    '[]'::jsonb, jsonb_build_array(
      pg_temp.r395_bookkeeping(pg_temp.r395_id(803), pg_temp.r395_id(811), 'delete_saved')))),
  ('stale_with_absent_create', pg_temp.r395_review_envelope(pg_temp.r395_id(1106), 'VOICE',
    jsonb_build_array(
      pg_temp.r395_account(pg_temp.r395_id(220), 'Uncreated Stale Group'),
      pg_temp.r395_transaction(pg_temp.r395_id(221), pg_temp.r395_id(220), '1000', 'INCOME', 'VOICE', null, pg_temp.r395_id(10)),
      pg_temp.r395_transaction(pg_temp.r395_id(222), pg_temp.r395_id(101), '200', 'INCOME', 'VOICE', null, pg_temp.r395_id(10)),
      pg_temp.r395_transaction(pg_temp.r395_id(223), pg_temp.r395_id(101), '200', 'EXPENSE', 'VOICE', null, pg_temp.r395_id(10))),
    jsonb_build_array(
      pg_temp.r395_guard(pg_temp.r395_id(101), '0'),
      pg_temp.r395_guard(pg_temp.r395_id(220), '0')),
    jsonb_build_array(
      pg_temp.r395_effect(pg_temp.r395_id(101), '0', pg_temp.r395_id(1207)),
      pg_temp.r395_effect(pg_temp.r395_id(220), '1000', pg_temp.r395_id(1208))),
    jsonb_build_array(
      pg_temp.r395_source(pg_temp.r395_id(615), pg_temp.r395_id(221), null),
      pg_temp.r395_source(pg_temp.r395_id(616), pg_temp.r395_id(222), null),
      pg_temp.r395_source(pg_temp.r395_id(617), pg_temp.r395_id(223), null)),
    jsonb_build_array(jsonb_build_object('groupId', pg_temp.r395_id(702),
      'revision', '1', 'accountId', pg_temp.r395_id(220))), '[]'::jsonb)),
  ('foreign_account_collision', pg_temp.r395_review_envelope(pg_temp.r395_id(1107), 'VOICE',
    jsonb_build_array(
      pg_temp.r395_account(pg_temp.r395_id(104), 'Forged Foreign Create'),
      pg_temp.r395_transaction(pg_temp.r395_id(230), pg_temp.r395_id(104), '100', 'INCOME', 'VOICE', null, pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(104), '0')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(104), '100', pg_temp.r395_id(1209))),
    jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(618), pg_temp.r395_id(230), null)),
    jsonb_build_array(jsonb_build_object('groupId', pg_temp.r395_id(703),
      'revision', '1', 'accountId', pg_temp.r395_id(104))), '[]'::jsonb)),
  ('deleted_account_collision', pg_temp.r395_review_envelope(pg_temp.r395_id(1108), 'VOICE',
    jsonb_build_array(
      pg_temp.r395_account(pg_temp.r395_id(103), 'Forged Deleted Create'),
      pg_temp.r395_transaction(pg_temp.r395_id(231), pg_temp.r395_id(103), '100', 'INCOME', 'VOICE', null, pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(103), '0')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(103), '100', pg_temp.r395_id(1210))),
    jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(619), pg_temp.r395_id(231), null)),
    jsonb_build_array(jsonb_build_object('groupId', pg_temp.r395_id(704),
      'revision', '1', 'accountId', pg_temp.r395_id(103))), '[]'::jsonb)),
  ('late_foreign_category', pg_temp.r395_review_envelope(pg_temp.r395_id(1109), 'SMS',
    jsonb_build_array(
      pg_temp.r395_account(pg_temp.r395_id(240), 'Rollback Group'),
      pg_temp.r395_sender(pg_temp.r395_id(241), pg_temp.r395_id(240)),
      pg_temp.r395_transaction(pg_temp.r395_id(242), pg_temp.r395_id(240), '1000', 'INCOME', 'SMS', repeat('4',64), pg_temp.r395_id(11))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(240), '0')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(240), '1000', pg_temp.r395_id(1211))),
    jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(620), pg_temp.r395_id(242), repeat('4',64))),
    jsonb_build_array(jsonb_build_object('groupId', pg_temp.r395_id(705),
      'revision', '1', 'accountId', pg_temp.r395_id(240))),
    jsonb_build_array(pg_temp.r395_bookkeeping(
      pg_temp.r395_id(804), pg_temp.r395_id(811), 'delete_saved')))),
  ('spoofed_zero_root', jsonb_set(pg_temp.r395_review_envelope(pg_temp.r395_id(1110), 'VOICE',
    jsonb_build_array(
      pg_temp.r395_transaction(pg_temp.r395_id(250), pg_temp.r395_id(101), '100', 'INCOME', 'VOICE', null, pg_temp.r395_id(10)),
      pg_temp.r395_transaction(pg_temp.r395_id(251), pg_temp.r395_id(101), '100', 'EXPENSE', 'VOICE', null, pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(101), '2')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(101), '0', pg_temp.r395_id(1212))),
    jsonb_build_array(
      pg_temp.r395_source(pg_temp.r395_id(621), pg_temp.r395_id(250), null),
      pg_temp.r395_source(pg_temp.r395_id(622), pg_temp.r395_id(251), null)),
    '[]'::jsonb, '[]'::jsonb), '{kind}', '"create"'));

INSERT INTO review_inputs(case_name, envelope)
SELECT 'changed_hash_same_action',
  jsonb_set(envelope, '{payload,accountEffects,0,amountMinorUnits}', '"1"')
FROM review_inputs WHERE case_name = 'zero_net';

UPDATE review_inputs SET payload_json = private.financial_action_encode_jsonb_v1(envelope);
UPDATE review_inputs SET payload_hash =
  encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex');
GRANT SELECT ON review_inputs TO authenticated;
GRANT SELECT, INSERT ON review_outcomes TO authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.r395_id(1)::text, true);
SELECT set_config('request.jwt.claims',
  jsonb_build_object('sub',pg_temp.r395_id(1),'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- A real v1 positive control precedes all new-tuple RED cases.
INSERT INTO review_outcomes
SELECT case_name, public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name = 'legacy_positive';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='legacy_positive'),
  'accepted', 'legacy transaction.create baseline still accepts');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(105)),
  49::numeric, 'legacy baseline signed EGP delta posted once');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.r395_id(105)),
  1::bigint, 'legacy baseline financial revision incremented once');
SELECT is((SELECT count(*) FROM public.transactions WHERE id=pg_temp.r395_id(1001)),
  1::bigint, 'legacy baseline financial record exists');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id=pg_temp.r395_id(1101)),
  1::bigint, 'legacy baseline immutable effect exists');

-- New tuple: same-account 20.01 in and out is two persisted rows + one zero effect.
INSERT INTO review_outcomes
SELECT case_name, public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name = 'zero_net';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='zero_net'),
  'accepted', 'new review zero-net tuple is registered (expected RED before 088)');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN
  (pg_temp.r395_id(110),pg_temp.r395_id(111))), 2::bigint,
  'both nonzero financial rows survive aggregate zero');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  100::numeric, 'zero aggregate does not alter existing account balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  1::bigint, 'zero aggregate still advances guarded revision exactly once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1103) AND account_id=pg_temp.r395_id(101)
    AND amount_minor_units=0 AND accepted_account_revision=1 AND is_effective),
  1::bigint, 'new tuple retains one effective immutable zero effect');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE action_id=pg_temp.r395_id(1103) AND kind='review_batch_save'
    AND domain='transactions'), 1::bigint, 'zero-net action root has exact domain/kind');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM review_inputs WHERE case_name='zero_net'), 'idempotent',
  'same action/hash replays without posting again');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  1::bigint, 'zero-net replay never increments revision twice');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code'
  FROM review_inputs WHERE case_name='changed_hash_same_action'),
  'PAYLOAD_HASH_MISMATCH', 'same action ID with different canonical payload rejects');

-- Selected shared QNB group: account/children/records/effect atomically.
INSERT INTO review_outcomes
SELECT case_name, public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='new_bank_selected';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='new_bank_selected'),
  'accepted', 'selected shared bank creates via complete new tuple');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(200)
  AND user_id=pg_temp.r395_id(1) AND NOT deleted AND NOT is_default AND balance=15
  AND financial_revision=1), 1::bigint,
  'suggested bank starts at zero and posts selected net 15 once');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN
  (pg_temp.r395_id(210),pg_temp.r395_id(211)) AND account_id=pg_temp.r395_id(200)),
  2::bigint, 'both selected SMS rows use the one confirmed account');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.r395_id(202)
  AND account_id=pg_temp.r395_id(200) AND card_last_4=7 AND NOT deleted),
  1::bigint, 'one child bank card keeps 0007 wire suffix as numeric 7 in SQL');
SELECT is((SELECT count(*) FROM public.account_sms_senders WHERE id=pg_temp.r395_id(201)
  AND account_id=pg_temp.r395_id(200) AND normalized_sender_name='qnb' AND NOT deleted),
  1::bigint, 'sender child belongs to created bank once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1104) AND account_id=pg_temp.r395_id(200)
    AND amount_minor_units=1500 AND accepted_account_revision=1 AND is_effective),
  1::bigint, 'new bank 20.01 minus 5.01 effect is exactly 1500 minor units');
SELECT is((SELECT is_default FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  true, 'review confirmation never changes the previous default');
SELECT ok((SELECT payload_json NOT LIKE '%original_transcript%'
    AND payload_json NOT LIKE '%"body"%'
    AND payload_json NOT LIKE '%"payloadJson"%'
    AND payload_json NOT LIKE '%"preimages"%'
  FROM review_inputs WHERE case_name='new_bank_selected'),
  'cloud action contains no transcript, raw SMS body or local snapshots');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(399)),
  0::bigint, 'unused draft account is not created');

-- ATM transfer source and destination both revision guarded, one fingerprint.
INSERT INTO review_outcomes
SELECT case_name, public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='atm_transfer';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='atm_transfer'),
  'accepted', 'selected ATM transfer commits both endpoints in one tuple');
SELECT is((SELECT count(*) FROM public.transfers WHERE id=pg_temp.r395_id(212)
  AND from_account_id=pg_temp.r395_id(101) AND to_account_id=pg_temp.r395_id(102)
  AND sms_fingerprint=repeat('3',64)), 1::bigint,
  'ATM transfer retains dedup identity and exact source/destination IDs');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  74.95::numeric, 'ATM bank source debited exactly once');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(102)),
  100.05::numeric, 'ATM Cash destination credited exactly once');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  2::bigint, 'source financial revision advances after zero-net revision');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.r395_id(102)),
  1::bigint, 'destination financial revision advances exactly once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1105) AND is_effective), 2::bigint,
  'ATM records one immutable effect for each guarded endpoint');

-- A real accepted baseline now precedes deliberate stale/absence collision.
INSERT INTO review_outcomes
SELECT case_name, public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='stale_with_absent_create';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='stale_with_absent_create'),
  'stale', 'revision-zero guard loses to already accepted revision two');
SELECT is((SELECT jsonb_typeof(outcome->'canonicalAbsentAccountIds')
  FROM review_outcomes WHERE case_name='stale_with_absent_create'),
  'array', 'new-tuple stale outcome includes typed canonicalAbsentAccountIds');
SELECT ok((SELECT COALESCE(outcome->'canonicalAbsentAccountIds','[]'::jsonb)
  ? pg_temp.r395_id(220)::text
  FROM review_outcomes WHERE case_name='stale_with_absent_create'),
  'scoped rejection proves absent optimistic new account ID');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(220)),
  0::bigint, 'stale group did not create its suggested account');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN
  (pg_temp.r395_id(221),pg_temp.r395_id(222),pg_temp.r395_id(223))),
  0::bigint, 'stale group did not partially save selected rows');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  74.95::numeric, 'stale group leaves canonical balance untouched');

INSERT INTO review_outcomes
SELECT case_name, public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name IN
  ('foreign_account_collision','deleted_account_collision','late_foreign_category','spoofed_zero_root');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='foreign_account_collision'),
  'foreign occupied create ID rejects rather than reparent/upsert');
SELECT ok((SELECT NOT (COALESCE(outcome->'canonicalAbsentAccountIds','[]'::jsonb)
    ? pg_temp.r395_id(104)::text)
    AND NOT (COALESCE(outcome->'canonicalAccounts','[]'::jsonb)
      @> jsonb_build_array(jsonb_build_object('accountId',pg_temp.r395_id(104))))
  FROM review_outcomes WHERE case_name='foreign_account_collision'),
  'foreign collision is not reported absent and discloses no foreign account snapshot');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(104)),
  0::bigint, 'authenticated owner cannot read foreign account during collision');
SELECT is((SELECT count(*) FROM public.transactions WHERE id=pg_temp.r395_id(230)),
  0::bigint, 'foreign-ID collision saves no financial row');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='deleted_account_collision'),
  'deleted occupied account ID is not treated as absent');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(103)
  AND deleted AND name='Tombstoned ID'), 1::bigint,
  'own tombstoned account not overwritten by new create');
SELECT is((SELECT count(*) FROM public.transactions WHERE id=pg_temp.r395_id(231)),
  0::bigint, 'tombstone collision commits no new transaction');

SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='late_foreign_category'),
  'foreign category member rejects whole selected action');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(240)),
  0::bigint, 'failed later member rolls back prepared account create');
SELECT is((SELECT count(*) FROM public.account_sms_senders WHERE id=pg_temp.r395_id(241)),
  0::bigint, 'failed later member rolls back sender child');
SELECT is((SELECT count(*) FROM public.transactions WHERE id=pg_temp.r395_id(242)),
  0::bigint, 'failed later member rolls back financial row');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1109) AND is_effective), 0::bigint,
  'failed later member leaves no effective effect');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='spoofed_zero_root'),
  'zero effect cannot be smuggled under legacy kind=create');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1110) AND is_effective), 0::bigint,
  'wrong-root zero effect never becomes effective');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN
  (pg_temp.r395_id(250),pg_temp.r395_id(251))), 0::bigint,
  'spoofed root does not save the transaction pair');

-- Positive v1 baseline also guards nonzero-only v1 rejection.
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM review_inputs WHERE case_name='legacy_zero_rejected'),
  'rejected', 'old transaction.create tuple still rejects zero effect');
SELECT is((SELECT count(*) FROM public.transactions WHERE id=pg_temp.r395_id(1002)),
  0::bigint, 'old zero attempt does not persist a transaction');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1102)), 0::bigint,
  'old zero attempt does not persist an effect');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(105)),
  49::numeric, 'old zero attempt leaves baseline balance untouched');

SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE',
  'deferred root/effect correspondence rejects no accepted new tuple');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(104)
  AND user_id=pg_temp.r395_id(2)), 1::bigint,
  'privileged postcheck confirms foreign owner row remains');
SELECT * FROM finish();
ROLLBACK;
