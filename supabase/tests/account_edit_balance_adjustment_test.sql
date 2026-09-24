-- Issue #242 Slice 3B: account.edit-balance with adjustment transaction.
-- Focused pgTAP for the 076 RPC: silent single-record edits stay accepted,
-- two-record account+adjustment edits apply the delta exactly once, and
-- arbitrary/wrong records plus hash mismatches are rejected.
-- Runs against an isolated disposable DB (supabase test db --db-url).
BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('018f0c7a-1234-7abc-8def-000000000201', 'authenticated', 'authenticated', 'editbal-owner@monyvi.test', 'unused', '{}', '{}'),
  ('018f0c7a-1234-7abc-8def-000000000202', 'authenticated', 'authenticated', 'editbal-foreign@monyvi.test', 'unused', '{}', '{}');

INSERT INTO public.categories (id, user_id, system_name, display_name, icon, level)
VALUES
  ('018f0c7a-1234-7abc-8def-000000000242', '018f0c7a-1234-7abc-8def-000000000202', 'foreign-cat', 'Foreign', 'wallet', 1);

-- Fixture timestamps must survive verbatim: the server insert trigger would
-- otherwise rewrite updated_at to statement_timestamp() (microseconds) while
-- the RPC contract matches expectedUpdatedAt at millisecond precision.
ALTER TABLE public.accounts DISABLE TRIGGER accounts_set_server_insert_updated_at;
INSERT INTO public.accounts (id, user_id, name, type, balance, currency, financial_revision, created_at, updated_at, deleted, is_default)
VALUES
  ('018f0c7a-1234-7abc-8def-000000000211', '018f0c7a-1234-7abc-8def-000000000201', 'Silent', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000212', '018f0c7a-1234-7abc-8def-000000000201', 'Adjust up', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000213', '018f0c7a-1234-7abc-8def-000000000201', 'Adjust down', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000000201', 'Reject', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000215', '018f0c7a-1234-7abc-8def-000000000201', 'Mismatch', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000216', '018f0c7a-1234-7abc-8def-000000000202', 'Foreign', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000217', '018f0c7a-1234-7abc-8def-000000000201', 'DeleteTarget', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000218', '018f0c7a-1234-7abc-8def-000000000201', 'TypeTarget', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false),
  ('018f0c7a-1234-7abc-8def-000000000219', '018f0c7a-1234-7abc-8def-000000000201', 'CurrencyTarget', 'CASH', 100, 'EGP', 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z', false, false);
ALTER TABLE public.accounts ENABLE TRIGGER accounts_set_server_insert_updated_at;

-- Shared fragments: account update (target balance) and adjustment transaction.
-- The forged-mutation cases override deleted/type/currency via the trailing
-- defaults; legitimate edits always use the defaults.
CREATE FUNCTION pg_temp.edit_account_after(p_account text, p_target text, p_name text, p_deleted boolean DEFAULT false, p_type text DEFAULT 'CASH', p_currency text DEFAULT 'EGP')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'createdAt', '2026-09-01T12:00:00.000Z', 'currency', p_currency, 'deleted', p_deleted,
    'id', p_account, 'institutionId', null, 'isDefault', false, 'name', p_name,
    'openingBalanceMinorUnits', null, 'providerDisplayName', null,
    'targetBalanceMinorUnits', p_target, 'type', p_type);
$$;

CREATE FUNCTION pg_temp.edit_txn_after(p_txn text, p_account text, p_amount text, p_category text, p_type text, p_currency text DEFAULT 'EGP')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'accountId', p_account, 'amountMinorUnits', p_amount, 'categoryId', p_category,
    'counterparty', null, 'createdAt', '2026-09-01T12:00:00.000Z', 'currency', p_currency,
    'date', '2026-09-01', 'deleted', false, 'id', p_txn, 'isDraft', false,
    'linkedAssetId', null, 'linkedDebtId', null, 'linkedRecurringId', null,
    'note', 'Balance adjustment', 'smsFingerprint', null, 'source', 'MANUAL', 'type', p_type);
$$;

