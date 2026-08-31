-- Gold/Silver exact persistence, lifecycle evidence, and dedicated sync ownership.
-- Account financial effects remain reserved for migration 069 / issue #242.

CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.metal_revision_from_text_v1(p_revision text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_revision !~ '^(0|[1-9][0-9]*)$'
    OR length(p_revision) > 19
    OR p_revision::numeric > 9223372036854775807
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_metal_revision';
  END IF;
  RETURN p_revision::bigint;
END;
$$;

-- Payload schemas remain action-specific and registry-owned. This helper freezes only
-- the approved holding-CAS binding shared by every future exact Metals definition.
CREATE OR REPLACE FUNCTION private.metal_action_expected_revision_v1(
  p_envelope jsonb
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_payload jsonb;
  v_payload_version text;
  v_revision jsonb;
BEGIN
  IF jsonb_typeof(p_envelope) IS DISTINCT FROM 'object'
    OR p_envelope ->> 'domain' IS DISTINCT FROM 'metals'
    OR jsonb_typeof(p_envelope -> 'accountGuards') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_invalid_binding';
  END IF;

  IF jsonb_array_length(p_envelope -> 'accountGuards') <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_action_account_effects_disabled';
  END IF;

  v_kind := p_envelope ->> 'kind';
  v_payload_version := p_envelope ->> 'payloadVersion';
  IF (v_kind, v_payload_version) NOT IN (
    ('add', 'metals.add/v1'),
    ('correct', 'metals.correct/v1'),
    ('sell', 'metals.sell/v2'),
    ('dispose', 'metals.dispose/v1'),
    ('delete', 'metals.delete/v1'),
    ('undo', 'metals.undo/v1')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_action_unknown_definition';
  END IF;

  v_payload := p_envelope -> 'payload';
  IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_payload -> 'holdingId') IS DISTINCT FROM 'string'
    OR (v_payload ->> 'holdingId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_envelope ->> 'domainReferenceId' IS DISTINCT FROM v_payload ->> 'holdingId'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_invalid_binding';
  END IF;

  v_revision := v_payload -> 'expectedHoldingRevision';
  IF v_kind = 'add' THEN
    IF jsonb_typeof(v_revision) IS DISTINCT FROM 'null' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_invalid_revision';
    END IF;
    RETURN NULL;
  END IF;

  IF jsonb_typeof(v_revision) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_invalid_revision';
  END IF;

  BEGIN
    RETURN private.metal_revision_from_text_v1(v_revision #>> '{}');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metal_action_invalid_revision';
  END;
END;
$$;

ALTER TABLE public.assets
  ADD COLUMN purchase_price_decimal numeric,
  ADD COLUMN purchase_currency text,
  ADD COLUMN acquisition_action_id uuid;

ALTER TABLE public.asset_metals
  ADD COLUMN weight_grams_decimal numeric,
  ADD COLUMN purity_code text,
  ADD COLUMN purity_factor_decimal numeric,
  ADD COLUMN purity_catalog_version text;

-- Exact backfill is rerunnable and never replaces a previously populated exact value.
UPDATE public.assets AS asset
SET
  purchase_price_decimal = CASE
    WHEN asset.purchase_price_decimal IS NULL AND asset.purchase_price > 0
      THEN asset.purchase_price::numeric
    ELSE asset.purchase_price_decimal
  END,
  purchase_currency = CASE
    WHEN asset.purchase_currency IS NULL AND asset.currency::text ~ '^[A-Z]{3}$'
      THEN asset.currency::text
    ELSE asset.purchase_currency
  END
FROM public.asset_metals AS metal
WHERE metal.asset_id = asset.id
  AND metal.metal_type IN ('GOLD', 'SILVER');

UPDATE public.asset_metals AS metal
SET
  weight_grams_decimal = CASE
    WHEN metal.weight_grams_decimal IS NULL AND metal.weight_grams > 0
      THEN metal.weight_grams::numeric
    ELSE metal.weight_grams_decimal
  END,
  purity_code = CASE
    WHEN metal.purity_code IS NOT NULL THEN metal.purity_code
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.9999 THEN 'gold-9999'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.999 THEN 'gold-999'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.995 THEN 'gold-995'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.97916 THEN 'gold-97916'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.9167 THEN 'gold-9167'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.875 THEN 'gold-875'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.75 THEN 'gold-750'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.58333 THEN 'gold-58333'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.5 THEN 'gold-500'
    WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.375 THEN 'gold-375'
    WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.9999 THEN 'silver-9999'
    WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.999 THEN 'silver-999'
    WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.925 THEN 'silver-925'
    WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.9 THEN 'silver-900'
    WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.8 THEN 'silver-800'
    WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.6 THEN 'silver-600'
    ELSE NULL
  END,
  purity_factor_decimal = CASE
    WHEN metal.purity_factor_decimal IS NOT NULL THEN metal.purity_factor_decimal
    WHEN metal.metal_type IN ('GOLD', 'SILVER')
      AND metal.purity_fraction IN (
        0.9999, 0.999, 0.995, 0.97916, 0.9167, 0.875, 0.75,
        0.58333, 0.5, 0.375, 0.925, 0.9, 0.8, 0.6
      ) THEN metal.purity_fraction::numeric
    ELSE NULL
  END,
  purity_catalog_version = CASE
    WHEN metal.purity_catalog_version IS NOT NULL THEN metal.purity_catalog_version
    WHEN metal.metal_type IN ('GOLD', 'SILVER')
      AND metal.purity_fraction IN (
        0.9999, 0.999, 0.995, 0.97916, 0.9167, 0.875, 0.75,
        0.58333, 0.5, 0.375, 0.925, 0.9, 0.8, 0.6
      ) THEN '1'
    ELSE NULL
  END
WHERE metal.metal_type IN ('GOLD', 'SILVER');

ALTER TABLE public.assets
  ADD CONSTRAINT assets_purchase_price_decimal_check
    CHECK (purchase_price_decimal IS NULL OR purchase_price_decimal > 0),
  ADD CONSTRAINT assets_purchase_currency_check
    CHECK (purchase_currency IS NULL OR purchase_currency ~ '^[A-Z]{3}$');

ALTER TABLE public.asset_metals
  ADD CONSTRAINT asset_metals_v1_metal_type_check
    CHECK (metal_type IN ('GOLD', 'SILVER')) NOT VALID,
  ADD CONSTRAINT asset_metals_weight_grams_decimal_check
    CHECK (weight_grams_decimal IS NULL OR weight_grams_decimal > 0),
  ADD CONSTRAINT asset_metals_purity_tuple_check
    CHECK (
      (purity_code IS NULL AND purity_factor_decimal IS NULL AND purity_catalog_version IS NULL)
      OR
      (
        purity_catalog_version = '1'
        AND (
          (
            metal_type = 'GOLD' AND (purity_code, purity_factor_decimal) IN (
              ('gold-9999', 0.9999), ('gold-999', 0.999), ('gold-995', 0.995),
              ('gold-97916', 0.97916), ('gold-9167', 0.9167), ('gold-875', 0.875),
              ('gold-750', 0.75), ('gold-58333', 0.58333), ('gold-500', 0.5),
              ('gold-375', 0.375)
            )
          )
          OR (
            metal_type = 'SILVER' AND (purity_code, purity_factor_decimal) IN (
              ('silver-9999', 0.9999), ('silver-999', 0.999),
              ('silver-925', 0.925), ('silver-900', 0.9),
              ('silver-800', 0.8), ('silver-600', 0.6)
            )
          )
        )
      )
    );

CREATE UNIQUE INDEX assets_user_id_id_unique ON public.assets (user_id, id);

ALTER TABLE public.assets
  ADD CONSTRAINT assets_acquisition_action_owner_fk
  FOREIGN KEY (user_id, acquisition_action_id)
  REFERENCES public.financial_action_groups (user_id, action_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.metal_holding_states (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'sold', 'disposed')),
  financial_revision bigint NOT NULL DEFAULT 0 CHECK (
    financial_revision >= 0 AND financial_revision <= 9223372036854775807
  ),
  effective_event_id uuid,
  effective_action_id uuid,
  is_visible boolean NOT NULL DEFAULT true,
  reconciliation_state text NOT NULL DEFAULT 'accepted' CHECK (
    reconciliation_state IN (
      'pending_local', 'local_complete', 'sync_pending', 'sync_failed',
      'accepted', 'rejected_compensating', 'reconciliation_incomplete', 'reconciled'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (holding_id),
  FOREIGN KEY (user_id, holding_id) REFERENCES public.assets (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, effective_action_id)
    REFERENCES public.financial_action_groups (user_id, action_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (financial_revision = 0 AND effective_action_id IS NULL)
    OR effective_action_id IS NOT NULL
  )
);

CREATE TABLE public.metal_action_evidence (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid NOT NULL,
  holding_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('add', 'correct', 'sell', 'dispose', 'delete', 'undo')),
  expected_holding_revision bigint CHECK (
    expected_holding_revision IS NULL OR
    (expected_holding_revision >= 0 AND expected_holding_revision <= 9223372036854775807)
  ),
  canonical_holding_revision bigint CHECK (
    canonical_holding_revision IS NULL OR
    (canonical_holding_revision >= 0 AND canonical_holding_revision <= 9223372036854775807)
  ),
  domain_payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, action_id),
  FOREIGN KEY (user_id, action_id)
    REFERENCES public.financial_action_groups (user_id, action_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, holding_id) REFERENCES public.assets (user_id, id) ON DELETE CASCADE,
  CHECK (
    (kind = 'add' AND expected_holding_revision IS NULL)
    OR (kind <> 'add' AND expected_holding_revision IS NOT NULL)
  )
);

CREATE TABLE public.metal_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL,
  action_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('add', 'correct', 'sell', 'dispose', 'delete', 'undo')),
  occurred_at timestamptz NOT NULL,
  payload_json jsonb NOT NULL,
  predecessor_event_id uuid,
  reverses_event_id uuid,
  is_effective boolean NOT NULL DEFAULT true,
  is_history_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, action_id),
  UNIQUE (user_id, holding_id, id),
  FOREIGN KEY (user_id, action_id)
    REFERENCES public.financial_action_groups (user_id, action_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, holding_id) REFERENCES public.assets (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, holding_id, predecessor_event_id)
    REFERENCES public.metal_lifecycle_events (user_id, holding_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (user_id, holding_id, reverses_event_id)
    REFERENCES public.metal_lifecycle_events (user_id, holding_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.metal_holding_states
  ADD CONSTRAINT metal_holding_states_effective_event_fk
  FOREIGN KEY (user_id, holding_id, effective_event_id)
  REFERENCES public.metal_lifecycle_events (user_id, holding_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.metal_rate_references (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL,
  action_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN (
    'acquisition_metal', 'current_metal', 'terminal_metal',
    'acquisition_purchase_currency', 'current_purchase_currency',
    'terminal_purchase_currency', 'terminal_proceeds_currency',
    'display_purchase_currency', 'display_preferred_currency'
  )),
  kind text NOT NULL CHECK (kind IN ('metal', 'currency')),
  instrument_code text NOT NULL,
  value_decimal numeric NOT NULL CHECK (value_decimal > 0),
  unit text NOT NULL CHECK (unit IN (
    'usd_per_pure_gram', 'usd_per_currency_unit', 'currency_units_per_usd'
  )),
  orientation text NOT NULL CHECK (orientation IN ('quote_per_base', 'base_per_quote')),
  provider_observed_at timestamptz,
  source text NOT NULL,
  quality text NOT NULL,
  captured_freshness text NOT NULL CHECK (captured_freshness IN ('fresh', 'stale', 'unknown')),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, action_id, role),
  FOREIGN KEY (user_id, action_id)
    REFERENCES public.financial_action_groups (user_id, action_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, holding_id) REFERENCES public.assets (user_id, id) ON DELETE CASCADE,
  CHECK (
    (
      kind = 'metal'
      AND role IN ('acquisition_metal', 'current_metal', 'terminal_metal')
      AND instrument_code IN ('metal:GOLD', 'metal:SILVER')
      AND unit = 'usd_per_pure_gram'
      AND orientation = 'quote_per_base'
    )
    OR
    (
      kind = 'currency'
      AND role IN (
        'acquisition_purchase_currency', 'current_purchase_currency',
        'terminal_purchase_currency', 'terminal_proceeds_currency',
        'display_purchase_currency', 'display_preferred_currency'
      )
      AND instrument_code ~ '^currency:[A-Z]{3}$'
      AND (
        (unit = 'usd_per_currency_unit' AND orientation = 'quote_per_base')
        OR (unit = 'currency_units_per_usd' AND orientation = 'base_per_quote')
      )
    )
  )
);

CREATE TABLE public.market_rate_observations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  batch_id uuid NOT NULL,
  instrument_code text NOT NULL CHECK (
    instrument_code IN ('metal:GOLD', 'metal:SILVER')
    OR instrument_code ~ '^currency:[A-Z]{3}$'
  ),
  value_decimal numeric NOT NULL CHECK (value_decimal > 0),
  unit text NOT NULL CHECK (unit IN (
    'usd_per_pure_gram', 'usd_per_currency_unit', 'currency_units_per_usd'
  )),
  orientation text NOT NULL CHECK (orientation IN ('quote_per_base', 'base_per_quote')),
  provider_observed_at timestamptz,
  source text NOT NULL,
  quality text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.metal_holding_states (
  user_id, holding_id, status, financial_revision, effective_event_id,
  effective_action_id, is_visible, reconciliation_state, created_at, updated_at, deleted
)
SELECT
  asset.user_id, asset.id, 'active', 0, NULL, NULL, true, 'accepted',
  asset.created_at, asset.updated_at, asset.deleted
FROM public.assets AS asset
JOIN public.asset_metals AS metal ON metal.asset_id = asset.id
WHERE metal.metal_type IN ('GOLD', 'SILVER')
ON CONFLICT (holding_id) DO NOTHING;

CREATE INDEX metal_holding_states_user_status_deleted_idx
  ON public.metal_holding_states (user_id, status, deleted);
CREATE INDEX metal_holding_states_user_updated_idx
  ON public.metal_holding_states (user_id, updated_at);
CREATE INDEX assets_acquisition_action_owner_idx
  ON public.assets (user_id, acquisition_action_id)
  WHERE acquisition_action_id IS NOT NULL;
CREATE INDEX metal_holding_states_effective_action_idx
  ON public.metal_holding_states (user_id, effective_action_id)
  WHERE effective_action_id IS NOT NULL;
CREATE INDEX metal_holding_states_effective_event_idx
  ON public.metal_holding_states (effective_event_id)
  WHERE effective_event_id IS NOT NULL;
CREATE INDEX metal_action_evidence_holding_idx
  ON public.metal_action_evidence (user_id, holding_id);
CREATE INDEX metal_lifecycle_events_holding_occurred_idx
  ON public.metal_lifecycle_events (user_id, holding_id, occurred_at);
CREATE INDEX metal_lifecycle_events_predecessor_idx
  ON public.metal_lifecycle_events (predecessor_event_id)
  WHERE predecessor_event_id IS NOT NULL;
CREATE INDEX metal_lifecycle_events_reverses_idx
  ON public.metal_lifecycle_events (reverses_event_id)
  WHERE reverses_event_id IS NOT NULL;
CREATE INDEX metal_rate_references_holding_idx
  ON public.metal_rate_references (user_id, holding_id);
CREATE INDEX market_rate_observations_instrument_observed_idx
  ON public.market_rate_observations (instrument_code, provider_observed_at DESC);
CREATE INDEX market_rate_observations_batch_idx
  ON public.market_rate_observations (batch_id);

CREATE TRIGGER handle_metal_holding_states_updated_at
BEFORE UPDATE ON public.metal_holding_states
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_metal_action_evidence_updated_at
BEFORE UPDATE ON public.metal_action_evidence
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_metal_lifecycle_events_updated_at
BEFORE UPDATE ON public.metal_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_metal_rate_references_updated_at
BEFORE UPDATE ON public.metal_rate_references
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.metal_holding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_action_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_rate_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own metal holding states"
ON public.metal_holding_states FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can select own metal action evidence"
ON public.metal_action_evidence FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can select own metal lifecycle events"
ON public.metal_lifecycle_events FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can select own metal rate references"
ON public.metal_rate_references FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Authenticated users can read market rate observations"
ON public.market_rate_observations FOR SELECT TO authenticated
USING (true);

GRANT SELECT ON public.metal_holding_states TO authenticated;
GRANT SELECT ON public.metal_action_evidence TO authenticated;
GRANT SELECT ON public.metal_lifecycle_events TO authenticated;
GRANT SELECT ON public.metal_rate_references TO authenticated;
GRANT SELECT ON public.market_rate_observations TO authenticated;
REVOKE ALL ON FUNCTION private.metal_revision_from_text_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.metal_revision_from_text_v1(text) TO service_role;
REVOKE ALL ON FUNCTION private.metal_action_expected_revision_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.metal_action_expected_revision_v1(jsonb)
  TO service_role;
