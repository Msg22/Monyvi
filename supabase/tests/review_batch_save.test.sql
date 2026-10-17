-- #395 T045: strict selected-review financial action. Expected RED until migrations 090/091 register the new tuples:
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
  (pg_temp.r395_id(2), 'authenticated', 'authenticated', 'sql395-review-foreign@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.r395_id(3), 'authenticated', 'authenticated', 'sql395-review-first-cash@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.r395_id(4), 'authenticated', 'authenticated', 'sql395-review-first-bank@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.r395_id(5), 'authenticated', 'authenticated', 'sql395-review-first-wallet@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.r395_id(6), 'authenticated', 'authenticated', 'sql395-review-multicash@monyvi.test', 'unused', '{}', '{}'),
  (pg_temp.r395_id(7), 'authenticated', 'authenticated', 'sql395-review-no-default@monyvi.test', 'unused', '{}', '{}');

INSERT INTO public.accounts
  (id, user_id, name, type, balance, currency, financial_revision, is_default, deleted)
VALUES
  (pg_temp.r395_id(101), pg_temp.r395_id(1), 'Existing Bank', 'BANK', 100, 'EGP', 0, true, false),
  (pg_temp.r395_id(102), pg_temp.r395_id(1), 'Cash Destination', 'CASH', 75, 'EGP', 0, false, false),
  (pg_temp.r395_id(103), pg_temp.r395_id(1), 'Tombstoned ID', 'BANK', 0, 'EGP', 0, false, true),
  (pg_temp.r395_id(104), pg_temp.r395_id(2), 'Foreign ID', 'BANK', 9, 'EGP', 0, false, false),
  (pg_temp.r395_id(105), pg_temp.r395_id(1), 'Legacy Baseline', 'CASH', 50, 'EGP', 0, false, false),
  (pg_temp.r395_id(170), pg_temp.r395_id(7), 'Active Without Default', 'CASH', 0, 'EGP', 0, false, false);

INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level)
VALUES
  (pg_temp.r395_id(10), pg_temp.r395_id(1), 'review-fixture', 'Review Fixture', 'wallet', 1),
  (pg_temp.r395_id(11), pg_temp.r395_id(2), 'foreign-review-fixture', 'Foreign Fixture', 'wallet', 1),
  (pg_temp.r395_id(12), pg_temp.r395_id(3), 'cash-review-fixture', 'Cash Fixture', 'wallet', 1),
  (pg_temp.r395_id(13), pg_temp.r395_id(4), 'bank-review-fixture', 'Bank Fixture', 'wallet', 1),
  (pg_temp.r395_id(14), pg_temp.r395_id(5), 'wallet-review-fixture', 'Wallet Fixture', 'wallet', 1),
  (pg_temp.r395_id(15), pg_temp.r395_id(6), 'multi-cash-review-fixture', 'Multi Cash Fixture', 'wallet', 1),
  (pg_temp.r395_id(16), pg_temp.r395_id(7), 'no-default-review-fixture', 'No Default Fixture', 'wallet', 1);

-- Produce the exact persisted mutation field vocabulary; no ad-hoc SQL RPC.
CREATE FUNCTION pg_temp.r395_transaction(
  p_id uuid, p_account uuid, p_amount text, p_kind text, p_source text,
  p_fingerprint text, p_category uuid, p_currency text DEFAULT 'EGP'
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'entity', 'transaction', 'mode', 'create', 'expectedUpdatedAt', null,
    'after', jsonb_build_object(
      'id', p_id, 'accountId', p_account, 'amountMinorUnits', p_amount,
      'currency', p_currency, 'type', p_kind, 'categoryId', p_category,
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
      'amountMinorUnits', '2505', 'convertedAmountMinorUnits', null,
      'exchangeRate', null, 'currency', 'EGP', 'date', '2026-09-01',
      'notes', null, 'smsFingerprint', p_fingerprint,
      'createdAt', '2026-09-01T12:00:00.000Z', 'deleted', false))
$$;

