-- #395 T066: account.create-default/v1 strict default/absence CAS.
-- Expected RED until the approved 090/091 implementation registers the tuple.
-- Isolated pgTAP; canonical hashes generated before SET LOCAL ROLE authenticated.
BEGIN;
SELECT no_plan();

CREATE FUNCTION pg_temp.d395_id(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('39a60000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

INSERT INTO auth.users
  (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
SELECT pg_temp.d395_id(n), 'authenticated', 'authenticated',
  'sql395-default-' || n || '@monyvi.test', 'unused', '{}', '{}'
FROM generate_series(1, 15) AS owners(n);

INSERT INTO public.accounts
  (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
VALUES
  (pg_temp.d395_id(101),pg_temp.d395_id(1),'Default A','CASH',100,'EGP',0,true,false),
  (pg_temp.d395_id(102),pg_temp.d395_id(1),'Other Account','BANK',25,'EGP',0,false,false),
  (pg_temp.d395_id(251),pg_temp.d395_id(2),'V1 Default','CASH',50,'EGP',0,true,false),
  (pg_temp.d395_id(301),pg_temp.d395_id(3),'Default C','CASH',30,'EGP',0,true,false),
  (pg_temp.d395_id(501),pg_temp.d395_id(5),'No Default Yet','CASH',0,'EGP',0,false,false),
  (pg_temp.d395_id(601),pg_temp.d395_id(6),'Historical A','CASH',20,'EGP',0,true,false),
  (pg_temp.d395_id(602),pg_temp.d395_id(6),'Historical B','CASH',10,'EGP',0,false,false),
  (pg_temp.d395_id(701),pg_temp.d395_id(7),'Stale Default A','CASH',20,'EGP',0,true,false),
  (pg_temp.d395_id(702),pg_temp.d395_id(7),'Stale Default B','CASH',10,'EGP',0,false,false),
  (pg_temp.d395_id(801),pg_temp.d395_id(8),'Original No Default','CASH',0,'EGP',0,false,false),
  (pg_temp.d395_id(901),pg_temp.d395_id(9),'Collision Prior Default','CASH',30,'EGP',0,true,false),
  (pg_temp.d395_id(910),pg_temp.d395_id(10),'Foreign Occupied ID','CASH',90,'EGP',0,true,false),
  (pg_temp.d395_id(911),pg_temp.d395_id(9),'Deleted Occupied ID','CASH',0,'EGP',0,false,true),
  (pg_temp.d395_id(1101),pg_temp.d395_id(11),'Sender Parent','BANK',15,'EGP',0,true,false),
  (pg_temp.d395_id(1201),pg_temp.d395_id(12),'Conflict Prior Default','CASH',20,'EGP',0,true,false),
  (pg_temp.d395_id(1203),pg_temp.d395_id(12),'Already Used','CASH',10,'EGP',0,false,false),
  (pg_temp.d395_id(1301),pg_temp.d395_id(13),'Owned Not Foreign','CASH',5,'EGP',0,true,false),
  (pg_temp.d395_id(1501),pg_temp.d395_id(15),'Existing No Default','CASH',0,'EGP',0,false,false);

INSERT INTO public.account_sms_senders
  (id, account_id, sender_name, normalized_sender_name, deleted)
VALUES (pg_temp.d395_id(1102), pg_temp.d395_id(1101), 'Existing',
  'existing', false);

CREATE FUNCTION pg_temp.d395_snapshot(p_active jsonb, p_default uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'activeAccountIds', p_active,
    'defaultAccount', CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId', p_default, 'isDefault', true) END)
$$;

CREATE FUNCTION pg_temp.d395_account(p_id uuid, p_name text, p_type text,
  p_default boolean, p_opening text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'entity', 'account', 'mode', 'create', 'expectedUpdatedAt', null,
    'after', jsonb_build_object(
      'id',p_id,'name',p_name,'type',p_type,'currency','EGP',
      'institutionId',null,'providerDisplayName',null,'isDefault',p_default,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false,
      'openingBalanceMinorUnits',p_opening,'targetBalanceMinorUnits',null))
$$;

CREATE FUNCTION pg_temp.d395_clear(p_previous uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('entity','account_default','mode','update',
    'expectedIsDefault',true,'after',jsonb_build_object(
      'id',p_previous,'isDefault',false))
$$;

CREATE FUNCTION pg_temp.d395_sender(p_id uuid, p_account uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'entity','account_sms_sender','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_id,'accountId',p_account,'senderName','QNB',
      'normalizedSenderName','qnb','createdAt','2026-09-01T12:00:00.000Z',
      'deleted',false))
$$;

CREATE FUNCTION pg_temp.d395_bank(p_id uuid, p_account uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'entity','bank_details','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_id,'accountId',p_account,'accountNumber',null,
      'cardLast4','0007','createdAt','2026-09-01T12:00:00.000Z',
      'deleted',false))
$$;

CREATE FUNCTION pg_temp.d395_guard(p_id uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'expectedRevision','0')
$$;

CREATE FUNCTION pg_temp.d395_effect(p_id uuid, p_minor text, p_effect_id uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId',p_id,'amountMinorUnits',p_minor,
    'currency','EGP','effectId',p_effect_id)
$$;

-- Exact frozen tuple; derived refs/guards are sorted, not guessed signatures.
CREATE FUNCTION pg_temp.d395_envelope(
  p_action uuid, p_owner uuid, p_records jsonb, p_snapshot jsonb,
  p_intent boolean, p_guards jsonb, p_effects jsonb
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner,'actionId',p_action,
    'domain','accounts','kind','create_with_default',
    'domainReferenceId',(
      SELECT (r.value->'after'->>'id')::uuid
      FROM jsonb_array_elements(p_records) AS r(value)
      WHERE r.value->>'entity'='account' AND r.value->>'mode'='create'
      LIMIT 1),
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.create-default/v1',
    'accountGuards',p_guards,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1',
      'operationCode','account.create-default',
      'defaultIntent',p_intent,'expectedDefaultSnapshot',p_snapshot,
      'createGuards',COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'entity',r.value->>'entity','id',r.value->'after'->>'id','expectedAbsent',true)
          ORDER BY ((r.value->>'entity')||':'||(r.value->'after'->>'id')) COLLATE "C")
        FROM jsonb_array_elements(p_records) AS r(value)
        WHERE r.value->>'mode'='create'),'[]'::jsonb),
      'accountEffects',p_effects,
      'domainRecordRefs',COALESCE((
        SELECT jsonb_agg(r.value->'after'->>'id'
          ORDER BY (r.value->'after'->>'id') COLLATE "C")
        FROM jsonb_array_elements(p_records) AS r(value)),'[]'::jsonb),
      'domainMutation',jsonb_build_object('records',p_records)))