CREATE FUNCTION pg_temp.edit_envelope(p_action text, p_account text, p_delta text, p_records jsonb, p_refs jsonb, p_effect text, p_effect_currency text DEFAULT 'EGP')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'accountGuards', jsonb_build_array(jsonb_build_object('accountId', p_account, 'expectedRevision', '0')),
    'actionId', p_action, 'domain', 'accounts', 'domainReferenceId', p_account,
    'envelopeVersion', 'monyvi.financial-action/v1', 'kind', 'edit_balance',
    'occurredAt', '2026-09-01T12:00:00.000Z',
    'payload', jsonb_build_object(
      'accountEffects', jsonb_build_array(jsonb_build_object(
        'accountId', p_account, 'amountMinorUnits', p_delta, 'currency', p_effect_currency, 'effectId', p_effect)),
      'domainMutation', jsonb_build_object('records', p_records),
      'domainRecordRefs', p_refs,
      'operationCode', 'account.edit-balance', 'schemaVersion', 'account.balance-effects/v1'),
    'payloadVersion', 'account.balance-effects/v1',
    'userId', '018f0c7a-1234-7abc-8def-000000000201');
$$;

CREATE TEMP TABLE edit_inputs (name text PRIMARY KEY, envelope jsonb, payload_json text, payload_hash text);

-- Silent single-record edit: 100 -> 125 (delta +2500).
INSERT INTO edit_inputs(name, envelope) VALUES ('silent', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000301', '018f0c7a-1234-7abc-8def-000000000211', '2500',
  jsonb_build_array(jsonb_build_object(
    'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000211', '12500', 'Silent'),
    'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000211'),
  '018f0c7a-1234-7abc-8def-000000000401'));

-- Adjustment increase: 100 -> 150 (delta +5000) with INCOME evidence.
INSERT INTO edit_inputs(name, envelope) VALUES ('adjust_inc', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000302', '018f0c7a-1234-7abc-8def-000000000212', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000212', '15000', 'Adjust up'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001312', '018f0c7a-1234-7abc-8def-000000000212', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000212', '018f0c7a-1234-7abc-8def-000000001312'),
  '018f0c7a-1234-7abc-8def-000000000402'));

-- Adjustment decrease: 100 -> 75 (delta -2500) with EXPENSE evidence.
INSERT INTO edit_inputs(name, envelope) VALUES ('adjust_dec', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000303', '018f0c7a-1234-7abc-8def-000000000213', '-2500',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000213', '7500', 'Adjust down'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001313', '018f0c7a-1234-7abc-8def-000000000213', '2500', '00000000-0000-0000-0001-000000000201', 'EXPENSE'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000213', '018f0c7a-1234-7abc-8def-000000001313'),
  '018f0c7a-1234-7abc-8def-000000000403'));

-- Same actionId as silent but different target: replay with different payload.
INSERT INTO edit_inputs(name, envelope) VALUES ('silent_variant', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000301', '018f0c7a-1234-7abc-8def-000000000211', '3000',
  jsonb_build_array(jsonb_build_object(
    'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000211', '13000', 'Silent'),
    'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000211'),
  '018f0c7a-1234-7abc-8def-000000000401'));

-- Wrong amount: delta claims +5000 but evidence is only 4000.
INSERT INTO edit_inputs(name, envelope) VALUES ('wrong_amount', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000304', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001314', '018f0c7a-1234-7abc-8def-000000000214', '4000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001314'),
  '018f0c7a-1234-7abc-8def-000000000404'));

-- Foreign category: evidence links a category owned by another user.
INSERT INTO edit_inputs(name, envelope) VALUES ('foreign_category', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000305', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001315', '018f0c7a-1234-7abc-8def-000000000214', '5000', '018f0c7a-1234-7abc-8def-000000000242', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001315'),
  '018f0c7a-1234-7abc-8def-000000000405'));

-- Wrong sign: delta is +5000 but evidence is an EXPENSE.
INSERT INTO edit_inputs(name, envelope) VALUES ('wrong_type', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000306', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001316', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000201', 'EXPENSE'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001316'),
  '018f0c7a-1234-7abc-8def-000000000406'));

-- Wrong currency: evidence currency diverges from the account currency.
INSERT INTO edit_inputs(name, envelope) VALUES ('wrong_currency', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000307', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001317', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME', 'USD'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001317'),
  '018f0c7a-1234-7abc-8def-000000000407'));

-- Wrong account: evidence points at a different owned account.
INSERT INTO edit_inputs(name, envelope) VALUES ('wrong_account', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000308', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001318', '018f0c7a-1234-7abc-8def-000000000215', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001318'),
  '018f0c7a-1234-7abc-8def-000000000408'));

