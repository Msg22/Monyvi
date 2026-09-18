begin;

select plan(42);

create or replace function pg_temp.atomic_snapshot_root(
  p_gold text default '3738.7400000000000001',
  p_metal_time text default '2026-09-09T10:00:00Z',
  p_currency_time text default '2026-09-09T10:01:00Z'
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'goldUsdPerGram', p_gold,
    'silverUsdPerGram', '43.73874000',
    'platinumUsdPerGram', '1398.2500',
    'palladiumUsdPerGram', '1123.4500',
    'fiatUsdPerUnit', jsonb_build_object(
      'EGP', '0.021052330900000001', 'SAR', '0.2666666667',
      'AED', '0.2722940779', 'KWD', '3.2599837001',
      'QAR', '0.2747252747', 'BHD', '2.6595744681',
      'OMR', '2.6007802341', 'JOD', '1.4104372355',
      'IQD', '0.0007639419', 'LYD', '0.2057613169',
      'TND', '0.3205128205', 'MAD', '0.1019367992',
      'DZD', '0.0074321900', 'EUR', '1.1734567890123456',
      'GBP', '1.3523456789012345', 'JPY', '0.0067890123',
      'CHF', '1.2456789012', 'CNY', '0.1401234567',
      'INR', '0.0112345678', 'KRW', '0.0007212345',
      'KPW', '0.0011111111', 'SGD', '0.7789012345',
      'HKD', '0.1282051282', 'MYR', '0.2375296912',
      'AUD', '0.6712345678', 'NZD', '0.5890123456',
      'CAD', '0.7246376812', 'SEK', '0.1063829787',
      'NOK', '0.0980392157', 'DKK', '0.1572327044',
      'ISK', '0.0078125000', 'TRY', '0.0303030303',
      'RUB', '0.0111111111', 'ZAR', '0.0555555556',
      'BTC', '0.0000086956521739'
    ),
    'providerMetalObservedAt', p_metal_time,
    'providerCurrencyObservedAt', p_currency_time
  );
$$;