$$;

CREATE FUNCTION pg_temp.d395_legacy(p_action uuid, p_new uuid, p_opening text,
  p_effect uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'accountGuards',jsonb_build_array(pg_temp.d395_guard(p_new)),
    'actionId',p_action,'domain','accounts','domainReferenceId',p_new,
    'envelopeVersion','monyvi.financial-action/v1','kind','create',
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.balance-effects/v1',
    'userId',pg_temp.d395_id(2),
    'payload',jsonb_build_object(
      'schemaVersion','account.balance-effects/v1',
      'operationCode','account.create',
      'domainRecordRefs',jsonb_build_array(p_new),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        pg_temp.d395_account(p_new,'Legacy V1 New','CASH',false,p_opening))),
      'accountEffects',jsonb_build_array(
        pg_temp.d395_effect(p_new,p_opening,p_effect))))
$$;

CREATE TEMP TABLE default_inputs (
  case_name text PRIMARY KEY, owner_n integer NOT NULL, envelope jsonb NOT NULL,
  payload_json text, payload_hash text
);
CREATE TEMP TABLE default_outcomes (case_name text PRIMARY KEY, outcome jsonb);

INSERT INTO default_inputs(case_name,owner_n,envelope) VALUES
  ('v1_nonzero',2,pg_temp.d395_legacy(
    pg_temp.d395_id(2001),pg_temp.d395_id(252),'1000',pg_temp.d395_id(4001))),
  ('v1_zero_rejected',2,pg_temp.d395_legacy(
    pg_temp.d395_id(2002),pg_temp.d395_id(253),'0',pg_temp.d395_id(4002))),
  ('zero_on',1,pg_temp.d395_envelope(
    pg_temp.d395_id(2101),pg_temp.d395_id(1),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(201),'New Default Bank','BANK',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(101)),
      pg_temp.d395_sender(pg_temp.d395_id(202),pg_temp.d395_id(201)),
      pg_temp.d395_bank(pg_temp.d395_id(203),pg_temp.d395_id(201))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(101),pg_temp.d395_id(102)),
      pg_temp.d395_id(101)),true,'[]'::jsonb,'[]'::jsonb)),
  ('nonzero_off',3,pg_temp.d395_envelope(
    pg_temp.d395_id(2103),pg_temp.d395_id(3),
    jsonb_build_array(pg_temp.d395_account(
      pg_temp.d395_id(302),'Later Cash','CASH',false,'1001')),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(301)),pg_temp.d395_id(301)),
    false,jsonb_build_array(pg_temp.d395_guard(pg_temp.d395_id(302))),
    jsonb_build_array(pg_temp.d395_effect(
      pg_temp.d395_id(302),'1001',pg_temp.d395_id(4103))))),
  ('first_zero',4,pg_temp.d395_envelope(
    pg_temp.d395_id(2104),pg_temp.d395_id(4),
    jsonb_build_array(pg_temp.d395_account(
      pg_temp.d395_id(401),'First Account','CASH',true,'0')),
    pg_temp.d395_snapshot('[]'::jsonb,null),false,'[]'::jsonb,'[]'::jsonb)),
  ('no_default_on',5,pg_temp.d395_envelope(
    pg_temp.d395_id(2105),pg_temp.d395_id(5),
    jsonb_build_array(pg_temp.d395_account(
      pg_temp.d395_id(502),'New Current Default','CASH',true,'0')),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(501)),null),
    true,'[]'::jsonb,'[]'::jsonb)),
  ('aba_same_state',6,pg_temp.d395_envelope(
    pg_temp.d395_id(2106),pg_temp.d395_id(6),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(603),'After ABA','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(601))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(601),pg_temp.d395_id(602)),
      pg_temp.d395_id(601)),true,'[]'::jsonb,'[]'::jsonb)),
  ('default_changed',7,pg_temp.d395_envelope(
    pg_temp.d395_id(2107),pg_temp.d395_id(7),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(703),'Stale Attempt','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(701))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(701),pg_temp.d395_id(702)),
      pg_temp.d395_id(701)),true,'[]'::jsonb,'[]'::jsonb)),
  ('active_set_changed',8,pg_temp.d395_envelope(
    pg_temp.d395_id(2108),pg_temp.d395_id(8),
    jsonb_build_array(pg_temp.d395_account(
      pg_temp.d395_id(803),'New With Stale Set','CASH',false,'0')),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(801)),null),
    false,'[]'::jsonb,'[]'::jsonb)),
  ('foreign_id_collision',9,pg_temp.d395_envelope(
    pg_temp.d395_id(2109),pg_temp.d395_id(9),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(910),'Foreign ID Attempt','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(901))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(901)),pg_temp.d395_id(901)),
    true,'[]'::jsonb,'[]'::jsonb)),
  ('deleted_id_collision',9,pg_temp.d395_envelope(
    pg_temp.d395_id(2110),pg_temp.d395_id(9),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(911),'Deleted ID Attempt','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(901))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(901)),pg_temp.d395_id(901)),
    true,'[]'::jsonb,'[]'::jsonb)),
  ('child_id_collision',11,pg_temp.d395_envelope(
    pg_temp.d395_id(2111),pg_temp.d395_id(11),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(1103),'Sender Collision','BANK',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(1101)),
      pg_temp.d395_sender(pg_temp.d395_id(1102),pg_temp.d395_id(1103))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(1101)),pg_temp.d395_id(1101)),
    true,'[]'::jsonb,'[]'::jsonb)),
  ('name_conflict_rollback',12,pg_temp.d395_envelope(
    pg_temp.d395_id(2112),pg_temp.d395_id(12),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(1202),'Already Used','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(1201))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(1201),pg_temp.d395_id(1203)),
      pg_temp.d395_id(1201)),true,'[]'::jsonb,'[]'::jsonb)),
  ('foreign_snapshot',13,pg_temp.d395_envelope(
    pg_temp.d395_id(2113),pg_temp.d395_id(13),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(1302),'Wrong Owner Guard','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(910))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(910)),pg_temp.d395_id(910)),
    true,'[]'::jsonb,'[]'::jsonb)),
  ('wrong_clear',3,pg_temp.d395_envelope(
    pg_temp.d395_id(2114),pg_temp.d395_id(3),
    jsonb_build_array(
      pg_temp.d395_account(pg_temp.d395_id(304),'Wrong Default Clear','CASH',true,'0'),
      pg_temp.d395_clear(pg_temp.d395_id(302))),
    pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(301),pg_temp.d395_id(302)),
      pg_temp.d395_id(301)),true,'[]'::jsonb,'[]'::jsonb));