-- Extra record: account plus two transactions must be rejected.
INSERT INTO edit_inputs(name, envelope) VALUES ('extra_record', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000309', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001319', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001320', '018f0c7a-1234-7abc-8def-000000000214', '1000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001319', '018f0c7a-1234-7abc-8def-000000001320'),
  '018f0c7a-1234-7abc-8def-000000000409'));

-- Category/type mismatch: INCOME evidence with the expense adjustment category.
INSERT INTO edit_inputs(name, envelope) VALUES ('category_mismatch', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000312', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001321', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000201', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001321'),
  '018f0c7a-1234-7abc-8def-000000000411'));

-- Foreign guard: editing an account owned by another user.
INSERT INTO edit_inputs(name, envelope) VALUES ('foreign_guard', jsonb_build_object(
  'accountGuards', jsonb_build_array(jsonb_build_object('accountId', '018f0c7a-1234-7abc-8def-000000000216', 'expectedRevision', '0')),
  'actionId', '018f0c7a-1234-7abc-8def-000000000313', 'domain', 'accounts',
  'domainReferenceId', '018f0c7a-1234-7abc-8def-000000000216',
  'envelopeVersion', 'monyvi.financial-action/v1', 'kind', 'edit_balance',
  'occurredAt', '2026-09-01T12:00:00.000Z',
  'payload', jsonb_build_object(
    'accountEffects', jsonb_build_array(jsonb_build_object(
      'accountId', '018f0c7a-1234-7abc-8def-000000000216', 'amountMinorUnits', '2500',
      'currency', 'EGP', 'effectId', '018f0c7a-1234-7abc-8def-000000000413')),
    'domainMutation', jsonb_build_object('records', jsonb_build_array(jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000216', '12500', 'Foreign'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'))),
    'domainRecordRefs', jsonb_build_array('018f0c7a-1234-7abc-8def-000000000216'),
    'operationCode', 'account.edit-balance', 'schemaVersion', 'account.balance-effects/v1'),
  'payloadVersion', 'account.balance-effects/v1',
  'userId', '018f0c7a-1234-7abc-8def-000000000201'));

-- Forged delete: balance edits must never soft-delete the account.
INSERT INTO edit_inputs(name, envelope) VALUES ('forged_delete', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000314', '018f0c7a-1234-7abc-8def-000000000217', '2500',
  jsonb_build_array(jsonb_build_object(
    'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000217', '12500', 'DeleteTarget', true),
    'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000217'),
  '018f0c7a-1234-7abc-8def-000000000414'));

-- Forged type change: balance edits must never change the account type.
INSERT INTO edit_inputs(name, envelope) VALUES ('forged_type', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000315', '018f0c7a-1234-7abc-8def-000000000218', '2500',
  jsonb_build_array(jsonb_build_object(
    'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000218', '12500', 'TypeTarget', false, 'BANK'),
    'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000218'),
  '018f0c7a-1234-7abc-8def-000000000415'));

-- Forged currency change: balance edits must never change the account currency.
INSERT INTO edit_inputs(name, envelope) VALUES ('forged_currency', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000316', '018f0c7a-1234-7abc-8def-000000000219', '2500',
  jsonb_build_array(jsonb_build_object(
    'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000219', '12500', 'CurrencyTarget', false, 'CASH', 'USD'),
    'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000219'),
  '018f0c7a-1234-7abc-8def-000000000416', 'USD'));

-- Reversed order: canonical record order is account first, transaction
-- second. Transaction-first must fail closed at canonicalization.
INSERT INTO edit_inputs(name, envelope) VALUES ('reversed_order', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000318', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001322', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create'),
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001322'),
  '018f0c7a-1234-7abc-8def-000000000418'));

-- Wrong second mode: adjustment evidence must be a fresh create, never an
-- update of an existing transaction.
INSERT INTO edit_inputs(name, envelope) VALUES ('wrong_second_mode', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000319', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001323', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000001323'),
  '018f0c7a-1234-7abc-8def-000000000419'));

-- Duplicate id: the transaction reuses the account id, so the collected
-- record ids can never match the sorted-unique domain refs.
INSERT INTO edit_inputs(name, envelope) VALUES ('duplicate_id', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000320', '018f0c7a-1234-7abc-8def-000000000214', '5000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000214', '15000', 'Reject'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000000214', '018f0c7a-1234-7abc-8def-000000000214', '5000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000214'),
  '018f0c7a-1234-7abc-8def-000000000420'));

