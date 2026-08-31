begin;

select plan(65);

create or replace function pg_temp.valid_financial_action_envelope()
returns jsonb
language sql
immutable
as $$
  select '{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":[]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}'::jsonb
$$;

select has_table(
  'public',
  'financial_action_groups',
  'financial_action_groups exists'
);

select has_function(
  'private',
  'financial_action_canonical_json_v1',
  array['text'],
  'private canonicalizer exists'
);

select is(
  private.financial_action_canonical_json_v1(
    '{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}'
  ),
  '{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}',
  'Arabic vector remains canonical'
);

select is(
  encode(
    extensions.digest(
      convert_to(
        private.financial_action_canonical_json_v1(
          '{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'd9496846d80647644048c112aa501a2bf2985bc279445d82efdd96669b5718ab',
  'PostgreSQL digest matches TypeScript fixture'
);

select throws_ok(
  $$select private.financial_action_canonical_json_v1('{"userId":"018f0c7a-1234-7abc-8def-000000000003","actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1"}')$$,
  '22023',
  'financial_action_json_not_canonical',
  'reordered envelope keys are rejected'
);

select throws_ok(
  $$select private.financial_action_canonical_json_v1('{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"\u0630\u0647\u0628","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}')$$,
  '22023',
  'financial_action_json_not_canonical',
  'alternate string escapes are rejected at SQL boundary'
);

select throws_ok(
  $$select private.financial_action_canonical_json_v1('{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":35500,"holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":[]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}')$$,
  '22023',
  'financial_action_json_number_forbidden',
  'JSON numbers are rejected'
);

select throws_ok(
  $$select private.financial_action_canonical_json_v1('{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":[]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}')$$,
  '22023',
  'financial_action_json_duplicate_key',
  'duplicate raw keys are rejected'
);

select throws_ok(
  $$insert into public.financial_action_groups (id, action_id, user_id, domain, kind, domain_reference_id, payload_json, payload_hash, expected_account_revision, state, deleted) values ('018f0c7a-1234-7abc-8def-000000000001','018f0c7a-1234-7abc-8def-000000000001','018f0c7a-1234-7abc-8def-000000000003','metals','sell','018f0c7a-1234-7abc-8def-000000000002','{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}','bad',null,'sync_pending',false)$$,
  '23514',
  null,
  'invalid payload hash is rejected'
);

select col_is_null(
  'public',
  'financial_action_groups',
  'expected_account_revision',
  'expected account revision remains nullable in foundation'
);

select col_type_is(
  'public',
  'financial_action_groups',
  'expected_account_revision',
  'text',
  'expected account revision preserves exact decimal text'
);

select has_trigger(
  'public',
  'financial_action_groups',
  'financial_action_groups_assert_root_binding',
  'canonical envelope is bound to root columns'
);

select throws_ok(
  $$insert into public.financial_action_groups (id, action_id, user_id, domain, kind, domain_reference_id, payload_json, payload_hash, expected_account_revision, state, deleted) values ('018f0c7a-1234-7abc-8def-000000000001','018f0c7a-1234-7abc-8def-000000000001','018f0c7a-1234-7abc-8def-000000000099','metals','sell','018f0c7a-1234-7abc-8def-000000000002','{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}','d9496846d80647644048c112aa501a2bf2985bc279445d82efdd96669b5718ab',null,'sync_pending',false)$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'root user id cannot diverge from canonical envelope'
);

select policies_are(
  'public',
  'financial_action_groups',
  array['Users can select own financial action groups'],
  'authenticated owners have read-only RLS access'
);

select has_index(
  'public',
  'financial_action_groups',
  'financial_action_groups_user_action_unique',
  'owner-scoped action identity is unique'
);

select has_function(
  'private',
  'financial_action_validate_registered_payload_v1',
  array['jsonb'],
  'registered action dispatcher exists'
);

select throws_ok(
  $$select private.financial_action_validate_registered_payload_v1('{"domain":"metals","kind":"dispose","payload":{},"payloadVersion":"metals.dispose/v1"}'::jsonb)$$,
  '22023',
  'financial_action_unknown_definition',
  'unknown action tuples fail closed'
);

select throws_ok(
  $$select private.financial_action_assert_transition_v1('accepted','sync_pending')$$,
  '22023',
  'financial_action_invalid_transition',
  'terminal states cannot transition'
);

select throws_ok(
  $$select private.financial_action_validate_state_evidence_v1('accepted','accepted',null,null)$$,
  '22023',
  'financial_action_invalid_state_evidence',
  'accepted state requires canonical durable outcome evidence'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{actionId}', 'null'::jsonb))$$,
  '22023',
  'financial_action_invalid_envelope',
  'null required envelope string is rejected stably'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{kind}', 'true'::jsonb))$$,
  '22023',
  'financial_action_invalid_envelope',
  'wrong envelope scalar type is rejected stably'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,feeMinorUnits}', 'null'::jsonb))$$,
  '22023',
  'financial_action_invalid_payload',
  'null required payload string is rejected stably'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload}', '[]'::jsonb))$$,
  '22023',
  'financial_action_invalid_payload',
  'wrong payload container is rejected without internal error'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,rateReferenceIds}', '{}'::jsonb))$$,
  '22023',
  'financial_action_invalid_payload',
  'wrong rate-reference container is rejected without internal error'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,rateReferenceIds}', '[true]'::jsonb))$$,
  '22023',
  'financial_action_invalid_payload',
  'wrong rate-reference scalar is rejected stably'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,grossProceedsDecimal}', to_jsonb('0'::text)))$$,
  '22023',
  'financial_action_invalid_payload',
  'zero gross proceeds are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,grossProceedsDecimal}', to_jsonb('-1'::text)))$$,
  '22023',
  'financial_action_invalid_payload',
  'negative gross proceeds are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,grossProceedsDecimal}', to_jsonb(repeat('1', 51))))$$,
  '22023',
  'financial_action_invalid_payload',
  'gross proceeds above the digit cap are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,grossProceedsDecimal}', to_jsonb('1.' || repeat('1', 19))))$$,
  '22023',
  'financial_action_invalid_payload',
  'gross proceeds above the scale cap are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,feeMinorUnits}', to_jsonb('-1'::text)))$$,
  '22023',
  'financial_action_invalid_payload',
  'negative fee minor units are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,netProceedsMinorUnits}', to_jsonb('-1'::text)))$$,
  '22023',
  'financial_action_invalid_payload',
  'negative net minor units are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,notes}', to_jsonb(repeat('a', 4097))))$$,
  '22023',
  'financial_action_invalid_payload',
  'notes above the UTF-8 byte cap are rejected'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1(jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,rateReferenceIds}', (select jsonb_agg(to_jsonb('018f0c7a-1234-7abc-8def-000000000005'::text)) from generate_series(1, 17))))$$,
  '22023',
  'financial_action_invalid_payload',
  'too many rate references are rejected'
);