-- Add has its own unchanged expectedDefaultSnapshot/defaultIntent tuple;
-- unlike Review, an ordinary zero-opening Add must never carry a review-only
-- creationDefaultSnapshot field. New first-active Wallet uses no BANK child.
INSERT INTO default_inputs(case_name,owner_n,envelope) VALUES
 ('first_wallet',14,pg_temp.d395_envelope(
   pg_temp.d395_id(2115),pg_temp.d395_id(14),
   jsonb_build_array(pg_temp.d395_account(
     pg_temp.d395_id(1401),'First Wallet','DIGITAL_WALLET',true,'0')),
   pg_temp.d395_snapshot('[]'::jsonb,null),false,'[]'::jsonb,'[]'::jsonb)),
 ('no_default_off',15,pg_temp.d395_envelope(
   pg_temp.d395_id(2116),pg_temp.d395_id(15),
   jsonb_build_array(pg_temp.d395_account(
     pg_temp.d395_id(1502),'Later No Default Cash','CASH',false,'0')),
   pg_temp.d395_snapshot(jsonb_build_array(pg_temp.d395_id(1501)),null),
   false,'[]'::jsonb,'[]'::jsonb)),
 ('missing_bank_child',1,pg_temp.d395_envelope(
   pg_temp.d395_id(2210),pg_temp.d395_id(1),
   jsonb_build_array(
     pg_temp.d395_account(pg_temp.d395_id(201),'New Default Bank','BANK',true,'0'),
     pg_temp.d395_clear(pg_temp.d395_id(101)),
     pg_temp.d395_sender(pg_temp.d395_id(202),pg_temp.d395_id(201))),
   pg_temp.d395_snapshot(jsonb_build_array(
     pg_temp.d395_id(101),pg_temp.d395_id(102)),pg_temp.d395_id(101)),
   true,'[]'::jsonb,'[]'::jsonb));

INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'add_missing_snapshot',1,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2201))),
  '{payload}',((envelope->'payload') - 'expectedDefaultSnapshot'::text))
FROM default_inputs WHERE case_name='zero_on';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'add_review_snapshot_key',1,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2202))),
  '{payload}',((envelope->'payload') - 'expectedDefaultSnapshot'::text) ||
    jsonb_build_object('creationDefaultSnapshot',
      envelope->'payload'->'expectedDefaultSnapshot'))
FROM default_inputs WHERE case_name='zero_on';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'add_missing_default_intent',1,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2203))),
  '{payload}',((envelope->'payload') - 'defaultIntent'::text))
FROM default_inputs WHERE case_name='zero_on';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'add_extra_creation_snapshot',1,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2204))),
  '{payload}',(envelope->'payload') ||
    jsonb_build_object('creationDefaultSnapshot',
      envelope->'payload'->'expectedDefaultSnapshot'))
FROM default_inputs WHERE case_name='zero_on';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'add_forged_zero_effect',1,
  jsonb_set(jsonb_set(
    jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2205))),
    '{accountGuards}',jsonb_build_array(
      pg_temp.d395_guard(pg_temp.d395_id(201)))),
    '{payload,accountEffects}',jsonb_build_array(
      pg_temp.d395_effect(pg_temp.d395_id(201),'1',pg_temp.d395_id(4205))))
FROM default_inputs WHERE case_name='zero_on';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'first_missing_default',4,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2206))),
  '{payload,domainMutation,records,0,after,isDefault}','false'::jsonb)
FROM default_inputs WHERE case_name='first_zero';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'off_wrong_default',3,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2207))),
  '{payload,domainMutation,records,0,after,isDefault}','true'::jsonb)
FROM default_inputs WHERE case_name='nonzero_off';
INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'wallet_with_bank_child',14,jsonb_set(
  jsonb_set(envelope,'{actionId}',to_jsonb(pg_temp.d395_id(2208))),
  '{payload,domainMutation,records}',jsonb_build_array(
    pg_temp.d395_account(pg_temp.d395_id(1401),'First Wallet',
      'DIGITAL_WALLET',true,'0'),
    pg_temp.d395_bank(pg_temp.d395_id(1402),pg_temp.d395_id(1401))))
FROM default_inputs WHERE case_name='first_wallet';
UPDATE default_inputs SET envelope=jsonb_set(jsonb_set(envelope,
  '{payload,createGuards}',jsonb_build_array(
    jsonb_build_object('entity','account','id',pg_temp.d395_id(1401),'expectedAbsent',true),
    jsonb_build_object('entity','bank_details','id',pg_temp.d395_id(1402),'expectedAbsent',true))),
  '{payload,domainRecordRefs}',jsonb_build_array(pg_temp.d395_id(1401),pg_temp.d395_id(1402)))
WHERE case_name='wallet_with_bank_child';

INSERT INTO default_inputs(case_name,owner_n,envelope)
SELECT 'same_action_changed_payload',1,
  jsonb_set(envelope,'{payload,domainMutation,records,0,after,name}',
    '"Changed Immutable Name"')
FROM default_inputs WHERE case_name='zero_on';

UPDATE default_inputs SET payload_json=private.financial_action_encode_jsonb_v1(envelope);
UPDATE default_inputs SET payload_hash=
  encode(extensions.digest(convert_to(payload_json,'UTF8'),'sha256'),'hex');

CREATE FUNCTION pg_temp.d395_use_owner(p_n integer) RETURNS void
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',pg_temp.d395_id(p_n)::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',pg_temp.d395_id(p_n),'role','authenticated')::text,true);
END
$$;

GRANT SELECT ON default_inputs TO authenticated;
GRANT SELECT, INSERT ON default_outcomes TO authenticated;
SET LOCAL ROLE authenticated;

