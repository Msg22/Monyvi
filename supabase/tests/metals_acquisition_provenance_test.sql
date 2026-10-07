begin;
select plan(10);

insert into auth.users (id)
values ('018f0c7a-1234-7abc-8def-0000000000a1')
on conflict (id) do nothing;

create or replace function pg_temp.provenance_action(
  p_action_id uuid,
  p_kind text,
  p_payload_version text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload_json text;
begin
  v_payload_json := private.financial_action_encode_jsonb_v1(
    jsonb_build_object(
      'accountGuards', '[]'::jsonb,
      'actionId', p_action_id,
      'domain', 'metals',
      'domainReferenceId', '018f0c7a-1234-7abc-8def-0000000000a2',
      'envelopeVersion', 'monyvi.financial-action/v1',
      'kind', p_kind,
      'occurredAt', '2026-08-31T10:15:30.123Z',
      'payload', p_payload,
      'payloadVersion', p_payload_version,
      'userId', '018f0c7a-1234-7abc-8def-0000000000a1'
    )
  );
  return public.apply_metal_action_v1(
    v_payload_json,
    encode(
      extensions.digest(convert_to(v_payload_json, 'UTF8'), 'sha256'),
      'hex'
    )
  );
end;
$function$;

create or replace function pg_temp.material_facts(
  p_form text,
  p_price text
)
returns jsonb
language sql
immutable
as $function$
  select jsonb_build_object(
    'physicalForm', p_form,
    'purchaseCurrency', 'EGP',
    'purchaseDate', '2026-08-30',
    'purchasePriceDecimal', p_price,
    'purityCatalogVersion', '1',
    'purityCode', 'gold-999',
    'purityFactorDecimal', '0.999',
    'weightGramsDecimal', '10'
  );
$function$;

create or replace function pg_temp.correction_payload(
  p_expected_revision text,
  p_predecessor uuid,
  p_before_form text,
  p_after_form text,
  p_before_price text,
  p_after_price text,
  p_rate_snapshots jsonb
)
returns jsonb
language sql
immutable
as $function$
  select jsonb_build_object(
    'expectedHoldingRevision', p_expected_revision,
    'holdingId', '018f0c7a-1234-7abc-8def-0000000000a2',
    'metadataChange', null,
    'materialCorrection', jsonb_build_object(
      'before', pg_temp.material_facts(p_before_form, p_before_price),
      'after', pg_temp.material_facts(p_after_form, p_after_price),
      'rateSnapshots', p_rate_snapshots,
      'reason', ''
    ),
    'predecessorEventId', p_predecessor,
    'reversesEventId', null
  );
$function$;

create or replace function pg_temp.acquisition_snapshot(
  p_role text,
  p_kind text,
  p_instrument text,
  p_unit text,
  p_reference_id uuid,
  p_value text
)
returns jsonb
language sql
immutable
as $function$
  select jsonb_build_object(
    'capturedAt', '2026-08-30T10:15:30.123Z',
    'capturedFreshness', 'fresh',
    'instrumentCode', p_instrument,
    'kind', p_kind,
    'orientation', 'quote_per_base',
    'providerObservedAt', '2026-08-30T10:00:00.000Z',
    'quality', 'valid',
    'referenceId', p_reference_id,
    'role', p_role,
    'source', 'fixture',
    'unit', p_unit,
    'valueDecimal', p_value
  );
$function$;

grant execute on function pg_temp.provenance_action(uuid, text, text, jsonb)
  to authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"018f0c7a-1234-7abc-8def-0000000000a1","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '018f0c7a-1234-7abc-8def-0000000000a1',
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

set local role authenticated;

select is(
  pg_temp.provenance_action(
    '018f0c7a-1234-7abc-8def-0000000000a3',
    'add',
    'metals.add/v1',
    jsonb_build_object(
      'expectedHoldingRevision', null,
      'holdingId', '018f0c7a-1234-7abc-8def-0000000000a2',
      'materialFacts', pg_temp.material_facts('JEWELRY', '150000'),
      'metadata', jsonb_build_object('name', 'Provenance holding', 'notes', null),
      'metalType', 'GOLD',
      'predecessorEventId', null,
      'rateSnapshots', '[]'::jsonb,
      'reversesEventId', null
    )
  ) ->> 'status',
  'accepted',
  'baseline Add is accepted'
);

select is(
  (select acquisition_action_id::text from public.assets
   where id = '018f0c7a-1234-7abc-8def-0000000000a2'),
  '018f0c7a-1234-7abc-8def-0000000000a3',
  'baseline acquisition link is established'
);

select is(
  pg_temp.provenance_action(
    '018f0c7a-1234-7abc-8def-0000000000a4',
    'correct',
    'metals.correct/v1',
    pg_temp.correction_payload(
      '0',
      '018f0c7a-1234-7abc-8def-0000000000a3',
      'JEWELRY',
      'BAR',
      '150000',
      '150000',
      '[]'::jsonb
    )
  ) ->> 'status',
  'accepted',
  'reference-less physical-form correction is accepted'
);

select is(
  (select acquisition_action_id::text from public.assets
   where id = '018f0c7a-1234-7abc-8def-0000000000a2'),
  '018f0c7a-1234-7abc-8def-0000000000a3',
  'reference-less correction preserves the prior acquisition link'
);

select is(
  pg_temp.provenance_action(
    '018f0c7a-1234-7abc-8def-0000000000a5',
    'correct',
    'metals.correct/v1',
    pg_temp.correction_payload(
      '1',
      '018f0c7a-1234-7abc-8def-0000000000a4',
      'BAR',
      'BAR',
      '150000',
      '151000',
      jsonb_build_array(
        pg_temp.acquisition_snapshot(
          'acquisition_metal',
          'metal',
          'metal:GOLD',
          'usd_per_pure_gram',
          '018f0c7a-1234-7abc-8def-0000000000a7',
          '139.9466'
        ),
        pg_temp.acquisition_snapshot(
          'acquisition_purchase_currency',
          'currency',
          'currency:EGP',
          'usd_per_currency_unit',
          '018f0c7a-1234-7abc-8def-0000000000a8',
          '0.02'
        )
      )
    )
  ) ->> 'status',
  'accepted',
  'financial correction with acquisition references is accepted'
);

select is(
  (select acquisition_action_id::text from public.assets
   where id = '018f0c7a-1234-7abc-8def-0000000000a2'),
  '018f0c7a-1234-7abc-8def-0000000000a5',
  'correction with acquisition references replaces the acquisition link'
);

select is(
  pg_temp.provenance_action(
    '018f0c7a-1234-7abc-8def-0000000000a4',
    'correct',
    'metals.correct/v1',
    pg_temp.correction_payload(
      '0',
      '018f0c7a-1234-7abc-8def-0000000000a3',
      'JEWELRY',
      'BAR',
      '150000',
      '150000',
      '[]'::jsonb
    )
  ) ->> 'status',
  'idempotent',
  'older accepted correction replays idempotently'
);

select is(
  (select acquisition_action_id::text from public.assets
   where id = '018f0c7a-1234-7abc-8def-0000000000a2'),
  '018f0c7a-1234-7abc-8def-0000000000a5',
  'older replay cannot overwrite the newer acquisition link'
);

reset role;
update public.assets
set acquisition_action_id = null
where id = '018f0c7a-1234-7abc-8def-0000000000a2';
set local role authenticated;

select is(
  pg_temp.provenance_action(
    '018f0c7a-1234-7abc-8def-0000000000a6',
    'correct',
    'metals.correct/v1',
    pg_temp.correction_payload(
      '2',
      '018f0c7a-1234-7abc-8def-0000000000a5',
      'BAR',
      'COIN',
      '151000',
      '151000',
      '[]'::jsonb
    )
  ) ->> 'status',
  'accepted',
  'reference-less correction remains accepted with a legacy null link'
);

select ok(
  (select acquisition_action_id is null from public.assets
   where id = '018f0c7a-1234-7abc-8def-0000000000a2'),
  'legacy null acquisition link remains null without fabricated evidence'
);

reset role;
select * from finish();
rollback;