CREATE FUNCTION pg_temp.r395_account(
  p_id uuid, p_name text, p_type text DEFAULT 'BANK',
  p_currency text DEFAULT 'EGP', p_default boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity', 'account', 'mode', 'create',
    'expectedUpdatedAt', null, 'after', jsonb_build_object(
      'id', p_id, 'name', p_name, 'type', p_type, 'currency', p_currency,
      'institutionId', null, 'providerDisplayName', null,
      'isDefault', p_default, 'createdAt', '2026-09-01T12:00:00.000Z',
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

CREATE FUNCTION pg_temp.r395_effect(
  p_id uuid, p_minor text, p_effect uuid, p_currency text DEFAULT 'EGP'
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId', p_id, 'amountMinorUnits', p_minor,
    'currency', p_currency, 'effectId', p_effect)
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

CREATE FUNCTION pg_temp.r395_snapshot(p_active jsonb, p_default uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('activeAccountIds', p_active,
    'defaultAccount', CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId', p_default, 'isDefault', true) END)
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

-- Owner1's initial current logical snapshot; other owners override explicitly.
-- The optional key exists if and only if the mutation creates any account.
CREATE FUNCTION pg_temp.r395_review_envelope(
  p_action uuid, p_source text, p_records jsonb, p_guards jsonb,
  p_effects jsonb, p_selected jsonb, p_groups jsonb, p_bookkeeping jsonb,
  p_snapshot jsonb DEFAULT pg_temp.r395_snapshot(
    jsonb_build_array(pg_temp.r395_id(101), pg_temp.r395_id(102),
      pg_temp.r395_id(105)), pg_temp.r395_id(101)),
  p_owner uuid DEFAULT pg_temp.r395_id(1)
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion', 'monyvi.financial-action/v1',
    'userId', p_owner, 'actionId', p_action,
    'domain', 'transactions', 'kind', 'review_batch_save',
    'domainReferenceId', (
      SELECT (r.value->'after'->>'id')::uuid
      FROM jsonb_array_elements(p_records) AS r(value)
      WHERE r.value->>'entity' IN ('transaction', 'transfer')
      ORDER BY (r.value->'after'->>'id') COLLATE "C" LIMIT 1),
    'occurredAt', '2026-09-01T12:00:00.000Z',
    'payloadVersion', 'review.batch-save/v1',
    'accountGuards', p_guards,
    'payload', (jsonb_build_object(
      'schemaVersion', 'review.batch-save/v1', 'operationCode', 'review.batch-save',
      'source', p_source, 'sessionId', pg_temp.r395_id(900),
      'frozenIntentDigest', pg_temp.r395_fixture_digest(p_action),
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
      'localSmsBookkeeping', p_bookkeeping)
      || CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_records) AS r(value)
        WHERE r.value->>'entity'='account' AND r.value->>'mode'='create'
      ) THEN jsonb_build_object('creationDefaultSnapshot',p_snapshot)
      ELSE '{}'::jsonb END))
$$;

-- Use only for synthetic fixture forks; keep the digest paired with the
-- newly chosen action identity. The server must treat the value as opaque.
CREATE FUNCTION pg_temp.r395_rekey_review(p_envelope jsonb,p_action uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(
    jsonb_set(p_envelope,'{actionId}',to_jsonb(p_action)),
    '{payload,frozenIntentDigest}',
    to_jsonb(pg_temp.r395_fixture_digest(p_action)))
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

CREATE FUNCTION pg_temp.r395_use_owner(p_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_id::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',p_id,'role','authenticated')::text,true);
END;
$$;

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
  -- Mixed SMS first-save: selected physical draft set S has two opaque
  -- cleanup entries, while the genuinely NEW financial subset U has one
  -- transaction/source ref. The second already-saved selection contributes
  -- no second financial record. SQL tests shape, not device-only membership.
  ('sms_two_delete_one_financial', pg_temp.r395_review_envelope(
    pg_temp.r395_id(1111), 'SMS',
    jsonb_build_array(
      pg_temp.r395_transaction(pg_temp.r395_id(270),pg_temp.r395_id(102),
        '777','INCOME','SMS',repeat('6',64),pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(102),'1')),
    jsonb_build_array(pg_temp.r395_effect(
      pg_temp.r395_id(102),'777',pg_temp.r395_id(1240))),
    jsonb_build_array(pg_temp.r395_source(
      pg_temp.r395_id(640),pg_temp.r395_id(270),repeat('6',64))),
    '[]'::jsonb,
    jsonb_build_array(
      pg_temp.r395_bookkeeping(
        pg_temp.r395_id(820),pg_temp.r395_id(830),'delete_saved'),
      jsonb_set(
        jsonb_set(
          pg_temp.r395_bookkeeping(
            pg_temp.r395_id(821),pg_temp.r395_id(830),'delete_saved'),
          '{snapshotHash}',to_jsonb(repeat('b',64))),
        '{expectedReviewRevision}',to_jsonb('2'::text))))),
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
      pg_temp.r395_bank(pg_temp.r395_id(224), pg_temp.r395_id(220)),
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
      pg_temp.r395_bank(pg_temp.r395_id(232), pg_temp.r395_id(104)),
      pg_temp.r395_transaction(pg_temp.r395_id(230), pg_temp.r395_id(104), '100', 'INCOME', 'VOICE', null, pg_temp.r395_id(10))),
    jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(104), '0')),
    jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(104), '100', pg_temp.r395_id(1209))),
    jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(618), pg_temp.r395_id(230), null)),
    jsonb_build_array(jsonb_build_object('groupId', pg_temp.r395_id(703),
      'revision', '1', 'accountId', pg_temp.r395_id(104))), '[]'::jsonb)),
  ('deleted_account_collision', pg_temp.r395_review_envelope(pg_temp.r395_id(1108), 'VOICE',
    jsonb_build_array(
      pg_temp.r395_account(pg_temp.r395_id(103), 'Forged Deleted Create'),
      pg_temp.r395_bank(pg_temp.r395_id(233), pg_temp.r395_id(103)),
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
      pg_temp.r395_bank(pg_temp.r395_id(243), pg_temp.r395_id(240)),
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


-- Fully canonical new-account vectors; no new default can be guessed from
-- confirmation order or from a Cash-only singleton. The source snapshots below
-- are frozen before the actions and remain owned by the stated actor.
INSERT INTO review_inputs(case_name,envelope) VALUES
 ('first_cash',pg_temp.r395_review_envelope(pg_temp.r395_id(1150),'VOICE',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(300),'First Cash','CASH','EGP',true),
     pg_temp.r395_transaction(pg_temp.r395_id(310),pg_temp.r395_id(300),
       '2500','INCOME','VOICE',null,pg_temp.r395_id(12))),
   jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(300),'0')),
   jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(300),'2500',pg_temp.r395_id(1230))),
   jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(630),pg_temp.r395_id(310),null)),
   jsonb_build_array(jsonb_build_object('groupId',pg_temp.r395_id(710),
     'revision','1','accountId',pg_temp.r395_id(300))),
   '[]'::jsonb,pg_temp.r395_snapshot('[]'::jsonb,null),pg_temp.r395_id(3))),
 ('first_bank',pg_temp.r395_review_envelope(pg_temp.r395_id(1151),'VOICE',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(320),'First Bank','BANK','EGP',true),
     pg_temp.r395_bank(pg_temp.r395_id(321),pg_temp.r395_id(320)),
     pg_temp.r395_transaction(pg_temp.r395_id(322),pg_temp.r395_id(320),
       '150','INCOME','VOICE',null,pg_temp.r395_id(13))),
   jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(320),'0')),
   jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(320),'150',pg_temp.r395_id(1231))),
   jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(631),pg_temp.r395_id(322),null)),
   jsonb_build_array(jsonb_build_object('groupId',pg_temp.r395_id(711),
     'revision','1','accountId',pg_temp.r395_id(320))),
   '[]'::jsonb,pg_temp.r395_snapshot('[]'::jsonb,null),pg_temp.r395_id(4))),
 ('first_wallet',pg_temp.r395_review_envelope(pg_temp.r395_id(1152),'VOICE',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(340),'First Wallet','DIGITAL_WALLET','EGP',true),
     pg_temp.r395_transaction(pg_temp.r395_id(341),pg_temp.r395_id(340),
       '300','INCOME','VOICE',null,pg_temp.r395_id(14))),
   jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(340),'0')),
   jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(340),'300',pg_temp.r395_id(1232))),
   jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(632),pg_temp.r395_id(341),null)),
   jsonb_build_array(jsonb_build_object('groupId',pg_temp.r395_id(712),
     'revision','1','accountId',pg_temp.r395_id(340))),
   '[]'::jsonb,pg_temp.r395_snapshot('[]'::jsonb,null),pg_temp.r395_id(5))),
 ('first_multicash',pg_temp.r395_review_envelope(pg_temp.r395_id(1153),'VOICE',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(350),'First USD Cash','CASH','USD',true),
     pg_temp.r395_account(pg_temp.r395_id(360),'Second EGP Cash','CASH','EGP',false),
     pg_temp.r395_transaction(pg_temp.r395_id(351),pg_temp.r395_id(350),
       '500','INCOME','VOICE',null,pg_temp.r395_id(15),'USD'),
     pg_temp.r395_transaction(pg_temp.r395_id(361),pg_temp.r395_id(360),
       '700','INCOME','VOICE',null,pg_temp.r395_id(15))),
   jsonb_build_array(
     pg_temp.r395_guard(pg_temp.r395_id(350),'0'),
     pg_temp.r395_guard(pg_temp.r395_id(360),'0')),
   jsonb_build_array(
     pg_temp.r395_effect(pg_temp.r395_id(350),'500',pg_temp.r395_id(1233),'USD'),
     pg_temp.r395_effect(pg_temp.r395_id(360),'700',pg_temp.r395_id(1234))),
   jsonb_build_array(
     pg_temp.r395_source(pg_temp.r395_id(633),pg_temp.r395_id(351),null),
     pg_temp.r395_source(pg_temp.r395_id(634),pg_temp.r395_id(361),null)),
   jsonb_build_array(
     jsonb_build_object('groupId',pg_temp.r395_id(713),
       'revision','1','accountId',pg_temp.r395_id(350)),
     jsonb_build_object('groupId',pg_temp.r395_id(714),
       'revision','1','accountId',pg_temp.r395_id(360))),
   '[]'::jsonb,pg_temp.r395_snapshot('[]'::jsonb,null),pg_temp.r395_id(6))),
 ('later_off_no_default',pg_temp.r395_review_envelope(pg_temp.r395_id(1154),'VOICE',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(380),'Later Cash','CASH','EGP',false),
     pg_temp.r395_transaction(pg_temp.r395_id(381),pg_temp.r395_id(380),
       '100','INCOME','VOICE',null,pg_temp.r395_id(16))),
   jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(380),'0')),
   jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(380),'100',pg_temp.r395_id(1237))),
   jsonb_build_array(pg_temp.r395_source(pg_temp.r395_id(637),pg_temp.r395_id(381),null)),
   jsonb_build_array(jsonb_build_object('groupId',pg_temp.r395_id(715),
     'revision','1','accountId',pg_temp.r395_id(380))),
   '[]'::jsonb,pg_temp.r395_snapshot(
     jsonb_build_array(pg_temp.r395_id(170)),null),pg_temp.r395_id(7))),
 ('ungrouped_atm_cash',pg_temp.r395_review_envelope(pg_temp.r395_id(1186),'SMS',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(290),'Invented ATM Cash','CASH'),
     pg_temp.r395_transfer(pg_temp.r395_id(291),
       pg_temp.r395_id(101),pg_temp.r395_id(290),repeat('5',64))),
   jsonb_build_array(
     pg_temp.r395_guard(pg_temp.r395_id(101),'0'),
     pg_temp.r395_guard(pg_temp.r395_id(290),'0')),
   jsonb_build_array(
     pg_temp.r395_effect(pg_temp.r395_id(101),'-2505',pg_temp.r395_id(1235)),
     pg_temp.r395_effect(pg_temp.r395_id(290),'2505',pg_temp.r395_id(1236))),
   jsonb_build_array(pg_temp.r395_source(
     pg_temp.r395_id(635),pg_temp.r395_id(291),repeat('5',64))),
   '[]'::jsonb,'[]'::jsonb)),
 ('bank_missing_details',pg_temp.r395_review_envelope(pg_temp.r395_id(1187),'SMS',
   jsonb_build_array(
     pg_temp.r395_account(pg_temp.r395_id(200),'Suggested QNB'),
     pg_temp.r395_sender(pg_temp.r395_id(201),pg_temp.r395_id(200)),
     pg_temp.r395_transaction(pg_temp.r395_id(210),pg_temp.r395_id(200),
       '2001','INCOME','SMS',repeat('1',64),pg_temp.r395_id(10)),
     pg_temp.r395_transaction(pg_temp.r395_id(211),pg_temp.r395_id(200),
       '501','EXPENSE','SMS',repeat('2',64),pg_temp.r395_id(10))),
   jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(200),'0')),
   jsonb_build_array(pg_temp.r395_effect(pg_temp.r395_id(200),'1500',pg_temp.r395_id(1204))),
   jsonb_build_array(
     pg_temp.r395_source(pg_temp.r395_id(612),pg_temp.r395_id(210),repeat('1',64)),
     pg_temp.r395_source(pg_temp.r395_id(613),pg_temp.r395_id(211),repeat('2',64))),
   jsonb_build_array(jsonb_build_object('groupId',pg_temp.r395_id(701),
     'revision','1','accountId',pg_temp.r395_id(200))),
   jsonb_build_array(
     pg_temp.r395_bookkeeping(pg_temp.r395_id(800),pg_temp.r395_id(810),'delete_saved'),
     pg_temp.r395_bookkeeping(pg_temp.r395_id(801),pg_temp.r395_id(810),'delete_saved'),
     pg_temp.r395_bookkeeping(pg_temp.r395_id(802),pg_temp.r395_id(810),'rebind_remaining'))));

