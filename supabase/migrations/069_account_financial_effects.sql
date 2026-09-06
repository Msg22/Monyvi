-- Issue #242 Slice 3B account-financial cutover.
--
-- Existing account writers use the exact account.balance-effects/v1 payload.
-- Every writer tuple is registered explicitly; unknown tuples remain fail-closed.

ALTER TABLE public.accounts
  ADD COLUMN financial_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_financial_revision_range CHECK (
    financial_revision >= 0
    AND financial_revision <= 9223372036854775807
  ),
  ADD CONSTRAINT accounts_user_id_id_key UNIQUE (user_id, id);

CREATE OR REPLACE FUNCTION private.financial_action_account_revision_from_text_v1(
  p_value text
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision bigint;
BEGIN
  IF p_value !~ '^(0|[1-9][0-9]{0,18})$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END IF;

  BEGIN
    v_revision := p_value::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END;

  IF v_revision < 0 OR v_revision > 9223372036854775807 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END IF;

  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_account_guards_v1(
  p_guards jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guard jsonb;
  v_account_id text;
  v_previous_account_id text;
BEGIN
  IF jsonb_typeof(p_guards) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END IF;

  FOR v_guard IN
    SELECT guard.value
    FROM jsonb_array_elements(p_guards) WITH ORDINALITY AS guard(value, position)
    ORDER BY guard.position
  LOOP
    IF jsonb_typeof(v_guard) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_guard) AS key
      ) IS DISTINCT FROM ARRAY['accountId', 'expectedRevision']::text[]
      OR jsonb_typeof(v_guard -> 'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_guard -> 'expectedRevision') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_account_guards_invalid';
    END IF;

    v_account_id := v_guard ->> 'accountId';
    IF v_account_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_account_guards_invalid';
    END IF;

    PERFORM private.financial_action_account_revision_from_text_v1(
      v_guard ->> 'expectedRevision'
    );

    IF v_previous_account_id IS NOT NULL
      AND (v_previous_account_id COLLATE "C") >= (v_account_id COLLATE "C")
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_account_guards_invalid';
    END IF;
    v_previous_account_id := v_account_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_signed_minor_units_from_text_v1(
  p_value text
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount bigint;
BEGIN
  IF p_value !~ '^-?(0|[1-9][0-9]{0,18})$' OR p_value IN ('0', '-0') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_effect';
  END IF;

  BEGIN
    v_amount := p_value::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_effect';
  END;

  IF v_amount = -9223372036854775808 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_effect';
  END IF;
  RETURN v_amount;
END;
$$;

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
    ('accounts', 'pending_prepare', 'account.pending.prepare'),
    ('accounts', 'edit_balance', 'account.edit-balance'),
    ('transactions', 'create', 'transaction.create'),
    ('transactions', 'update', 'transaction.update'),
    ('transactions', 'delete', 'transaction.delete'),
    ('transactions', 'convert_to_transfer', 'transaction.convert-to-transfer'),
    ('transactions', 'batch_delete', 'transaction.batch-delete'),
    ('transactions', 'batch_import', 'transaction.batch-import'),
    ('transfers', 'create', 'transfer.create'),
    ('transfers', 'update', 'transfer.update'),
    ('transfers', 'delete', 'transfer.delete'),
    ('transfers', 'convert_to_transaction', 'transfer.convert-to-transaction'),
    ('recurring_payments', 'pay_now', 'recurring.pay-now'),
    ('sms', 'review_confirm', 'sms.review-durable')
  );
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_domain_mutation_v1(
  p_mutation jsonb,
  p_operation_code text,
  p_domain_record_refs jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record jsonb;
  v_after jsonb;
  v_entity text;
  v_mode text;
  v_id text;
  v_previous_sort_key text;
  v_refs jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_mutation) IS DISTINCT FROM 'object'
    OR (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(p_mutation) AS key
    ) IS DISTINCT FROM ARRAY['records']::text[]
    OR jsonb_typeof(p_mutation -> 'records') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_mutation -> 'records') = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  FOR v_record IN
    SELECT record.value
    FROM jsonb_array_elements(p_mutation -> 'records') WITH ORDINALITY
      AS record(value, position)
    ORDER BY record.position
  LOOP
    IF jsonb_typeof(v_record) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_record) AS key
      ) IS DISTINCT FROM ARRAY['after', 'entity', 'expectedUpdatedAt', 'mode']::text[]
      OR jsonb_typeof(v_record -> 'after') IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_record -> 'entity') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_record -> 'mode') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_record -> 'expectedUpdatedAt') NOT IN ('null', 'string')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    v_after := v_record -> 'after';
    v_entity := v_record ->> 'entity';
    v_mode := v_record ->> 'mode';
    v_id := v_after ->> 'id';

    IF v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_mode = 'create' AND jsonb_typeof(v_record -> 'expectedUpdatedAt') <> 'null')
      OR (v_mode <> 'create' AND (
        jsonb_typeof(v_record -> 'expectedUpdatedAt') <> 'string'
        OR (v_record ->> 'expectedUpdatedAt') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      ))
      OR v_mode NOT IN ('create', 'update', 'delete')
      OR (v_previous_sort_key IS NOT NULL AND
        (v_previous_sort_key COLLATE "C") >= ((v_entity || ':' || v_id) COLLATE "C"))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    IF v_entity = 'account' THEN
      IF (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_after) AS key
      ) IS DISTINCT FROM ARRAY[
        'createdAt', 'currency', 'deleted', 'id', 'institutionId', 'isDefault',
        'name', 'openingBalanceMinorUnits', 'providerDisplayName',
        'targetBalanceMinorUnits', 'type'
      ]::text[]
        OR p_operation_code NOT IN (
          'account.cash.create-within-writer', 'account.cash.prepare',
          'account.cash.prepare-named', 'account.create', 'account.pending.prepare',
          'account.edit-balance'
        )
        OR (p_operation_code = 'account.edit-balance' AND v_mode <> 'update')
        OR (p_operation_code <> 'account.edit-balance' AND v_mode <> 'create')
        OR jsonb_typeof(v_after -> 'name') IS DISTINCT FROM 'string'
        OR length(btrim(v_after ->> 'name')) = 0
        OR v_after ->> 'type' NOT IN ('CASH', 'BANK', 'DIGITAL_WALLET')
        OR jsonb_typeof(v_after -> 'isDefault') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_mode = 'create' AND (
          (v_after ->> 'deleted')::boolean
          OR jsonb_typeof(v_after -> 'openingBalanceMinorUnits') <> 'string'
          OR jsonb_typeof(v_after -> 'targetBalanceMinorUnits') <> 'null'
        ))
        OR (v_mode = 'update' AND (
          jsonb_typeof(v_after -> 'openingBalanceMinorUnits') <> 'null'
          OR jsonb_typeof(v_after -> 'targetBalanceMinorUnits') <> 'string'
        ))
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
    ELSIF v_entity = 'transaction' THEN
      IF (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_after) AS key
      ) IS DISTINCT FROM ARRAY[
        'accountId', 'amountMinorUnits', 'categoryId', 'counterparty', 'createdAt',
        'currency', 'date', 'deleted', 'id', 'isDraft', 'linkedAssetId',
        'linkedDebtId', 'linkedRecurringId', 'note', 'smsFingerprint', 'source',
        'type'
      ]::text[]
        OR p_operation_code NOT IN (
          'transaction.create', 'transaction.update', 'transaction.delete',
          'transaction.convert-to-transfer', 'transaction.batch-delete',
        'transaction.batch-import', 'transfer.convert-to-transaction',
        'recurring.pay-now', 'sms.review-durable'
        )
        OR (
        p_operation_code IN (
          'transaction.create', 'transaction.batch-import',
          'transfer.convert-to-transaction', 'recurring.pay-now',
          'sms.review-durable'
        )
          AND v_mode <> 'create'
        )
        OR (p_operation_code = 'transaction.update' AND v_mode <> 'update')
        OR (
          p_operation_code IN (
            'transaction.delete', 'transaction.batch-delete',
            'transaction.convert-to-transfer'
          )
          AND v_mode <> 'delete'
        )
        OR jsonb_typeof(v_after -> 'amountMinorUnits') IS DISTINCT FROM 'string'
        OR (v_after ->> 'amountMinorUnits') !~ '^[1-9][0-9]{0,18}$'
        OR v_after ->> 'type' NOT IN ('EXPENSE', 'INCOME')
        OR v_after ->> 'source' NOT IN ('MANUAL', 'VOICE', 'SMS', 'RECURRING')
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_mode = 'delete' AND NOT (v_after ->> 'deleted')::boolean)
        OR (v_mode <> 'delete' AND (v_after ->> 'deleted')::boolean)
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
    ELSIF v_entity = 'recurring_payment' THEN
      IF (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_after) AS key
      ) IS DISTINCT FROM ARRAY['id', 'nextDueDate', 'status']::text[]
        OR p_operation_code <> 'recurring.pay-now'
        OR v_mode <> 'update'
        OR (v_after ->> 'nextDueDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR v_after ->> 'status' NOT IN ('ACTIVE', 'COMPLETED')
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
    ELSIF v_entity = 'sms_review_draft_item' THEN
      IF (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_after) AS key
      ) IS DISTINCT FROM ARRAY[
        'id', 'queueId', 'smsFingerprint', 'snapshotHash'
      ]::text[]
        OR p_operation_code <> 'sms.review-durable'
        OR v_mode <> 'delete'
        OR (v_after ->> 'queueId') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR jsonb_typeof(v_after -> 'smsFingerprint') <> 'string'
        OR length(v_after ->> 'smsFingerprint') = 0
        OR (v_after ->> 'snapshotHash') !~ '^[0-9a-f]{64}$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
    ELSIF v_entity = 'transfer' THEN
      IF (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_after) AS key
      ) IS DISTINCT FROM ARRAY[
        'amountMinorUnits', 'convertedAmountMinorUnits', 'createdAt', 'currency',
        'date', 'deleted', 'exchangeRate', 'fromAccountId', 'id', 'notes',
        'smsFingerprint', 'toAccountId'
      ]::text[]
        OR p_operation_code NOT IN (
          'transfer.create', 'transfer.update', 'transfer.delete',
          'transfer.convert-to-transaction', 'transaction.convert-to-transfer',
          'transaction.batch-delete'
        )
        OR (
          p_operation_code IN ('transfer.create', 'transaction.convert-to-transfer')
          AND v_mode <> 'create'
        )
        OR (p_operation_code = 'transfer.update' AND v_mode <> 'update')
        OR (
          p_operation_code IN (
            'transfer.delete', 'transfer.convert-to-transaction',
            'transaction.batch-delete'
          )
          AND v_mode <> 'delete'
        )
        OR jsonb_typeof(v_after -> 'amountMinorUnits') IS DISTINCT FROM 'string'
        OR (v_after ->> 'amountMinorUnits') !~ '^[1-9][0-9]{0,18}$'
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_mode = 'delete' AND NOT (v_after ->> 'deleted')::boolean)
        OR (v_mode <> 'delete' AND (v_after ->> 'deleted')::boolean)
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    IF v_entity NOT IN ('recurring_payment', 'sms_review_draft_item')
      AND (v_after ->> 'createdAt') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    v_refs := v_refs || jsonb_build_array(v_id);
    v_previous_sort_key := v_entity || ':' || v_id;
  END LOOP;

  SELECT coalesce(jsonb_agg(reference.value ORDER BY reference.value #>> '{}' COLLATE "C"), '[]'::jsonb)
  INTO v_refs
  FROM jsonb_array_elements(v_refs) AS reference(value);

  IF v_refs IS DISTINCT FROM p_domain_record_refs THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_domain_refs_mismatch';
  END IF;

  IF p_operation_code IN (
      'account.cash.create-within-writer', 'account.cash.prepare',
      'account.cash.prepare-named', 'account.create', 'account.pending.prepare',
      'account.edit-balance', 'transaction.create', 'transaction.update', 'transaction.delete',
      'transfer.create', 'transfer.update', 'transfer.delete'
    ) AND jsonb_array_length(p_mutation -> 'records') <> 1
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;
  IF p_operation_code IN (
      'transaction.convert-to-transfer', 'transfer.convert-to-transaction'
    ) AND (
      jsonb_array_length(p_mutation -> 'records') <> 2
      OR (
        SELECT count(DISTINCT record.value ->> 'entity')
        FROM jsonb_array_elements(p_mutation -> 'records') AS record(value)
      ) <> 2
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;
  IF p_operation_code = 'recurring.pay-now' AND (
      jsonb_array_length(p_mutation -> 'records') <> 2
      OR p_mutation -> 'records' -> 0 ->> 'entity' <> 'recurring_payment'
      OR p_mutation -> 'records' -> 1 ->> 'entity' <> 'transaction'
      OR p_mutation -> 'records' -> 1 -> 'after' ->> 'linkedRecurringId'
        IS DISTINCT FROM p_mutation -> 'records' -> 0 -> 'after' ->> 'id'
      OR p_mutation -> 'records' -> 1 -> 'after' ->> 'source' <> 'RECURRING'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;
  IF p_operation_code = 'sms.review-durable' AND (
      jsonb_array_length(p_mutation -> 'records') <> 2
      OR p_mutation -> 'records' -> 0 ->> 'entity' <> 'sms_review_draft_item'
      OR p_mutation -> 'records' -> 1 ->> 'entity' <> 'transaction'
      OR p_mutation -> 'records' -> 1 -> 'after' ->> 'smsFingerprint'
        IS DISTINCT FROM p_mutation -> 'records' -> 0 -> 'after' ->> 'smsFingerprint'
      OR p_mutation -> 'records' -> 1 -> 'after' ->> 'source' <> 'SMS'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.account_financial_minor_units_from_numeric_v1(
  p_amount numeric,
  p_currency public.currency_type
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scaled numeric;
BEGIN
  v_scaled := p_amount * power(
    10::numeric,
    private.account_currency_minor_unit_scale_v1(p_currency)
  );
  IF v_scaled <> trunc(v_scaled)
    OR v_scaled < -9223372036854775807
    OR v_scaled > 9223372036854775807
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
  END IF;
  RETURN v_scaled::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION private.account_financial_accumulate_effect_v1(
  p_effects jsonb,
  p_account_id uuid,
  p_currency public.currency_type,
  p_delta bigint
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text := p_account_id::text;
  v_existing jsonb := p_effects -> v_key;
  v_amount numeric;
BEGIN
  IF v_existing IS NOT NULL
    AND v_existing ->> 'currency' IS DISTINCT FROM p_currency::text
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_account_currency_mismatch';
  END IF;
  v_amount := coalesce((v_existing ->> 'amountMinorUnits')::numeric, 0) + p_delta;
  IF v_amount < -9223372036854775807 OR v_amount > 9223372036854775807 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
  END IF;
  IF v_amount = 0 THEN
    RETURN p_effects - v_key;
  END IF;
  RETURN jsonb_set(
    p_effects,
    ARRAY[v_key],
    jsonb_build_object(
      'amountMinorUnits', v_amount::bigint::text,
      'currency', p_currency::text
    ),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_expected_account_effects_v1(
  p_owner_id uuid,
  p_domain_mutation jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_effect_map jsonb := '{}'::jsonb;
  v_record jsonb;
  v_after jsonb;
  v_account public.accounts%ROWTYPE;
  v_transaction public.transactions%ROWTYPE;
  v_transfer public.transfers%ROWTYPE;
  v_amount bigint;
  v_converted bigint;
  v_old_amount bigint;
  v_currency public.currency_type;
BEGIN
  FOR v_record IN
    SELECT record.value
    FROM jsonb_array_elements(p_domain_mutation -> 'records') WITH ORDINALITY
      AS record(value, position)
    ORDER BY record.position
  LOOP
    v_after := v_record -> 'after';
    IF v_record ->> 'entity' = 'account' THEN
      IF v_record ->> 'mode' = 'create' THEN
        v_amount := CASE v_after ->> 'openingBalanceMinorUnits'
          WHEN '0' THEN 0
          ELSE private.financial_action_signed_minor_units_from_text_v1(
            v_after ->> 'openingBalanceMinorUnits'
          )
        END;
      ELSE
        SELECT account.* INTO STRICT v_account
        FROM public.accounts AS account
        WHERE account.user_id = p_owner_id
          AND account.id = (v_after ->> 'id')::uuid;
        v_amount := CASE v_after ->> 'targetBalanceMinorUnits'
          WHEN '0' THEN 0
          ELSE private.financial_action_signed_minor_units_from_text_v1(
            v_after ->> 'targetBalanceMinorUnits'
          )
        END - private.account_financial_minor_units_from_numeric_v1(
          v_account.balance,
          v_account.currency
        );
      END IF;
      v_effect_map := private.account_financial_accumulate_effect_v1(
        v_effect_map,
        (v_after ->> 'id')::uuid,
        (v_after ->> 'currency')::public.currency_type,
        v_amount
      );
    ELSIF v_record ->> 'entity' = 'transaction' THEN
      IF v_record ->> 'mode' <> 'create' THEN
        SELECT transaction.* INTO STRICT v_transaction
        FROM public.transactions AS transaction
        WHERE transaction.user_id = p_owner_id
          AND transaction.id = (v_after ->> 'id')::uuid;
        IF v_transaction.deleted = false THEN
          v_old_amount := private.account_financial_minor_units_from_numeric_v1(
            v_transaction.amount,
            v_transaction.currency
          );
          v_effect_map := private.account_financial_accumulate_effect_v1(
            v_effect_map,
            v_transaction.account_id,
            v_transaction.currency,
            CASE v_transaction.type
              WHEN 'INCOME'::public.transaction_type THEN -v_old_amount
              ELSE v_old_amount
            END
          );
        END IF;
      END IF;
      IF (v_after ->> 'deleted')::boolean = false THEN
        v_amount := private.financial_action_signed_minor_units_from_text_v1(
          v_after ->> 'amountMinorUnits'
        );
        v_effect_map := private.account_financial_accumulate_effect_v1(
          v_effect_map,
          (v_after ->> 'accountId')::uuid,
          (v_after ->> 'currency')::public.currency_type,
          CASE v_after ->> 'type' WHEN 'INCOME' THEN v_amount ELSE -v_amount END
        );
      END IF;
    ELSIF v_record ->> 'entity' = 'transfer' THEN
      IF v_record ->> 'mode' <> 'create' THEN
        SELECT transfer.* INTO STRICT v_transfer
        FROM public.transfers AS transfer
        WHERE transfer.user_id = p_owner_id
          AND transfer.id = (v_after ->> 'id')::uuid;
        IF v_transfer.deleted = false THEN
          v_old_amount := private.account_financial_minor_units_from_numeric_v1(
            v_transfer.amount,
            v_transfer.currency
          );
          SELECT account.currency INTO STRICT v_currency
          FROM public.accounts AS account
          WHERE account.user_id = p_owner_id AND account.id = v_transfer.to_account_id;
          v_converted := private.account_financial_minor_units_from_numeric_v1(
            coalesce(v_transfer.converted_amount, v_transfer.amount),
            v_currency
          );
          v_effect_map := private.account_financial_accumulate_effect_v1(
            v_effect_map, v_transfer.from_account_id, v_transfer.currency, v_old_amount
          );
          v_effect_map := private.account_financial_accumulate_effect_v1(
            v_effect_map, v_transfer.to_account_id, v_currency, -v_converted
          );
        END IF;
      END IF;
      IF (v_after ->> 'deleted')::boolean = false THEN
        v_amount := private.financial_action_signed_minor_units_from_text_v1(
          v_after ->> 'amountMinorUnits'
        );
        SELECT account.currency INTO STRICT v_currency
        FROM public.accounts AS account
        WHERE account.user_id = p_owner_id
          AND account.id = (v_after ->> 'toAccountId')::uuid;
        v_converted := CASE
          WHEN v_after ->> 'convertedAmountMinorUnits' IS NULL THEN v_amount
          ELSE private.financial_action_signed_minor_units_from_text_v1(
            v_after ->> 'convertedAmountMinorUnits'
          )
        END;
        v_effect_map := private.account_financial_accumulate_effect_v1(
          v_effect_map,
          (v_after ->> 'fromAccountId')::uuid,
          (v_after ->> 'currency')::public.currency_type,
          -v_amount
        );
        v_effect_map := private.account_financial_accumulate_effect_v1(
          v_effect_map,
          (v_after ->> 'toAccountId')::uuid,
          v_currency,
          v_converted
        );
      END IF;
    END IF;
  END LOOP;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'accountId', effect.key,
        'amountMinorUnits', effect.value ->> 'amountMinorUnits',
        'currency', effect.value ->> 'currency'
      )
      ORDER BY effect.key COLLATE "C"
    )
    FROM jsonb_each(v_effect_map) AS effect(key, value)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_apply_account_mutation_v1(
  p_owner_id uuid,
  p_operation_code text,
  p_record jsonb,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_after jsonb := p_record -> 'after';
  v_affected integer;
BEGIN
  IF p_operation_code NOT IN (
    'account.cash.create-within-writer', 'account.cash.prepare',
    'account.cash.prepare-named', 'account.create', 'account.pending.prepare',
    'account.edit-balance'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_unknown_operation';
  END IF;

  IF p_record ->> 'mode' = 'create' THEN
    INSERT INTO public.accounts (
      id, user_id, name, type, balance, currency, institution_id,
      provider_display_name, is_default, created_at, updated_at, deleted,
      financial_revision
    ) VALUES (
      (v_after ->> 'id')::uuid,
      p_owner_id,
      v_after ->> 'name',
      (v_after ->> 'type')::public.account_type,
      0,
      (v_after ->> 'currency')::public.currency_type,
      v_after ->> 'institutionId',
      v_after ->> 'providerDisplayName',
      (v_after ->> 'isDefault')::boolean,
      (v_after ->> 'createdAt')::timestamptz,
      p_now,
      (v_after ->> 'deleted')::boolean,
      0
    );
    RETURN;
  END IF;

  UPDATE public.accounts AS account
  SET
    name = v_after ->> 'name',
    type = (v_after ->> 'type')::public.account_type,
    currency = (v_after ->> 'currency')::public.currency_type,
    institution_id = v_after ->> 'institutionId',
    provider_display_name = v_after ->> 'providerDisplayName',
    is_default = (v_after ->> 'isDefault')::boolean,
    deleted = (v_after ->> 'deleted')::boolean,
    updated_at = p_now
  WHERE account.user_id = p_owner_id
    AND account.id = (v_after ->> 'id')::uuid
    AND account.created_at = (v_after ->> 'createdAt')::timestamptz
    AND account.updated_at = (p_record ->> 'expectedUpdatedAt')::timestamptz;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'financial_action_domain_revision_stale';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_apply_transaction_mutation_v1(
  p_owner_id uuid,
  p_operation_code text,
  p_record jsonb,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_after jsonb := p_record -> 'after';
  v_affected integer;
BEGIN
  IF p_operation_code NOT IN (
    'transaction.create', 'transaction.update', 'transaction.delete',
    'transaction.convert-to-transfer', 'transaction.batch-delete',
    'transaction.batch-import', 'transfer.convert-to-transaction',
    'recurring.pay-now', 'sms.review-durable'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_unknown_operation';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.categories AS category
      WHERE category.id = (v_after ->> 'categoryId')::uuid
        AND category.deleted = false
        AND (category.user_id IS NULL OR category.user_id = p_owner_id)
    )
    OR (
      v_after ->> 'linkedDebtId' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.debts AS debt
        WHERE debt.id = (v_after ->> 'linkedDebtId')::uuid
          AND debt.user_id = p_owner_id
      )
    )
    OR (
      v_after ->> 'linkedAssetId' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.assets AS asset
        WHERE asset.id = (v_after ->> 'linkedAssetId')::uuid
          AND asset.user_id = p_owner_id
      )
    )
    OR (
      v_after ->> 'linkedRecurringId' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.recurring_payments AS payment
        WHERE payment.id = (v_after ->> 'linkedRecurringId')::uuid
          AND payment.user_id = p_owner_id
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'financial_action_link_not_owned';
  END IF;

  IF p_record ->> 'mode' = 'create' THEN
    INSERT INTO public.transactions (
      id, user_id, account_id, amount, currency, type, category_id,
      counterparty, note, date, source, is_draft, linked_debt_id,
      linked_asset_id, linked_recurring_id, sms_fingerprint,
      created_at, updated_at, deleted
    ) VALUES (
      (v_after ->> 'id')::uuid,
      p_owner_id,
      (v_after ->> 'accountId')::uuid,
      private.financial_action_signed_minor_units_from_text_v1(
        v_after ->> 'amountMinorUnits'
      )::numeric / power(
        10::numeric,
        private.account_currency_minor_unit_scale_v1(
          (v_after ->> 'currency')::public.currency_type
        )
      ),
      (v_after ->> 'currency')::public.currency_type,
      (v_after ->> 'type')::public.transaction_type,
      (v_after ->> 'categoryId')::uuid,
      v_after ->> 'counterparty',
      v_after ->> 'note',
      (v_after ->> 'date')::date,
      (v_after ->> 'source')::public.transaction_source,
      (v_after ->> 'isDraft')::boolean,
      nullif(v_after ->> 'linkedDebtId', '')::uuid,
      nullif(v_after ->> 'linkedAssetId', '')::uuid,
      nullif(v_after ->> 'linkedRecurringId', '')::uuid,
      v_after ->> 'smsFingerprint',
      (v_after ->> 'createdAt')::timestamptz,
      p_now,
      (v_after ->> 'deleted')::boolean
    );
    RETURN;
  END IF;

  UPDATE public.transactions AS transaction
  SET
    account_id = (v_after ->> 'accountId')::uuid,
    amount = private.financial_action_signed_minor_units_from_text_v1(
      v_after ->> 'amountMinorUnits'
    )::numeric / power(
      10::numeric,
      private.account_currency_minor_unit_scale_v1(
        (v_after ->> 'currency')::public.currency_type
      )
    ),
    currency = (v_after ->> 'currency')::public.currency_type,
    type = (v_after ->> 'type')::public.transaction_type,
    category_id = (v_after ->> 'categoryId')::uuid,
    counterparty = v_after ->> 'counterparty',
    note = v_after ->> 'note',
    date = (v_after ->> 'date')::date,
    source = (v_after ->> 'source')::public.transaction_source,
    is_draft = (v_after ->> 'isDraft')::boolean,
    linked_debt_id = nullif(v_after ->> 'linkedDebtId', '')::uuid,
    linked_asset_id = nullif(v_after ->> 'linkedAssetId', '')::uuid,
    linked_recurring_id = nullif(v_after ->> 'linkedRecurringId', '')::uuid,
    sms_fingerprint = v_after ->> 'smsFingerprint',
    deleted = (v_after ->> 'deleted')::boolean,
    updated_at = p_now
  WHERE transaction.user_id = p_owner_id
    AND transaction.id = (v_after ->> 'id')::uuid
    AND transaction.created_at = (v_after ->> 'createdAt')::timestamptz
    AND transaction.updated_at = (p_record ->> 'expectedUpdatedAt')::timestamptz;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'financial_action_domain_revision_stale';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_apply_transfer_mutation_v1(
  p_owner_id uuid,
  p_operation_code text,
  p_record jsonb,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_after jsonb := p_record -> 'after';
  v_affected integer;
  v_amount numeric;
  v_converted_amount numeric;
  v_destination_currency public.currency_type;
BEGIN
  IF p_operation_code NOT IN (
    'transfer.create', 'transfer.update', 'transfer.delete',
    'transfer.convert-to-transaction', 'transaction.convert-to-transfer',
    'transaction.batch-delete'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_unknown_operation';
  END IF;

  v_amount := private.financial_action_signed_minor_units_from_text_v1(
    v_after ->> 'amountMinorUnits'
  )::numeric / power(
    10::numeric,
    private.account_currency_minor_unit_scale_v1(
      (v_after ->> 'currency')::public.currency_type
    )
  );
  SELECT account.currency
  INTO STRICT v_destination_currency
  FROM public.accounts AS account
  WHERE account.user_id = p_owner_id
    AND account.id = (v_after ->> 'toAccountId')::uuid;
  v_converted_amount := CASE
    WHEN v_after ->> 'convertedAmountMinorUnits' IS NULL THEN null
    ELSE private.financial_action_signed_minor_units_from_text_v1(
      v_after ->> 'convertedAmountMinorUnits'
    )::numeric / power(
       10::numeric,
       private.account_currency_minor_unit_scale_v1(
         v_destination_currency
       )
    )
  END;

  IF p_record ->> 'mode' = 'create' THEN
    INSERT INTO public.transfers (
      id, user_id, from_account_id, to_account_id, amount, currency,
      exchange_rate, converted_amount, notes, date, sms_fingerprint,
      created_at, updated_at, deleted
    ) VALUES (
      (v_after ->> 'id')::uuid,
      p_owner_id,
      (v_after ->> 'fromAccountId')::uuid,
      (v_after ->> 'toAccountId')::uuid,
      v_amount,
      (v_after ->> 'currency')::public.currency_type,
      nullif(v_after ->> 'exchangeRate', '')::numeric,
      v_converted_amount,
      v_after ->> 'notes',
      (v_after ->> 'date')::date,
      v_after ->> 'smsFingerprint',
      (v_after ->> 'createdAt')::timestamptz,
      p_now,
      (v_after ->> 'deleted')::boolean
    );
    RETURN;
  END IF;

  UPDATE public.transfers AS transfer
  SET
    from_account_id = (v_after ->> 'fromAccountId')::uuid,
    to_account_id = (v_after ->> 'toAccountId')::uuid,
    amount = v_amount,
    currency = (v_after ->> 'currency')::public.currency_type,
    exchange_rate = nullif(v_after ->> 'exchangeRate', '')::numeric,
    converted_amount = v_converted_amount,
    notes = v_after ->> 'notes',
    date = (v_after ->> 'date')::date,
    sms_fingerprint = v_after ->> 'smsFingerprint',
    deleted = (v_after ->> 'deleted')::boolean,
    updated_at = p_now
  WHERE transfer.user_id = p_owner_id
    AND transfer.id = (v_after ->> 'id')::uuid
    AND transfer.created_at = (v_after ->> 'createdAt')::timestamptz
    AND transfer.updated_at = (p_record ->> 'expectedUpdatedAt')::timestamptz;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'financial_action_domain_revision_stale';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_apply_recurring_schedule_mutation_v1(
  p_owner_id uuid,
  p_operation_code text,
  p_record jsonb,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_after jsonb := p_record -> 'after';
  v_payment public.recurring_payments%ROWTYPE;
  v_next_due_date date;
  v_expected_due_date date;
  v_expected_status public.recurring_status;
  v_affected integer;
BEGIN
  IF p_operation_code <> 'recurring.pay-now'
    OR p_record ->> 'mode' <> 'update'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_unknown_operation';
  END IF;

  SELECT payment.* INTO STRICT v_payment
  FROM public.recurring_payments AS payment
  WHERE payment.user_id = p_owner_id
    AND payment.id = (v_after ->> 'id')::uuid
    AND payment.deleted = false
    AND payment.status = 'ACTIVE'::public.recurring_status
    AND (
      payment.end_date IS NULL
      OR payment.next_due_date <= payment.end_date
    )
  FOR UPDATE;

  v_next_due_date := CASE v_payment.frequency
    WHEN 'DAILY'::public.recurring_frequency THEN v_payment.next_due_date + 1
    WHEN 'WEEKLY'::public.recurring_frequency THEN v_payment.next_due_date + 7
    WHEN 'QUARTERLY'::public.recurring_frequency THEN
      (v_payment.next_due_date + interval '3 months')::date
    WHEN 'YEARLY'::public.recurring_frequency THEN
      (v_payment.next_due_date + interval '12 months')::date
    ELSE (v_payment.next_due_date + interval '1 month')::date
  END;
  IF v_payment.end_date IS NOT NULL AND v_next_due_date > v_payment.end_date THEN
    v_expected_due_date := v_payment.next_due_date;
    v_expected_status := 'COMPLETED'::public.recurring_status;
  ELSE
    v_expected_due_date := v_next_due_date;
    v_expected_status := 'ACTIVE'::public.recurring_status;
  END IF;

  IF (v_after ->> 'nextDueDate')::date IS DISTINCT FROM v_expected_due_date
    OR (v_after ->> 'status')::public.recurring_status IS DISTINCT FROM v_expected_status
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  UPDATE public.recurring_payments AS payment
  SET
    next_due_date = v_expected_due_date,
    status = v_expected_status,
    updated_at = p_now
  WHERE payment.user_id = p_owner_id
    AND payment.id = v_payment.id
    AND payment.updated_at = (p_record ->> 'expectedUpdatedAt')::timestamptz;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'financial_action_domain_revision_stale';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_dispatch_domain_mutation_v1(
  p_owner_id uuid,
  p_operation_code text,
  p_domain_mutation jsonb,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record jsonb;
BEGIN
  FOR v_record IN
    SELECT record.value
    FROM jsonb_array_elements(p_domain_mutation -> 'records') WITH ORDINALITY
      AS record(value, position)
    ORDER BY record.position
  LOOP
    CASE v_record ->> 'entity'
      WHEN 'account' THEN
        PERFORM private.financial_action_apply_account_mutation_v1(
          p_owner_id, p_operation_code, v_record, p_now
        );
      WHEN 'transaction' THEN
        PERFORM private.financial_action_apply_transaction_mutation_v1(
          p_owner_id, p_operation_code, v_record, p_now
        );
      WHEN 'transfer' THEN
        PERFORM private.financial_action_apply_transfer_mutation_v1(
          p_owner_id, p_operation_code, v_record, p_now
        );
      WHEN 'recurring_payment' THEN
        PERFORM private.financial_action_apply_recurring_schedule_mutation_v1(
          p_owner_id, p_operation_code, v_record, p_now
        );
      WHEN 'sms_review_draft_item' THEN
        -- Local-only cleanup descriptor. It is validated and hashed above, but
        -- no Supabase draft table exists and this dispatcher performs no mutation.
        IF p_operation_code <> 'sms.review-durable' THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_unknown_operation';
        END IF;
      ELSE
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END CASE;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_account_balance_effects_payload_v1(
  p_payload jsonb,
  p_domain_reference_id text,
  p_expected_operation_code text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reference jsonb;
  v_previous_reference text;
  v_effect jsonb;
  v_account_id text;
  v_previous_account_id text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(p_payload) AS key
    ) IS DISTINCT FROM ARRAY[
      'accountEffects', 'domainMutation', 'domainRecordRefs', 'operationCode',
      'schemaVersion'
    ]::text[]
    OR p_payload ->> 'schemaVersion' IS DISTINCT FROM 'account.balance-effects/v1'
    OR p_payload ->> 'operationCode' IS DISTINCT FROM p_expected_operation_code
    OR jsonb_typeof(p_payload -> 'domainRecordRefs') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload -> 'domainRecordRefs') = 0
    OR jsonb_typeof(p_payload -> 'domainMutation') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload -> 'accountEffects') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload -> 'accountEffects') = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  FOR v_reference IN
    SELECT reference.value
    FROM jsonb_array_elements(p_payload -> 'domainRecordRefs') WITH ORDINALITY
      AS reference(value, position)
    ORDER BY reference.position
  LOOP
    IF jsonb_typeof(v_reference) IS DISTINCT FROM 'string'
      OR (v_reference #>> '{}') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (
        v_previous_reference IS NOT NULL
        AND (v_previous_reference COLLATE "C") >= ((v_reference #>> '{}') COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
    v_previous_reference := v_reference #>> '{}';
  END LOOP;

  IF NOT (p_payload -> 'domainRecordRefs') @> jsonb_build_array(p_domain_reference_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  IF p_expected_operation_code IN ('recurring.pay-now', 'sms.review-durable')
    AND p_payload -> 'domainMutation' -> 'records' -> 0 -> 'after' ->> 'id'
      IS DISTINCT FROM p_domain_reference_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  PERFORM private.financial_action_validate_domain_mutation_v1(
    p_payload -> 'domainMutation',
    p_expected_operation_code,
    p_payload -> 'domainRecordRefs'
  );

  FOR v_effect IN
    SELECT effect.value
    FROM jsonb_array_elements(p_payload -> 'accountEffects') WITH ORDINALITY
      AS effect(value, position)
    ORDER BY effect.position
  LOOP
    IF jsonb_typeof(v_effect) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_effect) AS key
      ) IS DISTINCT FROM ARRAY['accountId', 'amountMinorUnits', 'currency']::text[]
      OR jsonb_typeof(v_effect -> 'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'amountMinorUnits') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'currency') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_invalid_account_effect';
    END IF;

    v_account_id := v_effect ->> 'accountId';
    IF v_account_id !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (
        v_previous_account_id IS NOT NULL
        AND (v_previous_account_id COLLATE "C") >= (v_account_id COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_invalid_account_effect';
    END IF;

    PERFORM private.financial_action_signed_minor_units_from_text_v1(
      v_effect ->> 'amountMinorUnits'
    );
    BEGIN
      PERFORM (v_effect ->> 'currency')::public.currency_type;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_invalid_account_effect';
    END;
    v_previous_account_id := v_account_id;
  END LOOP;
END;
$$;

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

  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'financial_action_unknown_definition';
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_envelope_v1(
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timestamp timestamptz;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object'
    OR (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(p_value) AS key
    ) IS DISTINCT FROM ARRAY[
      'accountGuards', 'actionId', 'domain', 'domainReferenceId', 'envelopeVersion',
      'kind', 'occurredAt', 'payload', 'payloadVersion', 'userId'
    ]::text[]
    OR jsonb_typeof(p_value -> 'actionId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'userId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'domain') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'domainReferenceId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'kind') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'envelopeVersion') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'payloadVersion') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'occurredAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'accountGuards') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  IF (p_value ->> 'actionId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_value ->> 'domain' NOT IN (
      'accounts', 'metals', 'transactions', 'transfers', 'recurring_payments', 'sms'
    )
    OR (p_value ->> 'domainReferenceId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_value ->> 'envelopeVersion' <> 'monyvi.financial-action/v1'
    OR length(btrim(p_value ->> 'kind')) = 0
    OR length(btrim(p_value ->> 'payloadVersion')) = 0
    OR (p_value ->> 'userId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  IF (p_value ->> 'occurredAt') !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;
  BEGIN
    v_timestamp := (p_value ->> 'occurredAt')::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END;
  IF to_char(v_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    <> p_value ->> 'occurredAt'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  PERFORM private.financial_action_validate_account_guards_v1(
    p_value -> 'accountGuards'
  );
  PERFORM private.financial_action_validate_registered_payload_v1(p_value);

  IF p_value ->> 'payloadVersion' = 'account.balance-effects/v1' AND (
    jsonb_array_length(p_value -> 'accountGuards')
      IS DISTINCT FROM jsonb_array_length(p_value -> 'payload' -> 'accountEffects')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_value -> 'accountGuards') WITH ORDINALITY
        AS guard(value, position)
      FULL JOIN jsonb_array_elements(p_value -> 'payload' -> 'accountEffects') WITH ORDINALITY
        AS effect(value, position)
        USING (position)
      WHERE guard.value ->> 'accountId' IS DISTINCT FROM effect.value ->> 'accountId'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;
END;
$$;

ALTER TABLE public.financial_action_groups
  DROP CONSTRAINT financial_action_groups_domain,
  ADD CONSTRAINT financial_action_groups_domain CHECK (
    domain IN ('accounts', 'metals', 'transactions', 'transfers', 'recurring_payments', 'sms')
  );

ALTER TABLE public.financial_action_groups
  DROP CONSTRAINT financial_action_groups_foundation_guards_empty;

CREATE OR REPLACE FUNCTION private.financial_action_validate_root_account_guards_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.financial_action_validate_account_guards_v1(
    NEW.account_guards_json
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_action_groups_account_guards_valid
  BEFORE INSERT OR UPDATE OF account_guards_json
  ON public.financial_action_groups
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_validate_root_account_guards_v1();

CREATE TABLE public.account_financial_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action_id uuid NOT NULL,
  account_id uuid NOT NULL,
  domain text NOT NULL,
  kind text NOT NULL,
  amount_minor_units bigint NOT NULL,
  currency public.currency_type NOT NULL,
  accepted_account_revision bigint NOT NULL,
  reverses_effect_id uuid,
  is_effective boolean NOT NULL DEFAULT true,
  compensated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT account_financial_effect_domain CHECK (
    domain IN ('accounts', 'metals', 'transactions', 'transfers', 'recurring_payments', 'sms')
  ),
  CONSTRAINT account_financial_effect_kind_not_blank CHECK (
    length(btrim(kind)) > 0
  ),
  CONSTRAINT account_financial_effect_amount_nonzero CHECK (
    amount_minor_units <> 0
  ),
  CONSTRAINT account_financial_effect_amount_range CHECK (
    amount_minor_units >= -9223372036854775807
    AND amount_minor_units <= 9223372036854775807
  ),
  CONSTRAINT account_financial_effect_revision_positive CHECK (
    accepted_account_revision > 0
  ),
  CONSTRAINT account_financial_effect_revision_range CHECK (
    accepted_account_revision <= 9223372036854775807
  ),
  CONSTRAINT account_financial_effect_retained CHECK (deleted = false),
  CONSTRAINT account_financial_effect_compensation_state CHECK (
    (is_effective = true AND compensated_at IS NULL)
    OR (is_effective = false AND compensated_at IS NOT NULL)
  ),
  CONSTRAINT account_financial_effect_not_self_reversing CHECK (
    reverses_effect_id IS NULL OR reverses_effect_id <> id
  ),
  CONSTRAINT account_financial_effect_action_owner_fk
    FOREIGN KEY (user_id, action_id)
    REFERENCES public.financial_action_groups (user_id, action_id)
    ON DELETE RESTRICT,
  CONSTRAINT account_financial_effect_account_owner_fk
    FOREIGN KEY (user_id, account_id)
    REFERENCES public.accounts (user_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX account_financial_effects_user_id_id_key
  ON public.account_financial_effects (user_id, id);

ALTER TABLE public.account_financial_effects
  ADD CONSTRAINT account_financial_effect_reversal_owner_fk
  FOREIGN KEY (user_id, reverses_effect_id)
  REFERENCES public.account_financial_effects (user_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX account_financial_effects_user_action_account_kind_unique
  ON public.account_financial_effects (user_id, action_id, account_id, kind);

CREATE UNIQUE INDEX account_financial_effects_reversal_once_unique
  ON public.account_financial_effects (user_id, reverses_effect_id)
  WHERE reverses_effect_id IS NOT NULL;

CREATE INDEX account_financial_effects_user_account_revision_idx
  ON public.account_financial_effects (
    user_id,
    account_id,
    accepted_account_revision
  );

CREATE INDEX account_financial_effects_user_action_idx
  ON public.account_financial_effects (user_id, action_id);

CREATE OR REPLACE FUNCTION private.financial_action_account_effects_match_guards_v1(
  p_user_id uuid,
  p_action_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guards jsonb;
  v_domain text;
BEGIN
  SELECT root.account_guards_json, root.domain
  INTO v_guards, v_domain
  FROM public.financial_action_groups AS root
  WHERE root.user_id = p_user_id
    AND root.action_id = p_action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'financial_action_account_effect_root_missing';
  END IF;

  PERFORM private.financial_action_validate_account_guards_v1(v_guards);

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(v_guards)
  ) IS DISTINCT FROM (
    SELECT count(*)
    FROM public.account_financial_effects AS effect
    WHERE effect.user_id = p_user_id
      AND effect.action_id = p_action_id
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_guards) AS guard(value)
    LEFT JOIN public.account_financial_effects AS effect
      ON effect.user_id = p_user_id
      AND effect.action_id = p_action_id
      AND effect.account_id = (guard.value ->> 'accountId')::uuid
    LEFT JOIN public.accounts AS account
      ON account.user_id = effect.user_id
      AND account.id = effect.account_id
    WHERE effect.id IS NULL
      OR effect.domain IS DISTINCT FROM v_domain
      OR effect.currency IS DISTINCT FROM account.currency
      OR private.financial_action_account_revision_from_text_v1(
        guard.value ->> 'expectedRevision'
      ) = 9223372036854775807
      OR effect.accepted_account_revision IS DISTINCT FROM
        private.financial_action_account_revision_from_text_v1(
          guard.value ->> 'expectedRevision'
        ) + 1
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_check_effects_match_guards_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_action_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_action_id := OLD.action_id;
  ELSE
    v_user_id := NEW.user_id;
    v_action_id := NEW.action_id;
  END IF;

  PERFORM private.financial_action_account_effects_match_guards_v1(
    v_user_id,
    v_action_id
  );
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER financial_action_groups_effects_match_guards
  AFTER INSERT OR UPDATE OF account_guards_json
  ON public.financial_action_groups
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_check_effects_match_guards_v1();

CREATE CONSTRAINT TRIGGER account_financial_effects_match_guards
  AFTER INSERT OR UPDATE OR DELETE
  ON public.account_financial_effects
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_check_effects_match_guards_v1();

CREATE OR REPLACE FUNCTION private.account_financial_effect_guard_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'account_financial_effect_delete_forbidden';
  END IF;

  IF NEW.deleted IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'account_financial_effect_delete_forbidden';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.domain IS DISTINCT FROM OLD.domain
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.amount_minor_units IS DISTINCT FROM OLD.amount_minor_units
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.accepted_account_revision IS DISTINCT FROM OLD.accepted_account_revision
    OR NEW.reverses_effect_id IS DISTINCT FROM OLD.reverses_effect_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.is_effective IS DISTINCT FROM true
    OR NEW.is_effective IS DISTINCT FROM false
    OR OLD.compensated_at IS NOT NULL
    OR NEW.compensated_at IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'account_financial_effect_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER account_financial_effects_immutable
  BEFORE UPDATE OR DELETE ON public.account_financial_effects
  FOR EACH ROW
  EXECUTE FUNCTION private.account_financial_effect_guard_immutable_v1();

CREATE TRIGGER handle_account_financial_effects_updated_at
  BEFORE UPDATE ON public.account_financial_effects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION private.account_currency_minor_unit_scale_v1(
  p_currency public.currency_type
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_currency::text = 'BTC' THEN 8
    WHEN p_currency::text IN ('BHD', 'KWD', 'OMR') THEN 3
    ELSE 2
  END;
$$;

CREATE OR REPLACE FUNCTION private.account_financial_canonical_evidence_v1(
  p_user_id uuid,
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.accounts%ROWTYPE;
  v_balance_minor_units text;
  v_canonical_action_id text;
  v_effect_chain jsonb;
  v_body jsonb;
BEGIN
  SELECT account.*
  INTO STRICT v_account
  FROM public.accounts AS account
  WHERE account.user_id = p_user_id
    AND account.id = p_account_id;

  v_balance_minor_units := (
    v_account.balance
    * power(10::numeric, private.account_currency_minor_unit_scale_v1(v_account.currency))
  )::bigint::text;

  SELECT effect.action_id::text
  INTO v_canonical_action_id
  FROM public.account_financial_effects AS effect
  WHERE effect.user_id = p_user_id
    AND effect.account_id = p_account_id
    AND effect.is_effective = true
    AND effect.accepted_account_revision = v_account.financial_revision
  ORDER BY effect.action_id::text COLLATE "C"
  LIMIT 1;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'acceptedRevision', effect.accepted_account_revision::text,
        'actionId', effect.action_id::text,
        'amountMinorUnits', effect.amount_minor_units::text,
        'kind', effect.kind
      )
      ORDER BY effect.accepted_account_revision, effect.action_id::text COLLATE "C"
    ),
    '[]'::jsonb
  )
  INTO v_effect_chain
  FROM public.account_financial_effects AS effect
  WHERE effect.user_id = p_user_id
    AND effect.account_id = p_account_id
    AND effect.is_effective = true;

  v_body := jsonb_build_object(
    'accountId', v_account.id::text,
    'balanceMinorUnits', v_balance_minor_units,
    'canonicalActionId', v_canonical_action_id,
    'canonicalRevision', v_account.financial_revision::text,
    'currency', v_account.currency::text,
    'effectChain', v_effect_chain,
    'userId', v_account.user_id::text
  );

  RETURN jsonb_build_object(
    'accountId', v_account.id::text,
    'canonicalActionId', v_canonical_action_id,
    'canonicalEvidenceHash', encode(
      extensions.digest(
        convert_to(private.financial_action_encode_jsonb_v1(v_body), 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    'canonicalRevision', v_account.financial_revision::text
  );
END;
$$;

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
  v_existing public.financial_action_groups%ROWTYPE;
  v_guard jsonb;
  v_effect jsonb;
  v_new_account_record jsonb;
  v_account public.accounts%ROWTYPE;
  v_expected_revision bigint;
  v_now timestamptz := clock_timestamp();
  v_is_stale boolean := false;
  v_stale_account_ids jsonb := '[]'::jsonb;
  v_canonical_accounts jsonb := '[]'::jsonb;
  v_account_revisions jsonb := '[]'::jsonb;
  v_expected_effects jsonb;
  v_outcome jsonb;
  v_outcome_text text;
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

  IF v_envelope ->> 'payloadVersion' IS DISTINCT FROM 'account.balance-effects/v1'
  THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'INCOMPLETE_GROUP',
      'status', 'rejected'
    );
  END IF;

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
    RETURN jsonb_set(
      v_existing.outcome_json::jsonb,
      '{status}',
      '"idempotent"'::jsonb,
      false
    );
  END IF;

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
  END;
  IF v_expected_effects IS DISTINCT FROM
    (v_envelope -> 'payload' -> 'accountEffects')
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
      private.account_financial_canonical_evidence_v1(v_owner_id, v_account.id)
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
      user_id, action_id, account_id, domain, kind,
      amount_minor_units, currency, accepted_account_revision,
      is_effective, compensated_at
    )
    SELECT
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
      AND account.id = (v_effect ->> 'accountId')::uuid;

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
    user_id, action_id, account_id, domain, kind,
    amount_minor_units, currency, accepted_account_revision
  )
  SELECT
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
  RAISE;
END;
$$;

CREATE TABLE private.account_financial_action_cutover_quarantine (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_record_id uuid NOT NULL,
  payload_json text NOT NULL,
  reason_code text NOT NULL CHECK (reason_code = 'legacy_protected_field_write'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_table, source_record_id)
);

REVOKE ALL ON private.account_financial_action_cutover_quarantine
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.apply_account_financial_action_v1(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_account_financial_action_v1(text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.accounts_protect_financial_columns_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' AND (
      NEW.balance IS DISTINCT FROM 0::numeric
      OR NEW.financial_revision IS DISTINCT FROM 0::bigint
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'account_financial_action_rpc_required';
    END IF;

    IF TG_OP = 'UPDATE' AND (
      NEW.balance IS DISTINCT FROM OLD.balance
      OR NEW.financial_revision IS DISTINCT FROM OLD.financial_revision
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'account_financial_action_rpc_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_protect_financial_columns
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION private.accounts_protect_financial_columns_v1();

REVOKE ALL ON FUNCTION public.recalculate_all_account_balances()
  FROM PUBLIC, anon, authenticated;

-- Preserve the existing owner-scoped account CRUD contract explicitly so
-- metadata writes reach the protected-column trigger on every Supabase bootstrap.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;

ALTER TABLE public.account_financial_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own account financial effects"
  ON public.account_financial_effects FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.account_financial_effects FROM authenticated;
GRANT SELECT ON public.account_financial_effects TO authenticated;
REVOKE ALL ON public.account_financial_effects FROM anon;

REVOKE ALL ON FUNCTION private.financial_action_account_revision_from_text_v1(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_validate_account_guards_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_validate_root_account_guards_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_account_effects_match_guards_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_check_effects_match_guards_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.account_financial_effect_guard_immutable_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.accounts_protect_financial_columns_v1()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.financial_action_account_revision_from_text_v1(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_account_guards_v1(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_account_effects_match_guards_v1(uuid, uuid)
  TO service_role;
