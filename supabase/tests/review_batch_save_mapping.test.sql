-- #395 T052: strict mapping closure regressions for review.batch-save/v1.
-- Direct tests of the REAL released 090 private payload validator
-- (private.financial_action_validate_review_batch_save_payload_v1), executed as
-- the trusted service_role inside BEGIN/ROLLBACK. No public RPC, no action
-- replay, no DB owner/stale guards: the validator is pure, so closure failures
-- cannot be masked by unrelated rejection paths.
-- Positive controls run FIRST and genuinely validate the released source.
-- The five closure negatives encode the frozen wire contract (one source ref per
-- created financial row; group refs only for actually created accounts; one
-- group per created account). Released 090 checks shape/order only, so those
-- negatives are EXPECTED RED until the validator gains the missing closure
-- checks. See specs/395-shared-account-review/validation/t052-mapping-regressions.md.
-- Harness notes: prerequisite lookup is schema-agnostic (pgTAP lives in the
-- extensions schema here); all negatives use the four-argument throws_ok form
-- with NULL expected message so only the 22023 errcode is asserted.
-- The account-creation positive uses VOICE/CASH with null fingerprints: SMS
-- cannot create Cash (wire-shapes: ordinary SMS drafts remain BANK/WALLET; SMS
-- never invents a Cash destination), so Cash creation is exercised via Voice.
-- All fixtures are pg_temp and deterministic; no permanent schema/data/extension
-- install; the existing 258-assertion suite is untouched.
BEGIN;
SELECT plan(12);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'throws_ok'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ),
  'PREREQUISITE: pgTAP throws_ok available (not auto-installed)'
);

-- Deterministic synthetic UUID namespace; no persisted fixture data.
CREATE FUNCTION pg_temp.t052_id(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('4b210000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- Deterministic 64-hex fixture commitment; the validator treats it as opaque.
CREATE FUNCTION pg_temp.t052_digest(p_seed text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(extensions.digest(
    convert_to('t052-frozen-intent:' || p_seed, 'UTF8'), 'sha256'), 'hex')
$$;

-- Field grammar mirrors review_batch_save.test.sql fixtures exactly.
CREATE FUNCTION pg_temp.t052_tx(
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

CREATE FUNCTION pg_temp.t052_transfer(
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

CREATE FUNCTION pg_temp.t052_account(
  p_id uuid, p_name text, p_type text DEFAULT 'CASH',
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

CREATE FUNCTION pg_temp.t052_source(p_row uuid, p_record uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('rowId', p_row, 'recordId', p_record,
    'sourceFingerprint', p_fingerprint)
$$;

CREATE FUNCTION pg_temp.t052_group(p_account uuid, p_group uuid, p_revision text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId', p_account, 'groupId', p_group,
    'revision', p_revision)
$$;

CREATE FUNCTION pg_temp.t052_effect(
  p_id uuid, p_minor text, p_effect uuid, p_currency text DEFAULT 'EGP'
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId', p_id, 'amountMinorUnits', p_minor,
    'currency', p_currency, 'effectId', p_effect)
$$;

CREATE FUNCTION pg_temp.t052_snapshot(p_active jsonb, p_default uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('activeAccountIds', p_active,
    'defaultAccount', CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId', p_default, 'isDefault', true) END)
$$;

CREATE FUNCTION pg_temp.t052_bank(p_id uuid, p_account uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity', 'bank_details', 'mode', 'create',
    'expectedUpdatedAt', null, 'after', jsonb_build_object(
      'id', p_id, 'accountId', p_account, 'accountNumber', null,
      'cardLast4', '0007',
      'createdAt', '2026-09-01T12:00:00.000Z', 'deleted', false))
$$;

CREATE FUNCTION pg_temp.t052_bookkeeping(p_draft uuid, p_queue uuid, p_op text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('draftId', p_draft, 'queueId', p_queue,
    'snapshotHash', repeat('c', 64), 'expectedReviewRevision', '1',
    'operation', p_op)
$$;

-- Closed payload builder: derives createGuards/domainRecordRefs exactly like the
-- real client; adds creationDefaultSnapshot only when one is supplied (i.e. when
-- any account is created).
CREATE FUNCTION pg_temp.t052_payload(
  p_records jsonb, p_source text, p_selected jsonb, p_groups jsonb,
  p_effects jsonb, p_bookkeeping jsonb DEFAULT '[]'::jsonb,
  p_snapshot jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 'review.batch-save/v1', 'operationCode', 'review.batch-save',
    'source', p_source, 'sessionId', pg_temp.t052_id(900),
    'frozenIntentDigest', pg_temp.t052_digest('t052-' || p_source),
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
  || CASE WHEN p_snapshot IS NOT NULL
    THEN jsonb_build_object('creationDefaultSnapshot', p_snapshot)
    ELSE '{}'::jsonb END
$$;

-- VOICE/CASH closed base: one created Cash account, one income transaction,
-- one confirmed group, null fingerprints. Used by the account-creation
-- positive and the group-mapping negatives. SMS cannot create Cash
-- (wire-shapes: ordinary SMS drafts remain BANK/WALLET; SMS never invents a
-- Cash destination), so Cash creation is exercised via Voice.
CREATE FUNCTION pg_temp.t052_voice_cash_payload(p_selected jsonb, p_groups jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.t052_payload(
    jsonb_build_array(
      pg_temp.t052_account(pg_temp.t052_id(400), 'Suggested Cash', 'CASH', 'EGP', true),
      pg_temp.t052_tx(pg_temp.t052_id(410), pg_temp.t052_id(400), '1000',
        'INCOME', 'VOICE', null, pg_temp.t052_id(12))),
    'VOICE',
    p_selected,
    p_groups,
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(400), '1000', pg_temp.t052_id(1240))),
    '[]'::jsonb,
    pg_temp.t052_snapshot('[]'::jsonb, null))
$$;

-- The released 090 validator is granted to service_role only.
SET LOCAL ROLE service_role;

-- Positive control 1: valid existing-account Voice expense, closed payload.
SELECT lives_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(pg_temp.t052_tx(
      pg_temp.t052_id(411), pg_temp.t052_id(101), '100', 'EXPENSE',
      'VOICE', null, pg_temp.t052_id(12))),
    'VOICE',
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(621), pg_temp.t052_id(411), null)),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(101), '-100', pg_temp.t052_id(1241)))),
  pg_temp.t052_id(411)::text),
  'positive: valid existing-account Voice expense passes the real validator');

-- Positive control 2: valid VOICE created Cash account with one confirmed
-- group and one source ref, closed snapshot, null fingerprints.
SELECT lives_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_voice_cash_payload(
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(620), pg_temp.t052_id(410), null)),
    jsonb_build_array(pg_temp.t052_group(
      pg_temp.t052_id(400), pg_temp.t052_id(701), '1'))),
  pg_temp.t052_id(410)::text),
  'positive: valid VOICE created-Cash group with one source ref passes');