-- These negatives are derived from the otherwise complete Bank and zero-net
-- fixtures, so their only intended fault is the explicitly altered wire field.
INSERT INTO review_inputs(case_name,envelope)
SELECT 'creation_snapshot_absent',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1180))),
  '{payload}',((envelope->'payload') - 'creationDefaultSnapshot'::text))
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'old_cash_snapshot_key',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1181))),
  '{payload}',((envelope->'payload') - 'creationDefaultSnapshot'::text) ||
  jsonb_build_object('cashDefaultSnapshot',envelope->'payload'->'creationDefaultSnapshot'))
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'stale_creation_snapshot',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1182))),
  '{payload,creationDefaultSnapshot,activeAccountIds}',
  jsonb_build_array(pg_temp.r395_id(101),pg_temp.r395_id(105)))
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'incorrect_existing_default',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1183))),
  '{payload,domainMutation,records,0,after,isDefault}','true'::jsonb)
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'snapshot_without_create',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1184))),
  '{payload}',(envelope->'payload') ||
    jsonb_build_object('creationDefaultSnapshot',
      pg_temp.r395_snapshot(
        jsonb_build_array(pg_temp.r395_id(101),pg_temp.r395_id(102),pg_temp.r395_id(105)),
        pg_temp.r395_id(101))))
