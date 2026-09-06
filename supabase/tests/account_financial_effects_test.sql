begin;

select plan(38);

select has_column(
  'public', 'accounts', 'financial_revision',
  'accounts carry an authoritative financial revision'
);

select col_type_is(
  'public', 'accounts', 'financial_revision', 'bigint',
  'account revisions use PostgreSQL bigint'
);

select col_not_null(
  'public', 'accounts', 'financial_revision',
  'account revisions are never null'
);

select col_default_is(
  'public', 'accounts', 'financial_revision', '0',
  'legacy accounts enter the cutover at revision zero'
);

select has_table(
  'public', 'account_financial_effects',
  'immutable account financial effects exist'
);

select col_type_is(
  'public', 'account_financial_effects', 'amount_minor_units', 'bigint',
  'effect deltas use exact signed minor units'
);

select col_type_is(
  'public', 'account_financial_effects', 'accepted_account_revision', 'bigint',
  'accepted account revisions use bigint'
);

select col_not_null(
  'public', 'account_financial_effects', 'deleted',
  'effect retention marker is not nullable'
);

select col_default_is(
  'public', 'account_financial_effects', 'deleted', 'false',
  'effects are retained by default'
);

select has_index(
  'public', 'account_financial_effects',
  'account_financial_effects_user_action_account_kind_unique',
  'an action has at most one effect of each kind per account'
);

select has_index(
  'public', 'account_financial_effects',
  'account_financial_effects_reversal_once_unique',
  'an original effect can be reversed at most once'
);

select has_trigger(
  'public', 'accounts', 'accounts_protect_financial_columns',
  'account balances and revisions have a fail-closed write guard'
);

select has_trigger(
  'public', 'account_financial_effects', 'account_financial_effects_immutable',
  'effect identity and amounts are immutable'
);

select has_trigger(
  'public', 'financial_action_groups', 'financial_action_groups_effects_match_guards',
  'action roots defer guard/effect completeness validation'
);

select has_function(
  'private', 'financial_action_validate_account_guards_v1', array['jsonb'],
  'canonical account guard validation exists'
);

select has_function(
  'private', 'financial_action_account_effects_match_guards_v1', array['uuid','uuid'],
  'guard/effect parity validation exists'
);

select policies_are(
  'public', 'account_financial_effects',
  array['Users can select own account financial effects'],
  'authenticated owners have one read-only RLS policy'
);

select ok(
  has_table_privilege('authenticated', 'public.account_financial_effects', 'SELECT'),
  'authenticated clients can select effects'
);

select ok(
  not has_table_privilege('authenticated', 'public.account_financial_effects', 'INSERT'),
  'authenticated clients cannot insert effects directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.account_financial_effects', 'UPDATE'),
  'authenticated clients cannot update effects directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.account_financial_effects', 'DELETE'),
  'authenticated clients cannot delete effects directly'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.recalculate_all_account_balances()', 'EXECUTE'
  ),
  'legacy balance recalculation is unavailable to authenticated clients'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '018f0c7a-1234-7abc-8def-000000000201',
    'authenticated', 'authenticated', 'account-effects-owner@monyvi.test',
    'not-used', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '018f0c7a-1234-7abc-8def-000000000202',
    'authenticated', 'authenticated', 'account-effects-foreign@monyvi.test',
    'not-used', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.accounts (
  id, user_id, name, type, balance, currency, created_at, updated_at, deleted
) values
  (
    '018f0c7a-1234-7abc-8def-000000000211',
    '018f0c7a-1234-7abc-8def-000000000201',
    'Owner cash', 'CASH', 12.345, 'EGP', now(), now(), false
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000212',
    '018f0c7a-1234-7abc-8def-000000000202',
    'Foreign cash', 'CASH', 0, 'EGP', now(), now(), false
  );

select is(
  (
    select financial_revision
    from public.accounts
    where id = '018f0c7a-1234-7abc-8def-000000000211'
  ),
  0::bigint,
  'existing account state has revision zero without fabricated history'
);

select is(
  (
    select count(*)
    from public.account_financial_effects
    where account_id = '018f0c7a-1234-7abc-8def-000000000211'
  ),
  0::bigint,
  'revision-zero backfill fabricates no account effect'
);

select is(
  (
    select count(*)
    from public.financial_action_groups
    where user_id = '018f0c7a-1234-7abc-8def-000000000201'
  ),
  0::bigint,
  'revision-zero backfill fabricates no action root'
);