-- Closure negative 1: source recordId points to no financial mutation.
-- Sibling fields stay valid; only the recordId mapping is broken.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(pg_temp.t052_tx(
      pg_temp.t052_id(411), pg_temp.t052_id(101), '100', 'EXPENSE',
      'VOICE', null, pg_temp.t052_id(12))),
    'VOICE',
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(621), pg_temp.t052_id(9999), null)),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(101), '-100', pg_temp.t052_id(1241)))),
  pg_temp.t052_id(411)::text),
  '22023', NULL,
  'selectedSourceRefs recordId must reference an actual created financial record');

-- Closure negative 2: missing source ref for an actual created transfer.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(pg_temp.t052_transfer(
      pg_temp.t052_id(412), pg_temp.t052_id(101), pg_temp.t052_id(102),
      repeat('3', 64))),
    'SMS',
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      pg_temp.t052_effect(pg_temp.t052_id(101), '-2505', pg_temp.t052_id(1242)),
      pg_temp.t052_effect(pg_temp.t052_id(102), '2505', pg_temp.t052_id(1243)))),
  pg_temp.t052_id(412)::text),
  '22023', NULL,
  'every created transaction/transfer requires its selectedSourceRefs entry');

-- Closure negative 3: two source rows sharing one created financial record.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(pg_temp.t052_tx(
      pg_temp.t052_id(411), pg_temp.t052_id(101), '100', 'EXPENSE',
      'VOICE', null, pg_temp.t052_id(12))),
    'VOICE',
    jsonb_build_array(
      pg_temp.t052_source(pg_temp.t052_id(621), pg_temp.t052_id(411), null),
      pg_temp.t052_source(pg_temp.t052_id(622), pg_temp.t052_id(411), null)),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(101), '-100', pg_temp.t052_id(1241)))),
  pg_temp.t052_id(411)::text),
  '22023', NULL,
  'selectedSourceRefs recordId must be bijective: two rows cannot share one created financial record');

-- Closure negative 4: orphan confirmedGroupRef to an account not created.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_voice_cash_payload(
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(620), pg_temp.t052_id(410), null)),
    jsonb_build_array(
      pg_temp.t052_group(pg_temp.t052_id(400), pg_temp.t052_id(701), '1'),
      pg_temp.t052_group(pg_temp.t052_id(404), pg_temp.t052_id(702), '1'))),
  pg_temp.t052_id(410)::text),
  '22023', NULL,
  'confirmedGroupRefs must reverse-map: every group references an actually created account');