FROM review_inputs WHERE case_name='zero_net';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'new_bank_no_confirmed_group',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1188))),
  '{payload,confirmedGroupRefs}','[]'::jsonb)
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'cash_with_bank_child',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1185))),
  '{payload,domainMutation,records}',
  jsonb_build_array(
    pg_temp.r395_account(pg_temp.r395_id(300),'First Cash','CASH','EGP',true),
    pg_temp.r395_bank(pg_temp.r395_id(309),pg_temp.r395_id(300)),
    pg_temp.r395_transaction(pg_temp.r395_id(310),pg_temp.r395_id(300),
      '2500','INCOME','VOICE',null,pg_temp.r395_id(12))))
FROM review_inputs WHERE case_name='first_cash';
-- For this deliberately invalid child, keep guards and refs *consistent*
-- with the altered mutation so failure cannot be from a missing create guard.
UPDATE review_inputs SET envelope=jsonb_set(jsonb_set(envelope,
  '{payload,createGuards}',jsonb_build_array(
    jsonb_build_object('entity','account','id',pg_temp.r395_id(300),'expectedAbsent',true),
    jsonb_build_object('entity','bank_details','id',pg_temp.r395_id(309),'expectedAbsent',true),
    jsonb_build_object('entity','transaction','id',pg_temp.r395_id(310),'expectedAbsent',true))),
  '{payload,domainRecordRefs}',
  jsonb_build_array(pg_temp.r395_id(300),pg_temp.r395_id(309),pg_temp.r395_id(310)))
