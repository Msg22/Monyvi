-- Approved Sell policy: proceeds use the holding purchase currency.
-- Preserve the current hardened v2 shape, amount, link, and snapshot validator
-- from 075; add only currency equality before its empty-snapshot return.
-- No historical row rewrite, account effects, or change to serialization/hashing.

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
    OR (p_payload ->> 'saleCurrency') IS DISTINCT FROM (p_payload ->> 'purchaseCurrency')
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

REVOKE ALL ON FUNCTION private.financial_action_validate_metals_sell_payload_v2(jsonb) FROM PUBLIC, anon, authenticated;
