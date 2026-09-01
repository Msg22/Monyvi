begin;

select plan(69);

select has_table('public', 'metal_holding_states', 'holding projection exists');
select has_table('public', 'metal_action_evidence', 'action evidence exists');
select has_table('public', 'metal_lifecycle_events', 'lifecycle evidence exists');
select has_table('public', 'metal_rate_references', 'rate references exist');
select has_table('public', 'market_rate_observations', 'market observations exist');

select col_type_is(
  'public',
  'metal_holding_states',
  'financial_revision',
  'bigint',
  'remote holding revisions use bigint'
);
select col_type_is(
  'public',
  'metal_action_evidence',
  'expected_holding_revision',
  'bigint',
  'remote expected revisions use bigint'
);
select has_index(
  'public',
  'metal_action_evidence',
  'metal_action_evidence_user_id_action_id_key',
  'one evidence row exists per owner and action'
);
select has_index(
  'public',
  'metal_lifecycle_events',
  'metal_lifecycle_events_user_id_action_id_key',
  'one lifecycle row exists per owner and action'
);

select is(private.metal_revision_from_text_v1('0'), 0::bigint, 'revision zero parses');
select is(
  private.metal_revision_from_text_v1('9223372036854775807'),
  9223372036854775807::bigint,
  'maximum revision parses'
);
select throws_ok(
  $$select private.metal_revision_from_text_v1('01')$$,
  '22023',
  'invalid_metal_revision',
  'leading-zero revision is rejected'
);
select throws_ok(
  $$select private.metal_revision_from_text_v1('9223372036854775808')$$,
  '22023',
  'invalid_metal_revision',
  'out-of-range revision is rejected'
);

