-- Keep metals.correct/v1 materialCorrection.reason as a required string key.
-- Empty user text is valid; no placeholder reason is generated.
-- Full replacement of the existing validator from migration 068.
CREATE OR REPLACE FUNCTION private.financial_action_validate_metals_payload_v1(
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
  v_kind text := p_value ->> 'kind';
  v_payload jsonb := p_value -> 'payload';
  v_keys text[];
  v_material_correction jsonb;
  v_metadata_change jsonb;
  v_after_facts jsonb;
  v_material_metal text;
BEGIN
  PERFORM private.metal_action_expected_revision_v1(p_value);
  IF v_kind = 'dispose' THEN
    PERFORM private.financial_action_validate_metals_dispose_payload_v1(v_payload);
    RETURN;
  END IF;
  IF v_kind = 'add' THEN
    v_keys := ARRAY[
      'expectedHoldingRevision', 'holdingId', 'materialFacts', 'metadata',
      'metalType', 'predecessorEventId', 'rateSnapshots', 'reversesEventId'
    ];
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_payload) AS key)
        IS DISTINCT FROM v_keys
      OR v_payload -> 'expectedHoldingRevision' IS DISTINCT FROM 'null'::jsonb
      OR v_payload -> 'predecessorEventId' IS DISTINCT FROM 'null'::jsonb
      OR v_payload -> 'reversesEventId' IS DISTINCT FROM 'null'::jsonb
      OR v_payload ->> 'metalType' NOT IN ('GOLD', 'SILVER')
      OR jsonb_typeof(v_payload -> 'materialFacts') IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_payload -> 'metadata') IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_payload -> 'rateSnapshots') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
    END IF;
    PERFORM private.financial_action_validate_metals_material_facts_v1(
      v_payload -> 'materialFacts', v_payload ->> 'metalType'
    );
    PERFORM private.financial_action_validate_metals_metadata_v1(v_payload -> 'metadata');
    PERFORM private.financial_action_validate_metals_rate_snapshots_v1(
      v_payload -> 'rateSnapshots',
      ARRAY['acquisition_metal', 'acquisition_purchase_currency']::text[],
      v_payload ->> 'metalType',
      v_payload #>> '{materialFacts,purchaseCurrency}'
    );
    RETURN;
  END IF;
  IF v_kind = 'correct' THEN
    v_keys := ARRAY[
      'expectedHoldingRevision', 'holdingId', 'materialCorrection',
      'metadataChange', 'predecessorEventId', 'reversesEventId'
    ];
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_payload) AS key)
        IS DISTINCT FROM v_keys
      OR jsonb_typeof(v_payload -> 'predecessorEventId') NOT IN ('string', 'null')
      OR (
        jsonb_typeof(v_payload -> 'predecessorEventId') = 'null'
        AND v_payload ->> 'expectedHoldingRevision' <> '0'
      )
      OR v_payload -> 'reversesEventId' IS DISTINCT FROM 'null'::jsonb
      OR (
        v_payload -> 'materialCorrection' = 'null'::jsonb
        AND v_payload -> 'metadataChange' = 'null'::jsonb
      )
      OR (jsonb_typeof(v_payload -> 'materialCorrection') NOT IN ('object', 'null'))
      OR (jsonb_typeof(v_payload -> 'metadataChange') NOT IN ('object', 'null'))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
    END IF;
    v_metadata_change := v_payload -> 'metadataChange';
    IF v_metadata_change <> 'null'::jsonb THEN
      IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_metadata_change) AS key)
          IS DISTINCT FROM ARRAY['after', 'before']::text[]
        OR jsonb_typeof(v_metadata_change -> 'before') IS DISTINCT FROM 'object'
        OR jsonb_typeof(v_metadata_change -> 'after') IS DISTINCT FROM 'object'
        OR v_metadata_change -> 'before' = v_metadata_change -> 'after'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
      END IF;
      PERFORM private.financial_action_validate_metals_metadata_v1(v_metadata_change -> 'before');
      PERFORM private.financial_action_validate_metals_metadata_v1(v_metadata_change -> 'after');
    END IF;
    v_material_correction := v_payload -> 'materialCorrection';
    IF v_material_correction <> 'null'::jsonb THEN
      IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_material_correction) AS key)
          IS DISTINCT FROM ARRAY['after', 'before', 'rateSnapshots', 'reason']::text[]
        OR jsonb_typeof(v_material_correction -> 'before') IS DISTINCT FROM 'object'
        OR jsonb_typeof(v_material_correction -> 'after') IS DISTINCT FROM 'object'
        OR v_material_correction -> 'before' = v_material_correction -> 'after'
        OR jsonb_typeof(v_material_correction -> 'reason') IS DISTINCT FROM 'string'
        OR octet_length(v_material_correction ->> 'reason') > 1024
        OR jsonb_typeof(v_material_correction -> 'rateSnapshots') IS DISTINCT FROM 'array'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
      END IF;
      PERFORM private.financial_action_validate_metals_legacy_material_facts_v1(
        v_material_correction -> 'before'
      );
      v_after_facts := v_material_correction -> 'after';
      PERFORM private.financial_action_validate_metals_material_facts_v1(v_after_facts);
      v_material_metal := CASE
        WHEN v_after_facts ->> 'purityCode' LIKE 'gold-%' THEN 'GOLD'
        ELSE 'SILVER'
      END;
      IF v_material_correction #>> '{before,purityCode}' IS NOT NULL
        AND (v_material_correction #>> '{before,purityCode}' LIKE 'gold-%')
          IS DISTINCT FROM (v_material_metal = 'GOLD')
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
      END IF;
      PERFORM private.financial_action_validate_metals_rate_snapshots_v1(
        v_material_correction -> 'rateSnapshots',
        ARRAY['acquisition_metal', 'acquisition_purchase_currency']::text[],
        v_material_metal,
        v_after_facts ->> 'purchaseCurrency'
      );
    END IF;
    RETURN;
  END IF;
  IF v_kind IN ('delete', 'undo') THEN
    v_keys := ARRAY[
      'expectedHoldingRevision', 'holdingId', 'predecessorEventId', 'reversesEventId'
    ];
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_payload) AS key)
        IS DISTINCT FROM v_keys
      OR (
        v_kind = 'undo'
        AND jsonb_typeof(v_payload -> 'predecessorEventId') IS DISTINCT FROM 'string'
      )
      OR (
        v_kind = 'delete'
        AND jsonb_typeof(v_payload -> 'predecessorEventId') NOT IN ('string', 'null')
      )
      OR (
        v_kind = 'delete'
        AND jsonb_typeof(v_payload -> 'predecessorEventId') = 'null'
        AND v_payload ->> 'expectedHoldingRevision' <> '0'
      )
      OR (v_kind = 'delete' AND v_payload -> 'reversesEventId' IS DISTINCT FROM 'null'::jsonb)
      OR (v_kind = 'undo' AND jsonb_typeof(v_payload -> 'reversesEventId') IS DISTINCT FROM 'string')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
    END IF;
    RETURN;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_unknown_definition';
END;
$$;

REVOKE ALL ON FUNCTION private.financial_action_validate_metals_payload_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_metals_payload_v1(jsonb) TO authenticated, service_role;
