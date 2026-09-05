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
  IF v_kind IS NULL
    OR v_payload_version IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('add', 'metals.add/v1'),
        ('correct', 'metals.correct/v1'),
        ('sell', 'metals.sell/v2'),
        ('dispose', 'metals.dispose/v1'),
        ('delete', 'metals.delete/v1'),
        ('undo', 'metals.undo/v1')
      ) AS definition(kind, payload_version)
      WHERE definition.kind = v_kind
        AND definition.payload_version = v_payload_version
    )
  THEN
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
    OR jsonb_typeof(p_payload -> 'predecessorEventId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'predecessorEventId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
    AND p_value ->> 'kind' = 'sell'
    AND p_value ->> 'payloadVersion' = 'metals.sell/v1'
  THEN
    PERFORM private.financial_action_validate_metals_sell_payload_v1(p_value -> 'payload');
    RETURN;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'financial_action_unknown_definition';
END;
$$;

CREATE OR REPLACE FUNCTION private.set_server_insert_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER account_sms_senders_set_server_insert_updated_at
BEFORE INSERT ON public.account_sms_senders
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER accounts_set_server_insert_updated_at
BEFORE INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER asset_metals_set_server_insert_updated_at
BEFORE INSERT ON public.asset_metals
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER assets_set_server_insert_updated_at
BEFORE INSERT ON public.assets
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER bank_details_set_server_insert_updated_at
BEFORE INSERT ON public.bank_details
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER budgets_set_server_insert_updated_at
BEFORE INSERT ON public.budgets
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER categories_set_server_insert_updated_at
BEFORE INSERT ON public.categories
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER debts_set_server_insert_updated_at
BEFORE INSERT ON public.debts
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER profiles_set_server_insert_updated_at
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER recurring_payments_set_server_insert_updated_at
BEFORE INSERT ON public.recurring_payments
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER transactions_set_server_insert_updated_at
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER transfers_set_server_insert_updated_at
BEFORE INSERT ON public.transfers
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();
CREATE TRIGGER user_category_settings_set_server_insert_updated_at
BEFORE INSERT ON public.user_category_settings
FOR EACH ROW EXECUTE FUNCTION private.set_server_insert_updated_at_v1();

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
    WHEN asset.purchase_currency IS NULL AND asset.currency::text IN (
      'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'IQD',
      'LYD', 'TND', 'MAD', 'DZD', 'USD', 'EUR', 'GBP', 'JPY', 'CHF',
      'CNY', 'INR', 'KRW', 'KPW', 'SGD', 'HKD', 'MYR', 'AUD', 'NZD',
      'CAD', 'SEK', 'NOK', 'DKK', 'ISK', 'TRY', 'RUB', 'ZAR'
    )
      THEN asset.currency::text
    ELSE asset.purchase_currency
  END
FROM public.asset_metals AS metal
WHERE metal.asset_id = asset.id
  AND metal.metal_type IN ('GOLD', 'SILVER');

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
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.9167
        THEN 'gold-9167'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.875
        THEN 'gold-875'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.75
        THEN 'gold-750'
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.5833
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
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.9167 THEN 0.9167
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.875 THEN 0.875
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.75 THEN 0.75
      WHEN metal.metal_type = 'GOLD' AND metal.purity_fraction = 0.5833 THEN 0.58333
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
  weight_grams_decimal = CASE
    WHEN metal.weight_grams_decimal IS NULL
      AND metal.weight_grams > 0
      AND metal.weight_grams = trunc(metal.weight_grams, 3)
      THEN metal.weight_grams::numeric
    ELSE metal.weight_grams_decimal
  END,
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
FROM purity_mapping
WHERE purity_mapping.id = metal.id;

CREATE OR REPLACE FUNCTION private.guard_asset_metal_action_fields_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' AND (
    (TG_OP = 'INSERT' AND (
      NEW.purchase_price_decimal IS NOT NULL
      OR NEW.purchase_currency IS NOT NULL
      OR NEW.acquisition_action_id IS NOT NULL
    ))
    OR
    (TG_OP = 'UPDATE' AND (
      NEW.purchase_price_decimal IS DISTINCT FROM OLD.purchase_price_decimal
      OR NEW.purchase_currency IS DISTINCT FROM OLD.purchase_currency
      OR NEW.acquisition_action_id IS DISTINCT FROM OLD.acquisition_action_id
    ))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_action_rpc_required';
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
  IF current_user = 'authenticated' AND (
    (TG_OP = 'INSERT' AND (
      NEW.weight_grams_decimal IS NOT NULL
      OR NEW.purity_code IS NOT NULL
      OR NEW.purity_factor_decimal IS NOT NULL
      OR NEW.purity_catalog_version IS NOT NULL
    ))
    OR
    (TG_OP = 'UPDATE' AND (
      NEW.weight_grams_decimal IS DISTINCT FROM OLD.weight_grams_decimal
      OR NEW.purity_code IS DISTINCT FROM OLD.purity_code
      OR NEW.purity_factor_decimal IS DISTINCT FROM OLD.purity_factor_decimal
      OR NEW.purity_catalog_version IS DISTINCT FROM OLD.purity_catalog_version
    ))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_action_rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_guard_metal_action_fields
BEFORE INSERT OR UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION private.guard_asset_metal_action_fields_v1();

CREATE TRIGGER asset_metals_guard_metal_action_fields
BEFORE INSERT OR UPDATE ON public.asset_metals
FOR EACH ROW EXECUTE FUNCTION private.guard_asset_metal_detail_action_fields_v1();

ALTER TABLE public.assets
  ADD CONSTRAINT assets_purchase_price_decimal_check
    CHECK (purchase_price_decimal IS NULL OR purchase_price_decimal > 0),
  ADD CONSTRAINT assets_purchase_currency_check
    CHECK (purchase_currency IS NULL OR purchase_currency IN (
      'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'IQD',
      'LYD', 'TND', 'MAD', 'DZD', 'USD', 'EUR', 'GBP', 'JPY', 'CHF',
      'CNY', 'INR', 'KRW', 'KPW', 'SGD', 'HKD', 'MYR', 'AUD', 'NZD',
      'CAD', 'SEK', 'NOK', 'DKK', 'ISK', 'TRY', 'RUB', 'ZAR'
    ));

ALTER TABLE public.asset_metals
  ADD CONSTRAINT asset_metals_v1_metal_type_check
    CHECK (metal_type IN ('GOLD', 'SILVER')) NOT VALID,
  ADD CONSTRAINT asset_metals_weight_grams_decimal_check
    CHECK (
      weight_grams_decimal IS NULL
      OR (
        weight_grams_decimal > 0
        AND weight_grams_decimal = trunc(weight_grams_decimal, 3)
      )
    ),
  ADD CONSTRAINT asset_metals_purity_tuple_check
    CHECK (
      (purity_code IS NULL AND purity_factor_decimal IS NULL AND purity_catalog_version IS NULL)
      OR
      (
        purity_code IS NOT NULL
        AND purity_factor_decimal IS NOT NULL
        AND purity_catalog_version IS NOT NULL
        AND
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

ALTER TABLE public.financial_action_groups
  ADD CONSTRAINT financial_action_groups_metal_holding_binding_unique
  UNIQUE (user_id, action_id, domain_reference_id);

CREATE TABLE public.metal_holding_states (
  id uuid PRIMARY KEY,
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
  FOREIGN KEY (user_id, holding_id)
    REFERENCES public.assets (user_id, id) ON DELETE RESTRICT,
  CHECK (id = holding_id),
  CONSTRAINT metal_holding_states_provenance_pair_check CHECK (
    (financial_revision = 0) =
      (effective_action_id IS NULL AND effective_event_id IS NULL)
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
  UNIQUE (user_id, action_id, holding_id),
  UNIQUE (user_id, action_id, holding_id, kind),
  FOREIGN KEY (user_id, action_id, holding_id)
    REFERENCES public.financial_action_groups (
      user_id, action_id, domain_reference_id
    ) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, holding_id)
    REFERENCES public.assets (user_id, id) ON DELETE RESTRICT,
  CHECK (
    (kind = 'add' AND expected_holding_revision IS NULL)
    OR (kind <> 'add' AND expected_holding_revision IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION private.guard_metal_evidence_root_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

CREATE TRIGGER metal_action_evidence_guard_root
BEFORE INSERT OR UPDATE ON public.metal_action_evidence
FOR EACH ROW EXECUTE FUNCTION private.guard_metal_evidence_root_v1();

ALTER TABLE public.assets
  ADD CONSTRAINT assets_acquisition_action_holding_fk
  FOREIGN KEY (user_id, acquisition_action_id, id)
  REFERENCES public.metal_action_evidence (user_id, action_id, holding_id);

CREATE OR REPLACE FUNCTION private.guard_asset_acquisition_action_kind_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.acquisition_action_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.metal_action_evidence AS evidence
      WHERE evidence.user_id = NEW.user_id
        AND evidence.action_id = NEW.acquisition_action_id
        AND evidence.holding_id = NEW.id
        AND evidence.kind IN ('add', 'correct')
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_acquisition_action_kind_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_guard_acquisition_action_kind
BEFORE INSERT OR UPDATE OF acquisition_action_id ON public.assets
FOR EACH ROW EXECUTE FUNCTION private.guard_asset_acquisition_action_kind_v1();

ALTER TABLE public.metal_holding_states
  ADD CONSTRAINT metal_holding_states_effective_action_fk
  FOREIGN KEY (user_id, effective_action_id, holding_id)
  REFERENCES public.metal_action_evidence (user_id, action_id, holding_id);

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
  UNIQUE (user_id, holding_id, action_id, id),
  FOREIGN KEY (user_id, action_id, holding_id, kind)
    REFERENCES public.metal_action_evidence (user_id, action_id, holding_id, kind)
    ON DELETE RESTRICT,
  FOREIGN KEY (user_id, holding_id)
    REFERENCES public.assets (user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, holding_id, predecessor_event_id)
    REFERENCES public.metal_lifecycle_events (user_id, holding_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (user_id, holding_id, reverses_event_id)
    REFERENCES public.metal_lifecycle_events (user_id, holding_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE OR REPLACE FUNCTION private.guard_immutable_metal_lifecycle_event_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.holding_id IS DISTINCT FROM OLD.holding_id
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
    OR NEW.predecessor_event_id IS DISTINCT FROM OLD.predecessor_event_id
    OR NEW.reverses_event_id IS DISTINCT FROM OLD.reverses_event_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_lifecycle_event_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER metal_lifecycle_events_guard_immutable
BEFORE UPDATE OR DELETE ON public.metal_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION private.guard_immutable_metal_lifecycle_event_v1();

ALTER TABLE public.metal_holding_states
  ADD CONSTRAINT metal_holding_states_effective_event_fk
  FOREIGN KEY (user_id, holding_id, effective_event_id)
  REFERENCES public.metal_lifecycle_events (user_id, holding_id, id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.metal_holding_states
  ADD CONSTRAINT metal_holding_states_effective_provenance_fk
  FOREIGN KEY (user_id, holding_id, effective_action_id, effective_event_id)
  REFERENCES public.metal_lifecycle_events (user_id, holding_id, action_id, id);

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
  source text,
  quality text NOT NULL CHECK (quality = 'valid'),
  captured_freshness text NOT NULL CHECK (captured_freshness IN ('fresh', 'stale', 'unknown')),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, action_id, role),
  FOREIGN KEY (user_id, action_id, holding_id)
    REFERENCES public.metal_action_evidence (user_id, action_id, holding_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (user_id, holding_id)
    REFERENCES public.assets (user_id, id) ON DELETE RESTRICT,
  CHECK (source IS NULL OR length(btrim(source)) > 0),
  CHECK (
    (
      captured_freshness = 'unknown'
      AND (
        provider_observed_at IS NULL
        OR provider_observed_at > captured_at
      )
    )
    OR (
      captured_freshness = 'fresh'
      AND provider_observed_at IS NOT NULL
      AND provider_observed_at <= captured_at
      AND captured_at - provider_observed_at <= interval '24 hours'
    )
    OR (
      captured_freshness = 'stale'
      AND provider_observed_at IS NOT NULL
      AND provider_observed_at <= captured_at
      AND captured_at - provider_observed_at > interval '24 hours'
    )
  ),
  CHECK (instrument_code <> 'currency:USD' OR value_decimal = 1),
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
      AND instrument_code IN (
        'currency:EGP', 'currency:SAR', 'currency:AED', 'currency:KWD',
        'currency:QAR', 'currency:BHD', 'currency:OMR', 'currency:JOD',
        'currency:IQD', 'currency:LYD', 'currency:TND', 'currency:MAD',
        'currency:DZD', 'currency:USD', 'currency:EUR', 'currency:GBP',
        'currency:JPY', 'currency:CHF', 'currency:CNY', 'currency:INR',
        'currency:KRW', 'currency:KPW', 'currency:SGD', 'currency:HKD',
        'currency:MYR', 'currency:AUD', 'currency:NZD', 'currency:CAD',
        'currency:SEK', 'currency:NOK', 'currency:DKK', 'currency:ISK',
        'currency:TRY', 'currency:RUB', 'currency:ZAR'
      )
      AND (
        (unit = 'usd_per_currency_unit' AND orientation = 'quote_per_base')
        OR (unit = 'currency_units_per_usd' AND orientation = 'base_per_quote')
      )
    )
  )
);

CREATE OR REPLACE FUNCTION private.guard_immutable_metal_rate_reference_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'metal_rate_reference_immutable';
END;
$$;

CREATE TRIGGER metal_rate_references_guard_immutable
BEFORE UPDATE OR DELETE ON public.metal_rate_references
FOR EACH ROW EXECUTE FUNCTION private.guard_immutable_metal_rate_reference_v1();

CREATE TABLE public.market_rate_observations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  batch_id uuid NOT NULL,
  instrument_code text NOT NULL,
  value_decimal numeric NOT NULL CHECK (value_decimal > 0),
  unit text NOT NULL,
  orientation text NOT NULL,
  provider_observed_at timestamptz,
  source text,
  quality text NOT NULL CHECK (quality = 'valid'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source IS NULL OR length(btrim(source)) > 0),
  CHECK (instrument_code <> 'currency:USD' OR value_decimal = 1),
  CHECK (
    (
      instrument_code IN ('metal:GOLD', 'metal:SILVER')
      AND unit = 'usd_per_pure_gram'
      AND orientation = 'quote_per_base'
    )
    OR
    (
      instrument_code IN (
        'currency:EGP', 'currency:SAR', 'currency:AED', 'currency:KWD',
        'currency:QAR', 'currency:BHD', 'currency:OMR', 'currency:JOD',
        'currency:IQD', 'currency:LYD', 'currency:TND', 'currency:MAD',
        'currency:DZD', 'currency:USD', 'currency:EUR', 'currency:GBP',
        'currency:JPY', 'currency:CHF', 'currency:CNY', 'currency:INR',
        'currency:KRW', 'currency:KPW', 'currency:SGD', 'currency:HKD',
        'currency:MYR', 'currency:AUD', 'currency:NZD', 'currency:CAD',
        'currency:SEK', 'currency:NOK', 'currency:DKK', 'currency:ISK',
        'currency:TRY', 'currency:RUB', 'currency:ZAR'
      )
      AND (
        (unit = 'usd_per_currency_unit' AND orientation = 'quote_per_base')
        OR (unit = 'currency_units_per_usd' AND orientation = 'base_per_quote')
      )
    )
  )
);

INSERT INTO public.metal_holding_states (
  id, user_id, holding_id, status, financial_revision, effective_event_id,
  effective_action_id, is_visible, reconciliation_state, created_at, updated_at, deleted
)
SELECT
  asset.id, asset.user_id, asset.id, 'active', 0, NULL, NULL, true, 'accepted',
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
CREATE INDEX market_rate_observations_created_id_idx
  ON public.market_rate_observations (created_at, id);

CREATE OR REPLACE FUNCTION public.pull_metal_observations_page_v1(
  p_upper_watermark timestamptz DEFAULT NULL,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cursor jsonb := NULL;
  v_has_more boolean;
  v_rows jsonb;
  v_server_now timestamptz := statement_timestamp();
  v_upper_watermark timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_observation_invalid_limit';
  END IF;

  IF (p_after_created_at IS NULL) <> (p_after_id IS NULL)
    OR (p_after_created_at IS NOT NULL AND NOT isfinite(p_after_created_at))
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_observation_invalid_cursor';
  END IF;

  IF p_upper_watermark IS NOT NULL AND (
    NOT isfinite(p_upper_watermark)
    OR p_upper_watermark > v_server_now
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_observation_invalid_upper_watermark';
  END IF;

  v_upper_watermark := COALESCE(p_upper_watermark, v_server_now);

  IF p_after_created_at IS NOT NULL
    AND p_after_created_at > v_upper_watermark
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'metal_observation_invalid_cursor';
  END IF;

  WITH page_candidates AS (
    SELECT observation.*
    FROM public.market_rate_observations AS observation
    WHERE observation.created_at <= v_upper_watermark
      AND (
        p_after_created_at IS NULL
        OR (observation.created_at, observation.id) >
          (p_after_created_at, p_after_id)
      )
    ORDER BY observation.created_at, observation.id
    LIMIT p_limit + 1
  ), page_rows AS (
    SELECT candidate.*
    FROM page_candidates AS candidate
    ORDER BY candidate.created_at, candidate.id
    LIMIT p_limit
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_row.id,
          'batchId', page_row.batch_id,
          'instrumentCode', page_row.instrument_code,
          'valueDecimal', page_row.value_decimal::text,
          'unit', page_row.unit,
          'orientation', page_row.orientation,
          'providerObservedAt', page_row.provider_observed_at,
          'source', page_row.source,
          'quality', page_row.quality,
          'createdAt', page_row.created_at
        )
        ORDER BY page_row.created_at, page_row.id
      ),
      '[]'::jsonb
    ),
    (SELECT count(*) > p_limit FROM page_candidates)
  INTO v_rows, v_has_more
  FROM page_rows AS page_row;

  IF v_has_more THEN
    SELECT jsonb_build_object(
      'createdAt', page_row.created_at,
      'id', page_row.id
    )
    INTO v_cursor
    FROM (
      SELECT row_data.created_at, row_data.id
      FROM public.market_rate_observations AS row_data
      WHERE row_data.created_at <= v_upper_watermark
        AND (
          p_after_created_at IS NULL
          OR (row_data.created_at, row_data.id) >
            (p_after_created_at, p_after_id)
        )
      ORDER BY row_data.created_at, row_data.id
      LIMIT p_limit
    ) AS page_row
    ORDER BY page_row.created_at DESC, page_row.id DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'upperWatermark', v_upper_watermark,
    'rows', v_rows,
    'hasMore', v_has_more,
    'nextCursor', v_cursor
  );
END;
$$;

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
REVOKE ALL ON FUNCTION public.pull_metal_observations_page_v1(
  timestamptz, timestamptz, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pull_metal_observations_page_v1(
  timestamptz, timestamptz, uuid, integer
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_asset_metal_action_fields_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_asset_metal_detail_action_fields_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_metal_evidence_root_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_asset_acquisition_action_kind_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_immutable_metal_lifecycle_event_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.metal_revision_from_text_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.metal_revision_from_text_v1(text) TO service_role;
REVOKE ALL ON FUNCTION private.metal_action_expected_revision_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.metal_action_expected_revision_v1(jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION private.financial_action_validate_metals_sell_payload_v2(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_metals_sell_payload_v2(jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION private.set_server_insert_updated_at_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_immutable_metal_rate_reference_v1()
  FROM PUBLIC, anon, authenticated;