-- V1 positive before every new-version assertion, including old zero rejection.
SELECT pg_temp.d395_use_owner(2);
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='v1_nonzero';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='v1_nonzero'),
  'accepted','legacy accounts/create tuple remains accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.d395_id(252)),
  10::numeric,'legacy new account posts exact opening 10 once');
SELECT is((SELECT financial_revision FROM public.accounts WHERE id=pg_temp.d395_id(252)),
  1::bigint,'legacy opening increments financial revision once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.d395_id(2001) AND amount_minor_units=1000 AND is_effective),
  1::bigint,'legacy opening retains one immutable nonzero effect');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM default_inputs WHERE case_name='v1_nonzero'),
  'idempotent','legacy account create replay remains idempotent');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM default_inputs WHERE case_name='v1_zero_rejected'),
  'rejected','legacy accounts/create zero opening remains rejected');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(253)),
  0::bigint,'legacy zero create leaves account absent');

-- Add v1 and zero/nonzero baselines remain unchanged; all new contract
-- negatives are executed before their corresponding valid action to avoid
-- accidentally testing only occupied create IDs.
-- Owner1: A default, B active is a positive current logical-state baseline.
SELECT pg_temp.d395_use_owner(1);
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name IN (
  'add_missing_snapshot','add_review_snapshot_key',
  'add_missing_default_intent','add_extra_creation_snapshot',
  'add_forged_zero_effect','missing_bank_child'
);
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='add_missing_snapshot'),
  'Add requires its expectedDefaultSnapshot when creating an account');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='add_review_snapshot_key'),
  'review creationDefaultSnapshot cannot replace Add expectedDefaultSnapshot');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='add_missing_default_intent'),
  'Add requires explicit defaultIntent rather than a default inferred from metadata');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='add_extra_creation_snapshot'),
  'Add rejects the review-only creationDefaultSnapshot unexpected key');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='add_forged_zero_effect'),
  'zero-opening Add cannot manufacture a one-minor-unit financial effect');
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='missing_bank_child'),
  'Add BANK requires a bank_details child, not just an account and sender');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(201)),
  0::bigint,'invalid Add cases never create the otherwise valid default Bank');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(1)
  AND NOT deleted AND is_default),pg_temp.d395_id(101),
  'invalid Add cases retain the old default before the good action');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.d395_id(2205)),0::bigint,
  'invalid zero-opening Add leaves no financial action effect');
SELECT is((SELECT count(*) FROM public.accounts WHERE user_id=pg_temp.d395_id(1)
  AND NOT deleted),2::bigint,'zero ON baseline has exactly two active accounts');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(1)
  AND is_default AND NOT deleted),pg_temp.d395_id(101),
  'zero ON baseline has exactly A as default');
SELECT is((SELECT jsonb_array_length(envelope->'accountGuards')
  FROM default_inputs WHERE case_name='zero_on'),0,
  'zero opening action intentionally has no financial account guards');
SELECT is((SELECT jsonb_array_length(envelope->'payload'->'accountEffects')
  FROM default_inputs WHERE case_name='zero_on'),0,
  'zero opening action intentionally has no financial effects');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='zero_on';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='zero_on'),
  'accepted','new zero-opening default tuple registered (expected RED before 089)');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(201)
  AND user_id=pg_temp.d395_id(1) AND balance=0 AND financial_revision=0
  AND is_default AND NOT deleted),1::bigint,
  'new default account creates at zero balance with revision zero');
SELECT is((SELECT is_default FROM public.accounts WHERE id=pg_temp.d395_id(101)),
  false,'successful default ON clears only captured old default');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d395_id(203)
  AND account_id=pg_temp.d395_id(201) AND card_last_4=7 AND NOT deleted),1::bigint,
  'zero-opening bank child persisted once with 0007 suffix');
SELECT is((SELECT count(*) FROM public.account_sms_senders WHERE id=pg_temp.d395_id(202)
  AND account_id=pg_temp.d395_id(201) AND normalized_sender_name='qnb' AND NOT deleted),
  1::bigint,'zero-opening sender child persisted once');
SELECT is((SELECT count(*) FROM public.account_financial_effects WHERE action_id=pg_temp.d395_id(2101)),
  0::bigint,'no-effect Add creates no fabricated one-minor-unit evidence');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE action_id=pg_temp.d395_id(2101) AND domain='accounts'
  AND kind='create_with_default'),1::bigint,
  'metadata-only Add still has one immutable action root');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM default_inputs WHERE case_name='zero_on'),
  'idempotent','zero-effect replay returns immutable accepted outcome');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(201)),
  1::bigint,'zero-effect replay does not duplicate account');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'code'
  FROM default_inputs WHERE case_name='same_action_changed_payload'),
  'PAYLOAD_HASH_MISMATCH','identical action ID with changed immutable name rejects');