with root_input(action_id, user_id, domain_reference_id) as (
  values
    (
      '018f0c7a-1234-7abc-8def-000000000221'::uuid,
      '018f0c7a-1234-7abc-8def-000000000201'::uuid,
      '018f0c7a-1234-7abc-8def-000000000241'::uuid
    ),
    (
      '018f0c7a-1234-7abc-8def-000000000222'::uuid,
      '018f0c7a-1234-7abc-8def-000000000202'::uuid,
      '018f0c7a-1234-7abc-8def-000000000242'::uuid
    )
), envelopes as (
  select
    action_id,
    user_id,
    domain_reference_id,
    private.financial_action_encode_jsonb_v1(
      jsonb_build_object(
        'accountGuards', '[]'::jsonb,
        'actionId', action_id::text,
        'domain', 'metals',
        'domainReferenceId', domain_reference_id::text,
        'envelopeVersion', 'monyvi.financial-action/v1',
        'kind', 'sell',
        'occurredAt', '2026-08-31T10:15:30.123Z',
        'payload', jsonb_build_object(
          'feeMinorUnits', '0',
          'grossProceedsDecimal', '100',
          'holdingId', domain_reference_id::text,
          'includeAccountCredit', false,
          'netProceedsMinorUnits', '10000',
          'notes', 'account effect fixture',
          'rateReferenceIds', '[]'::jsonb
        ),
        'payloadVersion', 'metals.sell/v1',
        'userId', user_id::text
      )
    ) as payload_json
  from root_input
)
insert into public.financial_action_groups (
  id, action_id, user_id, domain, kind, domain_reference_id,
  payload_json, payload_hash, account_guards_json, state, deleted
)
select
  action_id,
  action_id,
  user_id,
  'metals',
  'sell',
  domain_reference_id,
  payload_json,
  encode(extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'), 'hex'),
  '[]'::jsonb,
  'sync_pending',
  false
from envelopes;

insert into public.account_financial_effects (
  id, user_id, action_id, account_id, domain, kind,
  amount_minor_units, currency, accepted_account_revision
) values (
  '018f0c7a-1234-7abc-8def-000000000231',
  '018f0c7a-1234-7abc-8def-000000000201',
  '018f0c7a-1234-7abc-8def-000000000221',
  '018f0c7a-1234-7abc-8def-000000000211',
  'metals', 'credit', 10000, 'EGP', 1
);

select lives_ok(
  $$select private.financial_action_account_effects_match_guards_v1(
    '018f0c7a-1234-7abc-8def-000000000202',
    '018f0c7a-1234-7abc-8def-000000000222'
  )$$,
  'an empty account-guard set has no account effects'
);

select throws_ok(
  $$select private.financial_action_account_effects_match_guards_v1(
    '018f0c7a-1234-7abc-8def-000000000201',
    '018f0c7a-1234-7abc-8def-000000000221'
  )$$,
  '23514', 'financial_action_account_effects_mismatch',
  'an effect without one matching account guard fails closed'
);

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"018f0c7a-1234-7abc-8def-000000000201","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '018f0c7a-1234-7abc-8def-000000000201',
    true
  );
end;
$$;

set local role authenticated;

select throws_ok(
  $$update public.accounts
    set balance = 99
    where id = '018f0c7a-1234-7abc-8def-000000000211'$$,
  '42501', 'account_financial_action_rpc_required',
  'mixed clients cannot overwrite authoritative balances'
);

select throws_ok(
  $$update public.accounts
    set financial_revision = 1
    where id = '018f0c7a-1234-7abc-8def-000000000211'$$,
  '42501', 'account_financial_action_rpc_required',
  'mixed clients cannot overwrite authoritative revisions'
);

select lives_ok(
  $$update public.accounts
    set name = 'Renamed owner cash'
    where id = '018f0c7a-1234-7abc-8def-000000000211'$$,
  'metadata-only account updates remain available'
);

select throws_ok(
  $$insert into public.account_financial_effects default values$$,
  '42501', null,
  'authenticated clients cannot bypass the action protocol with an effect insert'
);

reset role;

select throws_ok(
  $$insert into public.account_financial_effects (
      id, user_id, action_id, account_id, domain, kind,
      amount_minor_units, currency, accepted_account_revision
    ) values (
      '018f0c7a-1234-7abc-8def-000000000232',
      '018f0c7a-1234-7abc-8def-000000000202',
      '018f0c7a-1234-7abc-8def-000000000222',
      '018f0c7a-1234-7abc-8def-000000000211',
      'transactions', 'debit', -100, 'EGP', 1
    )$$,
  '23503', null,
  'effect ownership cannot diverge from the account owner'
);

select throws_ok(
  $$insert into public.account_financial_effects (
      id, user_id, action_id, account_id, domain, kind,
      amount_minor_units, currency, accepted_account_revision
    ) values (
      '018f0c7a-1234-7abc-8def-000000000233',
      '018f0c7a-1234-7abc-8def-000000000201',
      '018f0c7a-1234-7abc-8def-000000000221',
      '018f0c7a-1234-7abc-8def-000000000211',
      'metals', 'overflow_fixture', -9223372036854775808, 'EGP', 1
    )$$,
  '23514', null,
  'the non-invertible signed-bigint minimum is rejected'
);

select throws_ok(
  $$update public.account_financial_effects set amount_minor_units = 2$$,
  '22023', 'account_financial_effect_immutable',
  'server-side effect amounts cannot be rewritten'
);

select throws_ok(
  $$delete from public.account_financial_effects$$,
  '22023', 'account_financial_effect_delete_forbidden',
  'server-side effect evidence cannot be hard-deleted'
);

select throws_ok(
  $$select private.financial_action_validate_account_guards_v1(
    '[{"accountId":"018f0c7a-1234-7abc-8def-000000000212","expectedRevision":"0"},{"accountId":"018f0c7a-1234-7abc-8def-000000000211","expectedRevision":"0"}]'::jsonb
  )$$,
  '22023', 'financial_action_account_guards_invalid',
  'account guards must use canonical ascending account order'
);

select throws_ok(
  $$select private.financial_action_validate_account_guards_v1(
    '[{"accountId":"018f0c7a-1234-7abc-8def-000000000211","expectedRevision":"01"}]'::jsonb
  )$$,
  '22023', 'financial_action_account_guards_invalid',
  'account guard revisions reject leading zeroes'
);

select lives_ok(
  $$select private.financial_action_validate_account_guards_v1(
    '[{"accountId":"018f0c7a-1234-7abc-8def-000000000211","expectedRevision":"9223372036854775807"}]'::jsonb
  )$$,
  'maximum canonical guard revision parses without JavaScript rounding'
);

select * from finish();
rollback;
