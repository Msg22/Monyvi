-- 087: Issue #363 immutable per-edit applied Name/Notes evidence.
-- Based on 086 at published immutable parent 12c466e3568891467fd18e28b9fd082d6209d4ff.
-- No retrospective backfill. Material correction evidence and P/L remain unchanged.
-- Financial action material correction evidence and P/L remain immutable.
BEGIN;

CREATE TABLE public.metal_metadata_edit_outcomes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL,
  action_id uuid,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  request_json text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'ignored')),
  applied_changes_json jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(applied_changes_json) = 'object'),
  -- This field is populated only by the Watermelon local writer. The server
  -- stores '{}' for cross-device pull; it never trusts client-applied evidence.
  local_applied_changes_json text NOT NULL DEFAULT '{}',
  -- Immutable canonical metadata snapshot permits exact replay after later edits.
  canonical_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false CHECK (deleted = false),
  FOREIGN KEY (user_id, holding_id)
    REFERENCES public.assets(user_id, id) ON DELETE RESTRICT,
  CHECK (action_id IS NULL OR action_id = id)
);
CREATE UNIQUE INDEX metal_metadata_edit_outcomes_owner_edit_unique
  ON public.metal_metadata_edit_outcomes(user_id, id);
CREATE INDEX metal_metadata_edit_outcomes_owner_holding_time
  ON public.metal_metadata_edit_outcomes(user_id, holding_id, occurred_at DESC, id);
ALTER TABLE public.metal_metadata_edit_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own applied metal metadata edit outcomes"
  ON public.metal_metadata_edit_outcomes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.metal_metadata_edit_outcomes TO authenticated;

CREATE FUNCTION private.guard_immutable_metal_metadata_outcome_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',
    MESSAGE='metal_metadata_edit_outcome_immutable';
END;
$$;
CREATE TRIGGER metal_metadata_edit_outcomes_immutable
BEFORE UPDATE OR DELETE ON public.metal_metadata_edit_outcomes
FOR EACH ROW EXECUTE FUNCTION private.guard_immutable_metal_metadata_outcome_v1();