WHERE case_name='cash_with_bank_child';

-- Strict review-only digest boundary: all four cases derive from the
-- otherwise complete Bank tuple and run before its positive registration.
-- Fixture hashes are synthetic commitments, not SQL reconstruction of source.
INSERT INTO review_inputs(case_name,envelope)
SELECT 'missing_frozen_intent_digest',jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.r395_id(1190))),
  '{payload}',(envelope->'payload') - 'frozenIntentDigest'::text)
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'uppercase_frozen_intent_digest',jsonb_set(
  pg_temp.r395_rekey_review(envelope,pg_temp.r395_id(1191)),
  '{payload,frozenIntentDigest}',to_jsonb(repeat('A',64)))
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'short_frozen_intent_digest',jsonb_set(
  pg_temp.r395_rekey_review(envelope,pg_temp.r395_id(1192)),
  '{payload,frozenIntentDigest}',to_jsonb(repeat('a',63)))
FROM review_inputs WHERE case_name='new_bank_selected';
INSERT INTO review_inputs(case_name,envelope)
SELECT 'embedded_payload_hash_field',jsonb_set(
  pg_temp.r395_rekey_review(envelope,pg_temp.r395_id(1193)),
  '{payload,payloadHash}',to_jsonb(repeat('f',64)),true)
FROM review_inputs WHERE case_name='new_bank_selected';

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

-- Strict new review field/default/child checks run BEFORE the shared-bank
-- positive so an invalid case cannot be rejected solely by an occupied ID.
-- All use complete canonical envelopes apart from the explicitly named fault.
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name IN (
  'creation_snapshot_absent','old_cash_snapshot_key',
  'stale_creation_snapshot','incorrect_existing_default',
  'snapshot_without_create','bank_missing_details','ungrouped_atm_cash',
  'new_bank_no_confirmed_group',
  'missing_frozen_intent_digest','uppercase_frozen_intent_digest',
  'short_frozen_intent_digest','embedded_payload_hash_field'
);
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='creation_snapshot_absent'),
  'review create requires creationDefaultSnapshot even when bank account/guards valid');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='old_cash_snapshot_key'),
  'superseded cashDefaultSnapshot cannot authorize review creation');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='stale_creation_snapshot'),
  'captured active owned UUID set must match actual current logical state');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='incorrect_existing_default'),
  'review create cannot set a second default when active owned accounts exist');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='snapshot_without_create'),
  'review must omit creationDefaultSnapshot with existing-account-only actions');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='bank_missing_details'),
  'a new BANK requires exactly one owned bank_details child');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='ungrouped_atm_cash'),
  'ATM cannot invent an unconfirmed ungrouped Cash destination');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='new_bank_no_confirmed_group'),
  'new review account cannot be created without an actual confirmed group reference');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='missing_frozen_intent_digest'),
  'new review tuple rejects omitted required frozenIntentDigest');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='uppercase_frozen_intent_digest'),
  'new review tuple rejects non-lowercase frozenIntentDigest');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='short_frozen_intent_digest'),
  'new review tuple rejects wrong-length frozenIntentDigest');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='embedded_payload_hash_field'),
  'new review tuple rejects unexpected transport payloadHash nested in payload');
SELECT ok((SELECT (envelope->'payload'->>'frozenIntentDigest')
    ~ '^[0-9a-f]{64}$'
    AND (envelope->'payload'->>'frozenIntentDigest') <> payload_hash
  FROM review_inputs WHERE case_name='new_bank_selected'),
  'valid review fixture carries opaque SHA256-shaped digest distinct from envelope payloadHash');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE id IN (pg_temp.r395_id(200),pg_temp.r395_id(290))),0::bigint,
  'invalid new-account review cases create no account or default');
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN
  (pg_temp.r395_id(210),pg_temp.r395_id(211))),0::bigint,
  'invalid BANK detail/creation snapshot saves no financial row');
