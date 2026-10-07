-- PR #332 review follow-up.
--
-- A fresh accepted material correction must replace acquisition_action_id only
-- when that correction persisted a complete new acquisition Metal + purchase
-- currency reference set. Reference-less corrections preserve the prior link.
--
-- The active outer private.apply_metal_action_v1_pre_285() already performs
-- authentication, canonicalization/hash verification, the per-holding advisory
-- lock, accepted-replay short-circuiting, and revision validation before it
-- invokes this core. This wrapper therefore runs under the same holding
-- serialization, and an idempotent replay never reaches the repair below.

ALTER FUNCTION private.apply_metal_action_v1_pre_285_core(text, text)
  RENAME TO apply_metal_action_v1_pre_285_core_pre_078;

CREATE FUNCTION private.apply_metal_action_v1_pre_285_core(
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
  v_envelope jsonb := p_payload_json::jsonb;
  v_action_id uuid := (v_envelope ->> 'actionId')::uuid;
  v_holding_id uuid := (v_envelope ->> 'domainReferenceId')::uuid;
  v_prior_acquisition_action_id uuid;
  v_is_material_correction boolean;
  v_has_complete_acquisition_references boolean := false;
  v_outcome jsonb;
BEGIN
  v_is_material_correction :=
    v_envelope ->> 'kind' = 'correct'
    AND v_envelope #> '{payload,materialCorrection}' IS NOT NULL
    AND v_envelope #> '{payload,materialCorrection}' <> 'null'::jsonb;

  IF v_is_material_correction THEN
    SELECT asset.acquisition_action_id
    INTO v_prior_acquisition_action_id
    FROM public.assets AS asset
    WHERE asset.id = v_holding_id
      AND asset.user_id = v_owner
      AND asset.type = 'METAL'
    FOR UPDATE;
  END IF;

  v_outcome := private.apply_metal_action_v1_pre_285_core_pre_078(
    p_payload_json,
    p_payload_hash
  );

  IF v_is_material_correction
    AND v_outcome ->> 'status' = 'accepted'
  THEN
    SELECT
      EXISTS (
        SELECT 1
        FROM public.metal_rate_references AS reference
        WHERE reference.user_id = v_owner
          AND reference.holding_id = v_holding_id
          AND reference.action_id = v_action_id
          AND reference.role = 'acquisition_metal'
          AND reference.deleted = false
      )
      AND EXISTS (
        SELECT 1
        FROM public.metal_rate_references AS reference
        WHERE reference.user_id = v_owner
          AND reference.holding_id = v_holding_id
          AND reference.action_id = v_action_id
          AND reference.role = 'acquisition_purchase_currency'
          AND reference.deleted = false
      )
    INTO v_has_complete_acquisition_references;

    IF NOT v_has_complete_acquisition_references THEN
      UPDATE public.assets
      SET acquisition_action_id = v_prior_acquisition_action_id
      WHERE id = v_holding_id
        AND user_id = v_owner
        AND acquisition_action_id = v_action_id;
    END IF;
  END IF;

  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION
  private.apply_metal_action_v1_pre_285_core_pre_078(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  private.apply_metal_action_v1_pre_285_core(text, text)
  FROM PUBLIC, anon, authenticated;