-- Extract before/after exclusively from actual locked server rows.
CREATE FUNCTION private.metal_metadata_applied_delta_v1(
  p_before_name text, p_before_notes text,
  p_before_name_at bigint, p_before_name_writer uuid,
  p_before_notes_at bigint, p_before_notes_writer uuid,
  p_after_name text, p_after_notes text,
  p_after_name_at bigint, p_after_name_writer uuid,
  p_after_notes_at bigint, p_after_notes_writer uuid
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE v_changes jsonb := '{}'::jsonb;
BEGIN
  IF ROW(p_before_name_at,p_before_name_writer) IS DISTINCT FROM
     ROW(p_after_name_at,p_after_name_writer)
     AND p_before_name IS DISTINCT FROM p_after_name THEN
    v_changes := v_changes || jsonb_build_object(
      'name', jsonb_build_object('before',p_before_name,'after',p_after_name,
        'clock',jsonb_build_object('writtenAt',p_after_name_at,
          'writerId',p_after_name_writer))
    );
  END IF;
  IF ROW(p_before_notes_at,p_before_notes_writer) IS DISTINCT FROM
     ROW(p_after_notes_at,p_after_notes_writer)
     AND p_before_notes IS DISTINCT FROM p_after_notes THEN
    v_changes := v_changes || jsonb_build_object(
      'notes', jsonb_build_object('before',p_before_notes,'after',p_after_notes,
        'clock',jsonb_build_object('writtenAt',p_after_notes_at,
          'writerId',p_after_notes_writer))
    );
  END IF;
  RETURN v_changes;
END;
$$;

-- The core body follows immutable 068 with independent metadata clocks and
-- metadata application for valid corrections that lose financial revision CAS.
-- Material CAS, financial revisions, rate references, immutable financial
-- events, account effects, and financial outcomes retain their existing rules.
CREATE OR REPLACE FUNCTION private.apply_metal_action_v1_pre_285_core_pre_078(
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
  v_payload jsonb;
  v_action_id uuid;
  v_holding_id uuid;
  v_kind text;
  v_expected bigint;
  v_next_revision bigint;
  v_existing public.financial_action_groups%ROWTYPE;
  v_state public.metal_holding_states%ROWTYPE;
  v_asset public.assets%ROWTYPE;
  v_metal public.asset_metals%ROWTYPE;
  v_outcome jsonb;
  v_outcome_text text;
  v_now timestamptz := statement_timestamp();
  v_snapshot jsonb;
  v_facts jsonb;
  v_apply_name boolean := false;
  v_apply_notes boolean := false;
  v_metadata_written_at bigint;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'metal_action_not_authenticated';
  END IF;
  v_canonical := private.financial_action_canonical_json_v1(p_payload_json);
  v_envelope := v_canonical::jsonb;
  v_payload := v_envelope -> 'payload';
  v_action_id := (v_envelope ->> 'actionId')::uuid;
  v_holding_id := (v_envelope ->> 'domainReferenceId')::uuid;
  v_kind := v_envelope ->> 'kind';
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

  -- Different action IDs targeting the same holding still share one lock. This
  -- closes the Add/Add absence race before either transaction creates the row.
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

  v_expected := private.metal_action_expected_revision_v1(v_envelope);
  IF v_kind = 'add' THEN
    SELECT * INTO v_state
    FROM public.metal_holding_states
    WHERE holding_id = v_holding_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_state.user_id <> v_owner THEN
        RETURN jsonb_build_object(
          'status', 'rejected', 'actionId', v_action_id, 'code', 'NOT_OWNED'
        );
      END IF;
      RETURN jsonb_build_object(
        'status', 'stale', 'actionId', v_action_id,
        'code', 'HOLDING_REVISION_STALE',
        'canonicalHoldingRevision', v_state.financial_revision::text,
        'canonicalHoldingActionId', v_state.effective_action_id,
        'canonicalHoldingEvidenceHash', private.metal_holding_evidence_hash_v1(v_state),
        'canonicalAccounts', '[]'::jsonb, 'staleAccountIds', '[]'::jsonb
      );
    END IF;
    v_facts := v_payload -> 'materialFacts';
    INSERT INTO public.assets (
      id, user_id, name, notes, type, is_liquid, purchase_price, purchase_date,
      currency, purchase_price_decimal, purchase_currency, acquisition_action_id,
      created_at, updated_at, deleted
    ) VALUES (
      v_holding_id, v_owner, v_payload #>> '{metadata,name}',
      v_payload #>> '{metadata,notes}', 'METAL', false,
      (v_facts ->> 'purchasePriceDecimal')::numeric,
      (v_facts ->> 'purchaseDate')::date,
      (v_facts ->> 'purchaseCurrency')::public.currency_type,
      (v_facts ->> 'purchasePriceDecimal')::numeric,
      v_facts ->> 'purchaseCurrency', null, v_now, v_now, false
    );
    INSERT INTO public.asset_metals (
      id, asset_id, metal_type, weight_grams, purity_fraction, item_form,
      weight_grams_decimal, purity_code, purity_factor_decimal,
      purity_catalog_version, created_at, updated_at, deleted
    ) VALUES (
      v_holding_id, v_holding_id,
      (v_payload ->> 'metalType')::public.metal_type,
      (v_facts ->> 'weightGramsDecimal')::numeric,
      (v_facts ->> 'purityFactorDecimal')::numeric,
      v_facts ->> 'physicalForm',
      (v_facts ->> 'weightGramsDecimal')::numeric,
      v_facts ->> 'purityCode',
      (v_facts ->> 'purityFactorDecimal')::numeric,
      v_facts ->> 'purityCatalogVersion', v_now, v_now, false
    );
    v_next_revision := 0;
  ELSE
    SELECT * INTO v_state
    FROM public.metal_holding_states
    WHERE holding_id = v_holding_id
    FOR UPDATE;
    IF NOT FOUND OR v_state.user_id <> v_owner THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 'actionId', v_action_id, 'code', 'NOT_OWNED'
      );
    END IF;
    SELECT * INTO v_asset
    FROM public.assets
    WHERE id = v_holding_id AND user_id = v_owner;
    SELECT * INTO v_metal
    FROM public.asset_metals
    WHERE asset_id = v_holding_id;
    IF v_asset.id IS NULL OR v_metal.id IS NULL THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 'actionId', v_action_id, 'code', 'INVALID_LINK'
      );
    END IF;
    -- Independent per-field metadata clocks do not participate in material CAS.
    IF v_kind = 'correct' AND v_payload -> 'metadataChange' <> 'null'::jsonb THEN
    v_metadata_written_at := floor(extract(epoch FROM
      (v_envelope ->> 'occurredAt')::timestamptz) * 1000)::bigint;
    IF v_state.name_written_at = v_metadata_written_at
       AND v_state.name_writer_id = v_action_id
       AND v_asset.name IS DISTINCT FROM v_payload #>> '{metadataChange,after,name}'
    THEN
      RETURN jsonb_build_object('status', 'rejected', 'actionId', v_action_id,
        'code', 'INVALID_LINK');
    END IF;
    IF v_state.notes_written_at = v_metadata_written_at
       AND v_state.notes_writer_id = v_action_id
       AND v_asset.notes IS DISTINCT FROM v_payload #>> '{metadataChange,after,notes}'
    THEN
      RETURN jsonb_build_object('status', 'rejected', 'actionId', v_action_id,
        'code', 'INVALID_LINK');
    END IF;
    v_apply_name :=
      v_payload #>> '{metadataChange,before,name}' IS DISTINCT FROM
        v_payload #>> '{metadataChange,after,name}'
      AND (
        v_state.name_written_at IS NULL
        OR (v_state.name_written_at, v_state.name_writer_id) <
          (v_metadata_written_at, v_action_id)
      );
    v_apply_notes :=
      v_payload #> '{metadataChange,before,notes}' IS DISTINCT FROM
        v_payload #> '{metadataChange,after,notes}'
      AND (
        v_state.notes_written_at IS NULL
        OR (v_state.notes_written_at, v_state.notes_writer_id) <
          (v_metadata_written_at, v_action_id)
      );
  END IF;

    IF v_state.financial_revision <> v_expected THEN
      IF v_kind = 'correct' AND v_payload -> 'metadataChange' <> 'null'::jsonb THEN
        -- A revision conflict is allowed; foreign/missing links are not.
        IF v_asset.type <> 'METAL' OR v_asset.deleted OR v_state.deleted
          OR NOT (
            (v_payload ->> 'predecessorEventId' IS NULL AND v_expected = 0)
            OR EXISTS (SELECT 1 FROM public.metal_lifecycle_events AS predecessor
              WHERE predecessor.id::text = v_payload ->> 'predecessorEventId'
                AND predecessor.user_id = v_owner
                AND predecessor.holding_id = v_holding_id AND NOT predecessor.deleted)
          )
          OR (v_payload -> 'materialCorrection' <> 'null'::jsonb AND
            ((v_payload #>> '{materialCorrection,after,purityCode}' LIKE 'gold-%')
              IS DISTINCT FROM (v_metal.metal_type = 'GOLD')))
        THEN
          RETURN jsonb_build_object('status','rejected','actionId',v_action_id,'code','INVALID_LINK');
        END IF;
        UPDATE public.assets SET
          name = CASE WHEN v_apply_name THEN v_payload #>> '{metadataChange,after,name}' ELSE name END,
          notes = CASE WHEN v_apply_notes THEN v_payload #>> '{metadataChange,after,notes}' ELSE notes END
        WHERE id = v_holding_id AND user_id = v_owner AND (v_apply_name OR v_apply_notes);
        UPDATE public.metal_holding_states SET
          name_written_at = CASE WHEN v_apply_name THEN v_metadata_written_at ELSE name_written_at END,
          name_writer_id = CASE WHEN v_apply_name THEN v_action_id ELSE name_writer_id END,
          notes_written_at = CASE WHEN v_apply_notes THEN v_metadata_written_at ELSE notes_written_at END,
          notes_writer_id = CASE WHEN v_apply_notes THEN v_action_id ELSE notes_writer_id END
        WHERE holding_id = v_holding_id AND user_id = v_owner AND (v_apply_name OR v_apply_notes);
      END IF;
      RETURN jsonb_build_object(
        'status', 'stale', 'actionId', v_action_id,
        'code', 'HOLDING_REVISION_STALE',
        'canonicalHoldingRevision', v_state.financial_revision::text,
        'canonicalHoldingActionId', v_state.effective_action_id,
        'canonicalHoldingEvidenceHash', private.metal_holding_evidence_hash_v1(v_state),
        'canonicalAccounts', '[]'::jsonb, 'staleAccountIds', '[]'::jsonb
      );
    END IF;
    IF v_expected = 9223372036854775807 THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 'actionId', v_action_id, 'code', 'REVISION_EXHAUSTED'
      );
    END IF;
    IF (
      v_kind = 'correct'
      AND v_payload -> 'materialCorrection' <> 'null'::jsonb
      AND (
        v_payload #> '{materialCorrection,before}' IS DISTINCT FROM
          jsonb_build_object(
            'physicalForm', v_metal.item_form,
            'purchaseCurrency', v_asset.purchase_currency,
            'purchaseDate', to_char(v_asset.purchase_date, 'YYYY-MM-DD'),
            'purchasePriceDecimal', v_asset.purchase_price_decimal::text,
            'purityCatalogVersion', v_metal.purity_catalog_version,
            'purityCode', v_metal.purity_code,
            'purityFactorDecimal', v_metal.purity_factor_decimal::text,
            'weightGramsDecimal', v_metal.weight_grams_decimal::text
          )
        OR (
          (v_payload #>> '{materialCorrection,after,purityCode}' LIKE 'gold-%')
          IS DISTINCT FROM (v_metal.metal_type = 'GOLD')
        )
      )
    ) OR (
      v_kind = 'correct'
      AND (
        v_payload -> 'materialCorrection' IS NULL
        OR v_payload -> 'materialCorrection' = 'null'::jsonb
      )
      AND (
        v_payload -> 'metadataChange' IS NULL
        OR v_payload -> 'metadataChange' = 'null'::jsonb
        OR v_payload #> '{metadataChange,before}' IS DISTINCT FROM
          jsonb_build_object('name', v_asset.name, 'notes', v_asset.notes)
        OR NOT (v_apply_name OR v_apply_notes)
      )
    ) OR (
      v_kind = 'sell'
      AND (
        v_payload ->> 'metalType' IS DISTINCT FROM v_metal.metal_type::text
        OR v_payload ->> 'purchaseCurrency' IS DISTINCT FROM v_asset.purchase_currency
      )
    ) OR (
      v_kind = 'dispose'
      AND (v_payload ->> 'disposalDate')::date < v_asset.purchase_date
    ) THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 'actionId', v_action_id, 'code', 'INVALID_LINK'
      );
    END IF;
    IF v_state.effective_event_id::text IS DISTINCT FROM v_payload ->> 'predecessorEventId'
      OR (v_kind = 'undo' AND (
        v_state.status = 'active'
        OR v_state.effective_event_id::text IS DISTINCT FROM v_payload ->> 'reversesEventId'
      ))
      OR (v_kind <> 'undo' AND (v_state.status <> 'active' OR NOT v_state.is_visible))
    THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 'actionId', v_action_id, 'code', 'INVALID_STATE'
      );
    END IF;
    v_next_revision := v_expected + 1;
  END IF;


  INSERT INTO public.financial_action_groups (
    id, action_id, user_id, domain, kind, domain_reference_id,
    payload_json, payload_hash, account_guards_json, state, deleted
  ) VALUES (
    extensions.gen_random_uuid(), v_action_id, v_owner, 'metals', v_kind, v_holding_id,
    v_canonical, p_payload_hash, '[]'::jsonb, 'sync_pending', false
  );
  INSERT INTO public.metal_action_evidence (
    id, user_id, action_id, holding_id, kind, expected_holding_revision,
    canonical_holding_revision, domain_payload_json, created_at, updated_at, deleted
  ) VALUES (
    v_action_id, v_owner, v_action_id, v_holding_id, v_kind, v_expected,
    v_next_revision, v_payload, v_now, v_now, false
  );
  INSERT INTO public.metal_lifecycle_events (
    id, user_id, holding_id, action_id, kind, occurred_at, payload_json,
    predecessor_event_id, reverses_event_id, is_effective, is_history_visible,
    created_at, updated_at, deleted
  ) VALUES (
    v_action_id, v_owner, v_holding_id, v_action_id, v_kind,
    (v_envelope ->> 'occurredAt')::timestamptz, v_payload,
    (v_payload ->> 'predecessorEventId')::uuid,
    (v_payload ->> 'reversesEventId')::uuid,
    true, v_kind <> 'delete', v_now, v_now, false
  );

  FOR v_snapshot IN
    SELECT item.snapshot
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_payload -> 'rateSnapshots') = 'array'
          THEN v_payload -> 'rateSnapshots'
        WHEN jsonb_typeof(v_payload #> '{materialCorrection,rateSnapshots}') = 'array'
          THEN v_payload #> '{materialCorrection,rateSnapshots}'
        ELSE '[]'::jsonb
      END
    ) AS item(snapshot)
  LOOP
    INSERT INTO public.metal_rate_references (
      id, user_id, holding_id, action_id, role, kind, instrument_code,
      value_decimal, unit, orientation, provider_observed_at, source, quality,
      captured_freshness, captured_at, created_at, updated_at, deleted
    ) VALUES (
      (v_snapshot ->> 'referenceId')::uuid, v_owner, v_holding_id, v_action_id,
      v_snapshot ->> 'role', v_snapshot ->> 'kind', v_snapshot ->> 'instrumentCode',
      (v_snapshot ->> 'valueDecimal')::numeric, v_snapshot ->> 'unit',
      v_snapshot ->> 'orientation',
      (v_snapshot ->> 'providerObservedAt')::timestamptz,
      v_snapshot ->> 'source', v_snapshot ->> 'quality',
      v_snapshot ->> 'capturedFreshness',
      (v_snapshot ->> 'capturedAt')::timestamptz, v_now, v_now, false
    );
  END LOOP;

  IF v_kind = 'add' THEN
    UPDATE public.assets SET acquisition_action_id = v_action_id WHERE id = v_holding_id;
    INSERT INTO public.metal_holding_states (
      id, user_id, holding_id, status, financial_revision, effective_event_id,
      effective_action_id, is_visible, reconciliation_state, created_at, updated_at, deleted
    ) VALUES (
      v_holding_id, v_owner, v_holding_id, 'active', v_next_revision,
      v_action_id, v_action_id, true, 'accepted', v_now, v_now, false
    );
  ELSE
    IF v_kind = 'correct' AND v_payload -> 'materialCorrection' <> 'null'::jsonb THEN
      v_facts := v_payload #> '{materialCorrection,after}';
      UPDATE public.assets SET
        purchase_price = (v_facts ->> 'purchasePriceDecimal')::numeric,
        purchase_date = (v_facts ->> 'purchaseDate')::date,
        currency = (v_facts ->> 'purchaseCurrency')::public.currency_type,
        purchase_price_decimal = (v_facts ->> 'purchasePriceDecimal')::numeric,
        purchase_currency = v_facts ->> 'purchaseCurrency',
        acquisition_action_id = v_action_id
      WHERE id = v_holding_id AND user_id = v_owner;
      UPDATE public.asset_metals SET
        weight_grams = (v_facts ->> 'weightGramsDecimal')::numeric,
        purity_fraction = (v_facts ->> 'purityFactorDecimal')::numeric,
        item_form = v_facts ->> 'physicalForm',
        weight_grams_decimal = (v_facts ->> 'weightGramsDecimal')::numeric,
        purity_code = v_facts ->> 'purityCode',
        purity_factor_decimal = (v_facts ->> 'purityFactorDecimal')::numeric,
        purity_catalog_version = v_facts ->> 'purityCatalogVersion'
      WHERE asset_id = v_holding_id;
    END IF;
    IF v_apply_name OR v_apply_notes THEN
      UPDATE public.assets SET
        name = CASE WHEN v_apply_name
          THEN v_payload #>> '{metadataChange,after,name}' ELSE name END,
        notes = CASE WHEN v_apply_notes
          THEN v_payload #>> '{metadataChange,after,notes}' ELSE notes END
      WHERE id = v_holding_id AND user_id = v_owner;
    END IF;
    UPDATE public.metal_holding_states SET
      status = CASE
        WHEN v_kind = 'sell' THEN 'sold'
        WHEN v_kind = 'dispose' THEN 'disposed'
        ELSE 'active'
      END,
      financial_revision = v_next_revision,
      effective_event_id = v_action_id,
      effective_action_id = v_action_id,
      is_visible = v_kind <> 'delete',
      name_written_at = CASE
        WHEN v_apply_name THEN floor(extract(epoch FROM (v_envelope ->> 'occurredAt')::timestamptz) * 1000)::bigint
        ELSE name_written_at
      END,
      name_writer_id = CASE
        WHEN v_apply_name THEN v_action_id
        ELSE name_writer_id
      END,
      notes_written_at = CASE
        WHEN v_apply_notes THEN floor(extract(epoch FROM (v_envelope ->> 'occurredAt')::timestamptz) * 1000)::bigint
        ELSE notes_written_at
      END,
      notes_writer_id = CASE
        WHEN v_apply_notes THEN v_action_id
        ELSE notes_writer_id
      END,
      reconciliation_state = 'accepted'
    WHERE holding_id = v_holding_id AND user_id = v_owner;
  END IF;

  v_outcome := jsonb_build_object(
    'status', 'accepted', 'actionId', v_action_id,
    'holdingRevision', v_next_revision::text,
    'accountRevisions', '[]'::jsonb,
    'effectiveEventId', v_action_id,
    'serverAcceptedAt', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_outcome_text := private.financial_action_encode_jsonb_v1(v_outcome);
  UPDATE public.financial_action_groups SET
    state = 'accepted', server_outcome = 'accepted', outcome_json = v_outcome_text,
    rejection_code = null
  WHERE user_id = v_owner AND action_id = v_action_id;
  RETURN v_outcome;
END;
$$;

-- Dedicated durable metadata-only request RPC: canonical numeric-free JSON
-- serializes writtenAt as a decimal string, so the existing financial JSON
-- canonicalizer/hash verification can be used without changing financial APIs.
CREATE FUNCTION public.apply_metal_metadata_edit_v1(
  p_request_json text,
  p_request_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_text text;
  v_request jsonb;
  v_fields jsonb;
  v_name jsonb;
  v_notes jsonb;
  v_edit_id uuid;
  v_holding_id uuid;
  v_existing public.metal_metadata_edit_outcomes%ROWTYPE;
  v_state public.metal_holding_states%ROWTYPE;
  v_asset public.assets%ROWTYPE;
  v_after_state public.metal_holding_states%ROWTYPE;
  v_after_asset public.assets%ROWTYPE;
  v_apply_name boolean := false;
  v_apply_notes boolean := false;
  v_name_at bigint;
  v_notes_at bigint;
  v_changes jsonb;
  v_status text;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='metal_metadata_not_authenticated';
  END IF;
  IF octet_length(p_request_json) > 65536 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_metal_metadata_edit';
  END IF;
  v_text := private.financial_action_canonical_json_value_v1(p_request_json);
  IF p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_request_hash <> encode(
       extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex')
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='metal_metadata_edit_payload_hash_mismatch';
  END IF;
  v_request := v_text::jsonb;
  IF jsonb_typeof(v_request) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_request) AS key)
      IS DISTINCT FROM ARRAY[
        'editId','fields','holdingId','linkedActionId','occurredAt','userId'
      ]::text[]
    OR v_request ->> 'userId' IS DISTINCT FROM v_owner::text
    OR v_request -> 'linkedActionId' IS DISTINCT FROM 'null'::jsonb
    OR jsonb_typeof(v_request -> 'fields') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(v_request -> 'fields')) NOT BETWEEN 1 AND 2
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_request -> 'fields') AS key
               WHERE key NOT IN ('name','notes'))
  THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_metal_metadata_edit';
  END IF;
  v_edit_id := (v_request ->> 'editId')::uuid;
  v_holding_id := (v_request ->> 'holdingId')::uuid;
  v_fields := v_request -> 'fields';
  v_name := v_fields -> 'name';
  v_notes := v_fields -> 'notes';

  -- Reject non-canonical clocks before casting, including excessive values.
  IF v_name IS NOT NULL THEN
    IF jsonb_typeof(v_name) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_name) AS key)
         IS DISTINCT FROM ARRAY['value','writerId','writtenAt']::text[]
      OR jsonb_typeof(v_name -> 'value') IS DISTINCT FROM 'string'
      OR length(btrim(v_name ->> 'value')) = 0
      OR octet_length(v_name ->> 'value') > 256
      OR jsonb_typeof(v_name -> 'writtenAt') IS DISTINCT FROM 'string'
      OR v_name ->> 'writtenAt' !~ '^(0|[1-9][0-9]*)$'
      OR length(v_name ->> 'writtenAt') > 16
      OR (v_name ->> 'writtenAt')::numeric > 9007199254740991
      OR v_name ->> 'writerId' IS DISTINCT FROM v_edit_id::text
    THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_metal_metadata_edit';
    END IF;
    v_name_at := (v_name ->> 'writtenAt')::bigint;
  END IF;
  IF v_notes IS NOT NULL THEN
    IF jsonb_typeof(v_notes) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_notes) AS key)
         IS DISTINCT FROM ARRAY['value','writerId','writtenAt']::text[]
      OR jsonb_typeof(v_notes -> 'value') NOT IN ('string','null')
      OR octet_length(v_notes ->> 'value') > 4096
      OR jsonb_typeof(v_notes -> 'writtenAt') IS DISTINCT FROM 'string'
      OR v_notes ->> 'writtenAt' !~ '^(0|[1-9][0-9]*)$'
      OR length(v_notes ->> 'writtenAt') > 16
      OR (v_notes ->> 'writtenAt')::numeric > 9007199254740991
      OR v_notes ->> 'writerId' IS DISTINCT FROM v_edit_id::text
    THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_metal_metadata_edit';
    END IF;
    v_notes_at := (v_notes ->> 'writtenAt')::bigint;
  END IF;

  PERFORM private.acquire_sync_writer_fence_v1();
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || v_holding_id::text,0));
  SELECT * INTO v_existing FROM public.metal_metadata_edit_outcomes
  WHERE id=v_edit_id AND user_id=v_owner FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash <> p_request_hash
       OR v_existing.request_json <> v_text
       OR v_existing.holding_id <> v_holding_id THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='metal_metadata_edit_payload_hash_mismatch';
    END IF;
    RETURN jsonb_build_object('status',v_existing.status,
      'editId',v_edit_id,'holdingId',v_holding_id,
      'appliedChanges',v_existing.applied_changes_json,
      'canonicalMetadata',v_existing.canonical_metadata_json);
  END IF;

  SELECT * INTO v_state FROM public.metal_holding_states
  WHERE holding_id=v_holding_id AND user_id=v_owner AND deleted=false FOR UPDATE;
  SELECT * INTO v_asset FROM public.assets
  WHERE id=v_holding_id AND user_id=v_owner AND type='METAL'
    AND deleted=false FOR UPDATE;
  IF v_state.id IS NULL OR v_asset.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='metal_holding_not_owned';
  END IF;
  IF v_name IS NOT NULL THEN
    IF v_state.name_written_at=v_name_at
      AND v_state.name_writer_id=v_edit_id
      AND v_asset.name IS DISTINCT FROM v_name ->> 'value'
    THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='metal_metadata_tuple_conflict';
    END IF;
    v_apply_name := v_state.name_written_at IS NULL OR
      (v_state.name_written_at,v_state.name_writer_id) <
      (v_name_at,v_edit_id);
  END IF;
  IF v_notes IS NOT NULL THEN
    IF v_state.notes_written_at=v_notes_at
      AND v_state.notes_writer_id=v_edit_id
      AND v_asset.notes IS DISTINCT FROM v_notes ->> 'value'
    THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='metal_metadata_tuple_conflict';
    END IF;
    v_apply_notes := v_state.notes_written_at IS NULL OR
      (v_state.notes_written_at,v_state.notes_writer_id) <
      (v_notes_at,v_edit_id);
  END IF;
  IF v_apply_name OR v_apply_notes THEN
    UPDATE public.assets SET
      name=CASE WHEN v_apply_name THEN v_name ->> 'value' ELSE name END,
      notes=CASE WHEN v_apply_notes THEN v_notes ->> 'value' ELSE notes END
    WHERE id=v_holding_id AND user_id=v_owner;
    UPDATE public.metal_holding_states SET
      name_written_at=CASE WHEN v_apply_name THEN v_name_at ELSE name_written_at END,
      name_writer_id=CASE WHEN v_apply_name THEN v_edit_id ELSE name_writer_id END,
      notes_written_at=CASE WHEN v_apply_notes THEN v_notes_at ELSE notes_written_at END,
      notes_writer_id=CASE WHEN v_apply_notes THEN v_edit_id ELSE notes_writer_id END
    WHERE holding_id=v_holding_id AND user_id=v_owner;
  END IF;
  SELECT * INTO v_after_asset FROM public.assets
    WHERE id=v_holding_id AND user_id=v_owner;
  SELECT * INTO v_after_state FROM public.metal_holding_states
    WHERE holding_id=v_holding_id AND user_id=v_owner;
  v_changes := private.metal_metadata_applied_delta_v1(
    v_asset.name,v_asset.notes,
    v_state.name_written_at,v_state.name_writer_id,
    v_state.notes_written_at,v_state.notes_writer_id,
    v_after_asset.name,v_after_asset.notes,
    v_after_state.name_written_at,v_after_state.name_writer_id,
    v_after_state.notes_written_at,v_after_state.notes_writer_id
  );
  v_status := CASE WHEN v_changes = '{}'::jsonb THEN 'ignored' ELSE 'applied' END;
  INSERT INTO public.metal_metadata_edit_outcomes (
    id,user_id,holding_id,action_id,payload_hash,request_json,status,
    applied_changes_json,canonical_metadata_json,occurred_at
  ) VALUES (
    v_edit_id,v_owner,v_holding_id,NULL,p_request_hash,v_text,v_status,
    v_changes,
    jsonb_build_object(
      'name', jsonb_build_object('value',v_after_asset.name,
        'writtenAt',v_after_state.name_written_at,
        'writerId',v_after_state.name_writer_id),
      'notes', jsonb_build_object('value',v_after_asset.notes,
        'writtenAt',v_after_state.notes_written_at,
        'writerId',v_after_state.notes_writer_id)
    ),
    (v_request ->> 'occurredAt')::timestamptz
  );
  RETURN jsonb_build_object('status',v_status,'editId',v_edit_id,
    'holdingId',v_holding_id,'appliedChanges',v_changes,
    'canonicalMetadata',jsonb_build_object(
      'name', jsonb_build_object('value',v_after_asset.name,
        'writtenAt',v_after_state.name_written_at,
        'writerId',v_after_state.name_writer_id),
      'notes', jsonb_build_object('value',v_after_asset.notes,
        'writtenAt',v_after_state.notes_written_at,
        'writerId',v_after_state.notes_writer_id)
    ));
