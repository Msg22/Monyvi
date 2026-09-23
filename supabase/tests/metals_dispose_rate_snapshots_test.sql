begin;

select plan(23);

select has_function(
  'private', 'financial_action_validate_metals_dispose_payload_v1', array['jsonb'],
  'Dispose payload validator is registered server-side'
);
select has_function(
  'private', 'financial_action_validate_metals_dispose_rate_snapshots_v1', array['jsonb'],
  'Dispose terminal rate-snapshot validator is registered server-side'
);

create or replace function pg_temp.dispose_rate_snapshot(
  p_role text,
  p_kind text,
  p_instrument text,
  p_value text default '1',
  p_quality text default 'valid',
  p_freshness text default 'fresh',
  p_provider text default '2026-08-31T10:00:00.000Z',
  p_reference text default null
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'capturedAt', '2026-08-31T10:15:30.000Z',
    'capturedFreshness', p_freshness,
    'instrumentCode', p_instrument,
    'kind', p_kind,
    'orientation', case when p_kind = 'metal' then 'quote_per_base'
                        else 'quote_per_base' end,
    'providerObservedAt', p_provider,
    'quality', p_quality,
    'referenceId', coalesce(p_reference, case when p_role = 'terminal_metal'
      then '018f0c7a-1234-7abc-8def-0000000000a1'
      else '018f0c7a-1234-7abc-8def-0000000000a2' end),
    'role', p_role,
    'source', 'fixture',
    'unit', case when p_kind = 'metal' then 'usd_per_pure_gram'
                 else 'usd_per_currency_unit' end,
    'valueDecimal', p_value
  );
$$;

create or replace function pg_temp.dispose_payload(
  p_snapshots jsonb
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'disposalDate', '2026-08-31',
    'expectedHoldingRevision', '1',
    'holdingId', '018f0c7a-1234-7abc-8def-000000000004',
    'notes', null,
    'predecessorEventId', '018f0c7a-1234-7abc-8def-000000000006',
    'rateSnapshots', p_snapshots,
    'reason', 'donated',
    'reversesEventId', null
  );
$$;

create or replace function pg_temp.terminal_pair(
  p_metal_instrument text default 'metal:GOLD',
  p_currency_instrument text default 'currency:USD',
  p_metal_value text default '3738.74',
  p_currency_value text default '1'
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', p_metal_instrument, p_metal_value),
    pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', p_currency_instrument, p_currency_value)
  );
$$;

-- Historical payload without rateSnapshots remains accepted.
select lives_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    '{"disposalDate":"2026-08-31","expectedHoldingRevision":"1","holdingId":"018f0c7a-1234-7abc-8def-000000000004","notes":null,"predecessorEventId":"018f0c7a-1234-7abc-8def-000000000006","reason":"donated","reversesEventId":null}'::jsonb
  )$$,
  'historical dispose payload without rateSnapshots stays valid'
);

-- Empty rateSnapshots array is accepted.
select lives_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload('[]'::jsonb)
  )$$,
  'dispose payload with an empty rateSnapshots array stays valid'
);

-- A complete terminal_metal + terminal_purchase_currency pair is accepted.
select lives_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(pg_temp.terminal_pair())
  )$$,
  'dispose payload with a terminal metal plus purchase-currency pair is valid'
);

-- A Silver plus inverse-quoted EGP terminal pair is accepted.
select lives_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:SILVER', '43.74'),
        (pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:EGP', '47.5')
          || jsonb_build_object('unit', 'currency_units_per_usd', 'orientation', 'base_per_quote'))
      )
    )
  )$$,
  'dispose accepts a Silver plus inverse EGP terminal pair'
);

-- A terminal_proceeds_currency role is not part of the dispose context.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74'),
        pg_temp.dispose_rate_snapshot('terminal_proceeds_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a terminal_proceeds_currency role'
);

-- Duplicate roles are rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74'),
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74',
          p_reference => '018f0c7a-1234-7abc-8def-0000000000a2')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects duplicate terminal_metal roles'
);

-- Duplicate referenceIds are rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74',
          p_reference => '018f0c7a-1234-7abc-8def-0000000000a1'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1',
          p_reference => '018f0c7a-1234-7abc-8def-0000000000a1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects duplicate rate-reference IDs'
);

-- A single snapshot is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a single terminal snapshot'
);

-- Three snapshots are rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1'),
        pg_temp.dispose_rate_snapshot('terminal_proceeds_currency', 'currency', 'currency:USD', '1',
          p_reference => '018f0c7a-1234-7abc-8def-0000000000a3')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a three-snapshot set'
);

-- A missing structural field is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        (pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74') - 'source'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a snapshot missing a structural field'
);

-- Non-valid quality is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74',
          p_quality => 'invalid'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects non-valid snapshot quality'
);

-- Fresh freshness without a provider observation time is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74',
          p_provider => null),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects fresh freshness when provider observation is absent'
);

-- Stale freshness within 24 hours of provider evidence is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74',
          p_freshness => 'stale'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects stale freshness for recent provider evidence'
);

-- Future provider observation with non-unknown freshness is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74',
          p_provider => '2026-09-01T10:00:00.000Z'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a future provider observation without unknown freshness'
);

-- terminal_metal must be a metal reference.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'currency', 'currency:USD', '1'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a non-metal terminal_metal kind'
);

-- terminal_metal instrument must be Gold or Silver.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:PLATINUM', '1398.25'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a non-Gold/Silver terminal metal instrument'
);

-- terminal_metal must use the exact metal matrix.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        (pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74')
          || jsonb_build_object('unit', 'currency_units_per_usd', 'orientation', 'base_per_quote')),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects an inverse terminal metal matrix'
);

-- terminal_purchase_currency must be a currency reference.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'metal', 'metal:GOLD', '3738.74')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a non-currency terminal_purchase_currency kind'
);

-- BTC is excluded from the Metals ISO currency set.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:BTC', '60000')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a BTC purchase-currency reference'
);

-- USD identity must be exactly one.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    pg_temp.dispose_payload(
      jsonb_build_array(
        pg_temp.dispose_rate_snapshot('terminal_metal', 'metal', 'metal:GOLD', '3738.74'),
        pg_temp.dispose_rate_snapshot('terminal_purchase_currency', 'currency', 'currency:USD', '1.01')
      )
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a non-identity USD purchase-currency reference'
);

-- A non-array rateSnapshots value is rejected.
select throws_ok(
  $$select private.financial_action_validate_metals_dispose_payload_v1(
    (pg_temp.dispose_payload('[]'::jsonb) || jsonb_build_object('rateSnapshots', null))
  )$$,
  '22023', 'financial_action_invalid_payload',
  'dispose rejects a null rateSnapshots field'
);

select * from finish();
rollback;
