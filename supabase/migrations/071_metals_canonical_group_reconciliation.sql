-- Issue #285: complete stale-winner reconciliation and validate sale dates only
-- after authentication, canonicalization, payload-hash verification, accepted
-- replay handling, and the holding-scoped transaction lock.

ALTER FUNCTION private.apply_metal_action_v1_pre_285(text, text)
  RENAME TO apply_metal_action_v1_pre_285_core;

CREATE FUNCTION private.apply_metal_action_v1_pre_285(
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
  END IF;

  RETURN private.apply_metal_action_v1_pre_285_core(
    v_canonical,
    p_payload_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.metal_canonical_action_group_v1(
  p_owner uuid,
  p_holding_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'root', jsonb_build_object(
      'id', action_root.id,
      'accountGuardsJson', private.financial_action_encode_jsonb_v1(action_root.account_guards_json::jsonb),
      'actionId', action_root.action_id,
      'createdAt', to_char(action_root.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'deleted', action_root.deleted,
      'domain', action_root.domain,
      'domainReferenceId', action_root.domain_reference_id,
      'kind', action_root.kind,
      'outcomeJson', CASE WHEN action_root.outcome_json IS NULL THEN NULL
        ELSE private.financial_action_encode_jsonb_v1(action_root.outcome_json::jsonb) END,
      'payloadHash', action_root.payload_hash,
      'payloadJson', private.financial_action_encode_jsonb_v1(action_root.payload_json::jsonb),
      'rejectionCode', action_root.rejection_code,
      'serverOutcome', action_root.server_outcome,
      'state', action_root.state,
      'updatedAt', to_char(action_root.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'userId', action_root.user_id
    ),
    'evidence', jsonb_build_object(
      'id', evidence.id,
      'actionId', evidence.action_id,
      'canonicalHoldingRevision', evidence.canonical_holding_revision::text,
      'createdAt', to_char(evidence.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'deleted', evidence.deleted,
      'domainPayloadJson', private.financial_action_encode_jsonb_v1(evidence.domain_payload_json),
      'expectedHoldingRevision', evidence.expected_holding_revision::text,
      'holdingId', evidence.holding_id,
      'kind', evidence.kind,
      'updatedAt', to_char(evidence.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'userId', evidence.user_id
    ),
    'event', jsonb_build_object(
      'id', lifecycle_event.id,
      'actionId', lifecycle_event.action_id,
      'createdAt', to_char(lifecycle_event.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'deleted', lifecycle_event.deleted,
      'holdingId', lifecycle_event.holding_id,
      'isEffective', lifecycle_event.is_effective,
      'isHistoryVisible', lifecycle_event.is_history_visible,
      'kind', lifecycle_event.kind,
      'occurredAt', to_char(lifecycle_event.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'payloadJson', private.financial_action_encode_jsonb_v1(lifecycle_event.payload_json),
      'predecessorEventId', lifecycle_event.predecessor_event_id,
      'reversesEventId', lifecycle_event.reverses_event_id,
      'updatedAt', to_char(lifecycle_event.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'userId', lifecycle_event.user_id
    ),
    'rates', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', rate.id,
          'actionId', rate.action_id,
          'capturedAt', to_char(rate.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'capturedFreshness', rate.captured_freshness,
          'createdAt', to_char(rate.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'deleted', rate.deleted,
          'holdingId', rate.holding_id,
          'instrumentCode', rate.instrument_code,
          'kind', rate.kind,
          'orientation', rate.orientation,
          'providerObservedAt', CASE WHEN rate.provider_observed_at IS NULL THEN NULL
            ELSE to_char(rate.provider_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
          'quality', rate.quality,
          'role', rate.role,
          'source', rate.source,
          'unit', rate.unit,
          'updatedAt', to_char(rate.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'userId', rate.user_id,
          'valueDecimal', rate.value_decimal::text
        ) ORDER BY rate.id
      )
      FROM public.metal_rate_references AS rate
      WHERE rate.user_id = action_root.user_id
        AND rate.holding_id = action_root.domain_reference_id
        AND rate.action_id = action_root.action_id
        AND rate.deleted = false
    ), '[]'::jsonb)
  )
  FROM public.metal_holding_states AS holding_state
  JOIN public.financial_action_groups AS action_root
    ON action_root.user_id = holding_state.user_id
    AND action_root.action_id = holding_state.effective_action_id
    AND action_root.domain_reference_id = holding_state.holding_id
    AND action_root.domain = 'metals'
    AND action_root.state = 'accepted'
    AND action_root.deleted = false
  JOIN public.metal_action_evidence AS evidence
    ON evidence.user_id = action_root.user_id
    AND evidence.action_id = action_root.action_id
    AND evidence.holding_id = action_root.domain_reference_id
    AND evidence.deleted = false
  JOIN public.metal_lifecycle_events AS lifecycle_event
    ON lifecycle_event.user_id = action_root.user_id
    AND lifecycle_event.action_id = action_root.action_id
    AND lifecycle_event.id = holding_state.effective_event_id
    AND lifecycle_event.holding_id = action_root.domain_reference_id
    AND lifecycle_event.is_effective = true
    AND lifecycle_event.deleted = false
  WHERE holding_state.user_id = p_owner
    AND holding_state.holding_id = p_holding_id
    AND holding_state.deleted = false
$$;

CREATE OR REPLACE FUNCTION public.apply_metal_action_v1(
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
  v_envelope jsonb;
  v_holding_id uuid;
  v_outcome jsonb;
BEGIN
  v_outcome := private.apply_metal_action_v1_pre_285(
    p_payload_json,
    p_payload_hash
  );
  IF v_outcome ->> 'status' = 'stale'
    AND v_outcome ->> 'code' = 'HOLDING_REVISION_STALE'
  THEN
    v_envelope := private.financial_action_canonical_json_v1(p_payload_json)::jsonb;
    v_holding_id := (v_envelope ->> 'domainReferenceId')::uuid;
    v_outcome := v_outcome || jsonb_build_object(
      'canonicalHolding', private.metal_canonical_holding_v1(v_owner, v_holding_id),
      'canonicalActionGroup', private.metal_canonical_action_group_v1(v_owner, v_holding_id)
    );
  END IF;
  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_metal_action_v1_pre_285_core(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.apply_metal_action_v1_pre_285(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.metal_canonical_action_group_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_metal_action_v1(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_metal_action_v1(text, text) TO authenticated;