SELECT is((SELECT count(*) FROM public.transfers
  WHERE id=pg_temp.r395_id(291)),0::bigint,
  'invalid ungrouped ATM leaves no transfer');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.r395_id(101)),
  100::numeric,'failed review validation leaves prior owned balance unchanged');
SELECT is((SELECT financial_revision FROM public.accounts
  WHERE id=pg_temp.r395_id(101)),0::bigint,
  'failed review validation does not advance affected account revisions');

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
-- SQL can prove complete server mutation validation, not producer omission of
-- unrelated review groups. Actual selected-only/no-unused-group coverage is T043.
SELECT is((SELECT envelope->'payload'->'confirmedGroupRefs'
  FROM review_inputs WHERE case_name='new_bank_selected'),
  jsonb_build_array(jsonb_build_object(
    'groupId',pg_temp.r395_id(701),'revision','1','accountId',pg_temp.r395_id(200))),
  'SQL fixture binds only selected group; unused-group suppression belongs to T043');

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


-- Owner3: no preexisting account. First active CASH is default and has no
-- bank_details/account_sms_sender child; invalid child must fail before it.
SELECT pg_temp.r395_use_owner(pg_temp.r395_id(3));
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='cash_with_bank_child';
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM review_outcomes WHERE case_name='cash_with_bank_child'),
  'Cash account cannot carry a fabricated bank_details child');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(300)),
  0::bigint,'invalid Cash child cannot create its parent account');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.r395_id(309)),
  0::bigint,'invalid Cash child cannot persist independently');
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='first_cash';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='first_cash'),
  'accepted','first CASH review creation accepts with empty frozen snapshot');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(300)
  AND user_id=pg_temp.r395_id(3) AND type='CASH' AND currency='EGP'
  AND is_default AND balance=25 AND financial_revision=1),1::bigint,
  'first active CASH gets one true default flag and posted balance');
SELECT is((SELECT count(*) FROM public.bank_details WHERE account_id=pg_temp.r395_id(300)),
  0::bigint,'CASH creation must not fabricate bank child');
SELECT is((SELECT count(*) FROM public.account_sms_senders
  WHERE account_id=pg_temp.r395_id(300)),0::bigint,
  'CASH creation has no invented SMS sender alias');

-- Owner4: one new BANK, complete exactly-one bank child, no older default.
SELECT pg_temp.r395_use_owner(pg_temp.r395_id(4));
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='first_bank';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='first_bank'),
  'accepted','first BANK review creation uses the same empty snapshot contract');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(320)
  AND user_id=pg_temp.r395_id(4) AND type='BANK' AND is_default
  AND balance=1.5 AND financial_revision=1),1::bigint,
  'first active BANK defaults and posts its exact selected income');
SELECT is((SELECT count(*) FROM public.bank_details
  WHERE account_id=pg_temp.r395_id(320) AND id=pg_temp.r395_id(321)
    AND card_last_4=7),1::bigint,
  'new BANK has exactly one owned bank_details child with 0007 suffix');
SELECT is((SELECT count(*) FROM public.bank_details WHERE account_id=pg_temp.r395_id(320)),
  1::bigint,'BANK child count is exactly one');

-- Owner5: first DIGITAL_WALLET is also default; no Bank child.
SELECT pg_temp.r395_use_owner(pg_temp.r395_id(5));
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='first_wallet';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='first_wallet'),
  'accepted','first WALLET review creation uses the same default snapshot');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(340)
  AND user_id=pg_temp.r395_id(5) AND type='DIGITAL_WALLET'
  AND is_default AND balance=3 AND financial_revision=1),1::bigint,
  'first active WALLET becomes default with one posted selected effect');
SELECT is((SELECT count(*) FROM public.bank_details WHERE account_id=pg_temp.r395_id(340)),
  0::bigint,'new Wallet has no invented BANK child');

-- Owner6: two independent confirmed Voice Cash groups in EGP/USD. The
-- smallest actual frozen account-create UUID (350) wins default regardless
-- of group name, transaction currency or record arrival order.
SELECT pg_temp.r395_use_owner(pg_temp.r395_id(6));
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='first_multicash';
SELECT is((SELECT outcome->>'status' FROM review_outcomes WHERE case_name='first_multicash'),
  'accepted','two confirmed Voice Cash currencies are valid in one selected Save');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.r395_id(6) AND NOT deleted),2::bigint,
  'multi-Cash Save creates exactly two owned active accounts');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(350)
  AND user_id=pg_temp.r395_id(6) AND type='CASH' AND currency='USD'
  AND is_default AND balance=5 AND financial_revision=1),1::bigint,
  'minimum frozen Cash UUID receives default flag, even in USD');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(360)
  AND user_id=pg_temp.r395_id(6) AND type='CASH' AND currency='EGP'
  AND NOT is_default AND balance=7 AND financial_revision=1),1::bigint,
  'other independently confirmed EGP Cash retains false default');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.r395_id(6) AND NOT deleted AND is_default),1::bigint,
  'one default only across two different created Cash currencies');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1153) AND is_effective),2::bigint,
  'both Voice Cash currencies contribute exactly one own-currency effect');