END;
$$;

-- Wrap the current 078 acquisition-preserving core, rather than editing its
-- immutable material-rate behavior. Existing outer 084 writer fence and replay
-- protections remain in place.
ALTER FUNCTION private.apply_metal_action_v1_pre_285_core(text,text)
  RENAME TO apply_metal_action_v1_pre_285_core_pre_363;

CREATE FUNCTION private.apply_metal_action_v1_pre_285_core(
  p_payload_json text,p_payload_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_envelope jsonb := p_payload_json::jsonb;
  v_action_id uuid := (v_envelope ->> 'actionId')::uuid;
  v_holding_id uuid := (v_envelope ->> 'domainReferenceId')::uuid;
  v_before_state public.metal_holding_states%ROWTYPE;
  v_before_asset public.assets%ROWTYPE;
  v_after_state public.metal_holding_states%ROWTYPE;
  v_after_asset public.assets%ROWTYPE;
  v_outcome jsonb;
  v_changes jsonb;
  v_existing_metadata public.metal_metadata_edit_outcomes%ROWTYPE;
BEGIN
  IF v_owner IS NOT NULL
     AND v_envelope ->> 'userId'=v_owner::text
     AND v_envelope ->> 'kind'='correct'
     AND v_envelope #> '{payload,metadataChange}' IS NOT NULL
     AND v_envelope #> '{payload,metadataChange}' <> 'null'::jsonb
  THEN
    SELECT * INTO v_before_state FROM public.metal_holding_states
      WHERE holding_id=v_holding_id AND user_id=v_owner FOR UPDATE;
    SELECT * INTO v_before_asset FROM public.assets
      WHERE id=v_holding_id AND user_id=v_owner FOR UPDATE;
  END IF;
  SELECT * INTO v_existing_metadata FROM public.metal_metadata_edit_outcomes
    WHERE id=v_action_id AND user_id=v_owner;
  IF v_existing_metadata.id IS NOT NULL AND
    (v_existing_metadata.payload_hash <> p_payload_hash OR v_existing_metadata.request_json <> p_payload_json)
  THEN
    RETURN jsonb_build_object('status','rejected','actionId',v_action_id,'code','PAYLOAD_HASH_MISMATCH');
  END IF;
  v_outcome := private.apply_metal_action_v1_pre_285_core_pre_363(
    p_payload_json,p_payload_hash
  );
  IF v_existing_metadata.id IS NOT NULL THEN RETURN v_outcome; END IF;
  IF (v_outcome ->> 'status'='accepted' OR
      (v_outcome ->> 'status'='stale' AND v_outcome ->> 'code'='HOLDING_REVISION_STALE'))
    AND v_envelope ->> 'kind'='correct'
    AND v_envelope #> '{payload,metadataChange}' <> 'null'::jsonb
  THEN
    SELECT * INTO v_after_state FROM public.metal_holding_states
      WHERE holding_id=v_holding_id AND user_id=v_owner;
    SELECT * INTO v_after_asset FROM public.assets
      WHERE id=v_holding_id AND user_id=v_owner;
    v_changes := private.metal_metadata_applied_delta_v1(
      v_before_asset.name,v_before_asset.notes,
      v_before_state.name_written_at,v_before_state.name_writer_id,
      v_before_state.notes_written_at,v_before_state.notes_writer_id,
      v_after_asset.name,v_after_asset.notes,
      v_after_state.name_written_at,v_after_state.name_writer_id,
      v_after_state.notes_written_at,v_after_state.notes_writer_id
    );
    INSERT INTO public.metal_metadata_edit_outcomes (
      id,user_id,holding_id,action_id,payload_hash,request_json,status,
      applied_changes_json,canonical_metadata_json,occurred_at
    ) VALUES (
      v_action_id,v_owner,v_holding_id,v_action_id,p_payload_hash,p_payload_json,
      CASE WHEN v_changes='{}'::jsonb THEN 'ignored' ELSE 'applied' END,
      v_changes,jsonb_build_object(
        'name',jsonb_build_object('value',v_after_asset.name,
          'writtenAt',v_after_state.name_written_at,
          'writerId',v_after_state.name_writer_id),
        'notes',jsonb_build_object('value',v_after_asset.notes,
          'writtenAt',v_after_state.notes_written_at,
          'writerId',v_after_state.notes_writer_id)
      ),(v_envelope ->> 'occurredAt')::timestamptz
    );
  END IF;
  RETURN v_outcome;
END;
$$;

-- Only authenticated users can execute the owner-scoped RPC; all internal
-- helpers and wrapped financial-action core layers stay private.
REVOKE ALL ON FUNCTION public.apply_metal_metadata_edit_v1(text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_metal_metadata_edit_v1(text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION private.apply_metal_action_v1_pre_285_core_pre_363(text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.apply_metal_action_v1_pre_285_core(text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.metal_metadata_applied_delta_v1(
  text,text,bigint,uuid,bigint,uuid,text,text,bigint,uuid,bigint,uuid
) FROM PUBLIC,anon,authenticated;

-- The old projection-only metadata RPC could mutate a holding without an edit
-- identity or immutable applied evidence. Fail closed on old clients; the only
-- authenticated metadata writer after this migration is the durable edit RPC.
REVOKE ALL ON FUNCTION public.apply_metal_metadata_patch_v1(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.apply_metal_metadata_patch_v1_pre_285(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