select has_function(
  'private',
  'metal_action_expected_revision_v1',
  array['jsonb'],
  'holding-only RPC binding helper exists'
);
select is(
  private.metal_action_expected_revision_v1(
    '{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","kind":"add","payload":{"expectedHoldingRevision":null,"holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.add/v1"}'::jsonb
  ),
  null::bigint,
  'Add binds a null expected revision'
);
select is(
  private.metal_action_expected_revision_v1(
    '{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","kind":"sell","payload":{"expectedHoldingRevision":"7","holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.sell/v2"}'::jsonb
  ),
  7::bigint,
  'Sell v2 binds its canonical expected revision'
);
select throws_ok(
  $$select private.metal_action_expected_revision_v1('{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000099","kind":"sell","payload":{"expectedHoldingRevision":"7","holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.sell/v2"}'::jsonb)$$,
  '22023',
  'metal_action_invalid_binding',
  'domain reference must equal the payload holding'
);
select throws_ok(
  $$select private.metal_action_expected_revision_v1('{"accountGuards":[{"accountId":"018f0c7a-1234-7abc-8def-000000000008","expectedRevision":"0"}],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","kind":"sell","payload":{"expectedHoldingRevision":"7","holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.sell/v2"}'::jsonb)$$,
  '22023',
  'metal_action_account_effects_disabled',
  'Slice 4 rejects account guards'
);
select throws_ok(
  $$select private.metal_action_expected_revision_v1('{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","kind":"sell","payload":{"expectedHoldingRevision":"7","holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.sell/v1"}'::jsonb)$$,
  '22023',
  'metal_action_unknown_definition',
  'legacy Sell v1 cannot enter the holding CAS path'
);
select throws_ok(
  $$select private.metal_action_expected_revision_v1('{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","kind":"correct","payload":{"expectedHoldingRevision":7,"holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.correct/v1"}'::jsonb)$$,
  '22023',
  'metal_action_invalid_revision',
  'numeric JSON revisions are rejected before bigint storage'
);
select throws_ok(
  $$select private.metal_action_expected_revision_v1('{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","payload":{"expectedHoldingRevision":"7","holdingId":"018f0c7a-1234-7abc-8def-000000000004"},"payloadVersion":"metals.correct/v1"}'::jsonb)$$,
  '22023',
  'metal_action_unknown_definition',
  'missing action kind is rejected null-safely'
);
select throws_ok(
  $$select private.metal_action_expected_revision_v1('{"accountGuards":[],"domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000004","kind":"correct","payload":{"expectedHoldingRevision":"7","holdingId":"018f0c7a-1234-7abc-8def-000000000004"}}'::jsonb)$$,
  '22023',
  'metal_action_unknown_definition',
  'missing payload version is rejected null-safely'
);
select is(
  has_function_privilege(
    'authenticated',
    'private.metal_action_expected_revision_v1(jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot call the private binding helper'
);

select col_is_null(
  'public',
  'metal_rate_references',
  'source',
  'unknown consumed-rate provenance remains nullable'
);
select col_is_null(
  'public',
  'market_rate_observations',
  'source',
  'unknown observed-rate provenance remains nullable'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '018f0c7a-1234-7abc-8def-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'metals-domain@monyvi.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.assets (
  id, user_id, name, type, is_liquid, purchase_price, purchase_date, currency,
  purchase_price_decimal, purchase_currency, created_at, updated_at, deleted
) values
  (
    '018f0c7a-1234-7abc-8def-000000000004',
    '018f0c7a-1234-7abc-8def-000000000003',
    'Holding A', 'METAL', false, 100, '2026-08-31', 'EGP', 100, 'EGP', now(), now(), false
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000014',
    '018f0c7a-1234-7abc-8def-000000000003',
    'Holding B', 'METAL', false, 200, '2026-08-31', 'USD', 200, 'USD', now(), now(), false
  );

insert into public.asset_metals (
  id, asset_id, metal_type, weight_grams, purity_fraction,
  weight_grams_decimal, purity_code, purity_factor_decimal, purity_catalog_version,
  created_at, updated_at, deleted
) values
  (
    '018f0c7a-1234-7abc-8def-000000000005',
    '018f0c7a-1234-7abc-8def-000000000004',
    'GOLD', 1, 0.9167, 1, 'gold-9167', 0.9167, '1', now(), now(), false
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000015',
    '018f0c7a-1234-7abc-8def-000000000014',
    'SILVER', 2, 0.925, 2, 'silver-925', 0.925, '1', now(), now(), false
  );

select throws_ok(
  $$update public.asset_metals
    set purity_factor_decimal = null
    where id = '018f0c7a-1234-7abc-8def-000000000005'$$,
  '23514', null,
  'partial purity tuples are rejected'
);
select throws_ok(
  $$update public.asset_metals
    set weight_grams_decimal = 1.2345
    where id = '018f0c7a-1234-7abc-8def-000000000005'$$,
  '23514', null,
  'over-precision exact weights are rejected'
);
select throws_ok(
  $$update public.assets
    set purchase_currency = 'BTC'
    where id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  '23514', null,
  'BTC cannot become an authoritative Metals purchase currency'
);
select throws_ok(
  $$insert into public.metal_holding_states (
      id, user_id, holding_id, status, financial_revision
    ) values (
      '018f0c7a-1234-7abc-8def-000000000099',
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000004', 'active', 0
    )$$,
  '23514', null,
  'holding state identity must equal holding identity'
);

create or replace function pg_temp.metal_root_envelope(
  p_action_id text,
  p_holding_id text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'accountGuards', '[]'::jsonb,
    'actionId', p_action_id,
    'domain', 'metals',
    'domainReferenceId', p_holding_id,
    'envelopeVersion', 'monyvi.financial-action/v1',
    'kind', 'sell',
    'occurredAt', '2026-08-31T10:15:30.123Z',
    'payload', jsonb_build_object(
      'feeMinorUnits', '0',
      'grossProceedsDecimal', '100',
      'holdingId', p_holding_id,
      'includeAccountCredit', false,
      'netProceedsMinorUnits', '10000',
      'notes', 'fixture',
      'rateReferenceIds', '[]'::jsonb
    ),
    'payloadVersion', 'metals.sell/v1',
    'userId', '018f0c7a-1234-7abc-8def-000000000003'
  )
$$;

with roots(action_id, holding_id) as (
  values
    ('018f0c7a-1234-7abc-8def-000000000001', '018f0c7a-1234-7abc-8def-000000000004'),
    ('018f0c7a-1234-7abc-8def-000000000011', '018f0c7a-1234-7abc-8def-000000000014'),
    ('018f0c7a-1234-7abc-8def-000000000031', '018f0c7a-1234-7abc-8def-000000000004'),
    ('018f0c7a-1234-7abc-8def-000000000041', '018f0c7a-1234-7abc-8def-000000000004')
), payloads as (
  select
    action_id::uuid,
    holding_id::uuid,
    private.financial_action_encode_jsonb_v1(
      pg_temp.metal_root_envelope(action_id, holding_id)
    ) as payload_json
  from roots
)
insert into public.financial_action_groups (
  action_id, user_id, domain, kind, domain_reference_id, payload_json,
  payload_hash, account_guards_json, state, deleted
)
select
  action_id,
  '018f0c7a-1234-7abc-8def-000000000003',
  'metals', 'sell', holding_id, payload_json,
  encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex'),
  '[]'::jsonb, 'pending_local', false
from payloads;

select throws_ok(
  $$insert into public.metal_action_evidence (
      user_id, action_id, holding_id, kind, expected_holding_revision, domain_payload_json
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000001',
      '018f0c7a-1234-7abc-8def-000000000014', 'sell', 0, '{}'
    )$$,
  '23503', null,
  'Metals evidence must bind to the root holding'
);

insert into public.metal_action_evidence (
  user_id, action_id, holding_id, kind, expected_holding_revision, domain_payload_json
) values
  (
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000001',
    '018f0c7a-1234-7abc-8def-000000000004', 'sell', 0, '{}'
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000011',
    '018f0c7a-1234-7abc-8def-000000000014', 'sell', 0, '{}'
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000031',
    '018f0c7a-1234-7abc-8def-000000000004', 'sell', 0, '{}'
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000041',
    '018f0c7a-1234-7abc-8def-000000000004', 'sell', 0, '{}'
  );

select throws_ok(
  $$insert into public.metal_lifecycle_events (
      user_id, holding_id, action_id, kind, occurred_at, payload_json
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000004',
      '018f0c7a-1234-7abc-8def-000000000041', 'dispose', now(), '{}'
    )$$,
  '23503', null,
  'lifecycle event kind must match its linked action evidence'
);

select throws_ok(
  $$insert into public.metal_lifecycle_events (
      user_id, holding_id, action_id, kind, occurred_at, payload_json
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000001', 'sell', now(), '{}'
    )$$,
  '23503', null,
  'lifecycle evidence must bind to the action evidence holding'
);
insert into public.metal_lifecycle_events (
  id, user_id, holding_id, action_id, kind, occurred_at, payload_json
) values
  (
    '018f0c7a-1234-7abc-8def-000000000006',
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000004',
    '018f0c7a-1234-7abc-8def-000000000001', 'sell', now(), '{}'
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000036',
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000004',
    '018f0c7a-1234-7abc-8def-000000000031', 'sell', now(), '{}'
  );

select throws_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, source, quality, captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000001',
      'acquisition_metal', 'metal', 'metal:GOLD', 100,
      'usd_per_pure_gram', 'quote_per_base', null, 'valid', 'unknown', now()
    )$$,
  '23503', null,
  'rate evidence must bind to the action evidence holding'
);