SELECT is((SELECT count(*) FROM public.bank_details WHERE account_id IN
  (pg_temp.r395_id(350),pg_temp.r395_id(360))),0::bigint,
  'multi-Cash Save never creates phantom bank child rows');

-- Owner7: prior active Cash but intentionally no default. The new
-- confirmed Cash remains NOT DEFAULT and does not add a default toggle.
SELECT pg_temp.r395_use_owner(pg_temp.r395_id(7));
INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='later_off_no_default';
SELECT is((SELECT outcome->>'status' FROM review_outcomes
  WHERE case_name='later_off_no_default'),'accepted',
  'nonempty active/no-default review Save preserves the intentional no-default state');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.r395_id(7) AND NOT deleted AND is_default),0::bigint,
  'review-created account does not set a default when any active owned account exists');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(380)
  AND NOT is_default AND type='CASH' AND balance=1 AND financial_revision=1),
  1::bigint,'later review-created Cash posts selected delta without default change');

-- Canonical field barrier on prepared logical owner1 group: default snapshots
-- are required iff any account is created, and must use the accepted key.
SELECT is((SELECT envelope->'payload'->'creationDefaultSnapshot'
  FROM review_inputs WHERE case_name='new_bank_selected'),
  pg_temp.r395_snapshot(jsonb_build_array(
    pg_temp.r395_id(101),pg_temp.r395_id(102),pg_temp.r395_id(105)),
    pg_temp.r395_id(101)),
  'new BANK payload freezes all existing active IDs and current default');
SELECT ok((SELECT NOT(envelope->'payload' ? 'creationDefaultSnapshot')
  FROM review_inputs WHERE case_name='zero_net'),
  'existing-account review omits creationDefaultSnapshot entirely');
SELECT ok((SELECT NOT(envelope->'payload' ? 'cashDefaultSnapshot')
  FROM review_inputs WHERE case_name='new_bank_selected'),
  'new review Save never emits superseded cashDefaultSnapshot field');
SELECT is((SELECT envelope->'payload'->'creationDefaultSnapshot'
  FROM review_inputs WHERE case_name='first_multicash'),
  pg_temp.r395_snapshot('[]'::jsonb,null),
  'multiple planned accounts share one frozen empty logical snapshot');

-- SQL090 compatibility: two selected owned-queue SMS draft cleanup
-- descriptors (S), ONE new financial create/source ref (U). The first
-- selection may already have been saved: SQL only validates canonical shape,
-- not actual device queue ownership, fingerprint history, or S=U union A.
-- That positive first-write and selected physical membership proof belongs
-- to the authenticated device Save writer. No public/private wire changes.
-- Run last: account 102's correct guarded revision is now 1 after the ATM
-- positive; running earlier would invalidate that existing scenario.
SELECT pg_temp.r395_use_owner(pg_temp.r395_id(1));
SELECT is((SELECT jsonb_array_length(envelope->'payload'->'localSmsBookkeeping')
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),2,
  'mixed SMS action keeps both selected draft deletions in one payload');
SELECT is((SELECT jsonb_array_length(envelope->'payload'->'selectedSourceRefs')
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),1,
  'only the one new financial record gets a selectedSourceRef');
SELECT is((SELECT jsonb_array_length(envelope->'payload'->'domainMutation'->'records')
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),1,
  'deduplicated SMS selection does not synthesize a second mutation');
SELECT is((SELECT envelope->'payload'->'selectedSourceRefs'
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),
  jsonb_build_array(pg_temp.r395_source(
    pg_temp.r395_id(640),pg_temp.r395_id(270),repeat('6',64))),
  'one selected source has exactly the created transaction ID and fingerprint');
SELECT is((SELECT jsonb_agg(b.value->>'draftId' ORDER BY b.ordinality)
  FROM review_inputs AS input
  CROSS JOIN LATERAL jsonb_array_elements(
    input.envelope->'payload'->'localSmsBookkeeping')
    WITH ORDINALITY AS b(value,ordinality)
  WHERE input.case_name='sms_two_delete_one_financial'),
  jsonb_build_array(pg_temp.r395_id(820)::text,pg_temp.r395_id(821)::text),
  'both opaque selected draft IDs are ASCII-sorted in original order');
SELECT is((SELECT count(DISTINCT b.value->>'draftId')
  FROM review_inputs AS input
  CROSS JOIN LATERAL jsonb_array_elements(
    input.envelope->'payload'->'localSmsBookkeeping') AS b(value)
  WHERE input.case_name='sms_two_delete_one_financial'),2::bigint,
  'selected SMS cleanup draft IDs are distinct, with no duplicate deletion');
