-- Issue #285: harden Metals reconciliation without rewriting applied migration 068.

CREATE OR REPLACE FUNCTION private.guard_asset_metal_action_fields_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated'
    AND TG_OP = 'INSERT'
    AND NEW.type = 'METAL'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_rpc_required';
  END IF;
  IF current_user = 'authenticated'
    AND TG_OP = 'UPDATE'
    AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.notes IS DISTINCT FROM OLD.notes)
    AND EXISTS (
      SELECT 1 FROM public.metal_holding_states AS holding_state
      WHERE holding_state.holding_id = NEW.id
        AND holding_state.user_id = NEW.user_id
        AND holding_state.deleted = false
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_metadata_rpc_required';
  END IF;
  IF current_user = 'authenticated'
    AND NEW.type = 'METAL'
    AND (
      (TG_OP = 'INSERT' AND (
        NEW.purchase_price IS NOT NULL
        OR NEW.purchase_date IS NOT NULL
        OR NEW.currency IS NOT NULL
        OR NEW.purchase_price_decimal IS NOT NULL
        OR NEW.purchase_currency IS NOT NULL
        OR NEW.acquisition_action_id IS NOT NULL
      ))
      OR (TG_OP = 'UPDATE' AND (
        NEW.purchase_price IS DISTINCT FROM OLD.purchase_price
        OR NEW.purchase_date IS DISTINCT FROM OLD.purchase_date
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.purchase_price_decimal IS DISTINCT FROM OLD.purchase_price_decimal
        OR NEW.purchase_currency IS DISTINCT FROM OLD.purchase_currency
        OR NEW.acquisition_action_id IS DISTINCT FROM OLD.acquisition_action_id
      ))
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_asset_metal_detail_action_fields_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_rpc_required';
  END IF;
  IF current_user = 'authenticated' AND (
    (TG_OP = 'INSERT' AND (
      NEW.metal_type IS NOT NULL
      OR NEW.weight_grams IS NOT NULL
      OR NEW.weight_grams_decimal IS NOT NULL
      OR NEW.purity_fraction IS NOT NULL
      OR NEW.item_form IS NOT NULL
      OR NEW.purity_code IS NOT NULL
      OR NEW.purity_factor_decimal IS NOT NULL
      OR NEW.purity_catalog_version IS NOT NULL
    ))
    OR (TG_OP = 'UPDATE' AND (
      NEW.metal_type IS DISTINCT FROM OLD.metal_type
      OR NEW.weight_grams IS DISTINCT FROM OLD.weight_grams
      OR NEW.weight_grams_decimal IS DISTINCT FROM OLD.weight_grams_decimal
      OR NEW.purity_fraction IS DISTINCT FROM OLD.purity_fraction
      OR NEW.item_form IS DISTINCT FROM OLD.item_form
      OR NEW.purity_code IS DISTINCT FROM OLD.purity_code
      OR NEW.purity_factor_decimal IS DISTINCT FROM OLD.purity_factor_decimal
      OR NEW.purity_catalog_version IS DISTINCT FROM OLD.purity_catalog_version
    ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.metal_canonical_holding_v1(
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
    'holdingId', state.holding_id,
    'asset', jsonb_build_object(
      'acquisitionActionId', asset.acquisition_action_id,
      'currency', asset.currency,
      'name', asset.name,
      'notes', asset.notes,
      'purchaseCurrency', asset.purchase_currency,
      'purchaseDate', to_char(asset.purchase_date, 'YYYY-MM-DD'),
      'purchasePrice', asset.purchase_price,
      'purchasePriceDecimal', asset.purchase_price_decimal::text
    ),
    'metal', jsonb_build_object(
      'metalType', metal.metal_type,
      'physicalForm', metal.item_form,
      'purityCatalogVersion', metal.purity_catalog_version,
      'purityCode', metal.purity_code,
      'purityFactorDecimal', metal.purity_factor_decimal::text,
      'purityFraction', metal.purity_fraction,
      'weightGrams', metal.weight_grams,
      'weightGramsDecimal', metal.weight_grams_decimal::text
    ),
    'state', jsonb_build_object(
      'effectiveActionId', state.effective_action_id,
      'effectiveEventId', state.effective_event_id,
      'financialRevision', state.financial_revision::text,
      'isVisible', state.is_visible,
      'nameWrittenAt', state.name_written_at,
      'nameWriterId', state.name_writer_id,
      'notesWrittenAt', state.notes_written_at,
      'notesWriterId', state.notes_writer_id,
      'status', state.status
    )
  )
  FROM public.metal_holding_states AS state
  JOIN public.assets AS asset
    ON asset.id = state.holding_id AND asset.user_id = state.user_id
  JOIN public.asset_metals AS metal ON metal.asset_id = asset.id
  WHERE state.user_id = p_owner AND state.holding_id = p_holding_id
$$;

ALTER FUNCTION public.apply_metal_action_v1(text, text)
  SET SCHEMA private;
ALTER FUNCTION private.apply_metal_action_v1(text, text)
  RENAME TO apply_metal_action_v1_pre_285;

CREATE FUNCTION public.apply_metal_action_v1(
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
  BEGIN
    v_envelope := p_payload_json::jsonb;
    v_holding_id := (v_envelope #>> '{payload,holdingId}')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN private.apply_metal_action_v1_pre_285(p_payload_json, p_payload_hash);
  END;

  IF v_envelope ->> 'kind' = 'sell'
    AND v_envelope #>> '{payload,saleDate}' ~ '^\d{4}-\d{2}-\d{2}$'
    AND EXISTS (
      SELECT 1 FROM public.assets AS asset
      WHERE asset.id = v_holding_id
        AND asset.user_id = v_owner
        AND asset.type = 'METAL'
        AND (v_envelope #>> '{payload,saleDate}')::date < asset.purchase_date::date
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_sale_before_acquisition';
  END IF;

  v_outcome := private.apply_metal_action_v1_pre_285(
    p_payload_json,
    p_payload_hash
  );
  IF v_outcome ->> 'status' = 'stale'
    AND v_outcome ->> 'code' = 'HOLDING_REVISION_STALE'
  THEN
    v_outcome := v_outcome || jsonb_build_object(
      'canonicalHolding',
      private.metal_canonical_holding_v1(v_owner, v_holding_id)
    );
  END IF;
  RETURN v_outcome;
END;
$$;

ALTER FUNCTION public.apply_metal_metadata_patch_v1(uuid, jsonb)
  SET SCHEMA private;
ALTER FUNCTION private.apply_metal_metadata_patch_v1(uuid, jsonb)
  RENAME TO apply_metal_metadata_patch_v1_pre_285;

CREATE FUNCTION public.apply_metal_metadata_patch_v1(
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

REVOKE ALL ON FUNCTION private.apply_metal_action_v1_pre_285(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.apply_metal_metadata_patch_v1_pre_285(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.metal_canonical_holding_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_metal_action_v1(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_metal_action_v1(text, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_metal_metadata_patch_v1(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_metal_metadata_patch_v1(uuid, jsonb)
  TO authenticated, service_role;