-- Closure negative 5: reverse grouping duplicate control: one created account
-- confirmed in two distinct groups.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_voice_cash_payload(
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(620), pg_temp.t052_id(410), null)),
    jsonb_build_array(
      pg_temp.t052_group(pg_temp.t052_id(400), pg_temp.t052_id(701), '1'),
      pg_temp.t052_group(pg_temp.t052_id(400), pg_temp.t052_id(702), '1'))),
  pg_temp.t052_id(410)::text),
  '22023', NULL,
  'one created account must map to exactly one confirmed group (reverse duplicate rejected)');

-- Boundary control: exact duplicate groupId is already rejected by the released
-- order guard, proving the closure negatives above do not merely re-test it.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_voice_cash_payload(
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(620), pg_temp.t052_id(410), null)),
    jsonb_build_array(
      pg_temp.t052_group(pg_temp.t052_id(400), pg_temp.t052_id(701), '1'),
      pg_temp.t052_group(pg_temp.t052_id(400), pg_temp.t052_id(701), '1'))),
  pg_temp.t052_id(410)::text),
  '22023', NULL,
  'boundary: exact duplicate groupId already rejected by released order guard');

-- Positive parity: legitimate confirmed group referencing an existing
-- affected account (wire 230 "created or explicitly reused"). Account 101 is
-- existing and present in accountEffects, so the group ref is valid.
SELECT lives_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(pg_temp.t052_tx(
      pg_temp.t052_id(411), pg_temp.t052_id(101), '100', 'EXPENSE',
      'VOICE', null, pg_temp.t052_id(12))),
    'VOICE',
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(621), pg_temp.t052_id(411), null)),
    jsonb_build_array(pg_temp.t052_group(
      pg_temp.t052_id(101), pg_temp.t052_id(701), '1')),
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(101), '-100', pg_temp.t052_id(1241)))),
  pg_temp.t052_id(411)::text),
  'positive parity: confirmed group referencing existing affected account passes');

-- Negative parity (HELD): SMS source-ref fingerprint must match the
-- corresponding financial row fingerprint. Released 090 does not compare
-- them, so this otherwise-valid payload is accepted (expected Red until the
-- fingerprint fix lands; NOT implemented in this wave). Fully valid SMS
-- payload (created BANK + child + bookkeeping + full closure); only the
-- source ref fingerprint is mismatched from the transaction smsFingerprint.
SELECT throws_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(
      pg_temp.t052_account(pg_temp.t052_id(400), 'Suggested Bank', 'BANK', 'EGP', true),
      pg_temp.t052_bank(pg_temp.t052_id(401), pg_temp.t052_id(400)),
      pg_temp.t052_tx(pg_temp.t052_id(410), pg_temp.t052_id(400), '1000',
        'INCOME', 'SMS', repeat('a', 64), pg_temp.t052_id(12))),
    'SMS',
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(620), pg_temp.t052_id(410), repeat('b', 64))),
    jsonb_build_array(pg_temp.t052_group(
      pg_temp.t052_id(400), pg_temp.t052_id(701), '1')),
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(400), '1000', pg_temp.t052_id(1240))),
    jsonb_build_array(pg_temp.t052_bookkeeping(
      pg_temp.t052_id(800), pg_temp.t052_id(810), 'delete_saved')),
    pg_temp.t052_snapshot('[]'::jsonb, null)),
  pg_temp.t052_id(410)::text),
  '22023', NULL,
  'SMS source-ref fingerprint must match the corresponding financial row fingerprint (HELD)');

-- Positive parity control: the same fully valid SMS payload with the source
-- ref fingerprint MATCHED to the transaction smsFingerprint passes.
SELECT lives_ok(format(
  'SELECT private.financial_action_validate_review_batch_save_payload_v1(%L::jsonb, %L::text)',
  pg_temp.t052_payload(
    jsonb_build_array(
      pg_temp.t052_account(pg_temp.t052_id(400), 'Suggested Bank', 'BANK', 'EGP', true),
      pg_temp.t052_bank(pg_temp.t052_id(401), pg_temp.t052_id(400)),
      pg_temp.t052_tx(pg_temp.t052_id(410), pg_temp.t052_id(400), '1000',
        'INCOME', 'SMS', repeat('a', 64), pg_temp.t052_id(12))),
    'SMS',
    jsonb_build_array(pg_temp.t052_source(
      pg_temp.t052_id(620), pg_temp.t052_id(410), repeat('a', 64))),
    jsonb_build_array(pg_temp.t052_group(
      pg_temp.t052_id(400), pg_temp.t052_id(701), '1')),
    jsonb_build_array(pg_temp.t052_effect(
      pg_temp.t052_id(400), '1000', pg_temp.t052_id(1240))),
    jsonb_build_array(pg_temp.t052_bookkeeping(
      pg_temp.t052_id(800), pg_temp.t052_id(810), 'delete_saved')),
    pg_temp.t052_snapshot('[]'::jsonb, null)),
  pg_temp.t052_id(410)::text),
  'positive parity: SMS source-ref fingerprint matched to financial row passes');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