-- Owner3: later OFF preserves A; nonzero balance creates one posted effect.
SELECT pg_temp.d395_use_owner(3);
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='off_wrong_default';
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='off_wrong_default'),
  'later defaultIntent OFF cannot set a second default true');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(302)),
  0::bigint,'incorrect OFF flag creates no premature account');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(3)
  AND is_default AND NOT deleted),pg_temp.d395_id(301),
  'later OFF baseline has stable prior default');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='nonzero_off';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='nonzero_off'),
  'accepted','later default OFF with opening 10.01 accepts');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(302)
  AND balance=10.01 AND financial_revision=1 AND NOT is_default),1::bigint,
  'nonzero opening posts exactly 1001 minor units once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.d395_id(2103) AND account_id=pg_temp.d395_id(302)
  AND amount_minor_units=1001 AND accepted_account_revision=1 AND is_effective),
  1::bigint,'nonzero opening retains one exact immutable effect');
SELECT is((SELECT is_default FROM public.accounts WHERE id=pg_temp.d395_id(301)),
  true,'later OFF preserves original default unchanged');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM default_inputs WHERE case_name='wrong_clear'),
  'rejected','new default clear must target captured current default only');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(304)),
  0::bigint,'wrong-default-clear action creates nothing');

-- First active account and no-default later account are distinct positives.
SELECT pg_temp.d395_use_owner(4);
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='first_missing_default';
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='first_missing_default'),
  'first active Add cannot be created with default false even with OFF intent');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(401)),
  0::bigint,'invalid first-account OFF attempt leaves empty active set');
SELECT is((SELECT count(*) FROM public.accounts WHERE user_id=pg_temp.d395_id(4)
  AND NOT deleted),0::bigint,'first Add baseline has empty active set');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='first_zero';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='first_zero'),
  'accepted','first active account accepts even when optional intent is OFF');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(401)
  AND is_default AND balance=0 AND financial_revision=0),1::bigint,
  'first active account is default and has zero financial revision');

SELECT pg_temp.d395_use_owner(5);
SELECT is((SELECT count(*) FROM public.accounts WHERE user_id=pg_temp.d395_id(5)
  AND is_default AND NOT deleted),0::bigint,
  'no-default baseline deliberately has one active account and zero defaults');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='no_default_on';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='no_default_on'),
  'accepted','later ON from no-default state succeeds');
SELECT is((SELECT is_default FROM public.accounts WHERE id=pg_temp.d395_id(501)),
  false,'no-default previous account remains unset');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(502)
  AND is_default AND balance=0),1::bigint,
  'later ON establishes exactly one new default');

-- Sequential A->B->A returns identical *logical* active/default state.
SELECT pg_temp.d395_use_owner(6);
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(6)
  AND is_default AND NOT deleted),pg_temp.d395_id(601),'ABA baseline starts at A');
SELECT lives_ok($$UPDATE public.accounts SET is_default=false WHERE id=pg_temp.d395_id(601)$$,
  'generic writer can clear owner A in controlled ABA setup');
SELECT lives_ok($$UPDATE public.accounts SET is_default=true WHERE id=pg_temp.d395_id(602)$$,
  'generic writer can switch owner default to B in ABA setup');
SELECT lives_ok($$UPDATE public.accounts SET is_default=false WHERE id=pg_temp.d395_id(602)$$,
  'generic writer can clear B in ABA setup');
SELECT lives_ok($$UPDATE public.accounts SET is_default=true WHERE id=pg_temp.d395_id(601)$$,
  'generic writer can restore A in ABA setup');
SELECT lives_ok($$UPDATE public.accounts SET name='Changed After Capture'
  WHERE id=pg_temp.d395_id(602)$$,'unrelated account nickname may change');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='aba_same_state';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='aba_same_state'),
  'accepted','A->B->A logical-equality CAS succeeds despite timestamps');
SELECT is((SELECT is_default FROM public.accounts WHERE id=pg_temp.d395_id(601)),
  false,'accepted ABA action only clears captured A default');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(603)
  AND is_default),1::bigint,'new ABA target becomes sole default');
SELECT is((SELECT name FROM public.accounts WHERE id=pg_temp.d395_id(602)),
  'Changed After Capture','default CAS does not overwrite newer nickname');

-- Captured default mismatch rejects; no partial clear/create.
SELECT pg_temp.d395_use_owner(7);
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(7)
  AND is_default AND NOT deleted),pg_temp.d395_id(701),
  'stale default baseline begins at A');
SELECT lives_ok($$UPDATE public.accounts SET is_default=false WHERE id=pg_temp.d395_id(701)$$,
  'generic edit clears A before stale guard');
SELECT lives_ok($$UPDATE public.accounts SET is_default=true WHERE id=pg_temp.d395_id(702)$$,
  'generic edit makes B current default before stale guard');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='default_changed';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='default_changed'),
  'stale','captured A rejected when actual current default is B');