create or replace function pg_temp.atomic_snapshot_observations(
  p_root jsonb,
  p_source text default 'metals.dev'
)
returns jsonb
language sql
as $$
  with instruments(instrument_code, value_decimal, unit, provider_observed_at) as (
    values
      ('metal:GOLD', p_root ->> 'goldUsdPerGram', 'usd_per_pure_gram', p_root ->> 'providerMetalObservedAt'),
      ('metal:SILVER', p_root ->> 'silverUsdPerGram', 'usd_per_pure_gram', p_root ->> 'providerMetalObservedAt'),
      ('currency:EGP', p_root #>> '{fiatUsdPerUnit,EGP}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:SAR', p_root #>> '{fiatUsdPerUnit,SAR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:AED', p_root #>> '{fiatUsdPerUnit,AED}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:KWD', p_root #>> '{fiatUsdPerUnit,KWD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:QAR', p_root #>> '{fiatUsdPerUnit,QAR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:BHD', p_root #>> '{fiatUsdPerUnit,BHD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:OMR', p_root #>> '{fiatUsdPerUnit,OMR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:JOD', p_root #>> '{fiatUsdPerUnit,JOD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:IQD', p_root #>> '{fiatUsdPerUnit,IQD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:LYD', p_root #>> '{fiatUsdPerUnit,LYD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:TND', p_root #>> '{fiatUsdPerUnit,TND}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:MAD', p_root #>> '{fiatUsdPerUnit,MAD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:DZD', p_root #>> '{fiatUsdPerUnit,DZD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:USD', '1', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:EUR', p_root #>> '{fiatUsdPerUnit,EUR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:GBP', p_root #>> '{fiatUsdPerUnit,GBP}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:JPY', p_root #>> '{fiatUsdPerUnit,JPY}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:CHF', p_root #>> '{fiatUsdPerUnit,CHF}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:CNY', p_root #>> '{fiatUsdPerUnit,CNY}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:INR', p_root #>> '{fiatUsdPerUnit,INR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:KRW', p_root #>> '{fiatUsdPerUnit,KRW}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:KPW', p_root #>> '{fiatUsdPerUnit,KPW}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:SGD', p_root #>> '{fiatUsdPerUnit,SGD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:HKD', p_root #>> '{fiatUsdPerUnit,HKD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:MYR', p_root #>> '{fiatUsdPerUnit,MYR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:AUD', p_root #>> '{fiatUsdPerUnit,AUD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:NZD', p_root #>> '{fiatUsdPerUnit,NZD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:CAD', p_root #>> '{fiatUsdPerUnit,CAD}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:SEK', p_root #>> '{fiatUsdPerUnit,SEK}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:NOK', p_root #>> '{fiatUsdPerUnit,NOK}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:DKK', p_root #>> '{fiatUsdPerUnit,DKK}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:ISK', p_root #>> '{fiatUsdPerUnit,ISK}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:TRY', p_root #>> '{fiatUsdPerUnit,TRY}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:RUB', p_root #>> '{fiatUsdPerUnit,RUB}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt'),
      ('currency:ZAR', p_root #>> '{fiatUsdPerUnit,ZAR}', 'usd_per_currency_unit', p_root ->> 'providerCurrencyObservedAt')
  )
  select jsonb_agg(
    jsonb_build_object(
      'instrumentCode', instrument_code,
      'valueDecimal', value_decimal,
      'unit', unit,
      'orientation', 'quote_per_base',
      'providerObservedAt', provider_observed_at,
      'source', p_source,
      'quality', 'valid'
    )
    order by instrument_code
  )
  from instruments;
$$;

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_rate_observations'::regclass
      and confrelid = 'public.market_rates'::regclass
      and contype = 'f'
      and confdeltype = 'c'
  ),
  'observations bind to roots with delete cascade'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_rate_observations'::regclass
      and confrelid = 'public.market_rates'::regclass
      and contype = 'f'
      and not convalidated
  ),
  'future-write binding does not certify legacy observations'
);
select has_index(
  'public', 'market_rate_observations',
  'market_rate_observations_batch_instrument_idx',
  'bound observation lookup index exists'
);
select has_function(
  'public', 'persist_market_rate_snapshot_v1',
  array['uuid', 'timestamp with time zone', 'jsonb', 'jsonb'],
  'atomic persistence RPC exists'
);
select has_function(
  'public', 'pull_market_rate_snapshots_page_v1',
  array['timestamp with time zone', 'timestamp with time zone', 'uuid', 'integer'],
  'complete snapshot pull RPC exists'
);
select is(
  has_function_privilege('service_role', 'public.persist_market_rate_snapshot_v1(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  true,
  'service role may persist complete snapshots'
);
select is(
  has_function_privilege('authenticated', 'public.persist_market_rate_snapshot_v1(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  false,
  'authenticated clients cannot persist snapshots'
);
select is(
  has_function_privilege('anon', 'public.persist_market_rate_snapshot_v1(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  false,
  'anonymous clients cannot persist snapshots'
);
select is(
  has_function_privilege('authenticated', 'public.pull_market_rate_snapshots_page_v1(timestamptz,timestamptz,uuid,integer)', 'EXECUTE'),
  true,
  'authenticated sync may pull complete snapshots'
);
select is(
  has_function_privilege('anon', 'public.pull_market_rate_snapshots_page_v1(timestamptz,timestamptz,uuid,integer)', 'EXECUTE'),
  false,
  'anonymous clients cannot pull complete snapshots'
);

delete from public.market_rate_observations;
delete from public.market_rates;

create temporary table pg_temp.atomic_created as
select public.persist_market_rate_snapshot_v1(
  '11111111-1111-4111-8111-111111111111',
  '2026-09-09T10:02:00Z',
  pg_temp.atomic_snapshot_root(p_metal_time => null),
  pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root(p_metal_time => null))
) as payload;

select is((select payload ->> 'status' from pg_temp.atomic_created), 'created', 'valid exact snapshot is created');
select is((select count(*) from public.market_rates where id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'one root is persisted');
select is((select count(*) from public.market_rate_observations where batch_id = '11111111-1111-4111-8111-111111111111'), 37::bigint, 'exactly 37 observations are persisted');
select is(
  (select value_decimal::text from public.market_rate_observations where batch_id = '11111111-1111-4111-8111-111111111111' and instrument_code = 'metal:GOLD'),
  '3738.7400000000000001',
  'high-precision observation text is preserved exactly'
);
select is(
  (select provider_observed_at from public.market_rate_observations where batch_id = '11111111-1111-4111-8111-111111111111' and instrument_code = 'metal:GOLD'),
  null::timestamptz,
  'null provider time remains unknown'
);
select is(
  public.persist_market_rate_snapshot_v1(
    '11111111-1111-4111-8111-111111111111',
    '2026-09-09T10:02:00Z',
    pg_temp.atomic_snapshot_root(p_metal_time => null),
    pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root(p_metal_time => null))
  ) ->> 'status',
  'replayed',
  'identical same-ID replay is idempotent'
);
select is((select count(*) from public.market_rate_observations where batch_id = '11111111-1111-4111-8111-111111111111'), 37::bigint, 'replay creates no duplicate evidence');

select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000001','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),(select jsonb_agg(value) from jsonb_array_elements(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root())) where value ->> 'instrumentCode' <> 'currency:ZAR'))$$,
  '22023', 'snapshot_incomplete', 'missing required observation is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000002','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()) || (pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()) -> 0))$$,
  '22023', 'snapshot_incomplete', 'duplicate observation is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000003','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,instrumentCode}','"currency:BTC"'))$$,
  '22023', 'snapshot_incomplete', 'unexpected observation is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000004','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,quality}','"invalid"'))$$,
  '22023', 'snapshot_invalid_observation', 'invalid quality is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000005','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,unit}','"currency_units_per_usd"'))$$,
  '22023', 'snapshot_invalid_observation', 'invalid unit is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000006','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,orientation}','"base_per_quote"'))$$,
  '22023', 'snapshot_invalid_observation', 'invalid orientation is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000007','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,valueDecimal}','"0"'))$$,
  '22023', 'snapshot_invalid_decimal', 'non-positive decimal is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000008','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,source}','null'))$$,
  '22023', 'snapshot_invalid_source', 'null trusted source is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000009','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,source}','"   "'))$$,
  '22023', 'snapshot_invalid_source', 'whitespace-only trusted source is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('20000000-0000-4000-8000-000000000010','2026-09-09T10:03:00Z',pg_temp.atomic_snapshot_root(),jsonb_set(pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root()),'{0,valueDecimal}','"999"'))$$,
  '22023', 'snapshot_value_mismatch', 'root and observation mismatch is rejected'
);
select throws_ok(
  $$select public.persist_market_rate_snapshot_v1('11111111-1111-4111-8111-111111111111','2026-09-09T10:02:00Z',pg_temp.atomic_snapshot_root('4000',null),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root('4000',null)))$$,
  '23505', 'snapshot_conflict', 'conflicting same-ID replay is rejected'
);
select is(
  (select value_decimal::text from public.market_rate_observations where batch_id = '11111111-1111-4111-8111-111111111111' and instrument_code = 'metal:GOLD'),
  '3738.7400000000000001',
  'conflicting replay leaves accepted evidence unchanged'
);