select throws_ok(
  $$insert into public.metal_holding_states (
      id, user_id, holding_id, status, financial_revision,
      effective_action_id, effective_event_id
    ) values (
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014', 'sold', 1,
      '018f0c7a-1234-7abc-8def-000000000001',
      '018f0c7a-1234-7abc-8def-000000000006'
    )$$,
  '23503', null,
  'holding state effective action must bind to the same holding evidence'
);

select throws_ok(
  $$insert into public.metal_holding_states (
      id, user_id, holding_id, status, financial_revision, effective_action_id
    ) values (
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014', 'active', 0,
      '018f0c7a-1234-7abc-8def-000000000011'
    )$$,
  '23514', null,
  'revision zero cannot claim action provenance'
);

insert into public.metal_holding_states (
  id, user_id, holding_id, status, financial_revision
) values
  (
    '018f0c7a-1234-7abc-8def-000000000004',
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000004', 'active', 0
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000014',
    '018f0c7a-1234-7abc-8def-000000000003',
    '018f0c7a-1234-7abc-8def-000000000014', 'active', 0
  );

select throws_ok(
  $$update public.metal_holding_states
    set
      status = 'sold',
      financial_revision = 1,
      effective_action_id = '018f0c7a-1234-7abc-8def-000000000001',
      effective_event_id = null
    where holding_id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  '23514', null,
  'nonzero holding revision requires both effective provenance IDs'
);
select throws_ok(
  $$update public.metal_holding_states
    set
      status = 'sold',
      financial_revision = 1,
      effective_action_id = '018f0c7a-1234-7abc-8def-000000000001',
      effective_event_id = '018f0c7a-1234-7abc-8def-000000000036'
    where holding_id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  '23503', null,
  'holding state rejects independently valid action and event from different pairs'
);
select lives_ok(
  $$update public.metal_holding_states
    set
      status = 'sold',
      financial_revision = 1,
      effective_action_id = '018f0c7a-1234-7abc-8def-000000000001',
      effective_event_id = '018f0c7a-1234-7abc-8def-000000000006'
    where holding_id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  'holding state accepts one valid action and event provenance pair'
);

