-- Static current bodies from 075, 070 and 062; one early fence call each.
-- Existing roles, grants, guards, business clocks and domain lock order remain.
BEGIN;

CREATE OR REPLACE FUNCTION private.apply_metal_action_v1_pre_285(
  p_payload_json text,
  p_payload_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_canonical text;
  v_envelope jsonb;
  v_action_id uuid;
  v_holding_id uuid;
  v_purchase_date date;
  v_existing public.financial_action_groups%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'metal_action_not_authenticated';
  END IF;

  v_canonical := private.financial_action_canonical_json_v1(p_payload_json);
  v_envelope := v_canonical::jsonb;
  v_action_id := (v_envelope ->> 'actionId')::uuid;
  v_holding_id := (v_envelope ->> 'domainReferenceId')::uuid;

  IF v_envelope ->> 'userId' <> v_owner::text THEN
    RETURN jsonb_build_object(
      'status', 'rejected', 'actionId', v_action_id, 'code', 'NOT_OWNED'
    );
  END IF;
  IF p_payload_hash !~ '^[0-9a-f]{64}$'
    OR p_payload_hash <> encode(
      extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'rejected', 'actionId', v_action_id, 'code', 'PAYLOAD_HASH_MISMATCH'
    );
  END IF;

  PERFORM private.acquire_sync_writer_fence_v1();

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || v_holding_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.financial_action_groups
  WHERE user_id = v_owner AND action_id = v_action_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash
      OR v_existing.payload_json <> v_canonical
    THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 'actionId', v_action_id, 'code', 'PAYLOAD_HASH_MISMATCH'
      );
    END IF;
    IF v_existing.state = 'accepted' THEN
      RETURN jsonb_set(v_existing.outcome_json::jsonb, '{status}', '"idempotent"'::jsonb);
    END IF;
    RETURN jsonb_build_object(
      'status', 'rejected', 'actionId', v_action_id, 'code', 'INCOMPLETE_GROUP'
    );
  END IF;

  IF v_envelope ->> 'kind' = 'sell' THEN
    SELECT asset.purchase_date::date INTO v_purchase_date
    FROM public.assets AS asset
    WHERE asset.id = v_holding_id
      AND asset.user_id = v_owner
      AND asset.type = 'METAL'
      AND asset.deleted = false
    FOR UPDATE;

    IF v_purchase_date IS NOT NULL
      AND (v_envelope #>> '{payload,saleDate}')::date < v_purchase_date
    THEN
      RETURN jsonb_build_object(
        'status', 'rejected',
        'actionId', v_action_id,
        'code', 'INVALID_LINK'
      );
    END IF;

    IF (v_envelope #>> '{payload,saleDate}')::date > private.metal_cairo_calendar_date_v1()
    THEN
      RETURN jsonb_build_object(
        'status', 'rejected',
        'actionId', v_action_id,
        'code', 'INVALID_LINK'
      );
    END IF;
  END IF;

  RETURN private.apply_metal_action_v1_pre_285_core(
    v_canonical,
    p_payload_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_metal_metadata_patch_v1(
  p_holding_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_outcome jsonb;
  v_canonical jsonb;
BEGIN
  IF v_owner IS NULL THEN
    RETURN private.apply_metal_metadata_patch_v1_pre_285(
      p_holding_id,
      p_patch
    );
  END IF;

  PERFORM private.acquire_sync_writer_fence_v1();

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || p_holding_id::text, 0)
  );

  v_outcome := private.apply_metal_metadata_patch_v1_pre_285(
    p_holding_id,
    p_patch
  );
  SELECT jsonb_build_object(
    'name', CASE WHEN state.name_written_at IS NULL THEN NULL ELSE jsonb_build_object(
      'value', asset.name,
      'writtenAt', state.name_written_at,
      'writerId', state.name_writer_id
    ) END,
    'notes', CASE WHEN state.notes_written_at IS NULL THEN NULL ELSE jsonb_build_object(
      'value', asset.notes,
      'writtenAt', state.notes_written_at,
      'writerId', state.notes_writer_id
    ) END
  ) INTO v_canonical
  FROM public.metal_holding_states AS state
  JOIN public.assets AS asset
    ON asset.id = state.holding_id AND asset.user_id = state.user_id
  WHERE state.holding_id = p_holding_id AND state.user_id = v_owner;
  RETURN v_outcome || jsonb_build_object('canonicalMetadata', v_canonical);
END;
$$;

CREATE OR REPLACE FUNCTION public.sms_ai_reconcile_outcomes(
  p_user_id uuid,
  p_positive_fingerprints text[],
  p_negative_outcomes jsonb,
  p_strike_threshold integer DEFAULT 3
)
RETURNS TABLE (sms_fingerprint text, strike_count integer, is_terminal boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_outcome jsonb;
  v_fingerprint text;
  v_received_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_reconcile_outcomes is service-role only';
  END IF;
  IF p_user_id IS NULL OR p_strike_threshold <> 3 THEN
    RAISE EXCEPTION 'Invalid SMS AI outcome input';
  END IF;

  PERFORM private.acquire_sync_writer_fence_v1();

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':sms_full_parse', 0)
  );

  UPDATE public.sms_ai_negative_outcomes AS outcome
  SET deleted = true, updated_at = v_now
  WHERE outcome.user_id = p_user_id
    AND outcome.deleted = false
    AND outcome.is_terminal = false
    AND outcome.sms_fingerprint = ANY(COALESCE(p_positive_fingerprints, ARRAY[]::text[]));

  FOR v_outcome IN SELECT value FROM jsonb_array_elements(COALESCE(p_negative_outcomes, '[]'::jsonb))
  LOOP
    v_fingerprint := btrim(v_outcome->>'smsFingerprint');
    v_received_at := (v_outcome->>'originalReceivedAt')::timestamptz;
    IF length(COALESCE(v_fingerprint, '')) = 0 OR v_received_at IS NULL THEN
      RAISE EXCEPTION 'Invalid negative outcome';
    END IF;

    INSERT INTO public.sms_ai_negative_outcomes (
      user_id, sms_fingerprint, original_received_at, strike_count,
      is_terminal, terminal_at, last_classified_at, created_at, updated_at, deleted
    ) VALUES (
      p_user_id, v_fingerprint, v_received_at, 1,
      false, NULL, v_now, v_now, v_now, false
    )
    ON CONFLICT (user_id, sms_fingerprint) WHERE deleted = false
    DO UPDATE SET
      strike_count = LEAST(public.sms_ai_negative_outcomes.strike_count + 1, 3),
      is_terminal = LEAST(public.sms_ai_negative_outcomes.strike_count + 1, 3) = 3,
      terminal_at = CASE
        WHEN LEAST(public.sms_ai_negative_outcomes.strike_count + 1, 3) = 3
          THEN COALESCE(public.sms_ai_negative_outcomes.terminal_at, v_now)
        ELSE NULL
      END,
      last_classified_at = v_now,
      updated_at = v_now
    RETURNING public.sms_ai_negative_outcomes.sms_fingerprint,
      public.sms_ai_negative_outcomes.strike_count,
      public.sms_ai_negative_outcomes.is_terminal
    INTO sms_fingerprint, strike_count, is_terminal;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMIT;