select throws_ok(
  $$select private.financial_action_canonical_json_v1(repeat(' ', 65537))$$,
  '22023',
  'financial_action_payload_too_large',
  'oversize raw action text is rejected before parsing'
);

select lives_ok(
  $$select private.financial_action_validate_envelope_v1(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(pg_temp.valid_financial_action_envelope(), '{payload,grossProceedsDecimal}', to_jsonb(repeat('1', 32) || '.' || repeat('1', 18))),
            '{payload,feeMinorUnits}', to_jsonb(repeat('9', 50))
          ),
          '{payload,netProceedsMinorUnits}', to_jsonb(repeat('9', 50))
        ),
        '{payload,notes}', to_jsonb(repeat('a', 4096))
      ),
      '{payload,rateReferenceIds}', (select jsonb_agg(to_jsonb('018f0c7a-1234-7abc-8def-000000000005'::text)) from generate_series(1, 16))
    )
  )$$,
  'exact payload bounds are accepted'
);

select has_function(
  'private',
  'financial_action_assert_evidence_update_v1',
  array['text','text','text','text','text','text','text','text'],
  'terminal evidence update guard exists'
);

select throws_ok(
  $$select private.financial_action_assert_evidence_update_v1('accepted','accepted','{}',null,'accepted','accepted','{}','changed')$$,
  '22023',
  'financial_action_immutable_outcome_evidence',
  'accepted rejection evidence cannot change in place'
);