select is(
  private.metal_rate_captured_freshness_v1(
    null,
    '2026-08-31T12:00:00Z'::timestamptz
  ),
  'unknown',
  'missing provider observation derives unknown freshness'
);
select is(
  private.metal_rate_captured_freshness_v1(
    '2026-08-31T12:00:01Z'::timestamptz,
    '2026-08-31T12:00:00Z'::timestamptz
  ),
  'unknown',
  'future provider observation derives unknown freshness'
);
select is(
  private.metal_rate_captured_freshness_v1(
    '2026-08-30T12:00:00Z'::timestamptz,
    '2026-08-31T12:00:00Z'::timestamptz
  ),
  'fresh',
  'exactly 24 hours old remains fresh'
);
select is(
  private.metal_rate_captured_freshness_v1(
    '2026-08-30T11:59:59.999999Z'::timestamptz,
    '2026-08-31T12:00:00Z'::timestamptz
  ),
  'stale',
  'more than 24 hours old derives stale freshness'
);
select throws_ok(
  $$select private.metal_rate_captured_freshness_v1(
      null, 'infinity'::timestamptz
    )$$,
  '22023', 'metal_rate_invalid_capture_time',
  'non-finite capture time is rejected'
);
select throws_ok(
  $$select private.metal_rate_captured_freshness_v1(
      'infinity'::timestamptz, '2026-08-31T12:00:00Z'::timestamptz
    )$$,
  '22023', 'metal_rate_invalid_provider_observation_time',
  'non-finite provider observation time is rejected'
);