delete from public.market_rate_observations;
delete from public.market_rates;

select public.persist_market_rate_snapshot_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-09-09T10:10:00Z',pg_temp.atomic_snapshot_root(p_metal_time => null),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root(p_metal_time => null)));
select public.persist_market_rate_snapshot_v1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-09-09T10:11:00Z',pg_temp.atomic_snapshot_root('3800'),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root('3800')));
select public.persist_market_rate_snapshot_v1('cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-09-09T10:12:00Z',pg_temp.atomic_snapshot_root('3900'),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root('3900')));
delete from public.market_rate_observations where batch_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and instrument_code = 'currency:ZAR';
select public.persist_market_rate_snapshot_v1('dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-09-09T10:13:00Z',pg_temp.atomic_snapshot_root('3950'),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root('3950')));
insert into public.market_rate_observations (batch_id,instrument_code,value_decimal,unit,orientation,provider_observed_at,source,quality,created_at)
select batch_id,instrument_code,value_decimal,unit,orientation,provider_observed_at,source,quality,created_at
from public.market_rate_observations
where batch_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and instrument_code = 'metal:GOLD';
select public.persist_market_rate_snapshot_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-09-09T10:14:00Z',pg_temp.atomic_snapshot_root('3975'),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root('3975')));
update public.market_rate_observations set source = null where batch_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and instrument_code = 'metal:GOLD';
select public.persist_market_rate_snapshot_v1('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-09-09T10:15:00Z',pg_temp.atomic_snapshot_root('3990'),pg_temp.atomic_snapshot_observations(pg_temp.atomic_snapshot_root('3990')));
delete from public.market_rate_observations where batch_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