select throws_ok(
  $$select private.financial_action_assert_evidence_update_v1('rejected_compensating','rejected','{}','rejected_action','rejected_compensating','rejected','{}','changed')$$,
  '22023',
  'financial_action_immutable_outcome_evidence',
  'rejected rejection evidence cannot change in place'
);

select throws_ok(
  $$select private.financial_action_assert_evidence_update_v1('reconciled','stale','{}','stale_revision','reconciled','stale','{}','changed')$$,
  '22023',
  'financial_action_immutable_outcome_evidence',
  'reconciled rejection evidence cannot change in place'
);

select lives_ok(
  $$select private.financial_action_assert_evidence_update_v1('sync_failed',null,null,'offline','sync_pending',null,null,null)$$,
  'retry transition may clear transport rejection without outcome evidence'
);

select lives_ok(
  $$select private.financial_action_assert_evidence_update_v1('reconciliation_incomplete','accepted','{"receipt":"same"}','local_apply_failed','accepted','accepted','{"receipt":"same"}',null)$$,
  'reconciliation may clear rejection for identical accepted evidence'
);

select lives_ok(
  $$select private.financial_action_assert_evidence_update_v1('reconciliation_incomplete','idempotent','{"receipt":"same"}','local_apply_failed','accepted','idempotent','{"receipt":"same"}',null)$$,
  'reconciliation may clear rejection for identical idempotent evidence'
);

select throws_ok(
  $$select private.financial_action_assert_evidence_update_v1('reconciliation_incomplete','accepted','{"receipt":"same"}','local_apply_failed','accepted','accepted','{"receipt":"changed"}',null)$$,
  '22023',
  'financial_action_immutable_outcome_evidence',
  'reconciliation cannot change accepted outcome bytes'
);