-- Stale-revision composite: account 212 already advanced to revision 1 via
-- adjust_inc, so a new composite still guarding revision 0 must lose the
-- guard race with a durable stale outcome and move no balance.
INSERT INTO edit_inputs(name, envelope) VALUES ('stale_composite', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000317', '018f0c7a-1234-7abc-8def-000000000212', '1000',
  jsonb_build_array(
    jsonb_build_object(
      'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000212', '16000', 'Adjust up'),
      'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update'),
    jsonb_build_object(
      'after', pg_temp.edit_txn_after('018f0c7a-1234-7abc-8def-000000001324', '018f0c7a-1234-7abc-8def-000000000212', '1000', '00000000-0000-0000-0001-000000000200', 'INCOME'),
      'entity', 'transaction', 'expectedUpdatedAt', null, 'mode', 'create')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000212', '018f0c7a-1234-7abc-8def-000000001324'),
  '018f0c7a-1234-7abc-8def-000000000417'));

-- Zero delta: target equals the stored balance, so derivation yields no
-- effects while the payload claims one. Metadata-only edits carry no
-- financial evidence and must fail closed, never mint a zero effect.
INSERT INTO edit_inputs(name, envelope) VALUES ('zero_delta', pg_temp.edit_envelope(
  '018f0c7a-1234-7abc-8def-000000000321', '018f0c7a-1234-7abc-8def-000000000215', '2500',
  jsonb_build_array(jsonb_build_object(
    'after', pg_temp.edit_account_after('018f0c7a-1234-7abc-8def-000000000215', '10000', 'Mismatch'),
    'entity', 'account', 'expectedUpdatedAt', '2026-09-01T12:00:00.000Z', 'mode', 'update')),
  jsonb_build_array('018f0c7a-1234-7abc-8def-000000000215'),
  '018f0c7a-1234-7abc-8def-000000000421'));

UPDATE edit_inputs SET payload_json = private.financial_action_encode_jsonb_v1(envelope);
UPDATE edit_inputs SET payload_hash = encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex');
GRANT SELECT ON edit_inputs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT ON public.account_financial_effects TO authenticated;
SELECT set_config('request.jwt.claim.sub', '018f0c7a-1234-7abc-8def-000000000201', true);
SELECT set_config('request.jwt.claims', '{"sub":"018f0c7a-1234-7abc-8def-000000000201","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE edit_results (name text PRIMARY KEY, outcome jsonb);
SELECT lives_ok($$INSERT INTO edit_results SELECT name, public.apply_account_financial_action_v1(payload_json, payload_hash) FROM edit_inputs WHERE name = 'silent'$$, 'silent edit commits');
SELECT is((SELECT outcome->>'status' FROM edit_results WHERE name='silent'), 'accepted', 'silent single-record edit accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 125::numeric, 'silent edit lands exact balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 1::bigint, 'silent edit advances revision once');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000301'), 1::bigint, 'silent edit commits one effect');

SELECT lives_ok($$INSERT INTO edit_results SELECT name, public.apply_account_financial_action_v1(payload_json, payload_hash) FROM edit_inputs WHERE name = 'adjust_inc'$$, 'adjustment increase commits');
SELECT is((SELECT outcome->>'status' FROM edit_results WHERE name='adjust_inc'), 'accepted', 'two-record adjustment edit accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000212'), 150::numeric, 'adjustment applies delta exactly once');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000212'), 1::bigint, 'adjustment advances revision once');
SELECT is((SELECT count(*) FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001312'), 1::bigint, 'adjustment transaction committed');
SELECT is((SELECT type::text FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001312'), 'INCOME', 'increase evidence is income');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000302'), 1::bigint, 'adjustment commits exactly one effect');
SELECT is((SELECT amount_minor_units FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000302'), 5000::bigint, 'adjustment effect equals delta once');

SELECT lives_ok($$INSERT INTO edit_results SELECT name, public.apply_account_financial_action_v1(payload_json, payload_hash) FROM edit_inputs WHERE name = 'adjust_dec'$$, 'adjustment decrease commits');
SELECT is((SELECT outcome->>'status' FROM edit_results WHERE name='adjust_dec'), 'accepted', 'decrease adjustment edit accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000213'), 75::numeric, 'decrease applies signed delta once');
SELECT is((SELECT type::text FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001313'), 'EXPENSE', 'decrease evidence is expense');
SELECT is((SELECT amount_minor_units FROM public.account_financial_effects WHERE action_id='018f0c7a-1234-7abc-8def-000000000303'), -2500::bigint, 'decrease effect is signed once');

SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='silent'), 'idempotent', 'silent replay is idempotent');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000211'), 125::numeric, 'silent replay moves no balance');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='adjust_inc'), 'idempotent', 'adjustment replay is idempotent');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000212'), 150::numeric, 'adjustment replay moves no balance');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='silent_variant'), 'PAYLOAD_HASH_MISMATCH', 'same action with different payload rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,repeat('0',64))->>'code' FROM edit_inputs WHERE name='silent'), 'PAYLOAD_HASH_MISMATCH', 'forged payload digest rejected');

SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='wrong_amount'), 'rejected', 'wrong evidence amount rejected');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000214'), 100::numeric, 'wrong amount moves no balance');
SELECT is((SELECT count(*) FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001314'), 0::bigint, 'wrong amount evidence absent');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='foreign_category'), 'INCOMPLETE_GROUP', 'foreign evidence category rejected by closed adjustment vocabulary');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='wrong_type'), 'rejected', 'wrong evidence type rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='wrong_currency'), 'rejected', 'wrong evidence currency rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='wrong_account'), 'rejected', 'evidence for another account rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='extra_record'), 'rejected', 'arbitrary extra record rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='category_mismatch'), 'rejected', 'category and type mismatch rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='foreign_guard'), 'NOT_OWNED', 'foreign guard account rejected by owner check');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='forged_delete'), 'rejected', 'forged soft-delete rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='forged_delete'), 'INCOMPLETE_GROUP', 'forged soft-delete fails closed');
SELECT is((SELECT deleted FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000217'), false, 'forged delete leaves row present');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000217'), 100::numeric, 'forged delete moves no balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000217'), 0::bigint, 'forged delete advances no revision');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='forged_type'), 'rejected', 'forged type change rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='forged_type'), 'INCOMPLETE_GROUP', 'forged type change fails closed');
SELECT is((SELECT type::text FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000218'), 'CASH', 'forged type change keeps type');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000218'), 100::numeric, 'forged type change moves no balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000218'), 0::bigint, 'forged type change advances no revision');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='forged_currency'), 'rejected', 'forged currency change rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='forged_currency'), 'INCOMPLETE_GROUP', 'forged currency change fails closed');
SELECT is((SELECT currency::text FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000219'), 'EGP', 'forged currency change keeps currency');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000219'), 100::numeric, 'forged currency change moves no balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000219'), 0::bigint, 'forged currency change advances no revision');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='reversed_order'), 'rejected', 'reversed record order rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='reversed_order'), 'INCOMPLETE_GROUP', 'reversed record order fails closed');
SELECT is((SELECT count(*) FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001322'), 0::bigint, 'reversed order evidence absent');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='wrong_second_mode'), 'rejected', 'non-create adjustment evidence rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='wrong_second_mode'), 'INCOMPLETE_GROUP', 'non-create adjustment evidence fails closed');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='duplicate_id'), 'rejected', 'duplicate record id rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='duplicate_id'), 'INCOMPLETE_GROUP', 'duplicate record id fails closed');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='stale_composite'), 'stale', 'stale composite loses the guard race');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='stale_composite'), 'ACCOUNT_REVISION_STALE', 'stale composite carries the canonical code');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000212'), 150::numeric, 'stale composite moves no balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000212'), 1::bigint, 'stale composite advances no revision');
SELECT is((SELECT count(*) FROM public.transactions WHERE id='018f0c7a-1234-7abc-8def-000000001324'), 0::bigint, 'stale composite evidence absent');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status' FROM edit_inputs WHERE name='zero_delta'), 'rejected', 'zero delta edit rejected');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code' FROM edit_inputs WHERE name='zero_delta'), 'INCOMPLETE_GROUP', 'zero delta edit fails closed');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000215'), 100::numeric, 'zero delta moves no balance');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000215'), 0::bigint, 'zero delta advances no revision');
SELECT is((SELECT balance FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000214'), 100::numeric, 'all rejections leave balance untouched');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id='018f0c7a-1234-7abc-8def-000000000214'), 0::bigint, 'all rejections leave revision untouched');
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE', 'all deferred action/effect constraints hold');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