create temporary table pg_temp.atomic_page_one as
select public.pull_market_rate_snapshots_page_v1(null, null, null, 1) as payload;
create temporary table pg_temp.atomic_page_two as
select public.pull_market_rate_snapshots_page_v1(
  (payload ->> 'upperWatermark')::timestamptz,
  (payload #>> '{nextCursor,createdAt}')::timestamptz,
  (payload #>> '{nextCursor,id}')::uuid,
  1
) as payload
from pg_temp.atomic_page_one;

select is(
  (select jsonb_array_length(payload -> 'snapshots') from pg_temp.atomic_page_one)
    + (select jsonb_array_length(payload -> 'snapshots') from pg_temp.atomic_page_two),
  2,
  'pull returns only complete valid bound envelopes'
);
select is(
  (select payload ->> 'upperWatermark' from pg_temp.atomic_page_two),
  (select payload ->> 'upperWatermark' from pg_temp.atomic_page_one),
  'subsequent pages preserve the fixed upper watermark'
);
select is((select payload #>> '{snapshots,0,snapshotId}' from pg_temp.atomic_page_one), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'first page follows root cursor order');
select is((select payload #>> '{snapshots,0,snapshotId}' from pg_temp.atomic_page_two), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'second page advances exclusively');
select is((select payload ->> 'nextCursor' from pg_temp.atomic_page_two), null::text, 'last page has no next cursor');
select is(
  (
    select observation ->> 'valueDecimal'
    from pg_temp.atomic_page_one,
      jsonb_array_elements(payload -> 'snapshots') snapshot,
      jsonb_array_elements(snapshot -> 'observations') observation
    where observation ->> 'instrumentCode' = 'metal:GOLD'
  ),
  '3738.7400000000000001',
  'pull returns authoritative decimals as exact text'
);
select is(
  (
    select observation ->> 'providerObservedAt'
    from pg_temp.atomic_page_one,
      jsonb_array_elements(payload -> 'snapshots') snapshot,
      jsonb_array_elements(snapshot -> 'observations') observation
    where observation ->> 'instrumentCode' = 'metal:GOLD'
  ),
  null::text,
  'pull preserves unknown provider time as null'
);
select is(
  (
    select count(*)
    from pg_temp.atomic_page_one,
      jsonb_array_elements(payload -> 'snapshots') snapshot
    where snapshot ->> 'snapshotId' in (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    )
  ),
  0::bigint,
  'legacy partial duplicate source-invalid and root-only snapshots are omitted'
);

set local role authenticated;
select lives_ok(
  $$select public.pull_market_rate_snapshots_page_v1(null, null, null, 1)$$,
  'authenticated clients can execute the encapsulated complete-snapshot read'
);
reset role;

delete from public.market_rates where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*) from public.market_rate_observations where batch_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'root deletion cascades all bound observations');
select throws_ok(
  $$select public.pull_market_rate_snapshots_page_v1(null,null,null,0)$$,
  '22023', 'market_rate_snapshot_invalid_limit', 'invalid page limit is rejected'
);
select throws_ok(
  $$select public.pull_market_rate_snapshots_page_v1(null,'2026-09-09T09:00:00Z',null,1)$$,
  '22023', 'market_rate_snapshot_invalid_cursor', 'partial cursor is rejected'
);
select throws_ok(
  $$select public.pull_market_rate_snapshots_page_v1('2099-01-01T00:00:00Z',null,null,1)$$,
  '22023', 'market_rate_snapshot_invalid_upper_watermark', 'future upper watermark is rejected'
);

select * from finish();
rollback;