SELECT is((SELECT jsonb_agg(jsonb_build_array(
    b.value->>'queueId',b.value->>'snapshotHash',
    b.value->>'expectedReviewRevision',b.value->>'operation')
    ORDER BY b.ordinality)
  FROM review_inputs AS input
  CROSS JOIN LATERAL jsonb_array_elements(
    input.envelope->'payload'->'localSmsBookkeeping')
    WITH ORDINALITY AS b(value,ordinality)
  WHERE input.case_name='sms_two_delete_one_financial'),
  jsonb_build_array(
    jsonb_build_array(pg_temp.r395_id(830)::text,repeat('a',64),'1','delete_saved'),
    jsonb_build_array(pg_temp.r395_id(830)::text,repeat('b',64),'2','delete_saved')),
  'both entries retain their original opaque queue, hash, revision and delete operation');
SELECT is((SELECT envelope->'accountGuards'
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),
  jsonb_build_array(pg_temp.r395_guard(pg_temp.r395_id(102),'1')),
  'only the existing owned Cash financial revision is guarded');
SELECT is((SELECT envelope->'payload'->>'frozenIntentDigest'
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),
  pg_temp.r395_fixture_digest(pg_temp.r395_id(1111)),
  'mixed SMS action retains its deterministic opaque frozen intent commitment');

INSERT INTO review_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM review_inputs WHERE case_name='sms_two_delete_one_financial';
SELECT is((SELECT outcome->>'status' FROM review_outcomes
  WHERE case_name='sms_two_delete_one_financial'),'accepted',
  'SQL090 accepts two structural delete_saved descriptors and one genuine new financial source');
SELECT is((SELECT count(*) FROM public.transactions
  WHERE id=pg_temp.r395_id(270) AND user_id=pg_temp.r395_id(1)
    AND account_id=pg_temp.r395_id(102)
    AND sms_fingerprint=repeat('6',64) AND NOT deleted),1::bigint,
  'exactly one owner-bound new SMS financial row persists with its fingerprint');
SELECT is((SELECT count(*) FROM public.transactions
  WHERE user_id=pg_temp.r395_id(1)),6::bigint,
  'owner has only the five prior accepted transactions plus one new row');
SELECT is((SELECT count(*) FROM public.transfers
  WHERE id=pg_temp.r395_id(270)),0::bigint,
  'mixed SMS action adds no phantom transfer');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.r395_id(1)),5::bigint,
  'mixed existing-account SMS Save creates no extra owner account');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1111)
    AND user_id=pg_temp.r395_id(1)
    AND account_id=pg_temp.r395_id(102)
    AND amount_minor_units=777
    AND accepted_account_revision=2 AND is_effective),1::bigint,
  'one exact existing-account effect records 777 minor units at revision two');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1111)),1::bigint,
  'two selected SMS draft deletions never double financial effects');
SELECT is((SELECT balance FROM public.accounts
  WHERE id=pg_temp.r395_id(102)),107.82::numeric,
  'existing Cash credits exactly 7.77 once after the earlier ATM result');
SELECT is((SELECT financial_revision FROM public.accounts
  WHERE id=pg_temp.r395_id(102)),2::bigint,
  'only one guarded revision increment occurs for mixed SMS Save');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE action_id=pg_temp.r395_id(1111) AND user_id=pg_temp.r395_id(1)
    AND domain='transactions' AND kind='review_batch_save'),1::bigint,
  'one authenticated review action root is persisted, not one per deleted draft');
SELECT ok((SELECT payload_json NOT LIKE '%original_transcript%'
    AND payload_json NOT LIKE '%"body"%'
    AND payload_json NOT LIKE '%"payloadJson"%'
    AND payload_json NOT LIKE '%"preimages"%'
    AND payload_json NOT LIKE '%"queuePreimage"%'
    AND payload_json NOT LIKE '%"smsBody"%'
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),
  'public mixed SMS request contains no raw SMS text or private queue preimages');
SELECT ok((SELECT g.payload_json=i.payload_json
    AND g.payload_hash=i.payload_hash
    AND g.payload_json NOT LIKE '%"body"%'
    AND g.payload_json NOT LIKE '%"queuePreimage"%'
  FROM public.financial_action_groups AS g
  JOIN review_inputs AS i ON g.action_id=(i.envelope->>'actionId')::uuid
  WHERE i.case_name='sms_two_delete_one_financial'),
  'committed root retains identical canonical public hash without private SMS evidence');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM review_inputs WHERE case_name='sms_two_delete_one_financial'),'idempotent',
  'identical mixed SMS action/hash replays without another financial write');
SELECT is((SELECT count(*) FROM public.transactions
  WHERE id=pg_temp.r395_id(270)),1::bigint,
  'mixed SMS replay never duplicates its single transaction');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.r395_id(1111)),1::bigint,
  'mixed SMS replay never duplicates its single financial effect');
SELECT is((SELECT financial_revision FROM public.accounts
  WHERE id=pg_temp.r395_id(102)),2::bigint,
  'mixed SMS replay never advances the guarded financial revision twice');

SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE',
  'deferred root/effect correspondence rejects no accepted new tuple');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.r395_id(104)
  AND user_id=pg_temp.r395_id(2)), 1::bigint,
  'privileged postcheck confirms foreign owner row remains');
SELECT * FROM finish();
ROLLBACK;
