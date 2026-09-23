-- Issue #284: Metals persistence hardening for the post-merge PR #254 review
-- findings. This migration only ADDS hardening; it never edits 068-074.
--
-- r3939851776: the server backfill ports the exact legacy purity
-- representations named by the local WatermelonDB migration (22K/14K karat
-- fractions, the alternate 14K rounding, and the 23.5K catalog member) so both
-- migrations recognize the same forms with identical code/factor outputs.
-- The statement stays rerunnable: it only fills wholly missing tuples and
-- never replaces a previously populated exact value.
WITH purity_mapping AS (
  SELECT
    metal.id,
    CASE
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.9999
        THEN 'gold-9999'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.999
        THEN 'gold-999'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.995
        THEN 'gold-995'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.97916
        THEN 'gold-97916'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction IN (22.0/24.0, 0.9167)
        THEN 'gold-9167'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.875
        THEN 'gold-875'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.75
        THEN 'gold-750'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction IN (14.0/24.0, 0.5833, 0.58333)
        THEN 'gold-58333'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.5
        THEN 'gold-500'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.375
        THEN 'gold-375'
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.9999
        THEN 'silver-9999'
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.999
        THEN 'silver-999'
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.925
        THEN 'silver-925'
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.9
        THEN 'silver-900'
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.8
        THEN 'silver-800'
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.6
        THEN 'silver-600'
      ELSE NULL
    END AS purity_code,
    CASE
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.9999 THEN 0.9999
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.999 THEN 0.999
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.995 THEN 0.995
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.97916 THEN 0.97916
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction IN (22.0/24.0, 0.9167) THEN 0.9167
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.875 THEN 0.875
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.75 THEN 0.75
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction IN (14.0/24.0, 0.5833, 0.58333) THEN 0.58333
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.5 THEN 0.5
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.375 THEN 0.375
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.9999 THEN 0.9999
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.999 THEN 0.999
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.925 THEN 0.925
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.9 THEN 0.9
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.8 THEN 0.8
      WHEN metal.metal_type = 'SILVER' AND metal.purity_fraction = 0.6 THEN 0.6
      ELSE NULL
    END AS purity_factor_decimal
  FROM public.asset_metals AS metal
  WHERE metal.metal_type IN ('GOLD', 'SILVER')
)
UPDATE public.asset_metals AS metal
SET
  purity_code = CASE
    WHEN metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
      THEN purity_mapping.purity_code
    ELSE metal.purity_code
  END,
  purity_factor_decimal = CASE
    WHEN metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
      THEN purity_mapping.purity_factor_decimal
    ELSE metal.purity_factor_decimal
  END,
  purity_catalog_version = CASE
    WHEN metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
      AND purity_mapping.purity_code IS NOT NULL
      THEN '1'
    ELSE metal.purity_catalog_version
  END
-- Touch only wholly missing tuples with a valid mapping, so reruns match
-- zero rows and the updated_at touch trigger never fires on a second run.
FROM purity_mapping
WHERE purity_mapping.id = metal.id
  AND metal.purity_code IS NULL
  AND metal.purity_factor_decimal IS NULL
  AND metal.purity_catalog_version IS NULL
  AND purity_mapping.purity_code IS NOT NULL;

-- r3939851779: freeze persisted action evidence on UPDATE. The INSERT path
-- keeps the exact 068 root-binding check; the UPDATE path now rejects any
-- rewrite of the financial identity (ids, kind, revisions, payload, creation
-- time). Only sync housekeeping stays mutable: the updated_at touch trigger
-- and the deleted tombstone flag, mirroring the lifecycle-event guard which
-- freezes facts while leaving effectiveness/visibility flags free. No
-- legitimate server flow updates frozen columns: the RPC sets them once at
-- INSERT, dedicated-table pushes are rejected fail-closed, and local
-- reconciliation projections never propagate server-side.
CREATE OR REPLACE FUNCTION private.guard_metal_evidence_root_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.action_id IS DISTINCT FROM OLD.action_id
      OR NEW.holding_id IS DISTINCT FROM OLD.holding_id
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.expected_holding_revision IS DISTINCT FROM OLD.expected_holding_revision
      OR NEW.canonical_holding_revision IS DISTINCT FROM OLD.canonical_holding_revision
      OR NEW.domain_payload_json IS DISTINCT FROM OLD.domain_payload_json
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_action_evidence_immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_action_groups AS action_root
    WHERE action_root.user_id = NEW.user_id
      AND action_root.action_id = NEW.action_id
      AND action_root.domain = 'metals'
      AND action_root.kind = NEW.kind
      AND private.metal_action_expected_revision_v1(
        action_root.payload_json::jsonb
      ) IS NOT DISTINCT FROM NEW.expected_holding_revision
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_action_root_binding_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

