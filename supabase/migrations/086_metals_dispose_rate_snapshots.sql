-- Issue #279: accept validated optional terminal rate snapshots on metals.dispose/v1.
-- Applied migration 068 is untouched. The historical seven-key dispose payload
-- remains accepted. A payload that carries "rateSnapshots" must hold an array
-- that is empty or exactly one terminal_metal plus one
-- terminal_purchase_currency reference (rate-reference-contract terminal sale
-- context minus proceeds, which a write-off never has). Each snapshot keeps the
-- exact twelve structural fields, valid quality, freshness consistent with the
-- provider observation time, and unique roles and reference IDs.

CREATE OR REPLACE FUNCTION private.financial_action_validate_metals_dispose_rate_snapshots_v1(
  p_snapshots jsonb
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
    OR jsonb_array_length(p_snapshots) NOT IN (0, 2)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
  IF jsonb_array_length(p_snapshots) = 0 THEN
    RETURN;
  END IF;

  IF (
    SELECT array_agg(snapshot ->> 'role' ORDER BY snapshot ->> 'role')
    FROM jsonb_array_elements(p_snapshots) AS item(snapshot)
  ) IS DISTINCT FROM ARRAY[
    'terminal_metal', 'terminal_purchase_currency'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  FOR v_snapshot IN
    SELECT item.snapshot
    FROM jsonb_array_elements(p_snapshots) AS item(snapshot)
  LOOP
    v_is_metal := v_snapshot ->> 'role' = 'terminal_metal';
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
      OR (v_is_metal AND (
        (v_snapshot ->> 'kind') IS DISTINCT FROM 'metal'
        OR (v_snapshot ->> 'instrumentCode') IS NULL
        OR v_snapshot ->> 'instrumentCode' NOT IN ('metal:GOLD', 'metal:SILVER')
        OR (v_snapshot ->> 'unit') IS DISTINCT FROM 'usd_per_pure_gram'
        OR (v_snapshot ->> 'orientation') IS DISTINCT FROM 'quote_per_base'
      ))
      OR (NOT v_is_metal AND (
        (v_snapshot ->> 'kind') IS DISTINCT FROM 'currency'
        OR (v_snapshot ->> 'instrumentCode') IS NULL
        OR v_snapshot ->> 'instrumentCode' NOT IN (
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
        OR NOT coalesce(
          (v_snapshot ->> 'unit' = 'usd_per_currency_unit'
            AND v_snapshot ->> 'orientation' = 'quote_per_base')
          OR (v_snapshot ->> 'unit' = 'currency_units_per_usd'
            AND v_snapshot ->> 'orientation' = 'base_per_quote'),
          false
        )
        OR (v_snapshot ->> 'instrumentCode' = 'currency:USD'
          AND v_snapshot ->> 'valueDecimal' <> '1')
      ))
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT snapshot ->> 'referenceId')
      FROM jsonb_array_elements(p_snapshots) AS item(snapshot)) <> 2
    OR (SELECT count(DISTINCT snapshot ->> 'role')
      FROM jsonb_array_elements(p_snapshots) AS item(snapshot)) <> 2
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_metals_dispose_payload_v1(
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
  v_keys text[] := (
    SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_payload) AS key
  );
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (
      v_keys IS DISTINCT FROM ARRAY[
        'disposalDate', 'expectedHoldingRevision', 'holdingId', 'notes',
        'predecessorEventId', 'reason', 'reversesEventId'
      ]::text[]
      AND v_keys IS DISTINCT FROM ARRAY[
        'disposalDate', 'expectedHoldingRevision', 'holdingId', 'notes',
        'predecessorEventId', 'rateSnapshots', 'reason', 'reversesEventId'
      ]::text[]
    )
    OR jsonb_typeof(p_payload -> 'expectedHoldingRevision') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'holdingId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'predecessorEventId') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'reversesEventId') IS DISTINCT FROM 'null'
    OR jsonb_typeof(p_payload -> 'disposalDate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'reason') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'notes') NOT IN ('string', 'null')
    OR (p_payload ->> 'reason') NOT IN (
      'lost_or_stolen', 'destroyed_or_damaged', 'given_away', 'donated',
      'other_write_off', 'other_external_transfer'
    )
    OR (p_payload ->> 'holdingId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (
      jsonb_typeof(p_payload -> 'predecessorEventId') = 'string'
      AND (p_payload ->> 'predecessorEventId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    OR (
      jsonb_typeof(p_payload -> 'predecessorEventId') = 'null'
      AND p_payload ->> 'expectedHoldingRevision' <> '0'
    )
    OR (p_payload ->> 'disposalDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR to_char(to_date(p_payload ->> 'disposalDate', 'YYYY-MM-DD'), 'YYYY-MM-DD')
      <> p_payload ->> 'disposalDate'
    OR octet_length(p_payload ->> 'notes') > 4096
    OR (
      v_keys @> ARRAY['rateSnapshots']::text[]
      AND jsonb_typeof(p_payload -> 'rateSnapshots') IS DISTINCT FROM 'array'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
  PERFORM private.metal_revision_from_text_v1(p_payload ->> 'expectedHoldingRevision');
  IF v_keys @> ARRAY['rateSnapshots']::text[] THEN
    PERFORM private.financial_action_validate_metals_dispose_rate_snapshots_v1(
      p_payload -> 'rateSnapshots'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.financial_action_validate_metals_dispose_rate_snapshots_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_metals_dispose_rate_snapshots_v1(jsonb)
  TO service_role;
