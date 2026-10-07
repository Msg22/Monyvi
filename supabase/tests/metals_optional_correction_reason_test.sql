begin;
select plan(5);

create or replace function pg_temp.correction_with_reason(p_reason jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'domain', 'metals',
    'domainReferenceId', '018f0c7a-1234-7abc-8def-000000000002',
    'kind', 'correct',
    'payloadVersion', 'metals.correct/v1',
    'accountGuards', '[]'::jsonb,
    'payload', jsonb_build_object(
      'holdingId', '018f0c7a-1234-7abc-8def-000000000002',
      'expectedHoldingRevision', '0',
      'predecessorEventId', null,
      'reversesEventId', null,
      'metadataChange', null,
      'materialCorrection', jsonb_build_object(
        'before', jsonb_build_object(
          'physicalForm', 'COIN',
          'weightGramsDecimal', '10',
          'purityCode', 'gold-9999',
          'purityFactorDecimal', '0.9999',
          'purityCatalogVersion', '1',
          'purchasePriceDecimal', '1000',
          'purchaseCurrency', 'EGP',
          'purchaseDate', '2026-08-30'
        ),
        'after', jsonb_build_object(
          'physicalForm', 'COIN',
          'weightGramsDecimal', '12',
          'purityCode', 'gold-9999',
          'purityFactorDecimal', '0.9999',
          'purityCatalogVersion', '1',
          'purchasePriceDecimal', '1000',
          'purchaseCurrency', 'EGP',
          'purchaseDate', '2026-08-30'
        ),
        'reason', p_reason,
        'rateSnapshots', '[]'::jsonb
      )
    )
  )
$$;

select lives_ok(
  $$select private.financial_action_validate_metals_payload_v1(
    pg_temp.correction_with_reason('""'::jsonb)
  )$$,
  'empty user text is a valid correction reason string'
);
select lives_ok(
  $$select private.financial_action_validate_metals_payload_v1(
    pg_temp.correction_with_reason('"Corrected receipt"'::jsonb)
  )$$,
  'existing nonempty reason remains valid'
);
select throws_ok(
  $$select private.financial_action_validate_metals_payload_v1(
    pg_temp.correction_with_reason('null'::jsonb)
  )$$,
  '22023', 'financial_action_invalid_payload',
  'reason property remains a string'
);
select throws_ok(
  $$select private.financial_action_validate_metals_payload_v1(
    jsonb_set(
      pg_temp.correction_with_reason('""'::jsonb),
      '{payload,materialCorrection}',
      (pg_temp.correction_with_reason('""'::jsonb)
        #> '{payload,materialCorrection}') - 'reason'
    )
  )$$,
  '22023', 'financial_action_invalid_payload',
  'reason property cannot be omitted'
);
select throws_ok(
  $$select private.financial_action_validate_metals_payload_v1(
    pg_temp.correction_with_reason(to_jsonb(repeat('x', 1025)))
  )$$,
  '22023', 'financial_action_invalid_payload',
  'reason still respects 1024 UTF-8 byte limit'
);

select * from finish();
rollback;