SELECT ok((SELECT COALESCE(outcome->'canonicalAbsentAccountIds','[]'::jsonb)
  ? pg_temp.d395_id(703)::text FROM default_outcomes WHERE case_name='default_changed'),
  'scoped stale outcome names verified absent optimistic new account');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(703)),
  0::bigint,'default-CAS loser created no account');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(7)
  AND is_default AND NOT deleted),pg_temp.d395_id(702),
  'failed Add preserves newer current default B');
SELECT is((SELECT public.apply_account_financial_action_v1(payload_json,payload_hash)->>'status'
  FROM default_inputs WHERE case_name='default_changed'),
  'stale','same stale action replays rather than reinterpreting guard');

-- Changed active set with the same null default is also stale.
SELECT pg_temp.d395_use_owner(8);
SELECT is((SELECT count(*) FROM public.accounts WHERE user_id=pg_temp.d395_id(8)
  AND NOT deleted),1::bigint,'active-set baseline has exactly one account');
SELECT lives_ok($$INSERT INTO public.accounts
  (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
  VALUES (pg_temp.d395_id(802),pg_temp.d395_id(8),'Concurrent Local Add',
    'CASH',0,'EGP',0,false,false)$$,
  'generic create changes active-ID set before snapshot CAS');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='active_set_changed';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='active_set_changed'),
  'stale','same null default but different active UUID set rejects');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(803)),
  0::bigint,'active-set stale does not create the proposed account');
SELECT is((SELECT count(*) FROM public.accounts WHERE user_id=pg_temp.d395_id(8)
  AND NOT deleted),2::bigint,'stale action preserves the two actual active rows');

-- Foreign/deleted occupied create IDs never pass absent guards, even at rev0.
SELECT pg_temp.d395_use_owner(9);
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(9)
  AND is_default AND NOT deleted),pg_temp.d395_id(901),
  'collision baseline has unchanged captured prior default');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name IN ('foreign_id_collision','deleted_id_collision');
SELECT ok((SELECT outcome->>'status' IN ('rejected','stale')
  FROM default_outcomes WHERE case_name='foreign_id_collision'),
  'foreign create ID collision is rejected, not overwritten');
SELECT ok((SELECT NOT(COALESCE(outcome->'canonicalAbsentAccountIds','[]'::jsonb)
    ? pg_temp.d395_id(910)::text)
    AND NOT (COALESCE(outcome->'canonicalAccounts','[]'::jsonb) @>
      jsonb_build_array(jsonb_build_object('accountId',pg_temp.d395_id(910))))
  FROM default_outcomes WHERE case_name='foreign_id_collision'),
  'foreign collision does not disclose canonical account or claim it is absent');
SELECT ok((SELECT outcome->>'status' IN ('rejected','stale')
  FROM default_outcomes WHERE case_name='deleted_id_collision'),
  'own deleted create ID collision is not treated as absent');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(911)
  AND deleted AND name='Deleted Occupied ID'),1::bigint,
  'deleted account remains tombstoned with original metadata');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(9)
  AND is_default AND NOT deleted),pg_temp.d395_id(901),
  'neither collision clears previous default');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id IN (pg_temp.d395_id(2109),pg_temp.d395_id(2110))),
  0::bigint,'collided zero-effect Add fabricates no financial effects');

-- Child FK/reparenting and account uniqueness failure roll back prior flag change.
SELECT pg_temp.d395_use_owner(11);
SELECT is((SELECT account_id FROM public.account_sms_senders WHERE id=pg_temp.d395_id(1102)),
  pg_temp.d395_id(1101),'child-collision baseline links sender to original owner account');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='child_id_collision';
SELECT ok((SELECT outcome->>'status' IN ('rejected','stale')
  FROM default_outcomes WHERE case_name='child_id_collision'),
  'occupied child ID cannot reparent to new account');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(1103)),
  0::bigint,'child collision rolls back new account');
SELECT is((SELECT account_id FROM public.account_sms_senders WHERE id=pg_temp.d395_id(1102)),
  pg_temp.d395_id(1101),'child collision preserves original child parent');
SELECT is((SELECT is_default FROM public.accounts WHERE id=pg_temp.d395_id(1101)),
  true,'child collision restores captured default flag');

SELECT pg_temp.d395_use_owner(12);
SELECT is((SELECT count(*) FROM public.accounts WHERE user_id=pg_temp.d395_id(12)
  AND NOT deleted),2::bigint,'name-conflict baseline has two active accounts');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='name_conflict_rollback';
SELECT ok((SELECT outcome->>'status' IN ('rejected','stale')
  FROM default_outcomes WHERE case_name='name_conflict_rollback'),
  'unique-name failure rejects entire default-clear/create');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(1202)),
  0::bigint,'name conflict creates no partial account');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(12)
  AND is_default AND NOT deleted),pg_temp.d395_id(1201),
  'name conflict cannot leave prior default cleared');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE action_id=pg_temp.d395_id(2112) AND server_outcome='accepted'),
  0::bigint,'failed Add has no accepted root');