select lives_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, source, quality, captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000004',
      '018f0c7a-1234-7abc-8def-000000000001',
      'acquisition_purchase_currency', 'currency', 'currency:USD', 1,
      'usd_per_currency_unit', 'quote_per_base', null, 'valid', 'unknown', now()
    )$$,
  'null source remains truthful for a valid rate reference'
);
select throws_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, provider_observed_at, source, quality,
      captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000011',
      'current_purchase_currency', 'currency', 'currency:EGP', 0.02,
      'usd_per_currency_unit', 'quote_per_base',
      '2026-08-30T11:59:59.999999Z', 'fixture', 'valid', 'fresh',
      '2026-08-31T12:00:00Z'
    )$$,
  '22023', 'metal_rate_captured_freshness_mismatch',
  'caller freshness cannot disagree with derived provider freshness'
);
select lives_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, provider_observed_at, source, quality,
      captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000011',
      'current_purchase_currency', 'currency', 'currency:EGP', 0.02,
      'usd_per_currency_unit', 'quote_per_base',
      '2026-08-30T11:59:59.999999Z', 'fixture', 'valid', 'stale',
      '2026-08-31T12:00:00Z'
    )$$,
  'matching derived stale freshness is accepted'
);
set local role service_role;
select throws_ok(
  $$update public.metal_rate_references
    set source = 'rewritten'
    where user_id = '018f0c7a-1234-7abc-8def-000000000003'
      and action_id = '018f0c7a-1234-7abc-8def-000000000011'
      and role = 'current_purchase_currency'$$,
  '22023', 'metal_rate_reference_immutable',
  'service-role paths cannot update inserted role-specific rate evidence'
);
select throws_ok(
  $$delete from public.metal_rate_references
    where user_id = '018f0c7a-1234-7abc-8def-000000000003'
      and action_id = '018f0c7a-1234-7abc-8def-000000000011'
      and role = 'current_purchase_currency'$$,
  '22023', 'metal_rate_reference_immutable',
  'service-role paths cannot delete inserted role-specific rate evidence'
);
reset role;
select throws_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, quality, captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000011',
      'current_purchase_currency', 'currency', 'currency:EGP', 0.02,
      'usd_per_currency_unit', 'quote_per_base', 'invalid', 'unknown', now()
    )$$,
  '23514', null,
  'persisted exact rate quality must be valid'
);
select throws_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, quality, captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000011',
      'current_purchase_currency', 'currency', 'currency:USD', 1.01,
      'usd_per_currency_unit', 'quote_per_base', 'valid', 'unknown', now()
    )$$,
  '23514', null,
  'USD persisted reference must be exact identity one'
);
select throws_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, quality, captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000011',
      'current_metal', 'metal', 'metal:SILVER', 30,
      'currency_units_per_usd', 'base_per_quote', 'valid', 'unknown', now()
    )$$,
  '23514', null,
  'inverse metal matrix is rejected'
);
select throws_ok(
  $$insert into public.metal_rate_references (
      user_id, holding_id, action_id, role, kind, instrument_code, value_decimal,
      unit, orientation, quality, captured_freshness, captured_at
    ) values (
      '018f0c7a-1234-7abc-8def-000000000003',
      '018f0c7a-1234-7abc-8def-000000000014',
      '018f0c7a-1234-7abc-8def-000000000011',
      'current_purchase_currency', 'currency', 'currency:BTC', 1,
      'usd_per_currency_unit', 'quote_per_base', 'valid', 'unknown', now()
    )$$,
  '23514', null,
  'BTC rate references are rejected'
);

select throws_ok(
  $$insert into public.market_rate_observations (
      batch_id, instrument_code, value_decimal, unit, orientation, quality
    ) values (
      '018f0c7a-1234-7abc-8def-000000000020', 'metal:GOLD', 50,
      'currency_units_per_usd', 'base_per_quote', 'valid'
    )$$,
  '23514', null,
  'observation matrix rejects inverse metal rates'
);
select throws_ok(
  $$insert into public.market_rate_observations (
      batch_id, instrument_code, value_decimal, unit, orientation, quality
    ) values (
      '018f0c7a-1234-7abc-8def-000000000020', 'currency:BTC', 1,
      'usd_per_currency_unit', 'quote_per_base', 'valid'
    )$$,
  '23514', null,
  'observation matrix rejects BTC'
);
select throws_ok(
  $$insert into public.market_rate_observations (
      batch_id, instrument_code, value_decimal, unit, orientation, quality
    ) values (
      '018f0c7a-1234-7abc-8def-000000000020', 'currency:EGP', 0.02,
      'usd_per_currency_unit', 'quote_per_base', 'unknown'
    )$$,
  '23514', null,
  'observation quality must be valid'
);

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"018f0c7a-1234-7abc-8def-000000000003","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '018f0c7a-1234-7abc-8def-000000000003',
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;
set local role authenticated;
select throws_ok(
  $$update public.assets
    set purchase_price_decimal = 101
    where id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  '22023', 'metal_action_rpc_required',
  'authenticated direct asset exact-field update is denied'
);
select throws_ok(
  $$update public.asset_metals
    set weight_grams_decimal = 2
    where id = '018f0c7a-1234-7abc-8def-000000000005'$$,
  '22023', 'metal_action_rpc_required',
  'authenticated direct metal exact-field update is denied'
);
select lives_ok(
  $$update public.assets
    set name = 'Metadata update'
    where id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  'ordinary metadata remains writable'
);
select throws_ok(
  $$delete from public.assets
    where id = '018f0c7a-1234-7abc-8def-000000000004'$$,
  '23503', null,
  'asset delete cannot cascade immutable Metals evidence'
);
reset role;

