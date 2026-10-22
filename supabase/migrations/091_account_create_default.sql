-- Issue #395: Account Creation With Default Intent (account.create-default/v1).
--
-- Registers the account.create-default/v1 financial action tuple:
-- domain: 'accounts', kind: 'create_with_default', operationCode: 'account.create-default'.
-- Supports atomic account creation with explicit defaultIntent, expectedDefaultSnapshot CAS,
-- zero-opening and nonzero opening balance handling, and previous default clearance.

BEGIN;

-- 1. Register account.create-default in operation registration registry.
CREATE OR REPLACE FUNCTION private.financial_action_account_operation_registered_v1(
  p_domain text,
  p_kind text,
  p_operation_code text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (p_domain, p_kind, p_operation_code) IN (
    ('accounts', 'cash_create', 'account.cash.create-within-writer'),
    ('accounts', 'cash_prepare', 'account.cash.prepare'),
    ('accounts', 'cash_prepare_named', 'account.cash.prepare-named'),
    ('accounts', 'create', 'account.create'),
    ('accounts', 'create_with_default', 'account.create-default'),
    ('accounts', 'pending_prepare', 'account.pending.prepare'),
    ('accounts', 'edit_balance', 'account.edit-balance'),
    ('transactions', 'create', 'transaction.create'),
    ('transactions', 'update', 'transaction.update'),
    ('transactions', 'delete', 'transaction.delete'),
    ('transactions', 'convert_to_transfer', 'transaction.convert-to-transfer'),
    ('transactions', 'batch_delete', 'transaction.batch-delete'),
    ('transactions', 'batch_import', 'transaction.batch-import'),
    ('transactions', 'review_batch_save', 'review.batch-save'),
    ('transfers', 'create', 'transfer.create'),
    ('transfers', 'update', 'transfer.update'),
    ('transfers', 'delete', 'transfer.delete'),
    ('transfers', 'convert_to_transaction', 'transfer.convert-to-transaction'),
    ('recurring_payments', 'pay_now', 'recurring.pay-now'),
    ('sms', 'review_confirm', 'sms.review-durable')
  );
$$;

-- 2. Validator for account.create-default/v1 payload.
CREATE OR REPLACE FUNCTION private.financial_action_validate_account_create_default_payload_v1(
  p_payload jsonb,
  p_domain_reference_id text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_keys text[];
  v_snapshot jsonb;
  v_mutation_records jsonb;
  v_record jsonb;
  v_after jsonb;
  v_entity text;
  v_mode text;
  v_id text;
  v_previous_sort_key text;
  v_account_record jsonb;
  v_account_type text;
  v_account_id text;
  v_opening_minor text;
  v_bank_count integer := 0;
  v_sender_count integer := 0;
  v_default_clear_count integer := 0;
  v_ref jsonb;
  v_previous_ref text;
  v_guard jsonb;
  v_previous_guard text;
  v_effect jsonb;
  v_effect_count integer := 0;
  v_guard_count integer := 0;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  SELECT array_agg(key ORDER BY key) INTO v_keys
  FROM jsonb_object_keys(p_payload) AS key;

  IF v_keys IS DISTINCT FROM ARRAY[
    'accountEffects', 'createGuards', 'defaultIntent', 'domainMutation',
    'domainRecordRefs', 'expectedDefaultSnapshot', 'operationCode', 'schemaVersion'
  ]::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  IF p_payload ->> 'schemaVersion' IS DISTINCT FROM 'account.create-default/v1'
    OR p_payload ->> 'operationCode' IS DISTINCT FROM 'account.create-default'
    OR jsonb_typeof(p_payload -> 'defaultIntent') IS DISTINCT FROM 'boolean'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- Validate expectedDefaultSnapshot
  v_snapshot := p_payload -> 'expectedDefaultSnapshot';
  IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
    OR (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(v_snapshot) AS key
    ) IS DISTINCT FROM ARRAY['activeAccountIds', 'defaultAccount']::text[]
    OR jsonb_typeof(v_snapshot -> 'activeAccountIds') IS DISTINCT FROM 'array'
    OR (
      jsonb_typeof(v_snapshot -> 'defaultAccount') IS DISTINCT FROM 'null'
      AND (
        jsonb_typeof(v_snapshot -> 'defaultAccount') IS DISTINCT FROM 'object'
        OR (
          SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(v_snapshot -> 'defaultAccount') AS key
        ) IS DISTINCT FROM ARRAY['accountId', 'isDefault']::text[]
        OR jsonb_typeof(v_snapshot -> 'defaultAccount' -> 'accountId')
          IS DISTINCT FROM 'string'
        OR (v_snapshot -> 'defaultAccount' ->> 'accountId') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (v_snapshot -> 'defaultAccount' ->> 'isDefault') IS DISTINCT FROM 'true'
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- Validate domainMutation
  IF jsonb_typeof(p_payload -> 'domainMutation') IS DISTINCT FROM 'object'
    OR (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(p_payload -> 'domainMutation') AS key
    ) IS DISTINCT FROM ARRAY['records']::text[]
    OR jsonb_typeof(p_payload -> 'domainMutation' -> 'records') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload -> 'domainMutation' -> 'records') = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  v_mutation_records := p_payload -> 'domainMutation' -> 'records';

  FOR v_record IN
    SELECT record.value
    FROM jsonb_array_elements(v_mutation_records) WITH ORDINALITY AS record(value, position)
    ORDER BY record.position
  LOOP
    IF jsonb_typeof(v_record) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_record -> 'after') IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_record -> 'entity') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_record -> 'mode') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    v_after := v_record -> 'after';
    v_entity := v_record ->> 'entity';
    v_mode := v_record ->> 'mode';
    v_id := v_after ->> 'id';

    -- M2: exact outer mutation-wrapper keys, including the Add-only clear.
    IF (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(v_record) AS key
    ) IS DISTINCT FROM (
      CASE WHEN v_entity = 'account_default'
        THEN ARRAY['after', 'entity', 'expectedIsDefault', 'mode']::text[]
        ELSE ARRAY['after', 'entity', 'expectedUpdatedAt', 'mode']::text[]
      END
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    IF jsonb_typeof(v_after -> 'id') IS DISTINCT FROM 'string'
      OR v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_previous_sort_key IS NOT NULL AND (v_previous_sort_key COLLATE "C") >= ((v_entity || ':' || v_id) COLLATE "C"))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    v_previous_sort_key := v_entity || ':' || v_id;

    IF v_entity = 'account' THEN
      IF v_mode <> 'create'
        OR v_account_record IS NOT NULL
        OR v_id IS DISTINCT FROM p_domain_reference_id
        OR jsonb_typeof(v_record -> 'expectedUpdatedAt') <> 'null'
        OR (
          SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(v_after) AS key
        ) IS DISTINCT FROM ARRAY[
          'createdAt', 'currency', 'deleted', 'id', 'institutionId', 'isDefault',
          'name', 'openingBalanceMinorUnits', 'providerDisplayName',
          'targetBalanceMinorUnits', 'type'
        ]::text[]
        OR jsonb_typeof(v_after -> 'name') IS DISTINCT FROM 'string'
        OR length(btrim(v_after ->> 'name')) = 0
        OR jsonb_typeof(v_after -> 'type') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_after -> 'currency') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_after -> 'institutionId') NOT IN ('null', 'string')
        OR jsonb_typeof(v_after -> 'providerDisplayName') NOT IN ('null', 'string')
        OR v_after ->> 'type' NOT IN ('CASH', 'BANK', 'DIGITAL_WALLET')
        OR jsonb_typeof(v_after -> 'isDefault') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_after ->> 'deleted')::boolean
        OR (v_after ->> 'openingBalanceMinorUnits') !~ '^(0|[1-9][0-9]{0,18})$'
        OR jsonb_typeof(v_after -> 'targetBalanceMinorUnits') <> 'null'
        OR (v_after ->> 'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;

      v_account_record := v_record;
      v_account_id := v_id;
      v_account_type := v_after ->> 'type';
      v_opening_minor := v_after ->> 'openingBalanceMinorUnits';

    ELSIF v_entity = 'bank_details' THEN
      IF v_mode <> 'create'
        OR jsonb_typeof(v_record -> 'expectedUpdatedAt') <> 'null'
        OR (
          SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(v_after) AS key
        ) IS DISTINCT FROM ARRAY[
          'accountId', 'accountNumber', 'cardLast4', 'createdAt', 'deleted', 'id'
        ]::text[]
        OR jsonb_typeof(v_after -> 'accountId') IS DISTINCT FROM 'string'
        OR (v_after ->> 'accountId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        -- Optional Add accountNumber is null OR a real string.
        OR jsonb_typeof(v_after -> 'accountNumber') NOT IN ('null', 'string')
        OR (
          jsonb_typeof(v_after -> 'cardLast4') IS DISTINCT FROM 'null'
          AND (
            jsonb_typeof(v_after -> 'cardLast4') IS DISTINCT FROM 'string'
            OR (v_after ->> 'cardLast4') !~ '^[0-9]{4}$'
          )
        )
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_after ->> 'deleted')::boolean
        OR (v_after ->> 'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
      v_bank_count := v_bank_count + 1;

    ELSIF v_entity = 'account_sms_sender' THEN
      IF v_mode <> 'create'
        OR jsonb_typeof(v_record -> 'expectedUpdatedAt') <> 'null'
        OR (
          SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(v_after) AS key
        ) IS DISTINCT FROM ARRAY[
          'accountId', 'createdAt', 'deleted', 'id', 'normalizedSenderName', 'senderName'
        ]::text[]
        OR jsonb_typeof(v_after -> 'accountId') IS DISTINCT FROM 'string'
        OR (v_after ->> 'accountId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR jsonb_typeof(v_after -> 'senderName') IS DISTINCT FROM 'string'
        OR length(btrim(v_after ->> 'senderName')) = 0
        OR jsonb_typeof(v_after -> 'normalizedSenderName') IS DISTINCT FROM 'string'
        OR length(btrim(v_after ->> 'normalizedSenderName')) = 0
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_after ->> 'deleted')::boolean
        OR (v_after ->> 'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
      v_sender_count := v_sender_count + 1;

    ELSIF v_entity = 'account_default' THEN
      IF v_mode <> 'update'
        OR (v_record ->> 'expectedIsDefault') IS DISTINCT FROM 'true'
        OR (
          SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(v_after) AS key
        ) IS DISTINCT FROM ARRAY['id', 'isDefault']::text[]
        OR (v_after ->> 'isDefault') IS DISTINCT FROM 'false'
        OR jsonb_typeof(v_snapshot -> 'defaultAccount') IS DISTINCT FROM 'object'
        OR (v_after ->> 'id') IS DISTINCT FROM (v_snapshot -> 'defaultAccount' ->> 'accountId')
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
      v_default_clear_count := v_default_clear_count + 1;

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
  END LOOP;

  -- Exactly one default clear when defaultIntent targets a captured prior
  -- default; forbid multiple or unsolicited clears.
  IF (p_payload ->> 'defaultIntent')::boolean
    AND jsonb_typeof(v_snapshot -> 'defaultAccount') = 'object' THEN
    IF v_default_clear_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
  ELSE
    IF v_default_clear_count <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
  END IF;

  IF v_account_record IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  -- Validate frozen intent against its EXPECTED graph, never a later DB graph.
  -- This runs in registered payload validation, before business stale authority.
  IF (v_account_record -> 'after' ->> 'isDefault')::boolean
    IS DISTINCT FROM (
      jsonb_array_length(v_snapshot -> 'activeAccountIds') = 0
      OR (p_payload ->> 'defaultIntent')::boolean
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  -- Validate child count per account type
  IF v_account_type = 'BANK' THEN
    IF v_bank_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
  ELSIF v_account_type IN ('CASH', 'DIGITAL_WALLET') THEN
    IF v_bank_count <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
    IF v_account_type = 'CASH' AND v_sender_count <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
  END IF;

  -- C2: same-action child ownership; one typed newly-created parent only.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_mutation_records) AS child(value)
    WHERE child.value ->> 'entity' IN ('bank_details', 'account_sms_sender')
      AND child.value -> 'after' ->> 'accountId' IS DISTINCT FROM v_account_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  -- Validate opening balance guards and effects before touching array entries.
  IF jsonb_typeof(p_payload -> 'accountEffects') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_payload -> 'createGuards') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_effect';
  END IF;
  v_effect_count := jsonb_array_length(p_payload -> 'accountEffects');
  v_guard_count := jsonb_array_length(p_payload -> 'createGuards');

  IF v_opening_minor = '0' THEN
    IF v_effect_count <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END IF;
  ELSE
    IF v_effect_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END IF;
    v_effect := p_payload -> 'accountEffects' -> 0;
    -- The immutable effect is a CLOSED, typed tuple; the writer must post
    -- exactly this amount, account, currency and effect identity.
    IF jsonb_typeof(v_effect) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_effect) AS key
      ) IS DISTINCT FROM ARRAY[
        'accountId', 'amountMinorUnits', 'currency', 'effectId'
      ]::text[]
      OR jsonb_typeof(v_effect -> 'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'amountMinorUnits') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'currency') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'effectId') IS DISTINCT FROM 'string'
      OR (v_effect ->> 'accountId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_effect ->> 'effectId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_effect ->> 'amountMinorUnits') !~ '^[1-9][0-9]{0,18}$'
      OR (v_effect ->> 'accountId') IS DISTINCT FROM v_account_id
      OR (v_effect ->> 'amountMinorUnits') IS DISTINCT FROM v_opening_minor
      OR (v_effect ->> 'currency') IS DISTINCT FROM
        (v_account_record -> 'after' ->> 'currency')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END IF;
  END IF;

  IF v_effect_count = 1 THEN
    BEGIN
      PERFORM (v_effect ->> 'currency')::public.currency_type;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'financial_action_invalid_account_effect';
    END;
  END IF;

  -- Validate domainRecordRefs
  IF jsonb_typeof(p_payload -> 'domainRecordRefs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  FOR v_ref IN
    SELECT ref.value
    FROM jsonb_array_elements(p_payload -> 'domainRecordRefs') WITH ORDINALITY AS ref(value, position)
    ORDER BY ref.position
  LOOP
    IF jsonb_typeof(v_ref) IS DISTINCT FROM 'string'
      OR (v_ref #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_previous_ref IS NOT NULL AND (v_previous_ref COLLATE "C") >= ((v_ref #>> '{}') COLLATE "C"))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
    v_previous_ref := v_ref #>> '{}';
  END LOOP;

  IF (
    SELECT coalesce(jsonb_agg(r.value -> 'after' ->> 'id' ORDER BY (r.value -> 'after' ->> 'id') COLLATE "C"), '[]'::jsonb)
    FROM jsonb_array_elements(v_mutation_records) AS r(value)
  ) IS DISTINCT FROM (p_payload -> 'domainRecordRefs')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_domain_refs_mismatch';
  END IF;

  -- Validate createGuards
  IF jsonb_typeof(p_payload -> 'createGuards') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  FOR v_guard IN
    SELECT guard.value
    FROM jsonb_array_elements(p_payload -> 'createGuards') WITH ORDINALITY AS guard(value, position)
    ORDER BY guard.position
  LOOP
    IF jsonb_typeof(v_guard) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_guard) AS key
      ) IS DISTINCT FROM ARRAY['entity', 'expectedAbsent', 'id']::text[]
      OR jsonb_typeof(v_guard -> 'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_guard -> 'entity') IS DISTINCT FROM 'string'
      OR (v_guard ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_guard ->> 'expectedAbsent') IS DISTINCT FROM 'true'
      OR (v_guard ->> 'entity') NOT IN ('account', 'account_sms_sender', 'bank_details')
      OR (
        v_previous_guard IS NOT NULL
        AND (v_previous_guard COLLATE "C") >= (((v_guard ->> 'entity') || ':' || (v_guard ->> 'id')) COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
    v_previous_guard := (v_guard ->> 'entity') || ':' || (v_guard ->> 'id');
  END LOOP;

  IF (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('entity', r.value ->> 'entity', 'expectedAbsent', true, 'id', r.value -> 'after' ->> 'id')
      ORDER BY ((r.value ->> 'entity') || ':' || (r.value -> 'after' ->> 'id')) COLLATE "C"
    ), '[]'::jsonb)
    FROM jsonb_array_elements(v_mutation_records) AS r(value)
    WHERE r.value ->> 'mode' = 'create'
  ) IS DISTINCT FROM (p_payload -> 'createGuards')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;
END;
$$;

-- 3. Extend registered payload validation to account.create-default/v1.
CREATE OR REPLACE FUNCTION private.financial_action_validate_registered_payload_v1(
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_value ->> 'domain' = 'metals'
    AND p_value ->> 'kind' = 'sell'
    AND p_value ->> 'payloadVersion' = 'metals.sell/v2'
  THEN
    PERFORM private.financial_action_validate_metals_sell_payload_v2(p_value -> 'payload');
    RETURN;
  END IF;
  IF p_value ->> 'domain' = 'metals'
    AND (p_value ->> 'kind', p_value ->> 'payloadVersion') IN (
      ('add', 'metals.add/v1'),
      ('correct', 'metals.correct/v1'),
      ('dispose', 'metals.dispose/v1'),
      ('delete', 'metals.delete/v1'),
      ('undo', 'metals.undo/v1')
    )
  THEN
    PERFORM private.financial_action_validate_metals_payload_v1(p_value);
    RETURN;
  END IF;
  IF p_value ->> 'domain' = 'metals'
    AND p_value ->> 'kind' = 'sell'
    AND p_value ->> 'payloadVersion' = 'metals.sell/v1'
  THEN
    PERFORM private.financial_action_validate_metals_sell_payload_v1(p_value -> 'payload');
    RETURN;
  END IF;

  IF p_value ->> 'payloadVersion' = 'account.balance-effects/v1'
    AND private.financial_action_account_operation_registered_v1(
      p_value ->> 'domain',
      p_value ->> 'kind',
      p_value -> 'payload' ->> 'operationCode'
    )
  THEN
    PERFORM private.financial_action_validate_account_balance_effects_payload_v1(
      p_value -> 'payload',
      p_value ->> 'domainReferenceId',
      p_value -> 'payload' ->> 'operationCode'
    );
    RETURN;
  END IF;

  IF p_value ->> 'domain' = 'transactions'
    AND p_value ->> 'kind' = 'review_batch_save'
    AND p_value ->> 'payloadVersion' = 'review.batch-save/v1'
    AND (p_value -> 'payload' ->> 'operationCode') = 'review.batch-save'
  THEN
    PERFORM private.financial_action_validate_review_batch_save_payload_v1(
      p_value -> 'payload',
      p_value ->> 'domainReferenceId'
    );
    PERFORM private.financial_action_validate_review_guard_closure_v1(p_value);
    RETURN;
  END IF;

  IF p_value ->> 'domain' = 'accounts'
    AND p_value ->> 'kind' = 'create_with_default'
    AND p_value ->> 'payloadVersion' = 'account.create-default/v1'
    AND (p_value -> 'payload' ->> 'operationCode') = 'account.create-default'
  THEN
    PERFORM private.financial_action_validate_account_create_default_payload_v1(
      p_value -> 'payload',
      p_value ->> 'domainReferenceId'
    );
    RETURN;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'financial_action_unknown_definition';
END;
$$;

-- 4. Update apply_account_financial_action_v1 to support account.create-default/v1.
CREATE OR REPLACE FUNCTION public.apply_account_financial_action_v1(
  p_payload_json text,
  p_payload_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_envelope jsonb;
  v_action_id uuid;
  v_payload_version text;
  v_existing public.financial_action_groups%ROWTYPE;
  v_guard jsonb;
  v_effect jsonb;
  v_new_account_record jsonb;
  v_account public.accounts%ROWTYPE;
  v_expected_revision bigint;
  v_identity_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_is_stale boolean := false;
  v_stale_account_ids jsonb := '[]'::jsonb;
  v_canonical_accounts jsonb := '[]'::jsonb;
  v_canonical_absent_account_ids jsonb := '[]'::jsonb;
  v_account_revisions jsonb := '[]'::jsonb;
  v_expected_effects jsonb;
  v_outcome jsonb;
  v_outcome_text text;
  v_updated integer;
  v_rec record;
  v_created_account_id uuid;
  v_actual_active_ids jsonb;
  v_actual_default_id uuid;
  v_actual_default_ids uuid[];
  v_actual_snapshot jsonb;
  v_canonical_default_snapshot jsonb;
  v_payload_snapshot jsonb;
  v_first_created_account_id text;
  v_derived_delta_minor bigint;
  v_expected_effect_minor bigint;
  v_scale numeric;
  v_chk_acc public.accounts%ROWTYPE;
  v_conflict_state text;
  v_conflict_message text;
  v_default_intent boolean;
  v_created_is_default boolean;
  v_new_name text;
  v_opening_minor text;
  v_clear_account_id uuid;
BEGIN
  v_owner_id := (SELECT auth.uid());
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'actionId', null,
      'code', 'NOT_OWNED',
      'status', 'rejected'
    );
  END IF;

  BEGIN
    PERFORM private.financial_action_canonical_json_v1(p_payload_json);
    v_envelope := p_payload_json::jsonb;
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RETURN jsonb_build_object(
      'actionId', null,
      'code', CASE
        WHEN SQLERRM LIKE '%revision%' OR SQLERRM LIKE '%account_guards%'
          THEN 'INVALID_REVISION'
        ELSE 'INCOMPLETE_GROUP'
      END,
      'status', 'rejected'
    );
  END;

  v_action_id := (v_envelope ->> 'actionId')::uuid;
  IF v_envelope ->> 'userId' IS DISTINCT FROM v_owner_id::text THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'NOT_OWNED',
      'status', 'rejected'
    );
  END IF;

  IF p_payload_hash !~ '^[0-9a-f]{64}$'
    OR p_payload_hash IS DISTINCT FROM encode(
      extensions.digest(convert_to(p_payload_json, 'UTF8'), 'sha256'),
      'hex'
    )
  THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'PAYLOAD_HASH_MISMATCH',
      'status', 'rejected'
    );
  END IF;

  v_payload_version := v_envelope ->> 'payloadVersion';
  IF v_payload_version NOT IN ('account.balance-effects/v1', 'review.batch-save/v1', 'account.create-default/v1')
  THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'INCOMPLETE_GROUP',
      'status', 'rejected'
    );
  END IF;

  BEGIN
    PERFORM private.financial_action_validate_envelope_v1(v_envelope);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'INCOMPLETE_GROUP',
      'status', 'rejected'
    );
  END;

  -- New Review/Add default logical CAS must re-read at READ COMMITTED
  -- after the scope wait. Deployed legacy v1 semantics are unchanged.
  IF v_payload_version IN ('review.batch-save/v1', 'account.create-default/v1')
    AND pg_catalog.current_setting('transaction_isolation')
      IS DISTINCT FROM 'read committed'
  THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'INCOMPLETE_GROUP', 'status', 'rejected'
    );
  END IF;

  -- Single early statement/RPC scope: publication -> auth SHARE -> scoped
  -- owner, before immutable action root, any account row, or default read.
  PERFORM private.account_owner_enter_scope_v1(v_owner_id);

  -- Check existing action group for idempotency / replay
  SELECT root.*
  INTO v_existing
  FROM public.financial_action_groups AS root
  WHERE root.user_id = v_owner_id
    AND root.action_id = v_action_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_existing.payload_json IS DISTINCT FROM p_payload_json
    THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'PAYLOAD_HASH_MISMATCH',
        'status', 'rejected'
      );
    END IF;
    IF v_existing.server_outcome = 'accepted' THEN
      RETURN jsonb_set(
        v_existing.outcome_json::jsonb,
        '{status}',
        to_jsonb('idempotent'::text),
        false
      );
    ELSE
      RETURN v_existing.outcome_json::jsonb;
    END IF;
  END IF;

  -- Locks and the first immutable-root replay check above remain in this
  -- OUTER transaction. Only domain mutations execute in this savepoint:
  -- a failure rolls them back without releasing owner/publication/root locks.
  BEGIN
  -----------------------------------------------------------------------------
  -- BRANCH A: account.create-default/v1
  -----------------------------------------------------------------------------
  IF v_payload_version = 'account.create-default/v1' THEN
    SELECT (r.value -> 'after' ->> 'id')::uuid,
           r.value -> 'after' ->> 'name',
           (r.value -> 'after' ->> 'isDefault')::boolean,
           r.value -> 'after' ->> 'openingBalanceMinorUnits'
    INTO v_created_account_id, v_new_name, v_created_is_default, v_opening_minor
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
    WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create'
    LIMIT 1;

    v_default_intent := (v_envelope -> 'payload' ->> 'defaultIntent')::boolean;

    -- Collision checks on created account ID across all users
    SELECT account.* INTO v_chk_acc
    FROM public.accounts AS account
    WHERE account.id = v_created_account_id;

    IF FOUND THEN
      -- Existing physical IDs are never CREATE targets, even when owned/active.
      -- Exact owner/action replay was already resolved before this branch.
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'ACCOUNT_INELIGIBLE',
        'status', 'rejected'
      );
    ELSE
      v_canonical_absent_account_ids := v_canonical_absent_account_ids || jsonb_build_array(v_created_account_id::text);
    END IF;

    -- Collision checks on children (bank_details, account_sms_sender)
    FOR v_rec IN
      SELECT (r.value -> 'after' ->> 'id')::uuid AS child_id,
             r.value ->> 'entity' AS entity
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' IN ('bank_details', 'account_sms_sender')
    LOOP
      IF v_rec.entity = 'bank_details' THEN
        IF EXISTS (SELECT 1 FROM public.bank_details WHERE id = v_rec.child_id) THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'ACCOUNT_INELIGIBLE',
            'status', 'rejected'
          );
        END IF;
      ELSIF v_rec.entity = 'account_sms_sender' THEN
        IF EXISTS (SELECT 1 FROM public.account_sms_senders WHERE id = v_rec.child_id) THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'ACCOUNT_INELIGIBLE',
            'status', 'rejected'
          );
        END IF;
      END IF;
    END LOOP;

    -- Uniqueness is enforced by 051's owner/name/currency/provider indexes,
    -- not a name-only predicate that would reject Cash EGP + Cash USD.
    -- The inner business savepoint maps a true 23505 to canonical rejection.

    -- Verify expectedDefaultSnapshot against actual DB state under owner lock
    SELECT coalesce(jsonb_agg(id::text ORDER BY id::text COLLATE "C"), '[]'::jsonb)
    INTO v_actual_active_ids
    FROM public.accounts
    WHERE user_id = v_owner_id AND deleted = false;

    SELECT array_agg(id ORDER BY id::text COLLATE "C")
    INTO v_actual_default_ids
    FROM public.accounts
    WHERE user_id = v_owner_id AND deleted = false AND is_default = true;

    IF coalesce(array_length(v_actual_default_ids, 1), 0) > 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'financial_action_ambiguous_owned_default_graph';
    END IF;

    IF v_actual_default_ids IS NOT NULL AND array_length(v_actual_default_ids, 1) = 1 THEN
      v_actual_default_id := v_actual_default_ids[1];
      v_actual_snapshot := jsonb_build_object(
        'activeAccountIds', v_actual_active_ids,
        'defaultAccount', jsonb_build_object('accountId', v_actual_default_id::text, 'isDefault', true)
      );
    ELSE
      v_actual_default_id := NULL;
      v_actual_snapshot := jsonb_build_object(
        'activeAccountIds', v_actual_active_ids,
        'defaultAccount', 'null'::jsonb
      );
    END IF;

    v_payload_snapshot := v_envelope -> 'payload' -> 'expectedDefaultSnapshot';
    IF v_payload_snapshot IS DISTINCT FROM v_actual_snapshot THEN
      v_is_stale := true;
    END IF;

    -- Frozen flags/clears were validated against the expected graph.
    -- A changed actual graph must reach canonical stale persistence below.
    IF NOT v_is_stale AND jsonb_array_length(v_actual_active_ids) = 0 THEN
      -- First active account must be default
      IF NOT v_created_is_default THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'INCOMPLETE_GROUP',
          'status', 'rejected'
        );
      END IF;
    ELSIF NOT v_is_stale THEN
      -- Later account
      IF v_default_intent THEN
        IF NOT v_created_is_default THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'INCOMPLETE_GROUP',
            'status', 'rejected'
          );
        END IF;
        -- If previous default existed, mutation must clear it
        IF v_actual_default_id IS NOT NULL THEN
          SELECT (r.value -> 'after' ->> 'id')::uuid INTO v_clear_account_id
          FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
          WHERE r.value ->> 'entity' = 'account_default';

          IF v_clear_account_id IS DISTINCT FROM v_actual_default_id THEN
            v_is_stale := true;
          END IF;
        END IF;
      ELSE
        IF v_created_is_default THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'INCOMPLETE_GROUP',
            'status', 'rejected'
          );
        END IF;
      END IF;
    END IF;

    -- If stale, record and return stale outcome
    IF v_is_stale THEN
      FOR v_rec IN
        SELECT id FROM public.accounts WHERE user_id = v_owner_id AND deleted = false ORDER BY id::text COLLATE "C"
      LOOP
        v_canonical_accounts := v_canonical_accounts || jsonb_build_array(
          private.account_financial_canonical_snapshot_v1(v_owner_id, v_rec.id)
        );
      END LOOP;

      v_outcome := jsonb_build_object(
        'actionId', v_action_id::text,
        'canonicalAbsentAccountIds', v_canonical_absent_account_ids,
        'canonicalAccounts', v_canonical_accounts,
        'canonicalDefaultSnapshot', v_actual_snapshot,
        'canonicalHoldingActionId', null,
        'canonicalHoldingEvidenceHash', null,
        'canonicalHoldingRevision', null,
        'code', 'ACCOUNT_REVISION_STALE',
        'staleAccountIds', v_stale_account_ids,
        'status', 'stale'
      );
      v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);

      INSERT INTO public.financial_action_groups (
        action_id, user_id, domain, kind, domain_reference_id,
        payload_json, payload_hash, account_guards_json, state,
        server_outcome, outcome_json, rejection_code, deleted
      ) VALUES (
        v_action_id,
        v_owner_id,
        v_envelope ->> 'domain',
        v_envelope ->> 'kind',
        (v_envelope ->> 'domainReferenceId')::uuid,
        p_payload_json,
        p_payload_hash,
        v_envelope -> 'accountGuards',
        'reconciled',
        'stale',
        v_outcome_text,
        'account_revision_stale',
        false
      );

      RETURN v_outcome;
    END IF;

    -- Clear previous default if requested
    IF v_default_intent AND v_actual_default_id IS NOT NULL THEN
      UPDATE public.accounts
      SET is_default = false, updated_at = v_now
      WHERE user_id = v_owner_id AND id = v_actual_default_id;
    END IF;

    -- Insert created account
    SELECT r.value -> 'after' INTO v_new_account_record
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
    WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create';

    v_scale := power(10::numeric, private.account_currency_minor_unit_scale_v1((v_new_account_record ->> 'currency')::public.currency_type));

    IF v_opening_minor = '0' THEN
      INSERT INTO public.accounts (
        id, user_id, name, type, balance, currency,
        institution_id, provider_display_name, financial_revision,
        is_default, created_at, updated_at, deleted
      ) VALUES (
        (v_new_account_record ->> 'id')::uuid,
        v_owner_id,
        v_new_account_record ->> 'name',
        (v_new_account_record ->> 'type')::public.account_type,
        0,
        (v_new_account_record ->> 'currency')::public.currency_type,
        v_new_account_record ->> 'institutionId',
        v_new_account_record ->> 'providerDisplayName',
        0,
        (v_new_account_record ->> 'isDefault')::boolean,
        (v_new_account_record ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
      v_account_revisions := '[]'::jsonb;
    ELSE
      INSERT INTO public.accounts (
        id, user_id, name, type, balance, currency,
        institution_id, provider_display_name, financial_revision,
        is_default, created_at, updated_at, deleted
      ) VALUES (
        (v_new_account_record ->> 'id')::uuid,
        v_owner_id,
        v_new_account_record ->> 'name',
        (v_new_account_record ->> 'type')::public.account_type,
        v_opening_minor::numeric / v_scale,
        (v_new_account_record ->> 'currency')::public.currency_type,
        v_new_account_record ->> 'institutionId',
        v_new_account_record ->> 'providerDisplayName',
        1,
        (v_new_account_record ->> 'isDefault')::boolean,
        (v_new_account_record ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
      v_account_revisions := jsonb_build_array(
        jsonb_build_object(
          'accountId', v_created_account_id::text,
          'revision', '1'
        )
      );
    END IF;

    -- Insert children
    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'bank_details' AND r.value ->> 'mode' = 'create'
    LOOP
      INSERT INTO public.bank_details (
        id, account_id, account_number, card_last_4, created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        (v_rec.after ->> 'accountId')::uuid,
        v_rec.after ->> 'accountNumber',
        nullif(v_rec.after ->> 'cardLast4', '')::integer,
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
    END LOOP;

    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'account_sms_sender' AND r.value ->> 'mode' = 'create'
    LOOP
      INSERT INTO public.account_sms_senders (
        id, account_id, sender_name, normalized_sender_name, created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        (v_rec.after ->> 'accountId')::uuid,
        v_rec.after ->> 'senderName',
        v_rec.after ->> 'normalizedSenderName',
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
    END LOOP;

    v_outcome := jsonb_build_object(
      'accountRevisions', v_account_revisions,
      'actionId', v_action_id::text,
      'effectiveEventId', null,
      'holdingRevision', null,
      'serverAcceptedAt', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', 'accepted'
    );
    v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);

    INSERT INTO public.financial_action_groups (
      action_id, user_id, domain, kind, domain_reference_id,
      payload_json, payload_hash, account_guards_json, state,
      server_outcome, outcome_json, rejection_code, deleted
    ) VALUES (
      v_action_id,
      v_owner_id,
      v_envelope ->> 'domain',
      v_envelope ->> 'kind',
      (v_envelope ->> 'domainReferenceId')::uuid,
      p_payload_json,
      p_payload_hash,
      v_envelope -> 'accountGuards',
      'accepted',
      'accepted',
      v_outcome_text,
      null,
      false
    );

    -- Insert the nonzero-opening effect AFTER the action root so the effect's
    -- action_id FK is satisfied (effect may not precede its root). Matches the
    -- review branch ordering.
    IF v_opening_minor != '0' THEN
      INSERT INTO public.account_financial_effects (
        id, user_id, action_id, account_id, domain, kind,
        amount_minor_units, currency, accepted_account_revision
      ) VALUES (
        (v_envelope -> 'payload' -> 'accountEffects' -> 0 ->> 'effectId')::uuid,
        v_owner_id,
        v_action_id,
        v_created_account_id,
        v_envelope ->> 'domain',
        v_envelope -> 'payload' ->> 'operationCode',
        v_opening_minor::bigint,
        (v_new_account_record ->> 'currency')::public.currency_type,
        1
      );
    END IF;

    RETURN v_outcome;
  END IF;

  -----------------------------------------------------------------------------
  -- BRANCH B: review.batch-save/v1
  -----------------------------------------------------------------------------
  IF v_payload_version = 'review.batch-save/v1' THEN
    -- Check account creations in mutation
    FOR v_rec IN
      SELECT (r.value -> 'after' ->> 'id')::uuid AS acc_id,
             r.value -> 'after' ->> 'isDefault' AS is_def
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create'
      ORDER BY (r.value -> 'after' ->> 'id') COLLATE "C"
    LOOP
      -- Check collision across all users
      SELECT account.* INTO v_chk_acc
      FROM public.accounts AS account
      WHERE account.id = v_rec.acc_id;

      IF FOUND THEN
        -- Foreign user collision
        IF v_chk_acc.user_id <> v_owner_id THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'ACCOUNT_INELIGIBLE',
            'status', 'rejected'
          );
        END IF;
        -- Own deleted tombstone collision
        IF v_chk_acc.deleted THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'ACCOUNT_INELIGIBLE',
            'status', 'rejected'
          );
        END IF;
      ELSE
        v_canonical_absent_account_ids := v_canonical_absent_account_ids || jsonb_build_array(v_rec.acc_id::text);
      END IF;
    END LOOP;

    -- If accounts are created, verify creationDefaultSnapshot against database under owner lock
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create'
    ) THEN
      SELECT coalesce(jsonb_agg(id ORDER BY id::text COLLATE "C"), '[]'::jsonb)
      INTO v_actual_active_ids
      FROM public.accounts
      WHERE user_id = v_owner_id AND deleted = false;

      SELECT id INTO v_actual_default_id
      FROM public.accounts
      WHERE user_id = v_owner_id AND deleted = false AND is_default = true
      LIMIT 1;

      v_actual_snapshot := jsonb_build_object(
        'activeAccountIds', v_actual_active_ids,
        'defaultAccount', CASE
          WHEN v_actual_default_id IS NULL THEN 'null'::jsonb
          ELSE jsonb_build_object('accountId', v_actual_default_id, 'isDefault', true)
        END
      );

      v_payload_snapshot := v_envelope -> 'payload' -> 'creationDefaultSnapshot';
      IF v_payload_snapshot IS DISTINCT FROM v_actual_snapshot THEN
        v_is_stale := true;
      END IF;

      -- Validate default flags on created accounts
      IF jsonb_array_length(v_actual_active_ids) > 0 THEN
        -- Nonempty active set: ALL newly created accounts MUST have isDefault: false
        IF EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
          WHERE r.value ->> 'entity' = 'account'
            AND r.value ->> 'mode' = 'create'
            AND (r.value -> 'after' ->> 'isDefault')::boolean = true
        ) THEN
          v_is_stale := true;
        END IF;
      ELSE
        -- Empty active set: exactly the first created account in canonical ASCII UUID order must be default
        SELECT (r.value -> 'after' ->> 'id') INTO v_first_created_account_id
        FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
        WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create'
        ORDER BY (r.value -> 'after' ->> 'id') COLLATE "C"
        LIMIT 1;

        FOR v_rec IN
          SELECT (r.value -> 'after' ->> 'id') AS acc_id,
                 (r.value -> 'after' ->> 'isDefault')::boolean AS is_def
          FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
          WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create'
        LOOP
          IF v_rec.acc_id = v_first_created_account_id THEN
            IF NOT v_rec.is_def THEN
              v_is_stale := true;
            END IF;
          ELSE
            IF v_rec.is_def THEN
              v_is_stale := true;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- Check accountGuards for existing accounts
    FOR v_guard IN
      SELECT guard.value
      FROM jsonb_array_elements(v_envelope -> 'accountGuards') WITH ORDINALITY
        AS guard(value, position)
      ORDER BY (guard.value ->> 'accountId') COLLATE "C"
    LOOP
      SELECT account.*
      INTO v_account
      FROM public.accounts AS account
      WHERE account.user_id = v_owner_id
        AND account.id = (v_guard ->> 'accountId')::uuid
        AND account.deleted = false
      ORDER BY account.id::text COLLATE "C"
      FOR UPDATE;

      IF NOT FOUND THEN
        -- Check if it is a newly created account
        SELECT record.value
        INTO v_new_account_record
        FROM jsonb_array_elements(
          v_envelope -> 'payload' -> 'domainMutation' -> 'records'
        ) AS record(value)
        WHERE record.value ->> 'entity' = 'account'
          AND record.value ->> 'mode' = 'create'
          AND record.value -> 'after' ->> 'id' = v_guard ->> 'accountId';

        IF NOT FOUND OR v_guard ->> 'expectedRevision' IS DISTINCT FROM '0' THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'NOT_OWNED',
            'status', 'rejected'
          );
        END IF;

        SELECT effect.value
        INTO STRICT v_effect
        FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
          AS effect(value)
        WHERE effect.value ->> 'accountId' = v_guard ->> 'accountId';

        IF v_effect ->> 'currency' IS DISTINCT FROM
          (v_new_account_record -> 'after' ->> 'currency')
        THEN
          RETURN jsonb_build_object(
            'actionId', v_action_id::text,
            'code', 'ACCOUNT_INELIGIBLE',
            'status', 'rejected'
          );
        END IF;
        CONTINUE;
      END IF;

      -- Existing account
      SELECT effect.value
      INTO STRICT v_effect
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
        AS effect(value)
      WHERE effect.value ->> 'accountId' = v_guard ->> 'accountId';

      IF v_effect ->> 'currency' IS DISTINCT FROM v_account.currency::text THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'ACCOUNT_INELIGIBLE',
          'status', 'rejected'
        );
      END IF;

      v_expected_revision := private.financial_action_account_revision_from_text_v1(
        v_guard ->> 'expectedRevision'
      );
      IF v_expected_revision = 9223372036854775807 THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'REVISION_EXHAUSTED',
          'status', 'rejected'
        );
      ELSIF v_account.financial_revision IS DISTINCT FROM v_expected_revision THEN
        v_is_stale := true;
        v_stale_account_ids := v_stale_account_ids || jsonb_build_array(v_account.id::text);
      END IF;
      v_canonical_accounts := v_canonical_accounts || jsonb_build_array(
        private.account_financial_canonical_snapshot_v1(v_owner_id, v_account.id)
      );
    END LOOP;

    -- H1: Review transfers are SAME-CURRENCY ONLY under the frozen T046
    -- pure contract. Endpoint/effect sets have already been validated and
    -- every effect currency has been verified against its owned/created
    -- account in the guard loop above. No implicit FX or numeric conversion.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        v_envelope -> 'payload' -> 'domainMutation' -> 'records'
      ) AS rec(value)
      WHERE (
        rec.value ->> 'entity' = 'transaction'
        AND rec.value -> 'after' ->> 'currency' IS DISTINCT FROM (
          SELECT eff.value ->> 'currency'
          FROM jsonb_array_elements(
            v_envelope -> 'payload' -> 'accountEffects'
          ) AS eff(value)
          WHERE eff.value ->> 'accountId' =
            rec.value -> 'after' ->> 'accountId'
        )
      ) OR (
        rec.value ->> 'entity' = 'transfer'
        AND (
          rec.value -> 'after' ->> 'currency' IS DISTINCT FROM (
            SELECT eff.value ->> 'currency'
            FROM jsonb_array_elements(
              v_envelope -> 'payload' -> 'accountEffects'
            ) AS eff(value)
            WHERE eff.value ->> 'accountId' =
              rec.value -> 'after' ->> 'fromAccountId'
          )
          OR (
            SELECT eff.value ->> 'currency'
            FROM jsonb_array_elements(
              v_envelope -> 'payload' -> 'accountEffects'
            ) AS eff(value)
            WHERE eff.value ->> 'accountId' =
              rec.value -> 'after' ->> 'fromAccountId'
          ) IS DISTINCT FROM (
            SELECT eff.value ->> 'currency'
            FROM jsonb_array_elements(
              v_envelope -> 'payload' -> 'accountEffects'
            ) AS eff(value)
            WHERE eff.value ->> 'accountId' =
              rec.value -> 'after' ->> 'toAccountId'
          )
        )
      )
    ) THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'ACCOUNT_INELIGIBLE', 'status', 'rejected'
      );
    END IF;

    -- Verify expected account effects against transaction and transfer mutations
    FOR v_guard IN
      SELECT guard.value
      FROM jsonb_array_elements(v_envelope -> 'accountGuards') AS guard(value)
    LOOP
      v_derived_delta_minor := 0;

      -- Transactions targeting this account
      FOR v_rec IN
        SELECT (r.value -> 'after' ->> 'amountMinorUnits')::bigint AS amt,
               r.value -> 'after' ->> 'type' AS tx_type
        FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
        WHERE r.value ->> 'entity' = 'transaction'
          AND r.value -> 'after' ->> 'accountId' = v_guard ->> 'accountId'
      LOOP
        IF v_rec.tx_type = 'INCOME' THEN
          v_derived_delta_minor := v_derived_delta_minor + v_rec.amt;
        ELSE
          v_derived_delta_minor := v_derived_delta_minor - v_rec.amt;
        END IF;
      END LOOP;

      -- Transfers targeting or leaving this account
      FOR v_rec IN
        SELECT (r.value -> 'after' ->> 'amountMinorUnits')::bigint AS amt,
               r.value -> 'after' ->> 'fromAccountId' AS from_id,
               r.value -> 'after' ->> 'toAccountId' AS to_id
        FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
        WHERE r.value ->> 'entity' = 'transfer'
          AND (
            r.value -> 'after' ->> 'fromAccountId' = v_guard ->> 'accountId'
            OR r.value -> 'after' ->> 'toAccountId' = v_guard ->> 'accountId'
          )
      LOOP
        IF v_rec.from_id = v_guard ->> 'accountId' THEN
          v_derived_delta_minor := v_derived_delta_minor - v_rec.amt;
        END IF;
        IF v_rec.to_id = v_guard ->> 'accountId' THEN
          v_derived_delta_minor := v_derived_delta_minor + v_rec.amt;
        END IF;
      END LOOP;

      SELECT (effect.value ->> 'amountMinorUnits')::bigint INTO v_expected_effect_minor
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects') AS effect(value)
      WHERE effect.value ->> 'accountId' = v_guard ->> 'accountId';

      IF v_expected_effect_minor IS DISTINCT FROM v_derived_delta_minor THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'INCOMPLETE_GROUP',
          'status', 'rejected'
        );
      END IF;
    END LOOP;

    -- If stale, record and return stale outcome
    IF v_is_stale THEN
      v_outcome := jsonb_build_object(
        'actionId', v_action_id::text,
        'canonicalAbsentAccountIds', v_canonical_absent_account_ids,
        'canonicalAccounts', v_canonical_accounts,
        'canonicalHoldingActionId', null,
        'canonicalHoldingEvidenceHash', null,
        'canonicalHoldingRevision', null,
        'code', 'ACCOUNT_REVISION_STALE',
        'staleAccountIds', v_stale_account_ids,
        'status', 'stale'
      );
      v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);

      INSERT INTO public.financial_action_groups (
        action_id, user_id, domain, kind, domain_reference_id,
        payload_json, payload_hash, account_guards_json, state,
        server_outcome, outcome_json, rejection_code, deleted
      ) VALUES (
        v_action_id,
        v_owner_id,
        v_envelope ->> 'domain',
        v_envelope ->> 'kind',
        (v_envelope ->> 'domainReferenceId')::uuid,
        p_payload_json,
        p_payload_hash,
        v_envelope -> 'accountGuards',
        'reconciled',
        'stale',
        v_outcome_text,
        'account_revision_stale',
        false
      );

      RETURN v_outcome;
    END IF;

    -- Check category ownership for transaction records before mutations
    FOR v_rec IN
      SELECT (r.value -> 'after' ->> 'categoryId')::uuid AS cat_id
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'transaction'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.categories
        WHERE id = v_rec.cat_id
          AND (user_id = v_owner_id OR user_id IS NULL)
          AND deleted = false
      ) THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'ACCOUNT_INELIGIBLE',
          'status', 'rejected'
        );
      END IF;
    END LOOP;

    -- Execute domain mutations
    -- 1. Create accounts
    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'account' AND r.value ->> 'mode' = 'create'
    LOOP
      SELECT (effect.value ->> 'amountMinorUnits')::bigint INTO v_expected_effect_minor
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects') AS effect(value)
      WHERE effect.value ->> 'accountId' = v_rec.after ->> 'id';

      v_scale := power(10::numeric, private.account_currency_minor_unit_scale_v1((v_rec.after ->> 'currency')::public.currency_type));

      INSERT INTO public.accounts (
        id, user_id, name, type, balance, currency,
        institution_id, provider_display_name, financial_revision,
        is_default, created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        v_owner_id,
        v_rec.after ->> 'name',
        (v_rec.after ->> 'type')::public.account_type,
        coalesce(v_expected_effect_minor, 0)::numeric / v_scale,
        (v_rec.after ->> 'currency')::public.currency_type,
        v_rec.after ->> 'institutionId',
        v_rec.after ->> 'providerDisplayName',
        1,
        (v_rec.after ->> 'isDefault')::boolean,
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );

      v_account_revisions := v_account_revisions || jsonb_build_array(
        jsonb_build_object(
          'accountId', v_rec.after ->> 'id',
          'revision', '1'
        )
      );
    END LOOP;

    -- 2. Create bank_details
    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'bank_details' AND r.value ->> 'mode' = 'create'
    LOOP
      INSERT INTO public.bank_details (
        id, account_id, account_number, card_last_4, created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        (v_rec.after ->> 'accountId')::uuid,
        null,
        nullif(v_rec.after ->> 'cardLast4', '')::integer,
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
    END LOOP;

    -- 3. Create account_sms_senders
    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'account_sms_sender' AND r.value ->> 'mode' = 'create'
    LOOP
      INSERT INTO public.account_sms_senders (
        id, account_id, sender_name, normalized_sender_name, created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        (v_rec.after ->> 'accountId')::uuid,
        v_rec.after ->> 'senderName',
        v_rec.after ->> 'normalizedSenderName',
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
    END LOOP;

    -- 4. Create transactions
    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'transaction' AND r.value ->> 'mode' = 'create'
    LOOP
      INSERT INTO public.transactions (
        id, user_id, account_id, amount, currency, type, category_id,
        counterparty, note, date, source, is_draft, linked_debt_id,
        linked_asset_id, linked_recurring_id, sms_fingerprint,
        created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        v_owner_id,
        (v_rec.after ->> 'accountId')::uuid,
        (v_rec.after ->> 'amountMinorUnits')::numeric / power(10::numeric, private.account_currency_minor_unit_scale_v1((v_rec.after ->> 'currency')::public.currency_type)),
        (v_rec.after ->> 'currency')::public.currency_type,
        (v_rec.after ->> 'type')::public.transaction_type,
        (v_rec.after ->> 'categoryId')::uuid,
        v_rec.after ->> 'counterparty',
        v_rec.after ->> 'note',
        (v_rec.after ->> 'date')::date,
        (v_rec.after ->> 'source')::public.transaction_source,
        false,
        nullif(v_rec.after ->> 'linkedDebtId', '')::uuid,
        nullif(v_rec.after ->> 'linkedAssetId', '')::uuid,
        nullif(v_rec.after ->> 'linkedRecurringId', '')::uuid,
        v_rec.after ->> 'smsFingerprint',
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
    END LOOP;

    -- 5. Create transfers
    FOR v_rec IN
      SELECT r.value -> 'after' AS after
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
      WHERE r.value ->> 'entity' = 'transfer' AND r.value ->> 'mode' = 'create'
    LOOP
      INSERT INTO public.transfers (
        id, user_id, from_account_id, to_account_id, amount, currency,
        exchange_rate, converted_amount, notes, date, sms_fingerprint,
        created_at, updated_at, deleted
      ) VALUES (
        (v_rec.after ->> 'id')::uuid,
        v_owner_id,
        (v_rec.after ->> 'fromAccountId')::uuid,
        (v_rec.after ->> 'toAccountId')::uuid,
        (v_rec.after ->> 'amountMinorUnits')::numeric / power(10::numeric, private.account_currency_minor_unit_scale_v1((v_rec.after ->> 'currency')::public.currency_type)),
        (v_rec.after ->> 'currency')::public.currency_type,
        nullif(v_rec.after ->> 'exchangeRate', '')::numeric,
        CASE
          WHEN v_rec.after ->> 'convertedAmountMinorUnits' IS NULL THEN null
          ELSE (v_rec.after ->> 'convertedAmountMinorUnits')::numeric / power(10::numeric, private.account_currency_minor_unit_scale_v1((v_rec.after ->> 'currency')::public.currency_type))
        END,
        v_rec.after ->> 'notes',
        (v_rec.after ->> 'date')::date,
        v_rec.after ->> 'smsFingerprint',
        (v_rec.after ->> 'createdAt')::timestamptz,
        v_now,
        false
      );
    END LOOP;

    -- 6. Update existing accounts for balance and revision increments
    FOR v_effect IN
      SELECT effect.value
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects') WITH ORDINALITY
        AS effect(value, position)
      ORDER BY (effect.value ->> 'accountId') COLLATE "C"
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_envelope -> 'payload' -> 'domainMutation' -> 'records') AS r(value)
        WHERE r.value ->> 'entity' = 'account'
          AND r.value ->> 'mode' = 'create'
          AND r.value -> 'after' ->> 'id' = v_effect ->> 'accountId'
      ) THEN
        UPDATE public.accounts AS account
        SET
          balance = account.balance + (
            (v_effect ->> 'amountMinorUnits')::numeric
            / power(10::numeric, private.account_currency_minor_unit_scale_v1(account.currency))
          ),
          financial_revision = account.financial_revision + 1,
          updated_at = v_now
        WHERE account.user_id = v_owner_id
          AND account.id = (v_effect ->> 'accountId')::uuid
          AND account.deleted = false;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> 1 THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
        END IF;

        SELECT account.* INTO STRICT v_account
        FROM public.accounts AS account
        WHERE account.user_id = v_owner_id
          AND account.id = (v_effect ->> 'accountId')::uuid;

        v_account_revisions := v_account_revisions || jsonb_build_array(
          jsonb_build_object(
            'accountId', v_account.id::text,
            'revision', v_account.financial_revision::text
          )
        );
      END IF;
    END LOOP;

    SELECT coalesce(jsonb_agg(rev.value ORDER BY (rev.value ->> 'accountId') COLLATE "C"), '[]'::jsonb)
    INTO v_account_revisions
    FROM jsonb_array_elements(v_account_revisions) AS rev(value);

    v_outcome := jsonb_build_object(
      'accountRevisions', v_account_revisions,
      'actionId', v_action_id::text,
      'effectiveEventId', null,
      'holdingRevision', null,
      'serverAcceptedAt', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', 'accepted'
    );
    v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);

    INSERT INTO public.financial_action_groups (
      action_id, user_id, domain, kind, domain_reference_id,
      payload_json, payload_hash, account_guards_json, state,
      server_outcome, outcome_json, rejection_code, deleted
    ) VALUES (
      v_action_id,
      v_owner_id,
      v_envelope ->> 'domain',
      v_envelope ->> 'kind',
      (v_envelope ->> 'domainReferenceId')::uuid,
      p_payload_json,
      p_payload_hash,
      v_envelope -> 'accountGuards',
      'accepted',
      'accepted',
      v_outcome_text,
      null,
      false
    );

    INSERT INTO public.account_financial_effects (
      id, user_id, action_id, account_id, domain, kind,
      amount_minor_units, currency, accepted_account_revision
    )
    SELECT
      (effect.value ->> 'effectId')::uuid,
      v_owner_id,
      v_action_id,
      (effect.value ->> 'accountId')::uuid,
      v_envelope ->> 'domain',
      v_envelope -> 'payload' ->> 'operationCode',
      (effect.value ->> 'amountMinorUnits')::bigint,
      (effect.value ->> 'currency')::public.currency_type,
      private.financial_action_account_revision_from_text_v1(guard.value ->> 'expectedRevision') + 1
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects') AS effect(value)
    JOIN jsonb_array_elements(v_envelope -> 'accountGuards') AS guard(value)
      ON guard.value ->> 'accountId' = effect.value ->> 'accountId';

    RETURN v_outcome;
  END IF;

  -----------------------------------------------------------------------------
  -- BRANCH C: account.balance-effects/v1 (Existing logic from 076/083)
  -----------------------------------------------------------------------------
  BEGIN
    v_expected_effects := private.financial_action_expected_account_effects_v1(
      v_owner_id,
      v_envelope -> 'payload' -> 'domainMutation'
    );
  EXCEPTION
    WHEN no_data_found THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'NOT_OWNED',
        'status', 'rejected'
      );
    WHEN SQLSTATE '22023' THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'INCOMPLETE_GROUP',
        'status', 'rejected'
      );
  END;

  IF v_expected_effects IS DISTINCT FROM (
    SELECT jsonb_agg(
      effect.value - 'effectId'
      ORDER BY (effect.value ->> 'accountId') COLLATE "C"
    )
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
      AS effect(value)
  )
  THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'INCOMPLETE_GROUP',
      'status', 'rejected'
    );
  END IF;

  FOR v_guard IN
    SELECT guard.value
    FROM jsonb_array_elements(v_envelope -> 'accountGuards') WITH ORDINALITY
      AS guard(value, position)
    ORDER BY (guard.value ->> 'accountId') COLLATE "C"
  LOOP
    SELECT account.*
    INTO v_account
    FROM public.accounts AS account
    WHERE account.user_id = v_owner_id
      AND account.id = (v_guard ->> 'accountId')::uuid
      AND account.deleted = false
    ORDER BY account.id::text COLLATE "C"
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT record.value
      INTO v_new_account_record
      FROM jsonb_array_elements(
        v_envelope -> 'payload' -> 'domainMutation' -> 'records'
      ) AS record(value)
      WHERE record.value ->> 'entity' = 'account'
        AND record.value ->> 'mode' = 'create'
        AND record.value -> 'after' ->> 'id' = v_guard ->> 'accountId';

      IF NOT FOUND OR v_guard ->> 'expectedRevision' IS DISTINCT FROM '0' THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'NOT_OWNED',
          'status', 'rejected'
        );
      END IF;
      SELECT effect.value
      INTO STRICT v_effect
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
        AS effect(value)
      WHERE effect.value ->> 'accountId' = v_guard ->> 'accountId';
      IF v_effect ->> 'currency' IS DISTINCT FROM
        (v_new_account_record -> 'after' ->> 'currency')
      THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'ACCOUNT_INELIGIBLE',
          'status', 'rejected'
        );
      END IF;
      CONTINUE;
    END IF;

    SELECT record.value INTO v_identity_record
    FROM jsonb_array_elements(
      v_envelope -> 'payload' -> 'domainMutation' -> 'records'
    ) AS record(value)
    WHERE record.value ->> 'entity' = 'account'
      AND record.value ->> 'mode' = 'update'
      AND record.value -> 'after' ->> 'id' = v_guard ->> 'accountId';
    IF FOUND
      AND (
        (v_identity_record -> 'after' ->> 'deleted')::boolean
        OR (v_identity_record -> 'after' ->> 'type')
          IS DISTINCT FROM v_account.type::text
        OR (v_identity_record -> 'after' ->> 'currency')
          IS DISTINCT FROM v_account.currency::text
      )
    THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'INCOMPLETE_GROUP',
        'status', 'rejected'
      );
    END IF;

    SELECT effect.value
    INTO STRICT v_effect
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
      AS effect(value)
    WHERE effect.value ->> 'accountId' = v_guard ->> 'accountId';

    IF v_effect ->> 'currency' IS DISTINCT FROM v_account.currency::text THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'ACCOUNT_INELIGIBLE',
        'status', 'rejected'
      );
    END IF;

    v_expected_revision := private.financial_action_account_revision_from_text_v1(
      v_guard ->> 'expectedRevision'
    );
    IF v_expected_revision = 9223372036854775807 THEN
      RETURN jsonb_build_object(
        'actionId', v_action_id::text,
        'code', 'REVISION_EXHAUSTED',
        'status', 'rejected'
      );
    ELSIF v_account.financial_revision IS DISTINCT FROM v_expected_revision THEN
      v_is_stale := true;
      v_stale_account_ids := v_stale_account_ids ||
        jsonb_build_array(v_account.id::text);
    END IF;
    v_canonical_accounts := v_canonical_accounts || jsonb_build_array(
      private.account_financial_canonical_snapshot_v1(v_owner_id, v_account.id)
    );
  END LOOP;

  IF v_is_stale THEN
    v_outcome := jsonb_build_object(
      'actionId', v_action_id::text,
      'canonicalAccounts', v_canonical_accounts,
      'canonicalHoldingActionId', null,
      'canonicalHoldingEvidenceHash', null,
      'canonicalHoldingRevision', null,
      'code', 'ACCOUNT_REVISION_STALE',
      'staleAccountIds', v_stale_account_ids,
      'status', 'stale'
    );
    v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);

    INSERT INTO public.financial_action_groups (
      action_id, user_id, domain, kind, domain_reference_id,
      payload_json, payload_hash, account_guards_json, state,
      server_outcome, outcome_json, rejection_code, deleted
    ) VALUES (
      v_action_id,
      v_owner_id,
      v_envelope ->> 'domain',
      v_envelope ->> 'kind',
      (v_envelope ->> 'domainReferenceId')::uuid,
      p_payload_json,
      p_payload_hash,
      v_envelope -> 'accountGuards',
      'reconciled',
      'stale',
      v_outcome_text,
      'account_revision_stale',
      false
    );

    INSERT INTO public.account_financial_effects (
      id, user_id, action_id, account_id, domain, kind,
      amount_minor_units, currency, accepted_account_revision,
      is_effective, compensated_at
    )
    SELECT
      (effect.value ->> 'effectId')::uuid,
      v_owner_id,
      v_action_id,
      (effect.value ->> 'accountId')::uuid,
      v_envelope ->> 'domain',
      v_envelope -> 'payload' ->> 'operationCode',
      private.financial_action_signed_minor_units_from_text_v1(
        effect.value ->> 'amountMinorUnits'
      ),
      (effect.value ->> 'currency')::public.currency_type,
      private.financial_action_account_revision_from_text_v1(
        guard.value ->> 'expectedRevision'
      ) + 1,
      false,
      v_now
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
      AS effect(value)
    JOIN jsonb_array_elements(v_envelope -> 'accountGuards') AS guard(value)
      ON guard.value ->> 'accountId' = effect.value ->> 'accountId';

    RETURN v_outcome;
  END IF;

  PERFORM private.financial_action_dispatch_domain_mutation_v1(
    v_owner_id,
    v_envelope -> 'payload' ->> 'operationCode',
    v_envelope -> 'payload' -> 'domainMutation',
    v_now
  );

  FOR v_effect IN
    SELECT effect.value
    FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects') WITH ORDINALITY
      AS effect(value, position)
    ORDER BY (effect.value ->> 'accountId') COLLATE "C"
  LOOP
    UPDATE public.accounts AS account
    SET
      balance = account.balance + (
        private.financial_action_signed_minor_units_from_text_v1(
          v_effect ->> 'amountMinorUnits'
        )::numeric
        / power(
          10::numeric,
          private.account_currency_minor_unit_scale_v1(account.currency)
        )
      ),
      financial_revision = account.financial_revision + 1,
      updated_at = v_now
    WHERE account.user_id = v_owner_id
      AND account.id = (v_effect ->> 'accountId')::uuid
      AND account.deleted = false;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    SELECT account.*
    INTO STRICT v_account
    FROM public.accounts AS account
    WHERE account.user_id = v_owner_id
      AND account.id = (v_effect ->> 'accountId')::uuid;
    v_account_revisions := v_account_revisions || jsonb_build_array(
      jsonb_build_object(
        'accountId', v_account.id::text,
        'revision', v_account.financial_revision::text
      )
    );
  END LOOP;

  v_outcome := jsonb_build_object(
    'accountRevisions', v_account_revisions,
    'actionId', v_action_id::text,
    'effectiveEventId', null,
    'holdingRevision', null,
    'serverAcceptedAt', to_char(
      v_now AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'status', 'accepted'
  );
  v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);

  INSERT INTO public.financial_action_groups (
    action_id, user_id, domain, kind, domain_reference_id,
    payload_json, payload_hash, account_guards_json, state,
    server_outcome, outcome_json, rejection_code, deleted
  ) VALUES (
    v_action_id,
    v_owner_id,
    v_envelope ->> 'domain',
    v_envelope ->> 'kind',
    (v_envelope ->> 'domainReferenceId')::uuid,
    p_payload_json,
    p_payload_hash,
    v_envelope -> 'accountGuards',
    'accepted',
    'accepted',
    v_outcome_text,
    null,
    false
  );

  INSERT INTO public.account_financial_effects (
    id, user_id, action_id, account_id, domain, kind,
    amount_minor_units, currency, accepted_account_revision
  )
  SELECT
    (effect.value ->> 'effectId')::uuid,
    v_owner_id,
    v_action_id,
    (effect.value ->> 'accountId')::uuid,
    v_envelope ->> 'domain',
    v_envelope -> 'payload' ->> 'operationCode',
    private.financial_action_signed_minor_units_from_text_v1(
      effect.value ->> 'amountMinorUnits'
    ),
    (effect.value ->> 'currency')::public.currency_type,
    private.financial_action_account_revision_from_text_v1(
      guard.value ->> 'expectedRevision'
    ) + 1
  FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
    AS effect(value)
  JOIN jsonb_array_elements(v_envelope -> 'accountGuards') AS guard(value)
    ON guard.value ->> 'accountId' = effect.value ->> 'accountId';

  RETURN v_outcome;

  EXCEPTION WHEN OTHERS THEN
    v_conflict_state := SQLSTATE;
    v_conflict_message := SQLERRM;
    -- Unexpected errors are never converted into successful business results.
    IF v_conflict_state NOT IN ('22023', '23503', '23505', '40001', '42501') THEN
      RAISE;
    END IF;

    -- The inner savepoint discarded all tentative domain/root/effect rows;
    -- the outer publication, auth, owner and existing-root locks are retained.
    -- Recheck immutable root identity before creating any rejection evidence.
    SELECT root.* INTO v_existing
    FROM public.financial_action_groups AS root
    WHERE root.user_id = v_owner_id
      AND root.action_id = v_action_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash
        OR v_existing.payload_json IS DISTINCT FROM p_payload_json
      THEN
        RETURN jsonb_build_object(
          'actionId', v_action_id::text,
          'code', 'PAYLOAD_HASH_MISMATCH', 'status', 'rejected'
        );
      END IF;
      IF v_existing.server_outcome = 'accepted' THEN
        RETURN jsonb_set(
          v_existing.outcome_json::jsonb, '{status}',
          to_jsonb('idempotent'::text), false
        );
      END IF;
      RETURN v_existing.outcome_json::jsonb;
    END IF;
    -- The immutable action identity is (user_id, action_id). A foreign
    -- owner's same UUID must not veto this owner's canonical rejection.

    v_canonical_accounts := '[]'::jsonb;
    v_canonical_absent_account_ids := '[]'::jsonb;
    FOR v_guard IN
      SELECT value
      FROM jsonb_array_elements(v_envelope -> 'accountGuards')
      ORDER BY value ->> 'accountId' COLLATE "C"
    LOOP
      SELECT account.* INTO v_account
      FROM public.accounts AS account
      WHERE account.user_id = v_owner_id
        AND account.id = (v_guard ->> 'accountId')::uuid
      FOR UPDATE;
      IF FOUND THEN
        v_canonical_accounts := v_canonical_accounts || jsonb_build_array(
          private.account_financial_canonical_snapshot_v1(
            v_owner_id, (v_guard ->> 'accountId')::uuid
          )
        );
      ELSIF v_payload_version IN (
          'review.batch-save/v1', 'account.create-default/v1'
        ) AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            v_envelope -> 'payload' -> 'domainMutation' -> 'records'
          ) AS rec(value)
          WHERE rec.value ->> 'entity' = 'account'
            AND rec.value ->> 'mode' = 'create'
            AND rec.value -> 'after' ->> 'id' = v_guard ->> 'accountId'
        )
      THEN
        -- A known new-account guard may be absent after the failed savepoint.
        -- Derive its actual physical absence along with unguarded zero-opening
        -- Add creations below; do not invent a snapshot for this ID.
        NULL;
      ELSE
        RAISE EXCEPTION USING ERRCODE = '23503',
          MESSAGE = 'financial_action_existing_guard_missing_after_rollback';
      END IF;
    END LOOP;

    -- Failure rolled back the complete inner action. Unlike financial
    -- guards, zero-opening Add CREATEs may be intentionally unguarded.
    -- Enumerate every DECLARED account CREATE and prove its UUID truly absent
    -- from physical accounts before reporting canonicalAbsentAccountIds.
    IF v_payload_version IN (
      'review.batch-save/v1', 'account.create-default/v1'
    ) THEN
      SELECT coalesce(jsonb_agg(
        created.account_id ORDER BY created.account_id COLLATE "C"
      ), '[]'::jsonb)
      INTO v_canonical_absent_account_ids
      FROM (
        SELECT rec.value -> 'after' ->> 'id' AS account_id
        FROM jsonb_array_elements(
          v_envelope -> 'payload' -> 'domainMutation' -> 'records'
        ) AS rec(value)
        WHERE rec.value ->> 'entity' = 'account'
          AND rec.value ->> 'mode' = 'create'
          AND NOT EXISTS (
            SELECT 1 FROM public.accounts AS account
            WHERE account.id = (rec.value -> 'after' ->> 'id')::uuid
          )
      ) AS created;
    END IF;

    v_outcome := private.financial_action_domain_conflict_outcome_v1(
      v_action_id, v_conflict_state, v_conflict_message
    ) || jsonb_build_object('canonicalAccounts', v_canonical_accounts);
    IF v_payload_version IN (
      'review.batch-save/v1', 'account.create-default/v1'
    ) THEN
      v_outcome := v_outcome || jsonb_build_object(
        'canonicalAbsentAccountIds', v_canonical_absent_account_ids
      );
    END IF;
    IF v_payload_version = 'account.create-default/v1' THEN
      SELECT coalesce(jsonb_agg(id::text ORDER BY id::text COLLATE "C"), '[]'::jsonb)
      INTO v_actual_active_ids
      FROM public.accounts
      WHERE user_id = v_owner_id AND deleted = false;

      SELECT array_agg(id ORDER BY id::text COLLATE "C")
      INTO v_actual_default_ids
      FROM public.accounts
      WHERE user_id = v_owner_id AND deleted = false AND is_default = true;

      IF coalesce(array_length(v_actual_default_ids, 1), 0) > 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'financial_action_ambiguous_owned_default_graph';
      END IF;

      IF v_actual_default_ids IS NOT NULL AND array_length(v_actual_default_ids, 1) = 1 THEN
        v_canonical_default_snapshot := jsonb_build_object(
          'activeAccountIds', v_actual_active_ids,
          'defaultAccount', jsonb_build_object('accountId', v_actual_default_ids[1]::text, 'isDefault', true)
        );
      ELSE
        v_canonical_default_snapshot := jsonb_build_object(
          'activeAccountIds', v_actual_active_ids,
          'defaultAccount', 'null'::jsonb
        );
      END IF;

      v_outcome := v_outcome || jsonb_build_object(
        'canonicalDefaultSnapshot', v_canonical_default_snapshot
      );
    END IF;
    v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);
    INSERT INTO public.financial_action_groups (
      action_id, user_id, domain, kind, domain_reference_id,
      payload_json, payload_hash, account_guards_json, state,
      server_outcome, outcome_json, rejection_code, deleted
    ) VALUES (
      v_action_id,
      v_owner_id,
      v_envelope ->> 'domain',
      v_envelope ->> 'kind',
      (v_envelope ->> 'domainReferenceId')::uuid,
      p_payload_json,
      p_payload_hash,
      v_envelope -> 'accountGuards',
      'reconciled',
      'rejected',
      v_outcome_text,
      lower(v_outcome ->> 'code'),
      false
    );

    -- Failed/stale NEW Review and Add roots retain immutable requested guards
    -- but ZERO physical effects. Only deployed legacy v1 keeps its original
    -- compensated-effect evidence contract.
    IF v_payload_version = 'account.balance-effects/v1' THEN
      INSERT INTO public.account_financial_effects (
        id, user_id, action_id, account_id, domain, kind,
        amount_minor_units, currency, accepted_account_revision,
        is_effective, compensated_at
      )
      SELECT
        (effect.value ->> 'effectId')::uuid,
        v_owner_id,
        v_action_id,
        (effect.value ->> 'accountId')::uuid,
        v_envelope ->> 'domain',
        v_envelope -> 'payload' ->> 'operationCode',
        private.financial_action_signed_minor_units_from_text_v1(
          effect.value ->> 'amountMinorUnits'
        ),
        (effect.value ->> 'currency')::public.currency_type,
        private.financial_action_account_revision_from_text_v1(
          guard.value ->> 'expectedRevision'
        ) + 1,
        false,
        v_now
      FROM jsonb_array_elements(v_envelope -> 'payload' -> 'accountEffects')
        AS effect(value)
      JOIN jsonb_array_elements(v_envelope -> 'accountGuards') AS guard(value)
        ON guard.value ->> 'accountId' = effect.value ->> 'accountId';
    END IF;
    RETURN v_outcome;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.financial_action_validate_account_create_default_payload_v1(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_account_create_default_payload_v1(jsonb, text) TO service_role;

COMMIT;