SELECT pg_temp.d395_use_owner(13);
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(13)
  AND is_default AND NOT deleted),pg_temp.d395_id(1301),
  'foreign-snapshot baseline is locally owned current default');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='foreign_snapshot';
SELECT ok((SELECT outcome->>'status' IN ('rejected','stale')
  FROM default_outcomes WHERE case_name='foreign_snapshot'),
  'caller-supplied foreign default snapshot never authorizes mutation');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(1302)),
  0::bigint,'foreign snapshot cannot create an account');
SELECT is((SELECT id FROM public.accounts WHERE user_id=pg_temp.d395_id(13)
  AND is_default AND NOT deleted),pg_temp.d395_id(1301),
  'foreign snapshot cannot clear actual owned default');


-- Owner14: Wallet has no bank_details; first active account is default even
-- if the UI's explicit defaultIntent was false.
SELECT pg_temp.d395_use_owner(14);
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='wallet_with_bank_child';
SELECT ok((SELECT outcome->>'status' IN ('stale','rejected')
  FROM default_outcomes WHERE case_name='wallet_with_bank_child'),
  'Wallet account cannot smuggle a bank_details child into Add');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(1401)),
  0::bigint,'invalid Wallet child leaves first account absent');
SELECT is((SELECT count(*) FROM public.bank_details WHERE id=pg_temp.d395_id(1402)),
  0::bigint,'invalid Wallet child leaves no privileged child row');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='first_wallet';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='first_wallet'),
  'accepted','first active Wallet is supported by the existing Add default tuple');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(1401)
  AND user_id=pg_temp.d395_id(14) AND type='DIGITAL_WALLET'
  AND is_default AND balance=0 AND financial_revision=0),1::bigint,
  'first WALLET default is true, zero balance and no financial revision increment');
SELECT is((SELECT count(*) FROM public.bank_details WHERE account_id=pg_temp.d395_id(1401)),
  0::bigint,'valid Wallet creates no invented bank_details child');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE action_id=pg_temp.d395_id(2115)),0::bigint,
  'zero-opening first Wallet action creates no financial effect');

-- Owner15: a genuine nonempty active account set with no default stays with
-- no default when the user chooses OFF; no global auto-default convenience.
SELECT pg_temp.d395_use_owner(15);
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.d395_id(15) AND NOT deleted AND is_default),0::bigint,
  'later OFF baseline has an intentional nonempty no-default state');
INSERT INTO default_outcomes
SELECT case_name,public.apply_account_financial_action_v1(payload_json,payload_hash)
FROM default_inputs WHERE case_name='no_default_off';
SELECT is((SELECT outcome->>'status' FROM default_outcomes WHERE case_name='no_default_off'),
  'accepted','later OFF with no previous default preserves null default snapshot');
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(1502)
  AND user_id=pg_temp.d395_id(15) AND NOT is_default
  AND balance=0 AND financial_revision=0),1::bigint,
  'later OFF creates a nondefault zero-balance Cash account without side effects');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.d395_id(15) AND NOT deleted AND is_default),0::bigint,
  'two active Cash accounts may intentionally have no default');

-- These names remain independent even as both strict tuples use the same
-- closed logical DefaultSnapshot shape.
SELECT is((SELECT envelope->'payload'->'expectedDefaultSnapshot'
  FROM default_inputs WHERE case_name='zero_on'),
  pg_temp.d395_snapshot(
    jsonb_build_array(pg_temp.d395_id(101),pg_temp.d395_id(102)),
    pg_temp.d395_id(101)),
  'Add keeps unchanged expectedDefaultSnapshot and active/default UUID set');
SELECT ok((SELECT NOT(envelope->'payload' ? 'creationDefaultSnapshot')
  FROM default_inputs WHERE case_name='zero_on'),
  'the Add tuple never gains Review-only creationDefaultSnapshot');
SELECT ok((SELECT jsonb_array_length(envelope->'accountGuards')=0
  AND jsonb_array_length(envelope->'payload'->'accountEffects')=0
  FROM default_inputs WHERE case_name='first_wallet'),
  'zero-opening Wallet has exactly no financial guard/effect');
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE',
  'accepted zero/no-effect and nonzero Add satisfy deferred root/effect guards');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.accounts WHERE id=pg_temp.d395_id(910)
  AND user_id=pg_temp.d395_id(10) AND name='Foreign Occupied ID'
  AND balance=90 AND financial_revision=0),1::bigint,
  'privileged postcheck confirms collision did not alter foreign account');
SELECT * FROM finish();
ROLLBACK;