-- r3939851781: require string JSON types for every rate-snapshot discriminator
-- before the role matrix runs. A JSON null previously made `->> 'kind' <>
-- 'metal'` evaluate to SQL NULL, so the matrix branch stayed false and the
-- malformed snapshot was accepted for hashing and ID reservation even though
-- the TypeScript registry rejects it.
CREATE OR REPLACE FUNCTION private.financial_action_validate_metals_rate_snapshots_v1(
  p_snapshots jsonb,
  p_roles text[],
  p_metal_type text,
  p_purchase_currency text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb;
  v_is_metal boolean;
BEGIN
  IF jsonb_typeof(p_snapshots) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_snapshots) NOT IN (0, cardinality(p_roles))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
  IF jsonb_array_length(p_snapshots) = 0 THEN
    RETURN;
  END IF;

  FOR v_snapshot IN
    SELECT item.snapshot FROM jsonb_array_elements(p_snapshots) AS item(snapshot)
  LOOP
    v_is_metal := v_snapshot ->> 'role' = 'acquisition_metal';
    IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_snapshot) AS key)
        IS DISTINCT FROM ARRAY[
          'capturedAt', 'capturedFreshness', 'instrumentCode', 'kind',
          'orientation', 'providerObservedAt', 'quality', 'referenceId',
          'role', 'source', 'unit', 'valueDecimal'
        ]::text[]
      OR NOT (v_snapshot ->> 'role' = ANY(p_roles))
      OR jsonb_typeof(v_snapshot -> 'referenceId') IS DISTINCT FROM 'string'
      OR (v_snapshot ->> 'referenceId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_snapshot -> 'valueDecimal') IS DISTINCT FROM 'string'
      OR (v_snapshot ->> 'valueDecimal') !~
        '^([1-9][0-9]*|(0|[1-9][0-9]*)\.[0-9]*[1-9])$'
      OR length(replace(v_snapshot ->> 'valueDecimal', '.', '')) > 50
      OR length(split_part(v_snapshot ->> 'valueDecimal', '.', 2)) > 18
      OR jsonb_typeof(v_snapshot -> 'quality') IS DISTINCT FROM 'string'
      OR v_snapshot ->> 'quality' <> 'valid'
      OR jsonb_typeof(v_snapshot -> 'capturedFreshness') IS DISTINCT FROM 'string'
      OR v_snapshot ->> 'capturedFreshness' NOT IN ('fresh', 'stale', 'unknown')
      OR jsonb_typeof(v_snapshot -> 'capturedAt') IS DISTINCT FROM 'string'
      OR (v_snapshot ->> 'capturedAt') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR jsonb_typeof(v_snapshot -> 'providerObservedAt') NOT IN ('string', 'null')
      OR (
        jsonb_typeof(v_snapshot -> 'providerObservedAt') = 'string'
        AND (v_snapshot ->> 'providerObservedAt') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      )
      OR jsonb_typeof(v_snapshot -> 'source') NOT IN ('string', 'null')
      OR (
        jsonb_typeof(v_snapshot -> 'source') = 'string'
        AND length(btrim(v_snapshot ->> 'source')) = 0
      )
      OR (
        jsonb_typeof(v_snapshot -> 'providerObservedAt') = 'null'
        AND v_snapshot ->> 'capturedFreshness' <> 'unknown'
      )
      OR (
        jsonb_typeof(v_snapshot -> 'providerObservedAt') = 'string'
        AND (
          ((v_snapshot ->> 'providerObservedAt')::timestamptz >
            (v_snapshot ->> 'capturedAt')::timestamptz
            AND v_snapshot ->> 'capturedFreshness' <> 'unknown')
          OR ((v_snapshot ->> 'providerObservedAt')::timestamptz <=
            (v_snapshot ->> 'capturedAt')::timestamptz
            AND (v_snapshot ->> 'capturedAt')::timestamptz -
              (v_snapshot ->> 'providerObservedAt')::timestamptz <= interval '24 hours'
            AND v_snapshot ->> 'capturedFreshness' <> 'fresh')
          OR ((v_snapshot ->> 'providerObservedAt')::timestamptz <=
            (v_snapshot ->> 'capturedAt')::timestamptz
            AND (v_snapshot ->> 'capturedAt')::timestamptz -
              (v_snapshot ->> 'providerObservedAt')::timestamptz > interval '24 hours'
            AND v_snapshot ->> 'capturedFreshness' <> 'stale')
        )
      )
      OR jsonb_typeof(v_snapshot -> 'role') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'kind') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'instrumentCode') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'unit') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'orientation') IS DISTINCT FROM 'string'
      OR (v_is_metal AND (
        v_snapshot ->> 'kind' <> 'metal'
        OR v_snapshot ->> 'instrumentCode' <> 'metal:' || p_metal_type
        OR v_snapshot ->> 'unit' <> 'usd_per_pure_gram'
        OR v_snapshot ->> 'orientation' <> 'quote_per_base'
      ))
      OR (NOT v_is_metal AND (
        v_snapshot ->> 'kind' <> 'currency'
        OR v_snapshot ->> 'instrumentCode' <> 'currency:' || p_purchase_currency
        OR NOT (
          (v_snapshot ->> 'unit' = 'usd_per_currency_unit'
            AND v_snapshot ->> 'orientation' = 'quote_per_base')
          OR (v_snapshot ->> 'unit' = 'currency_units_per_usd'
            AND v_snapshot ->> 'orientation' = 'base_per_quote')
        )
        OR (p_purchase_currency = 'USD' AND v_snapshot ->> 'valueDecimal' <> '1')
      ))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT snapshot ->> 'referenceId')
      FROM jsonb_array_elements(p_snapshots) AS item(snapshot)) <> cardinality(p_roles)
    OR (SELECT count(DISTINCT snapshot ->> 'role')
      FROM jsonb_array_elements(p_snapshots) AS item(snapshot)) <> cardinality(p_roles)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
