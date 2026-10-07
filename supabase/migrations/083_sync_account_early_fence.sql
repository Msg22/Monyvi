-- Static copy of migration 076; only the pre-lock fence call is added.
BEGIN;

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
  v_identity_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_is_stale boolean := false;
  v_stale_account_ids jsonb := '[]'::jsonb;
  v_canonical_accounts jsonb := '[]'::jsonb;
  v_account_revisions jsonb := '[]'::jsonb;
  v_expected_effects jsonb;
  v_outcome jsonb;
  v_outcome_text text;
  v_updated integer;
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

  PERFORM private.acquire_sync_writer_fence_v1();

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

  BEGIN
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
    -- Derivation failures are validation failures (forged linkage, bad
    -- amounts, mismatched currency): reject ephemerally like the canonical
    -- validator. Persisting the offending evidence would violate the
    -- deferred guard/effect parity invariant (e.g. a forged currency).
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

    -- Edit identity gate: a balance edit must preserve the stored type,
    -- currency, and non-deleted state. This runs before any write (and
    -- before the effect-currency check), so a forged mutation fails
    -- ephemeral with no rows changed.
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
    CASE
      WHEN SQLSTATE IN ('22023', '23503', '23505', '40001', '42501') THEN
        v_canonical_accounts := '[]'::jsonb;
        FOR v_guard IN
          SELECT value
          FROM jsonb_array_elements(v_envelope -> 'accountGuards')
          ORDER BY value ->> 'accountId' COLLATE "C"
        LOOP
          v_canonical_accounts := v_canonical_accounts || jsonb_build_array(
            private.account_financial_canonical_snapshot_v1(
              v_owner_id,
              (v_guard ->> 'accountId')::uuid
            )
          );
        END LOOP;
        v_outcome := private.financial_action_domain_conflict_outcome_v1(
          v_action_id,
          SQLSTATE,
          SQLERRM
        ) || jsonb_build_object('canonicalAccounts', v_canonical_accounts);
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
      ELSE
        RAISE;
    END CASE;
  END;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

COMMIT;