select has_function(
  'public',
  'pull_metal_observations_page_v1',
  array['timestamp with time zone', 'timestamp with time zone', 'uuid', 'integer'],
  'bounded exact observation page RPC exists'
);
select throws_ok(
  $$select public.pull_metal_observations_page_v1(
      null, '2026-08-31T10:15:30Z', null, 10
    )$$,
  '22023', 'metal_observation_invalid_cursor',
  'observation page rejects a partial cursor'
);
select throws_ok(
  $$select public.pull_metal_observations_page_v1(null, null, null, 0)$$,
  '22023', 'metal_observation_invalid_limit',
  'observation page rejects an invalid limit'
);

insert into public.market_rate_observations (
  id, batch_id, instrument_code, value_decimal, unit, orientation,
  provider_observed_at, source, quality, created_at
) values
  (
    '018f0c7a-1234-7abc-8def-000000000021',
    '018f0c7a-1234-7abc-8def-000000000020', 'metal:GOLD',
    123.123456789012345678901, 'usd_per_pure_gram', 'quote_per_base',
    '2020-01-01T00:00:00Z', null, 'valid', '2020-01-01T00:00:00Z'
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000022',
    '018f0c7a-1234-7abc-8def-000000000020', 'currency:EGP',
    0.020123456789012345678901, 'usd_per_currency_unit', 'quote_per_base',
    '2020-01-01T00:00:00Z', 'fixture', 'valid', '2020-01-01T00:00:00Z'
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000023',
    '018f0c7a-1234-7abc-8def-000000000020', 'currency:USD',
    1, 'usd_per_currency_unit', 'quote_per_base',
    '2020-01-02T00:00:00Z', 'identity', 'valid', '2020-01-02T00:00:00Z'
  );

create temporary table pg_temp.metal_page_one as
select public.pull_metal_observations_page_v1(null, null, null, 2) as payload;

select is(
  (select payload #>> '{rows,0,valueDecimal}' from pg_temp.metal_page_one),
  '123.123456789012345678901',
  'observation numeric crosses RPC boundary as exact text'
);
select cmp_ok(
  (select (payload ->> 'upperWatermark')::timestamptz from pg_temp.metal_page_one),
  '>',
  (select max(created_at) from public.market_rate_observations),
  'server upper watermark is request time rather than table max'
);

create temporary table pg_temp.metal_page_two as
select public.pull_metal_observations_page_v1(
  (page.payload ->> 'upperWatermark')::timestamptz,
  (page.payload #>> '{nextCursor,createdAt}')::timestamptz,
  (page.payload #>> '{nextCursor,id}')::uuid,
  2
) as payload
from pg_temp.metal_page_one as page;

select is(
  (select payload ->> 'upperWatermark' from pg_temp.metal_page_two),
  (select payload ->> 'upperWatermark' from pg_temp.metal_page_one),
  'subsequent pages preserve the fixed upper watermark'
);
select is(
  array(
    select row_value ->> 'id'
    from pg_temp.metal_page_two,
      jsonb_array_elements(payload -> 'rows') as row_value
  ),
  array['018f0c7a-1234-7abc-8def-000000000023'],
  'exclusive keyset cursor returns the remaining deterministic row once'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.pull_metal_observations_page_v1(timestamptz,timestamptz,uuid,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated sync may execute the read-only observation page'
);
select is(
  has_function_privilege(
    'anon',
    'public.pull_metal_observations_page_v1(timestamptz,timestamptz,uuid,integer)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot execute the observation page'
);

select * from finish();
rollback;