END;
$$;

-- r3939851781 (sell path): same discriminator preconditions as the
-- acquisition validator above, placed before the terminal role matrix.
CREATE OR REPLACE FUNCTION private.financial_action_validate_metals_sell_payload_v2(
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb;
  v_purchase_currency text;
  v_sale_currency text;
  v_metal_type text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_payload) AS key)
      IS DISTINCT FROM ARRAY[
        'expectedHoldingRevision', 'feeMinorUnits', 'grossProceedsMinorUnits',
        'holdingId', 'metalType', 'netProceedsMinorUnits', 'notes',
        'predecessorEventId', 'purchaseCurrency', 'rateSnapshots', 'reversesEventId',
        'saleCurrency', 'saleDate'
      ]::text[]
    OR private.metal_action_expected_revision_v1(
      jsonb_build_object(
        'accountGuards', '[]'::jsonb,
        'domain', 'metals',
        'domainReferenceId', p_payload ->> 'holdingId',
        'kind', 'sell',
        'payload', p_payload,
        'payloadVersion', 'metals.sell/v2'
      )
    ) IS NULL
    OR jsonb_typeof(p_payload -> 'predecessorEventId') NOT IN ('string', 'null')
    OR (
      jsonb_typeof(p_payload -> 'predecessorEventId') = 'string'
      AND (p_payload ->> 'predecessorEventId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    OR (
      jsonb_typeof(p_payload -> 'predecessorEventId') = 'null'
      AND p_payload ->> 'expectedHoldingRevision' <> '0'
    )
    OR jsonb_typeof(p_payload -> 'reversesEventId') IS DISTINCT FROM 'null'
    OR jsonb_typeof(p_payload -> 'metalType') IS DISTINCT FROM 'string'
    OR p_payload ->> 'metalType' NOT IN ('GOLD', 'SILVER')
    OR jsonb_typeof(p_payload -> 'saleCurrency') IS DISTINCT FROM 'string'
    OR p_payload ->> 'saleCurrency' NOT IN (
      'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'IQD',
      'LYD', 'TND', 'MAD', 'DZD', 'USD', 'EUR', 'GBP', 'JPY', 'CHF',
      'CNY', 'INR', 'KRW', 'KPW', 'SGD', 'HKD', 'MYR', 'AUD', 'NZD',
      'CAD', 'SEK', 'NOK', 'DKK', 'ISK', 'TRY', 'RUB', 'ZAR'
    )
    OR jsonb_typeof(p_payload -> 'purchaseCurrency') IS DISTINCT FROM 'string'
    OR p_payload ->> 'purchaseCurrency' NOT IN (
      'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'IQD',
      'LYD', 'TND', 'MAD', 'DZD', 'USD', 'EUR', 'GBP', 'JPY', 'CHF',
      'CNY', 'INR', 'KRW', 'KPW', 'SGD', 'HKD', 'MYR', 'AUD', 'NZD',
      'CAD', 'SEK', 'NOK', 'DKK', 'ISK', 'TRY', 'RUB', 'ZAR'
    )
    OR jsonb_typeof(p_payload -> 'saleDate') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'saleDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR to_char(to_date(p_payload ->> 'saleDate', 'YYYY-MM-DD'), 'YYYY-MM-DD')
      <> p_payload ->> 'saleDate'
    OR jsonb_typeof(p_payload -> 'notes') NOT IN ('string', 'null')
    OR octet_length(p_payload ->> 'notes') > 4096
    OR jsonb_typeof(p_payload -> 'grossProceedsMinorUnits') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'feeMinorUnits') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'netProceedsMinorUnits') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'grossProceedsMinorUnits') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'feeMinorUnits') !~ '^(0|[1-9][0-9]*)$'
    OR (p_payload ->> 'netProceedsMinorUnits') !~ '^(0|[1-9][0-9]*)$'
    OR length(p_payload ->> 'grossProceedsMinorUnits') > 50
    OR length(p_payload ->> 'feeMinorUnits') > 50
    OR length(p_payload ->> 'netProceedsMinorUnits') > 50
    OR (p_payload ->> 'feeMinorUnits')::numeric >
      (p_payload ->> 'grossProceedsMinorUnits')::numeric
    OR (p_payload ->> 'netProceedsMinorUnits')::numeric <>
      (p_payload ->> 'grossProceedsMinorUnits')::numeric -
      (p_payload ->> 'feeMinorUnits')::numeric
    OR jsonb_typeof(p_payload -> 'rateSnapshots') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload -> 'rateSnapshots') NOT IN (0, 3)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF jsonb_array_length(p_payload -> 'rateSnapshots') = 0 THEN
    RETURN;
  END IF;

  v_purchase_currency := p_payload ->> 'purchaseCurrency';
  v_sale_currency := p_payload ->> 'saleCurrency';
  v_metal_type := p_payload ->> 'metalType';
  IF (
    SELECT array_agg(snapshot ->> 'role' ORDER BY snapshot ->> 'role')
    FROM jsonb_array_elements(p_payload -> 'rateSnapshots') AS item(snapshot)
  ) IS DISTINCT FROM ARRAY[
    'terminal_metal', 'terminal_proceeds_currency', 'terminal_purchase_currency'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  FOR v_snapshot IN
    SELECT item.snapshot
    FROM jsonb_array_elements(p_payload -> 'rateSnapshots') AS item(snapshot)
  LOOP
    IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_snapshot) AS key)
        IS DISTINCT FROM ARRAY[
          'capturedAt', 'capturedFreshness', 'instrumentCode', 'kind',
          'orientation', 'providerObservedAt', 'quality', 'referenceId',
          'role', 'source', 'unit', 'valueDecimal'
        ]::text[]
      OR jsonb_typeof(v_snapshot -> 'referenceId') IS DISTINCT FROM 'string'
      OR (v_snapshot ->> 'referenceId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_snapshot -> 'valueDecimal') IS DISTINCT FROM 'string'
      OR (v_snapshot ->> 'valueDecimal') !~
        '^([1-9][0-9]*|(0|[1-9][0-9]*)\.[0-9]*[1-9])$'
      OR length(replace(v_snapshot ->> 'valueDecimal', '.', '')) > 50
      OR length(split_part(v_snapshot ->> 'valueDecimal', '.', 2)) > 18
      OR jsonb_typeof(v_snapshot -> 'quality') IS DISTINCT FROM 'string'
      OR v_snapshot ->> 'quality' <> 'valid'
      OR jsonb_typeof(v_snapshot -> 'capturedFreshness') IS DISTINCT FROM 'string'
      OR v_snapshot ->> 'capturedFreshness' NOT IN ('fresh', 'stale', 'unknown')
      OR jsonb_typeof(v_snapshot -> 'capturedAt') IS DISTINCT FROM 'string'
      OR (v_snapshot ->> 'capturedAt') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR (
        jsonb_typeof(v_snapshot -> 'providerObservedAt') IS DISTINCT FROM 'null'
        AND (
          jsonb_typeof(v_snapshot -> 'providerObservedAt') IS DISTINCT FROM 'string'
          OR (v_snapshot ->> 'providerObservedAt') !~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        )
      )
      OR (
        jsonb_typeof(v_snapshot -> 'source') IS DISTINCT FROM 'null'
        AND (
          jsonb_typeof(v_snapshot -> 'source') IS DISTINCT FROM 'string'
          OR length(btrim(v_snapshot ->> 'source')) = 0
        )
      )
      OR (
        jsonb_typeof(v_snapshot -> 'providerObservedAt') = 'null'
        AND v_snapshot ->> 'capturedFreshness' <> 'unknown'
      )
      OR (
        jsonb_typeof(v_snapshot -> 'providerObservedAt') = 'string'
        AND (
          (
            (v_snapshot ->> 'providerObservedAt')::timestamptz >
              (v_snapshot ->> 'capturedAt')::timestamptz
            AND v_snapshot ->> 'capturedFreshness' <> 'unknown'
          )
          OR (
            (v_snapshot ->> 'providerObservedAt')::timestamptz <=
              (v_snapshot ->> 'capturedAt')::timestamptz
            AND (v_snapshot ->> 'capturedAt')::timestamptz -
              (v_snapshot ->> 'providerObservedAt')::timestamptz <= interval '24 hours'
            AND v_snapshot ->> 'capturedFreshness' <> 'fresh'
          )
          OR (
            (v_snapshot ->> 'providerObservedAt')::timestamptz <=
              (v_snapshot ->> 'capturedAt')::timestamptz
            AND (v_snapshot ->> 'capturedAt')::timestamptz -
              (v_snapshot ->> 'providerObservedAt')::timestamptz > interval '24 hours'
            AND v_snapshot ->> 'capturedFreshness' <> 'stale'
          )
        )
      )
      OR jsonb_typeof(v_snapshot -> 'kind') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'instrumentCode') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'unit') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_snapshot -> 'orientation') IS DISTINCT FROM 'string'
      OR (
        v_snapshot ->> 'role' = 'terminal_metal'
        AND (
          v_snapshot ->> 'kind' <> 'metal'
          OR v_snapshot ->> 'instrumentCode' <> 'metal:' || v_metal_type
          OR v_snapshot ->> 'unit' <> 'usd_per_pure_gram'
          OR v_snapshot ->> 'orientation' <> 'quote_per_base'
        )
      )
      OR (
        v_snapshot ->> 'role' = 'terminal_purchase_currency'
        AND (
          v_snapshot ->> 'kind' <> 'currency'
          OR v_snapshot ->> 'instrumentCode' <> 'currency:' || v_purchase_currency
          OR NOT (
            (v_snapshot ->> 'unit' = 'usd_per_currency_unit'
              AND v_snapshot ->> 'orientation' = 'quote_per_base')
            OR
            (v_snapshot ->> 'unit' = 'currency_units_per_usd'
              AND v_snapshot ->> 'orientation' = 'base_per_quote')
          )
          OR (
            v_snapshot ->> 'instrumentCode' = 'currency:USD'
            AND v_snapshot ->> 'valueDecimal' <> '1'
          )
        )
      )
      OR (
        v_snapshot ->> 'role' = 'terminal_proceeds_currency'
        AND (
          v_snapshot ->> 'kind' <> 'currency'
          OR v_snapshot ->> 'instrumentCode' <> 'currency:' || v_sale_currency
          OR NOT (
            (v_snapshot ->> 'unit' = 'usd_per_currency_unit'
              AND v_snapshot ->> 'orientation' = 'quote_per_base')
            OR
            (v_snapshot ->> 'unit' = 'currency_units_per_usd'
              AND v_snapshot ->> 'orientation' = 'base_per_quote')
          )
          OR (
            v_snapshot ->> 'instrumentCode' = 'currency:USD'
            AND v_snapshot ->> 'valueDecimal' <> '1'
          )
        )
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
    END IF;
  END LOOP;

  IF (
    SELECT count(DISTINCT snapshot ->> 'referenceId')
    FROM jsonb_array_elements(p_payload -> 'rateSnapshots') AS item(snapshot)
  ) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
END;
$$;

-- r3939851782: authoritative Cairo calendar date. Egypt observes DST, so the
-- IANA Africa/Cairo zone (not a fixed offset) is the single server source
-- for the FR-026 non-future sale-date boundary.
CREATE OR REPLACE FUNCTION private.metal_cairo_calendar_date_v1()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (statement_timestamp() AT TIME ZONE 'Africa/Cairo')::date
$$;

REVOKE ALL ON FUNCTION private.metal_cairo_calendar_date_v1()
  FROM PUBLIC, anon, authenticated;

-- r3939851782: reject future sale dates at the server action boundary. The
-- check runs after authentication, canonicalization, payload-hash
-- verification, accepted-replay handling, and the holding-scoped lock (same
-- ordering as the 070 purchase-date check), so idempotent replays of
-- previously accepted actions keep working. The outcome contract reuses
-- INVALID_LINK like the sibling sale-date check.
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
