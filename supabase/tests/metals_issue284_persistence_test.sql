BEGIN;

-- Issue #284 persistence hardening (post-merge PR #254 review findings).
-- Failing-before tests: evidence UPDATE rewrite (r3939851779), null snapshot
-- discriminators (r3939851781), future sale dates (r3939851782).
-- Boundary locks: Cairo-today sales stay accepted, idempotent replays keep
-- working, housekeeping evidence updates (updated_at/deleted) stay allowed.

SELECT plan(25);

SELECT has_trigger(
  'public',
  'metal_action_evidence',
  'metal_action_evidence_guard_root',
  'evidence root guard trigger exists'
);

INSERT INTO auth.users (id)
VALUES ('018f0c7a-1234-7abc-8def-000000000284')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"018f0c7a-1234-7abc-8def-000000000284","role":"authenticated"}',
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    '018f0c7a-1234-7abc-8def-000000000284',
    true
  );
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.issue284_action(
  p_action_id uuid,
  p_kind text,
  p_payload_version text,
  p_payload jsonb,
  p_holding_id uuid DEFAULT '018f0c7a-1234-7abc-8def-000000000286'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload_json text;
BEGIN
  v_payload_json := private.financial_action_encode_jsonb_v1(
    jsonb_build_object(
      'accountGuards', '[]'::jsonb,
      'actionId', p_action_id,
      'domain', 'metals',
      'domainReferenceId', p_holding_id,
      'envelopeVersion', 'monyvi.financial-action/v1',
      'kind', p_kind,
      'occurredAt', '2026-08-31T10:15:30.123Z',
      'payload', p_payload,
      'payloadVersion', p_payload_version,
      'userId', '018f0c7a-1234-7abc-8def-000000000284'
    )
  );
  RETURN public.apply_metal_action_v1(
    v_payload_json,
    encode(extensions.digest(convert_to(v_payload_json, 'UTF8'), 'sha256'), 'hex')
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION pg_temp.issue284_action(uuid, text, text, jsonb, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.issue284_sell_payload(
  p_sale_date text,
  p_expected_revision text,
  p_predecessor uuid,
  p_holding_id uuid DEFAULT '018f0c7a-1234-7abc-8def-000000000286'
)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'expectedHoldingRevision', p_expected_revision,
    'feeMinorUnits', '0',
    'grossProceedsMinorUnits', '100',
    'holdingId', p_holding_id,
    'metalType', 'GOLD',
    'netProceedsMinorUnits', '100',
    'notes', null,
    'purchaseCurrency', 'EGP',
    'rateSnapshots', '[]'::jsonb,
    'saleDate', p_sale_date,
    'saleCurrency', 'EGP',
    'predecessorEventId', p_predecessor,
    'reversesEventId', null
  );
$function$;

CREATE OR REPLACE FUNCTION pg_temp.issue284_snapshot(
  p_role text,
  p_kind jsonb,
  p_instrument text,
  p_unit jsonb,
  p_orientation jsonb,
  p_reference uuid
)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'capturedAt', '2026-08-31T10:15:30.123Z',
    'capturedFreshness', 'fresh',
    'instrumentCode', p_instrument,
    'kind', p_kind,
    'orientation', p_orientation,
    'providerObservedAt', '2026-08-31T10:00:00.000Z',
    'quality', 'valid',
    'referenceId', p_reference,
    'role', p_role,
    'source', null,
    'unit', p_unit,
    'valueDecimal', '50'
  );
$function$;

CREATE OR REPLACE FUNCTION pg_temp.issue284_validate_sell(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.financial_action_validate_metals_sell_payload_v2(p_payload);
  RETURN 'no-throw';
EXCEPTION WHEN SQLSTATE '22023' THEN
  RETURN '22023';
END;
$function$;

CREATE OR REPLACE FUNCTION pg_temp.issue284_validate_acquisition(p_snapshots jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.financial_action_validate_metals_rate_snapshots_v1(
    p_snapshots,
    ARRAY['acquisition_metal', 'acquisition_purchase_currency']::text[],
    'GOLD',
    'EGP'
  );
  RETURN 'no-throw';
EXCEPTION WHEN SQLSTATE '22023' THEN
  RETURN '22023';
END;
$function$;

SET LOCAL ROLE authenticated;
SELECT is(
  pg_temp.issue284_action(
    '018f0c7a-1234-7abc-8def-000000000287',
    'add',
    'metals.add/v1',
    jsonb_build_object(
      'expectedHoldingRevision', null,
      'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
      'materialFacts', jsonb_build_object(
        'physicalForm', 'JEWELRY',
        'purchaseCurrency', 'EGP',
        'purchaseDate', '2026-08-30',
        'purchasePriceDecimal', '150000',
        'purityCatalogVersion', '1',
        'purityCode', 'gold-9999',
        'purityFactorDecimal', '0.9999',
        'weightGramsDecimal', '10.25'
      ),
      'metadata', jsonb_build_object('name', 'Issue 284 gold', 'notes', null),
      'metalType', 'GOLD',
      'predecessorEventId', null,
      'rateSnapshots', '[]'::jsonb,
      'reversesEventId', null
    )
  ) ->> 'status',
  'accepted',
  'baseline Add succeeds before sale-date probes'
);

CREATE TEMPORARY TABLE pg_temp.issue284_future_sale AS
SELECT pg_temp.issue284_action(
  '018f0c7a-1234-7abc-8def-000000000290',
  'sell',
  'metals.sell/v2',
  pg_temp.issue284_sell_payload(
    '2099-01-01', '0', '018f0c7a-1234-7abc-8def-000000000287'
  )
) AS outcome;
SELECT is(
  (SELECT outcome ->> 'status' FROM pg_temp.issue284_future_sale),
  'rejected',
  'a far-future sale date is rejected at the server action boundary'
);
SELECT is(
  (SELECT outcome ->> 'code' FROM pg_temp.issue284_future_sale),
  'INVALID_LINK',
  'the future sale uses the existing invalid-link outcome contract'
);
SELECT is(
  (
    SELECT state.status || ':' || state.financial_revision::text
    FROM public.metal_holding_states AS state
    WHERE state.holding_id = '018f0c7a-1234-7abc-8def-000000000286'
  ),
  'active:0',
  'the rejected future sale makes no server mutation'
);

CREATE TEMPORARY TABLE pg_temp.issue284_today_sale AS
SELECT pg_temp.issue284_action(
  '018f0c7a-1234-7abc-8def-000000000291',
  'sell',
  'metals.sell/v2',
  pg_temp.issue284_sell_payload(
    (statement_timestamp() AT TIME ZONE 'Africa/Cairo')::date::text,
    '0',
    '018f0c7a-1234-7abc-8def-000000000287'
  )
) AS outcome;
SELECT is(
  (SELECT outcome ->> 'status' FROM pg_temp.issue284_today_sale),
  'accepted',
  'a sale dated Cairo today stays accepted'
);
SELECT is(
  pg_temp.issue284_action(
    '018f0c7a-1234-7abc-8def-000000000291',
    'sell',
    'metals.sell/v2',
    pg_temp.issue284_sell_payload(
      (statement_timestamp() AT TIME ZONE 'Africa/Cairo')::date::text,
      '0',
      '018f0c7a-1234-7abc-8def-000000000287'
    )
  ) ->> 'status',
  'idempotent',
  'replaying the accepted sale still returns idempotent after hardening'
);
RESET ROLE;

-- A third holding pins the exact next-day boundary: Cairo today is accepted
-- above, Cairo tomorrow must be rejected while the holding is still active.
SET LOCAL ROLE authenticated;
SELECT is(
  pg_temp.issue284_action(
    '018f0c7a-1234-7abc-8def-000000000299',
    'add',
    'metals.add/v1',
    jsonb_build_object(
      'expectedHoldingRevision', null,
      'holdingId', '018f0c7a-1234-7abc-8def-000000000298',
      'materialFacts', jsonb_build_object(
        'physicalForm', 'COIN',
        'purchaseCurrency', 'EGP',
        'purchaseDate', '2026-08-30',
        'purchasePriceDecimal', '75000',
        'purityCatalogVersion', '1',
        'purityCode', 'gold-875',
        'purityFactorDecimal', '0.875',
        'weightGramsDecimal', '8'
      ),
      'metadata', jsonb_build_object('name', 'Issue 284 boundary', 'notes', null),
      'metalType', 'GOLD',
      'predecessorEventId', null,
      'rateSnapshots', '[]'::jsonb,
      'reversesEventId', null
    ),
    '018f0c7a-1234-7abc-8def-000000000298'
  ) ->> 'status',
  'accepted',
  'boundary holding is accepted through the RPC'
);

CREATE TEMPORARY TABLE pg_temp.issue284_tomorrow_sale AS
SELECT pg_temp.issue284_action(
  '018f0c7a-1234-7abc-8def-00000000029a',
  'sell',
  'metals.sell/v2',
  pg_temp.issue284_sell_payload(
    ((statement_timestamp() AT TIME ZONE 'Africa/Cairo')::date + 1)::text,
    '0',
    '018f0c7a-1234-7abc-8def-000000000299',
    '018f0c7a-1234-7abc-8def-000000000298'
  ),
  '018f0c7a-1234-7abc-8def-000000000298'
) AS outcome;
SELECT is(
  (SELECT outcome ->> 'status' FROM pg_temp.issue284_tomorrow_sale),
  'rejected',
  'a sale dated the day after Cairo today is rejected'
);
SELECT is(
  (SELECT outcome ->> 'code' FROM pg_temp.issue284_tomorrow_sale),
  'INVALID_LINK',
  'the next-day sale uses the existing invalid-link outcome contract'
);
SELECT is(
  (
    SELECT state.status || ':' || state.financial_revision::text
    FROM public.metal_holding_states AS state
    WHERE state.holding_id = '018f0c7a-1234-7abc-8def-000000000298'
  ),
  'active:0',
  'the rejected next-day sale makes no server mutation'
);
RESET ROLE;

-- Null snapshot discriminators hit the validators directly: no holding state
-- is needed to prove the three-valued-logic bypass.
SELECT is(
  pg_temp.issue284_validate_sell(
    jsonb_build_object(
      'expectedHoldingRevision', '0',
      'feeMinorUnits', '0',
      'grossProceedsMinorUnits', '100',
      'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
      'metalType', 'GOLD',
      'netProceedsMinorUnits', '100',
      'notes', null,
      'purchaseCurrency', 'EGP',
      'rateSnapshots', jsonb_build_array(
        pg_temp.issue284_snapshot(
          'terminal_metal', 'null'::jsonb, 'metal:GOLD',
          '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a1'
        ),
        pg_temp.issue284_snapshot(
          'terminal_proceeds_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a2'
        ),
        pg_temp.issue284_snapshot(
          'terminal_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a3'
        )
      ),
      'saleDate', '2026-08-31',
      'saleCurrency', 'EGP',
      'predecessorEventId', '018f0c7a-1234-7abc-8def-000000000287',
      'reversesEventId', null
    )
  ),
  '22023',
  'sell validation rejects a null terminal_metal kind'
);
SELECT is(
  pg_temp.issue284_validate_sell(
    jsonb_build_object(
      'expectedHoldingRevision', '0',
      'feeMinorUnits', '0',
      'grossProceedsMinorUnits', '100',
      'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
      'metalType', 'GOLD',
      'netProceedsMinorUnits', '100',
      'notes', null,
      'purchaseCurrency', 'EGP',
      'rateSnapshots', jsonb_build_array(
        pg_temp.issue284_snapshot(
          'terminal_metal', '"metal"'::jsonb, null,
          '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a1'
        ),
        pg_temp.issue284_snapshot(
          'terminal_proceeds_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a2'
        ),
        pg_temp.issue284_snapshot(
          'terminal_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a3'
        )
      ),
      'saleDate', '2026-08-31',
      'saleCurrency', 'EGP',
      'predecessorEventId', '018f0c7a-1234-7abc-8def-000000000287',
      'reversesEventId', null
    )
  ),
  '22023',
  'sell validation rejects a null terminal_metal instrumentCode'
);
SELECT is(
  pg_temp.issue284_validate_sell(
    jsonb_build_object(
      'expectedHoldingRevision', '0',
      'feeMinorUnits', '0',
      'grossProceedsMinorUnits', '100',
      'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
      'metalType', 'GOLD',
      'netProceedsMinorUnits', '100',
      'notes', null,
      'purchaseCurrency', 'EGP',
      'rateSnapshots', jsonb_build_array(
        pg_temp.issue284_snapshot(
          'terminal_metal', '"metal"'::jsonb, 'metal:GOLD',
          '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a1'
        ),
        pg_temp.issue284_snapshot(
          'terminal_proceeds_currency', '"currency"'::jsonb, 'currency:EGP',
          'null'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a2'
        ),
        pg_temp.issue284_snapshot(
          'terminal_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a3'
        )
      ),
      'saleDate', '2026-08-31',
      'saleCurrency', 'EGP',
      'predecessorEventId', '018f0c7a-1234-7abc-8def-000000000287',
      'reversesEventId', null
    )
  ),
  '22023',
  'sell validation rejects a null currency snapshot unit'
);
SELECT is(
  pg_temp.issue284_validate_sell(
    jsonb_build_object(
      'expectedHoldingRevision', '0',
      'feeMinorUnits', '0',
      'grossProceedsMinorUnits', '100',
      'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
      'metalType', 'GOLD',
      'netProceedsMinorUnits', '100',
      'notes', null,
      'purchaseCurrency', 'EGP',
      'rateSnapshots', jsonb_build_array(
        pg_temp.issue284_snapshot(
          'terminal_metal', '"metal"'::jsonb, 'metal:GOLD',
          '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a1'
        ),
        pg_temp.issue284_snapshot(
          'terminal_proceeds_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a2'
        ),
        pg_temp.issue284_snapshot(
          'terminal_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
          '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
          '018f0c7a-1234-7abc-8def-0000000002a3'
        )
      ),
      'saleDate', '2026-08-31',
      'saleCurrency', 'EGP',
      'predecessorEventId', '018f0c7a-1234-7abc-8def-000000000287',
      'reversesEventId', null
    )
  ),
  'no-throw',
  'sell validation still accepts fully typed snapshots'
);
SELECT is(
  pg_temp.issue284_validate_acquisition(
    jsonb_build_array(
      pg_temp.issue284_snapshot(
        'acquisition_metal', 'null'::jsonb, 'metal:GOLD',
        '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
        '018f0c7a-1234-7abc-8def-0000000002a4'
      ),
      pg_temp.issue284_snapshot(
        'acquisition_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
        '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
        '018f0c7a-1234-7abc-8def-0000000002a5'
      )
    )
  ),
  '22023',
  'acquisition validation rejects a null snapshot kind'
);
SELECT is(
  pg_temp.issue284_validate_acquisition(
    jsonb_build_array(
      pg_temp.issue284_snapshot(
        null, '"metal"'::jsonb, 'metal:GOLD',
        '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
        '018f0c7a-1234-7abc-8def-0000000002a4'
      ),
      pg_temp.issue284_snapshot(
        'acquisition_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
        '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
        '018f0c7a-1234-7abc-8def-0000000002a5'
      )
    )
  ),
  '22023',
  'acquisition validation rejects a null snapshot role'
);
SELECT is(
  pg_temp.issue284_validate_acquisition(
    jsonb_build_array(
      pg_temp.issue284_snapshot(
        'acquisition_metal', '"metal"'::jsonb, 'metal:GOLD',
        '"usd_per_pure_gram"'::jsonb, '"quote_per_base"'::jsonb,
        '018f0c7a-1234-7abc-8def-0000000002a4'
      ),
      pg_temp.issue284_snapshot(
        'acquisition_purchase_currency', '"currency"'::jsonb, 'currency:EGP',
        '"usd_per_currency_unit"'::jsonb, '"quote_per_base"'::jsonb,
        '018f0c7a-1234-7abc-8def-0000000002a5'
      )
    )
  ),
  'no-throw',
  'acquisition validation still accepts fully typed snapshots'
);

-- A second holding isolates the evidence immutability probes from the sale
-- flow above; the UPDATEs run as the table owner to model a service-role
-- writer that bypasses RLS.
SET LOCAL ROLE authenticated;
SELECT is(
  pg_temp.issue284_action(
    '018f0c7a-1234-7abc-8def-000000000297',
    'add',
    'metals.add/v1',
    jsonb_build_object(
      'expectedHoldingRevision', null,
      'holdingId', '018f0c7a-1234-7abc-8def-000000000296',
      'materialFacts', jsonb_build_object(
        'physicalForm', 'BAR',
        'purchaseCurrency', 'USD',
        'purchaseDate', '2026-08-30',
        'purchasePriceDecimal', '2000',
        'purityCatalogVersion', '1',
        'purityCode', 'gold-9167',
        'purityFactorDecimal', '0.9167',
        'weightGramsDecimal', '5'
      ),
      'metadata', jsonb_build_object('name', 'Issue 284 silver', 'notes', null),
      'metalType', 'GOLD',
      'predecessorEventId', null,
      'rateSnapshots', '[]'::jsonb,
      'reversesEventId', null
    ),
    '018f0c7a-1234-7abc-8def-000000000296'
  ) ->> 'status',
  'accepted',
  'evidence probe holding is accepted through the RPC'
);
RESET ROLE;

CREATE TEMPORARY TABLE pg_temp.issue284_evidence_before AS
SELECT domain_payload_json, canonical_holding_revision, kind
FROM public.metal_action_evidence
WHERE action_id = '018f0c7a-1234-7abc-8def-000000000297';

SELECT throws_ok(
  $$UPDATE public.metal_action_evidence
    SET domain_payload_json = '{"tampered":true}'::jsonb
    WHERE action_id = '018f0c7a-1234-7abc-8def-000000000297'$$,
  '22023',
  'metal_action_evidence_immutable',
  'persisted action payloads cannot be rewritten in place'
);
SELECT throws_ok(
  $$UPDATE public.metal_action_evidence
    SET canonical_holding_revision = 999
    WHERE action_id = '018f0c7a-1234-7abc-8def-000000000297'$$,
  '22023',
  'metal_action_evidence_immutable',
  'canonical holding revisions cannot be rewritten in place'
);
SELECT throws_ok(
  $$UPDATE public.metal_action_evidence
    SET kind = 'sell'
    WHERE action_id = '018f0c7a-1234-7abc-8def-000000000297'$$,
  '22023',
  'metal_action_evidence_immutable',
  'evidence action kinds cannot be rewritten in place'
);
SELECT lives_ok(
  $$UPDATE public.metal_action_evidence
    SET updated_at = statement_timestamp()
    WHERE action_id = '018f0c7a-1234-7abc-8def-000000000297'$$,
  'housekeeping timestamp touches stay allowed'
);
SELECT lives_ok(
  $$UPDATE public.metal_action_evidence
    SET deleted = true
    WHERE action_id = '018f0c7a-1234-7abc-8def-000000000297'$$,
  'sync tombstone flags stay allowed'
);
SELECT is(
  (
    SELECT evidence.domain_payload_json = before.domain_payload_json
      AND evidence.canonical_holding_revision IS NOT DISTINCT FROM
        before.canonical_holding_revision
      AND evidence.kind = before.kind
    FROM public.metal_action_evidence AS evidence
    CROSS JOIN pg_temp.issue284_evidence_before AS before
    WHERE evidence.action_id = '018f0c7a-1234-7abc-8def-000000000297'
  ),
  true,
  'rejected rewrites leave the persisted evidence untouched'
);

SELECT * FROM finish();
ROLLBACK;
