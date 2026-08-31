begin;

select plan(21);

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
select is(
  has_function_privilege(
    'authenticated',
    'private.metal_action_expected_revision_v1(jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot call the private binding helper'
);

select * from finish();
rollback;