select throws_ok(
  $$select private.financial_action_assert_evidence_update_v1('reconciliation_incomplete','accepted','{"receipt":"same"}','local_apply_failed','accepted','idempotent','{"receipt":"same"}',null)$$,
  '22023',
  'financial_action_immutable_outcome_evidence',
  'reconciliation cannot change accepted server outcome'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '018f0c7a-1234-7abc-8def-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'financial-action-owner@monyvi.test',
    'not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '018f0c7a-1234-7abc-8def-000000000013',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'financial-action-foreign@monyvi.test',
    'not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
select lives_ok(
  $insert$
    with envelopes(payload_json) as (
      values
        (private.financial_action_encode_jsonb_v1(pg_temp.valid_financial_action_envelope())),
        (private.financial_action_encode_jsonb_v1(
          jsonb_set(
            jsonb_set(
              pg_temp.valid_financial_action_envelope(),
              '{actionId}',
              to_jsonb('018f0c7a-1234-7abc-8def-000000000011'::text)
            ),
            '{userId}',
            to_jsonb('018f0c7a-1234-7abc-8def-000000000013'::text)
          )
        ))
    )
    insert into public.financial_action_groups (
      action_id,
      user_id,
      domain,
      kind,
      domain_reference_id,
      payload_json,
      payload_hash,
      expected_account_revision,
      state,
      deleted
    )
    select
      (payload_json::jsonb ->> 'actionId')::uuid,
      (payload_json::jsonb ->> 'userId')::uuid,
      payload_json::jsonb ->> 'domain',
      payload_json::jsonb ->> 'kind',
      (payload_json::jsonb ->> 'domainReferenceId')::uuid,
      payload_json,
      encode(
        extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'),
        'hex'
      ),
      null,
      'pending_local',
      false
    from envelopes
  $insert$,
  'permitted server test role can insert valid roots'
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

SET LOCAL ROLE authenticated;

select is(
  (
    select count(*)
    from public.financial_action_groups
    where action_id = '018f0c7a-1234-7abc-8def-000000000001'
  ),
  1::bigint,
  'authenticated owner can select its root'
);

select is(
  (
    select count(*)
    from public.financial_action_groups
    where action_id = '018f0c7a-1234-7abc-8def-000000000011'
  ),
  0::bigint,
  'authenticated owner cannot see a foreign root'
);

select throws_ok(
  $$insert into public.financial_action_groups default values$$,
  '42501',
  null,
  'authenticated insert is denied'
);

select throws_ok(
  $$update public.financial_action_groups set state = 'local_complete' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '42501',
  null,
  'authenticated update is denied'
);

select throws_ok(
  $$delete from public.financial_action_groups where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '42501',
  null,
  'authenticated delete is denied'
);

select throws_ok(
  $$select private.financial_action_canonical_json_v1('{}')$$,
  '42501',
  null,
  'private canonicalizer execution is denied'
);

select throws_ok(
  $$select private.financial_action_assert_transition_v1('pending_local', 'local_complete')$$,
  '42501',
  null,
  'private state execution is denied'
);

select throws_ok(
  $$select private.financial_action_validate_envelope_v1('{}'::jsonb)$$,
  '42501',
  null,
  'private helper execution is denied'
);

RESET ROLE;

do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

select throws_ok(
  $$delete from public.financial_action_groups where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_delete_forbidden',
  'server-side hard delete of a durable root is rejected'
);

select throws_ok(
  $$delete from auth.users where id = '018f0c7a-1234-7abc-8def-000000000003'$$,
  '22023',
  'financial_action_root_delete_forbidden',
  'owner cascade cannot delete durable action roots'
);

select throws_ok(
  $$update public.financial_action_groups set action_id = '018f0c7a-1234-7abc-8def-000000000091' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'update action_id is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set user_id = '018f0c7a-1234-7abc-8def-000000000092' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'update user_id is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set domain = 'transactions' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'update domain is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set kind = 'dispose' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'update kind is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set domain_reference_id = '018f0c7a-1234-7abc-8def-000000000093' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'update domain_reference_id is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set payload_json = private.financial_action_encode_jsonb_v1(jsonb_set(payload_json::jsonb, '{payload,notes}', to_jsonb('changed'::text))) where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_immutable_root_mismatch',
  'update payload_json is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set payload_hash = repeat('0', 64) where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_immutable_root_mismatch',
  'update payload_hash is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set expected_account_revision = '1' where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_binding_mismatch',
  'update expected_account_revision is rejected'
);

select throws_ok(
  $$update public.financial_action_groups set deleted = true where action_id = '018f0c7a-1234-7abc-8def-000000000001'$$,
  '22023',
  'financial_action_root_delete_forbidden',
  'update deleted is rejected'
);

select is(
  (
    select count(*)
    from public.financial_action_groups
    where action_id = '018f0c7a-1234-7abc-8def-000000000001'
      and user_id = '018f0c7a-1234-7abc-8def-000000000003'
      and domain = 'metals'
      and kind = 'sell'
      and domain_reference_id = '018f0c7a-1234-7abc-8def-000000000002'
      and payload_json = private.financial_action_encode_jsonb_v1(
        pg_temp.valid_financial_action_envelope()
      )
      and payload_hash = encode(
        extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'),
        'hex'
      )
      and expected_account_revision is null
      and deleted = false
  ),
  1::bigint,
  'failed immutable updates leave the root unchanged'
);

select * from finish();
rollback;
