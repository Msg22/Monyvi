-- Issue #395: Shared Account Review Save (review.batch-save/v1).
--
-- Registers the review.batch-save/v1 financial action tuple:
-- domain: 'transactions', kind: 'review_batch_save', operationCode: 'review.batch-save'.
-- Supports atomic batch save of multiple transactions, transfers, accounts,
-- bank details, and SMS sender records, with zero-net account balance effects,
-- frozen intent digest validation, and owner-wide transaction serialization.

BEGIN;

-- 1. Update constraint on account_financial_effects to allow zero minor units
--    specifically for review.batch-save in the transactions domain.
ALTER TABLE public.account_financial_effects
  DROP CONSTRAINT account_financial_effect_amount_nonzero,
  ADD CONSTRAINT account_financial_effect_amount_nonzero CHECK (
    amount_minor_units <> 0
    OR (
      domain = 'transactions'
      AND kind = 'review.batch-save'
    )
  );

-- 2. Before-statement owner-scope serialization. A BEFORE ROW trigger is
-- too late for UPDATE/DELETE: the executor already holds the target tuple.
-- The existing auth-cascade SHARE/EXCLUSIVE and owner bigint keys are retained
-- for outstanding writers and for the frozen two-session test protocol.
CREATE OR REPLACE FUNCTION private.account_owner_enter_scope_v1(
  p_expected_owner uuid DEFAULT NULL,
  p_auth_delete boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := pg_catalog.current_setting('role', true);
  v_actor uuid := (SELECT auth.uid());
  v_scoped boolean;
  v_shared boolean := false;
  v_exclusive boolean := false;
  v_other_owner boolean;
  v_owner_key integer;
BEGIN
  -- Effective SET ROLE is PostgreSQL-controlled, unlike caller-defined GUCs.
  -- Definer current_user cannot establish the original request role.
  v_scoped := v_role = 'authenticated'
    AND v_actor IS NOT NULL
    AND NOT p_auth_delete;
  IF p_expected_owner IS NOT NULL
    AND (v_actor IS NULL OR v_actor IS DISTINCT FROM p_expected_owner)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account_owner_scope_mismatch';
  END IF;
  IF p_auth_delete AND v_role = 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account_owner_privileged_scope_required';
  END IF;

  -- Two-integer advisory lock class is separate from existing single-bigint
  -- auth/owner keys. A held shared mode must never upgrade to exclusive.
  SELECT coalesce(bool_or(held.mode = 'ShareLock'), false),
         coalesce(bool_or(held.mode = 'ExclusiveLock'), false)
  INTO v_shared, v_exclusive
  FROM pg_catalog.pg_locks AS held
  WHERE held.pid = pg_catalog.pg_backend_pid()
    AND held.locktype = 'advisory'
    AND held.granted
    AND held.classid = 395088::oid
    AND held.objid = 0::oid
    AND held.objsubid = 2;

  IF v_shared AND NOT v_scoped THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account_owner_scope_upgrade_forbidden';
  END IF;

  IF v_scoped AND NOT v_exclusive THEN
    v_owner_key := pg_catalog.hashtext(v_actor::text);
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_locks AS held
      WHERE held.pid = pg_catalog.pg_backend_pid()
        AND held.locktype = 'advisory'
        AND held.granted
        AND held.classid = 395089::oid
        AND held.objsubid = 2
        AND held.objid <> v_owner_key::oid
    ) INTO v_other_owner;
    IF v_other_owner THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'account_owner_scope_switch_forbidden';
    END IF;
  END IF;

  -- Earliest shared publication fence precedes every scope/owner held. It is
  -- reacquired safely by nested statement triggers inside an existing RPC.
  PERFORM private.acquire_sync_writer_fence_v1();

  IF v_scoped THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended('global:auth_user_cascade', 0)
    );
  ELSE
    -- Privileged unknown/multi-owner and auth DELETE are globally exclusive.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('global:auth_user_cascade', 0)
    );
  END IF;

  IF v_exclusive THEN RETURN; END IF;

  IF v_scoped THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(395088, 0);
    -- Acquire the OLD owner key before a new owner-marker key, including in
    -- frozen test probes preholding just the original bigint owner held.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('accounts:owner:' || v_actor::text, 0)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(395089, v_owner_key);
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(395088, 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.account_owner_before_accounts_statement_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.account_owner_enter_scope_v1();
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.account_owner_serialize_accounts_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role text := pg_catalog.current_setting('role', true);
  v_actor uuid := (SELECT auth.uid());
  v_has_scope boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_locks AS held
    WHERE held.pid = pg_catalog.pg_backend_pid()
      AND held.locktype = 'advisory' AND held.granted
      AND held.classid = 395088::oid AND held.objid = 0::oid
      AND held.objsubid = 2
  ) INTO v_has_scope;
  IF NOT v_has_scope THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account_owner_statement_gate_missing';
  END IF;
  -- A definer invoked from an authenticated request must not silently
  -- reparent or modify an unrelated account even if RLS is bypassed.
  IF v_role = 'authenticated' AND (
    v_actor IS NULL
    OR (TG_OP <> 'INSERT' AND OLD.user_id IS DISTINCT FROM v_actor)
    OR (TG_OP <> 'DELETE' AND NEW.user_id IS DISTINCT FROM v_actor)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account_owner_row_scope_mismatch';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_owner_before_statement ON public.accounts;
CREATE TRIGGER accounts_owner_before_statement
  BEFORE INSERT OR UPDATE OR DELETE ON public.accounts
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.account_owner_before_accounts_statement_v1();

DROP TRIGGER IF EXISTS accounts_owner_serialization ON public.accounts;
CREATE TRIGGER accounts_owner_serialization
  BEFORE INSERT OR UPDATE OR DELETE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION private.account_owner_serialize_accounts_v1();

CREATE OR REPLACE FUNCTION private.account_owner_auth_user_cascade_statement_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM private.account_owner_enter_scope_v1(NULL, true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.account_owner_auth_user_cascade_lock_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- The BEFORE STATEMENT trigger already owns the exclusive global/scope
  -- locks. No late lock acquisition after the auth row has been locked.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_locks AS held
    WHERE held.pid = pg_catalog.pg_backend_pid()
      AND held.locktype = 'advisory' AND held.granted
      AND held.mode = 'ExclusiveLock'
      AND held.classid = 395088::oid AND held.objid = 0::oid
      AND held.objsubid = 2
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account_owner_auth_delete_gate_missing';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_account_owner_cascade_statement ON auth.users;
CREATE TRIGGER auth_users_account_owner_cascade_statement
  BEFORE DELETE ON auth.users
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.account_owner_auth_user_cascade_statement_v1();

DROP TRIGGER IF EXISTS auth_users_account_owner_cascade_lock ON auth.users;
CREATE TRIGGER auth_users_account_owner_cascade_lock
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.account_owner_auth_user_cascade_lock_v1();

-- G1: preserve the original 044 DECIMAL(15,3) administrative utility
-- signature, SECURITY DEFINER policy and persisted balance calculation. Its
-- scope must be acquired BEFORE enumeration/row locks. CREATE OR REPLACE
-- retains this existing function's OID, ownership and 076-restricted ACLs.
CREATE OR REPLACE FUNCTION public.recalculate_all_account_balances()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  account_record RECORD;
  new_balance DECIMAL(15, 3);
  update_count INTEGER := 0;
BEGIN
  PERFORM private.account_owner_enter_scope_v1(NULL, true);

  FOR account_record IN SELECT id FROM public.accounts WHERE deleted = false LOOP
    new_balance := public.recalculate_account_balance(account_record.id);

    UPDATE public.accounts
    SET balance = new_balance, updated_at = NOW()
    WHERE id = account_record.id;

    update_count := update_count + 1;
  END LOOP;

  RETURN update_count;
END;
$$;

-- 3. Register review.batch-save in operation registration registry.
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
    ('transactions', 'review_batch_save', 'review.batch-save'),
    ('transfers', 'create', 'transfer.create'),
    ('transfers', 'update', 'transfer.update'),
    ('transfers', 'delete', 'transfer.delete'),
    ('transfers', 'convert_to_transaction', 'transfer.convert-to-transaction'),
    ('recurring_payments', 'pay_now', 'recurring.pay-now'),
    ('sms', 'review_confirm', 'sms.review-durable')
  );
$$;

-- 4. Validator for review.batch-save/v1 payload.
CREATE OR REPLACE FUNCTION private.financial_action_validate_review_batch_save_payload_v1(
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
  v_record jsonb;
  v_after jsonb;
  v_entity text;
  v_mode text;
  v_id text;
  v_previous_sort_key text;
  v_mutation_records jsonb;
  v_account_ids_created text[] := ARRAY[]::text[];
  v_first_ref_id text;
  v_ref jsonb;
  v_previous_ref text;
  v_guard jsonb;
  v_previous_guard text;
  v_effect jsonb;
  v_previous_effect_account text;
  v_effect_account_id text;
  v_source_ref jsonb;
  v_previous_source_row text;
  v_group_ref jsonb;
  v_previous_group text;
  v_bookkeeping jsonb;
  v_previous_bookkeeping_draft text;
  v_snapshot jsonb;
  v_has_account_creates boolean := false;
  v_bank_child_count integer;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  SELECT array_agg(key ORDER BY key) INTO v_keys
  FROM jsonb_object_keys(p_payload) AS key;

  IF v_keys IS DISTINCT FROM ARRAY[
      'accountEffects', 'confirmedGroupRefs', 'createGuards', 'domainMutation',
      'domainRecordRefs', 'frozenIntentDigest', 'localSmsBookkeeping', 'operationCode',
      'schemaVersion', 'selectedSourceRefs', 'sessionId', 'source'
    ]::text[]
    AND v_keys IS DISTINCT FROM ARRAY[
      'accountEffects', 'confirmedGroupRefs', 'createGuards', 'creationDefaultSnapshot',
      'domainMutation', 'domainRecordRefs', 'frozenIntentDigest', 'localSmsBookkeeping',
      'operationCode', 'schemaVersion', 'selectedSourceRefs', 'sessionId', 'source'
    ]::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  IF p_payload ->> 'schemaVersion' IS DISTINCT FROM 'review.batch-save/v1'
    OR p_payload ->> 'operationCode' IS DISTINCT FROM 'review.batch-save'
    OR jsonb_typeof(p_payload -> 'source') IS DISTINCT FROM 'string'
    OR p_payload ->> 'source' NOT IN ('VOICE', 'SMS')
    OR jsonb_typeof(p_payload -> 'sessionId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'sessionId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'frozenIntentDigest') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'frozenIntentDigest') !~ '^[0-9a-f]{64}$'
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
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_record) AS key
      ) IS DISTINCT FROM ARRAY[
        'after', 'entity', 'expectedUpdatedAt', 'mode'
      ]::text[]
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    v_after := v_record -> 'after';
    v_entity := v_record ->> 'entity';
    v_mode := v_record ->> 'mode';
    v_id := v_after ->> 'id';

    IF jsonb_typeof(v_after -> 'id') IS DISTINCT FROM 'string'
      OR v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR v_mode <> 'create'
      OR jsonb_typeof(v_record -> 'expectedUpdatedAt') <> 'null'
      OR (v_previous_sort_key IS NOT NULL AND (v_previous_sort_key COLLATE "C") >= ((v_entity || ':' || v_id) COLLATE "C"))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;

    v_previous_sort_key := v_entity || ':' || v_id;

    IF v_entity = 'account' THEN
      v_has_account_creates := true;
      v_account_ids_created := array_append(v_account_ids_created, v_id);

      IF (
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
        OR v_after ->> 'openingBalanceMinorUnits' IS DISTINCT FROM '0'
        OR jsonb_typeof(v_after -> 'targetBalanceMinorUnits') <> 'null'
        OR (v_after ->> 'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;

      -- Check confirmedGroupRef exists for this created account
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_payload -> 'confirmedGroupRefs') AS g
        WHERE g.value ->> 'accountId' = v_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
      END IF;

      -- Validate children of this account
      SELECT count(*) INTO v_bank_child_count
      FROM jsonb_array_elements(v_mutation_records) AS c
      WHERE c.value ->> 'entity' = 'bank_details'
        AND c.value -> 'after' ->> 'accountId' = v_id;

      IF v_after ->> 'type' = 'BANK' THEN
        IF v_bank_child_count <> 1 THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
        END IF;
      ELSIF v_after ->> 'type' IN ('CASH', 'DIGITAL_WALLET') THEN
        IF v_bank_child_count <> 0 THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
        END IF;
        IF v_after ->> 'type' = 'CASH' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_mutation_records) AS s
          WHERE s.value ->> 'entity' = 'account_sms_sender'
            AND s.value -> 'after' ->> 'accountId' = v_id
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
        END IF;
      END IF;

    ELSIF v_entity = 'bank_details' THEN
      IF (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_after) AS key
      ) IS DISTINCT FROM ARRAY[
        'accountId', 'accountNumber', 'cardLast4', 'createdAt', 'deleted', 'id'
      ]::text[]
        OR jsonb_typeof(v_after -> 'accountId') IS DISTINCT FROM 'string'
        OR (v_after ->> 'accountId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR jsonb_typeof(v_after -> 'accountNumber') <> 'null'
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

    ELSIF v_entity = 'account_sms_sender' THEN
      IF (
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
        OR jsonb_typeof(v_after -> 'amountMinorUnits') IS DISTINCT FROM 'string'
        OR (v_after ->> 'amountMinorUnits') !~ '^[1-9][0-9]{0,18}$'
        OR v_after ->> 'type' NOT IN ('EXPENSE', 'INCOME')
        OR v_after ->> 'source' IS DISTINCT FROM p_payload ->> 'source'
        -- Frozen Review creates do not link to foreign or later-owned rows.
        OR jsonb_typeof(v_after -> 'linkedAssetId') IS DISTINCT FROM 'null'
        OR jsonb_typeof(v_after -> 'linkedDebtId') IS DISTINCT FROM 'null'
        OR jsonb_typeof(v_after -> 'linkedRecurringId') IS DISTINCT FROM 'null'
        OR jsonb_typeof(v_after -> 'accountId') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_after -> 'categoryId') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_after -> 'currency') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_after -> 'isDraft') IS DISTINCT FROM 'boolean'
        OR (v_after ->> 'isDraft')::boolean
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_after ->> 'deleted')::boolean
        OR (v_after ->> 'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
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
        OR jsonb_typeof(v_after -> 'amountMinorUnits') IS DISTINCT FROM 'string'
        OR (v_after ->> 'amountMinorUnits') !~ '^[1-9][0-9]{0,18}$'
        -- New Review supports same-currency only; v1 FX remains unchanged.
        OR jsonb_typeof(v_after -> 'convertedAmountMinorUnits') IS DISTINCT FROM 'null'
        OR jsonb_typeof(v_after -> 'exchangeRate') IS DISTINCT FROM 'null'
        OR jsonb_typeof(v_after -> 'fromAccountId') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_after -> 'toAccountId') IS DISTINCT FROM 'string'
        OR (v_after ->> 'fromAccountId') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (v_after ->> 'toAccountId') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (v_after ->> 'fromAccountId') IS NOT DISTINCT FROM
          (v_after ->> 'toAccountId')
        OR jsonb_typeof(v_after -> 'deleted') IS DISTINCT FROM 'boolean'
        OR (v_after ->> 'deleted')::boolean
        OR (v_after ->> 'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
      END IF;

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_domain_mutation';
    END IF;
  END LOOP;

  -- Every bank/sender child belongs to an eligible account CREATE in this
  -- exact action. A foreign or unrelated existing account is never a child
  -- parent merely because a global FK happens to be valid.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_mutation_records) AS child(value)
    WHERE child.value ->> 'entity' IN ('bank_details', 'account_sms_sender')
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_mutation_records) AS parent(value)
        WHERE parent.value ->> 'entity' = 'account'
          AND parent.value ->> 'mode' = 'create'
          AND parent.value -> 'after' ->> 'id' =
              child.value -> 'after' ->> 'accountId'
          AND (
            (child.value ->> 'entity' = 'bank_details'
              AND parent.value -> 'after' ->> 'type' = 'BANK')
            OR (child.value ->> 'entity' = 'account_sms_sender'
              AND parent.value -> 'after' ->> 'type' IN ('BANK', 'DIGITAL_WALLET'))
          )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_domain_mutation';
  END IF;

  -- Domain Reference ID must be the first transaction or transfer UUID in ASCII collation order
  SELECT (r.value -> 'after' ->> 'id') INTO v_first_ref_id
  FROM jsonb_array_elements(v_mutation_records) AS r(value)
  WHERE r.value ->> 'entity' IN ('transaction', 'transfer')
  ORDER BY (r.value -> 'after' ->> 'id') COLLATE "C"
  LIMIT 1;

  IF v_first_ref_id IS DISTINCT FROM p_domain_reference_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- creationDefaultSnapshot presence check
  IF v_has_account_creates THEN
    IF NOT (p_payload ? 'creationDefaultSnapshot') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
    v_snapshot := p_payload -> 'creationDefaultSnapshot';
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
  ELSE
    IF p_payload ? 'creationDefaultSnapshot' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
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
      OR (v_guard ->> 'entity') NOT IN ('account', 'account_sms_sender', 'bank_details', 'transaction', 'transfer')
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
  ) IS DISTINCT FROM (p_payload -> 'createGuards')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- Validate accountEffects
  IF jsonb_typeof(p_payload -> 'accountEffects') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
  END IF;

  FOR v_effect IN
    SELECT effect.value
    FROM jsonb_array_elements(p_payload -> 'accountEffects') WITH ORDINALITY AS effect(value, position)
    ORDER BY effect.position
  LOOP
    IF jsonb_typeof(v_effect) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_effect) AS key
      ) IS DISTINCT FROM ARRAY['accountId', 'amountMinorUnits', 'currency', 'effectId']::text[]
      OR jsonb_typeof(v_effect -> 'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'amountMinorUnits') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'currency') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_effect -> 'effectId') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END IF;

    v_effect_account_id := v_effect ->> 'accountId';
    IF v_effect_account_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_effect ->> 'effectId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (
        v_previous_effect_account IS NOT NULL
        AND (v_previous_effect_account COLLATE "C") >= (v_effect_account_id COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END IF;

    IF (v_effect ->> 'amountMinorUnits') !~ '^-?(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END IF;

    BEGIN
      PERFORM (v_effect ->> 'currency')::public.currency_type;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_effect';
    END;

    v_previous_effect_account := v_effect_account_id;
  END LOOP;

  -- Review effect accounts must match the exact set of financial endpoints
  -- including zero-net endpoints; guards are checked at the envelope level.
  IF (
    SELECT coalesce(jsonb_agg(ep.account_id ORDER BY ep.account_id COLLATE "C"),
      '[]'::jsonb)
    FROM (
      SELECT r.value -> 'after' ->> 'accountId' AS account_id
      FROM jsonb_array_elements(v_mutation_records) AS r(value)
      WHERE r.value ->> 'entity' = 'transaction'
      UNION
      SELECT r.value -> 'after' ->> 'fromAccountId'
      FROM jsonb_array_elements(v_mutation_records) AS r(value)
      WHERE r.value ->> 'entity' = 'transfer'
      UNION
      SELECT r.value -> 'after' ->> 'toAccountId'
      FROM jsonb_array_elements(v_mutation_records) AS r(value)
      WHERE r.value ->> 'entity' = 'transfer'
    ) AS ep
  ) IS DISTINCT FROM (
    SELECT coalesce(jsonb_agg(e.value ->> 'accountId'
      ORDER BY (e.value ->> 'accountId') COLLATE "C"), '[]'::jsonb)
    FROM jsonb_array_elements(p_payload -> 'accountEffects') AS e(value)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;

  -- Validate selectedSourceRefs
  IF jsonb_typeof(p_payload -> 'selectedSourceRefs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  FOR v_source_ref IN
    SELECT s.value
    FROM jsonb_array_elements(p_payload -> 'selectedSourceRefs') WITH ORDINALITY AS s(value, position)
    ORDER BY s.position
  LOOP
    IF jsonb_typeof(v_source_ref) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_source_ref) AS key
      ) IS DISTINCT FROM ARRAY['recordId', 'rowId', 'sourceFingerprint']::text[]
      OR jsonb_typeof(v_source_ref -> 'recordId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_source_ref -> 'rowId') IS DISTINCT FROM 'string'
      OR (v_source_ref ->> 'recordId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_source_ref ->> 'rowId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (
        v_previous_source_row IS NOT NULL
        AND (v_previous_source_row COLLATE "C") >= ((v_source_ref ->> 'rowId') COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;

    IF p_payload ->> 'source' = 'SMS' THEN
      IF jsonb_typeof(v_source_ref -> 'sourceFingerprint') IS DISTINCT FROM 'string'
        OR length(v_source_ref ->> 'sourceFingerprint') = 0
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
      END IF;
    ELSE
      IF jsonb_typeof(v_source_ref -> 'sourceFingerprint') IS DISTINCT FROM 'null' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
      END IF;
    END IF;

    v_previous_source_row := v_source_ref ->> 'rowId';
  END LOOP;

  -- Closed financial-record bijection: every created transaction/transfer has
  -- exactly one selectedSourceRefs entry, and every entry's recordId maps to
  -- an actual created financial record (no orphan, no missing, no duplicate).
  IF (
    SELECT count(DISTINCT (s.value ->> 'recordId'))
    FROM jsonb_array_elements(p_payload -> 'selectedSourceRefs') AS s(value)
  ) IS DISTINCT FROM (
    SELECT count(*)
    FROM jsonb_array_elements(p_payload -> 'selectedSourceRefs') AS s(value)
  )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payload -> 'selectedSourceRefs') AS s(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_mutation_records) AS r(value)
        WHERE r.value ->> 'entity' IN ('transaction', 'transfer')
          AND r.value -> 'after' ->> 'id' = s.value ->> 'recordId'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_mutation_records) AS r(value)
      WHERE r.value ->> 'entity' IN ('transaction', 'transfer')
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_payload -> 'selectedSourceRefs') AS s(value)
          WHERE s.value ->> 'recordId' = r.value -> 'after' ->> 'id'
        )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- SMS source-ref fingerprint must match the corresponding financial row
  -- smsFingerprint (exact bijective match transaction/transfer). Voice keeps
  -- its null-fingerprint policy (validated in the loop above).
  IF p_payload ->> 'source' = 'SMS' AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'selectedSourceRefs') AS s(value)
    JOIN jsonb_array_elements(v_mutation_records) AS r(value)
      ON r.value ->> 'entity' IN ('transaction', 'transfer')
      AND r.value -> 'after' ->> 'id' = s.value ->> 'recordId'
    WHERE (s.value ->> 'sourceFingerprint') IS DISTINCT FROM (r.value -> 'after' ->> 'smsFingerprint')
  )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- Validate confirmedGroupRefs
  IF jsonb_typeof(p_payload -> 'confirmedGroupRefs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  FOR v_group_ref IN
    SELECT g.value
    FROM jsonb_array_elements(p_payload -> 'confirmedGroupRefs') WITH ORDINALITY AS g(value, position)
    ORDER BY g.position
  LOOP
    IF jsonb_typeof(v_group_ref) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_group_ref) AS key
      ) IS DISTINCT FROM ARRAY['accountId', 'groupId', 'revision']::text[]
      OR jsonb_typeof(v_group_ref -> 'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_group_ref -> 'groupId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_group_ref -> 'revision') IS DISTINCT FROM 'string'
      OR (v_group_ref ->> 'accountId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_group_ref ->> 'groupId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_group_ref ->> 'revision') !~ '^(0|[1-9][0-9]{0,18})$'
      OR (
        v_previous_group IS NOT NULL
        AND (v_previous_group COLLATE "C") >= ((v_group_ref ->> 'groupId') COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
    v_previous_group := v_group_ref ->> 'groupId';
  END LOOP;

  -- Group-membership consistency: every confirmedGroupRefs accountId must be a
  -- created account or an existing affected account (created or explicitly
  -- reused, never an unused orphan). One planned account per confirmed group:
  -- a created account must not be confirmed in two distinct groups.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'confirmedGroupRefs') AS g(value)
    WHERE NOT (
      (g.value ->> 'accountId') = ANY (v_account_ids_created)
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_payload -> 'accountEffects') AS e(value)
        WHERE e.value ->> 'accountId' = g.value ->> 'accountId'
      )
    )
  )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payload -> 'confirmedGroupRefs') AS g1(value)
      JOIN jsonb_array_elements(p_payload -> 'confirmedGroupRefs') AS g2(value)
        ON g1.value ->> 'accountId' = g2.value ->> 'accountId'
      WHERE (g1.value ->> 'accountId') = ANY (v_account_ids_created)
        AND g1.value ->> 'groupId' IS DISTINCT FROM g2.value ->> 'groupId'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  -- Validate localSmsBookkeeping
  IF jsonb_typeof(p_payload -> 'localSmsBookkeeping') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  IF p_payload ->> 'source' = 'VOICE' AND jsonb_array_length(p_payload -> 'localSmsBookkeeping') <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
  END IF;

  FOR v_bookkeeping IN
    SELECT b.value
    FROM jsonb_array_elements(p_payload -> 'localSmsBookkeeping') WITH ORDINALITY AS b(value, position)
    ORDER BY b.position
  LOOP
    IF jsonb_typeof(v_bookkeeping) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_bookkeeping) AS key
      ) IS DISTINCT FROM ARRAY[
        'draftId', 'expectedReviewRevision', 'operation', 'queueId', 'snapshotHash'
      ]::text[]
      OR jsonb_typeof(v_bookkeeping -> 'draftId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_bookkeeping -> 'queueId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_bookkeeping -> 'expectedReviewRevision') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_bookkeeping -> 'snapshotHash') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_bookkeeping -> 'operation') IS DISTINCT FROM 'string'
      OR (v_bookkeeping ->> 'draftId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_bookkeeping ->> 'queueId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_bookkeeping ->> 'expectedReviewRevision') !~ '^(0|[1-9][0-9]{0,18})$'
      OR (v_bookkeeping ->> 'snapshotHash') !~ '^[0-9a-f]{64}$'
      OR (v_bookkeeping ->> 'operation') NOT IN ('delete_saved', 'rebind_remaining')
      OR (
        v_previous_bookkeeping_draft IS NOT NULL
        AND (v_previous_bookkeeping_draft COLLATE "C") >= ((v_bookkeeping ->> 'draftId') COLLATE "C")
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_account_payload';
    END IF;
    v_previous_bookkeeping_draft := v_bookkeeping ->> 'draftId';
  END LOOP;
END;
$$;

-- Exact C1 guard endpoint equality is an ENVELOPE validation, since
-- accountGuards lives on the immutable root, not the review payload.
CREATE OR REPLACE FUNCTION private.financial_action_validate_review_guard_closure_v1(
  p_envelope jsonb
)
RETURNS void LANGUAGE plpgsql IMMUTABLE STRICT
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (
    SELECT coalesce(jsonb_agg(ep.account_id ORDER BY ep.account_id COLLATE "C"),
      '[]'::jsonb)
    FROM (
      SELECT r.value -> 'after' ->> 'accountId' AS account_id
      FROM jsonb_array_elements(
        p_envelope -> 'payload' -> 'domainMutation' -> 'records'
      ) AS r(value)
      WHERE r.value ->> 'entity' = 'transaction'
      UNION
      SELECT r.value -> 'after' ->> 'fromAccountId'
      FROM jsonb_array_elements(
        p_envelope -> 'payload' -> 'domainMutation' -> 'records'
      ) AS r(value)
      WHERE r.value ->> 'entity' = 'transfer'
      UNION
      SELECT r.value -> 'after' ->> 'toAccountId'
      FROM jsonb_array_elements(
        p_envelope -> 'payload' -> 'domainMutation' -> 'records'
      ) AS r(value)
      WHERE r.value ->> 'entity' = 'transfer'
    ) AS ep
  ) IS DISTINCT FROM (
    SELECT coalesce(jsonb_agg(g.value ->> 'accountId'
      ORDER BY (g.value ->> 'accountId') COLLATE "C"), '[]'::jsonb)
    FROM jsonb_array_elements(p_envelope -> 'accountGuards') AS g(value)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_mismatch';
  END IF;
END;
$$;

-- 5. Extend registered payload validation to review.batch-save/v1.
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

  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'financial_action_unknown_definition';
END;
$$;

-- 6. Update deferred trigger function for effects/root parity to guard zero effects.
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
  v_kind text;
  v_server_outcome text;
  v_root_payload jsonb;
  v_is_review boolean;
  v_is_add boolean;
BEGIN
  SELECT root.account_guards_json, root.domain, root.kind,
         root.server_outcome, root.payload_json::jsonb
  INTO v_guards, v_domain, v_kind, v_server_outcome, v_root_payload
  FROM public.financial_action_groups AS root
  WHERE root.user_id = p_user_id
    AND root.action_id = p_action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'financial_action_account_effect_root_missing';
  END IF;

  -- M1: a review root is review-only if its immutable domain/kind AND
  -- full version/schema/operation tuple agree. Failed/stale Review roots
  -- remain effect-free; old tuples keep original exact correspondence.
  IF v_kind = 'review_batch_save' AND (
    v_domain IS DISTINCT FROM 'transactions'
    OR v_root_payload ->> 'payloadVersion' IS DISTINCT FROM 'review.batch-save/v1'
    OR v_root_payload -> 'payload' ->> 'schemaVersion' IS DISTINCT FROM
      'review.batch-save/v1'
    OR v_root_payload -> 'payload' ->> 'operationCode' IS DISTINCT FROM
      'review.batch-save'
    OR v_root_payload ->> 'domain' IS DISTINCT FROM 'transactions'
    OR v_root_payload ->> 'kind' IS DISTINCT FROM 'review_batch_save'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;

  -- A failed/stale Add may carry its original nonzero opening guards
  -- without any posted effects. This exception is scoped to an exact
  -- immutable NEW tuple; a legacy/spoofed kind is never excused.
  IF v_kind = 'create_with_default' AND (
    v_domain IS DISTINCT FROM 'accounts'
    OR v_root_payload ->> 'payloadVersion' IS DISTINCT FROM
      'account.create-default/v1'
    OR v_root_payload -> 'payload' ->> 'schemaVersion' IS DISTINCT FROM
      'account.create-default/v1'
    OR v_root_payload -> 'payload' ->> 'operationCode' IS DISTINCT FROM
      'account.create-default'
    OR v_root_payload ->> 'domain' IS DISTINCT FROM 'accounts'
    OR v_root_payload ->> 'kind' IS DISTINCT FROM 'create_with_default'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;

  v_is_review := v_domain = 'transactions'
    AND v_kind = 'review_batch_save'
    AND v_root_payload ->> 'payloadVersion' = 'review.batch-save/v1'
    AND v_root_payload -> 'payload' ->> 'schemaVersion' = 'review.batch-save/v1'
    AND v_root_payload -> 'payload' ->> 'operationCode' = 'review.batch-save';
  v_is_add := v_domain = 'accounts'
    AND v_kind = 'create_with_default'
    AND v_root_payload ->> 'payloadVersion' = 'account.create-default/v1'
    AND v_root_payload -> 'payload' ->> 'schemaVersion' =
      'account.create-default/v1'
    AND v_root_payload -> 'payload' ->> 'operationCode' =
      'account.create-default';

  PERFORM private.financial_action_validate_account_guards_v1(v_guards);

  -- Only exact rejected/stale NEW tuples may retain requested guards with
  -- ZERO physical effects. Accepted and every legacy tuple retain their
  -- original exact guard/effect/owned-currency/revision correspondence.
  IF v_server_outcome IN ('rejected', 'stale') AND (v_is_review OR v_is_add) THEN
    IF EXISTS (
      SELECT 1 FROM public.account_financial_effects AS effect
      WHERE effect.user_id = p_user_id AND effect.action_id = p_action_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'financial_action_account_effects_mismatch';
    END IF;
  ELSE
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
  END IF;

  -- Ensure zero minor units effects ONLY exist under a review_batch_save root
  IF EXISTS (
    SELECT 1
    FROM public.account_financial_effects AS effect
    WHERE effect.user_id = p_user_id
      AND effect.action_id = p_action_id
      AND effect.amount_minor_units = 0
      AND (
        effect.domain <> 'transactions'
        OR effect.kind <> 'review.batch-save'
        OR v_domain <> 'transactions'
        OR v_kind <> 'review_batch_save'
        OR v_root_payload ->> 'payloadVersion' IS DISTINCT FROM 'review.batch-save/v1'
        OR v_root_payload -> 'payload' ->> 'schemaVersion' IS DISTINCT FROM
          'review.batch-save/v1'
        OR v_root_payload -> 'payload' ->> 'operationCode' IS DISTINCT FROM
          'review.batch-save'
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_root_payload -> 'payload' -> 'accountEffects')
            AS expected(value)
          WHERE expected.value ->> 'accountId' = effect.account_id::text
            AND expected.value ->> 'effectId' = effect.id::text
            AND expected.value ->> 'amountMinorUnits' = '0'
            AND expected.value ->> 'currency' = effect.currency::text
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;
END;
$$;

-- 7. Update apply_account_financial_action_v1 to support review.batch-save/v1.
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
  v_created_account_rec record;
  v_actual_active_ids jsonb;
  v_actual_default_id uuid;
  v_actual_snapshot jsonb;
  v_payload_snapshot jsonb;
  v_first_created_account_id text;
  v_derived_delta numeric;
  v_derived_delta_minor bigint;
  v_expected_effect_minor bigint;
  v_scale numeric;
  v_chk_acc public.accounts%ROWTYPE;
  v_conflict_state text;
  v_conflict_message text;
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
  IF v_payload_version NOT IN ('account.balance-effects/v1', 'review.batch-save/v1')
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

  -- New logical-CAS review requires fresh READ COMMITTED visibility after
  -- waiting for the owner scope. Older v1 tuples retain their isolation rules.
  IF v_payload_version = 'review.batch-save/v1'
    AND pg_catalog.current_setting('transaction_isolation')
      IS DISTINCT FROM 'read committed'
  THEN
    RETURN jsonb_build_object(
      'actionId', v_action_id::text,
      'code', 'INCOMPLETE_GROUP', 'status', 'rejected'
    );
  END IF;

  -- Publication fence -> auth-cascade SHARE -> scoped shared gate -> old
  -- owner bigint key BEFORE any financial root or account tuple held.
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
  -- BRANCH A: review.batch-save/v1
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
      -- Calculate net effect for the created account to set initial balance
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
      -- Only update if it is an existing account (created accounts were inserted with correct revision/balance)
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

    -- Sort account revisions by accountId
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
  -- BRANCH B: account.balance-effects/v1 (Existing logic from 076/083)
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

REVOKE ALL ON FUNCTION private.financial_action_validate_review_batch_save_payload_v1(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_review_batch_save_payload_v1(jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION private.account_owner_auth_user_cascade_lock_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.account_owner_auth_user_cascade_lock_v1() TO service_role;

REVOKE ALL ON FUNCTION private.financial_action_validate_review_guard_closure_v1(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_review_guard_closure_v1(jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION private.account_owner_enter_scope_v1(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.account_owner_before_accounts_statement_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.account_owner_auth_user_cascade_statement_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.account_owner_auth_user_cascade_lock_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.account_owner_serialize_accounts_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.account_owner_enter_scope_v1(uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.account_owner_before_accounts_statement_v1()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.account_owner_auth_user_cascade_statement_v1()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.account_owner_auth_user_cascade_lock_v1()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.account_owner_serialize_accounts_v1()
  TO service_role;

COMMIT;
