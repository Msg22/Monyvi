-- Real independent database sessions prove commit visibility, not just timestamps.
begin;
set local statement_timeout = '15s';
create extension if not exists dblink with schema extensions;
select plan(5);
select extensions.dblink_connect('snapshot_writer', 'dbname=' || current_database() || ' user=' || current_user);
select extensions.dblink_connect('snapshot_reader', 'dbname=' || current_database() || ' user=' || current_user);
select extensions.dblink_exec('snapshot_writer', 'set statement_timeout = ''10s''');
select extensions.dblink_exec('snapshot_reader', 'set statement_timeout = ''10s''');

create temp table publication_fixture as
select jsonb_build_object(
  'goldUsdPerGram','100', 'silverUsdPerGram','2',
  'platinumUsdPerGram','3', 'palladiumUsdPerGram','4',
  'providerMetalObservedAt',null, 'providerCurrencyObservedAt',null,
  'fiatUsdPerUnit', (select jsonb_object_agg(code,'0.5'::text) from (
    select split_part(code,':',2) as code
    from unnest(private.market_rate_snapshot_required_instruments_v1()) code
    where code like 'currency:%' and code <> 'currency:USD'
    union all select 'BTC'
  ) currencies)
) as root,
(select jsonb_agg(jsonb_build_object(
  'instrumentCode',code, 'valueDecimal',case code when 'metal:GOLD' then '100'
    when 'metal:SILVER' then '2' when 'currency:USD' then '1' else '0.5' end,
  'unit',case when code like 'metal:%' then 'usd_per_pure_gram' else 'usd_per_currency_unit' end,
  'orientation','quote_per_base', 'providerObservedAt',null,
  'source','publication-concurrency', 'quality','valid'
)) from unnest(private.market_rate_snapshot_required_instruments_v1()) code) as observations;

-- Writer has a complete snapshot, but keeps its transaction uncommitted.
select extensions.dblink_exec('snapshot_writer', 'begin');
select result from extensions.dblink('snapshot_writer', (
  select format('select public.persist_market_rate_snapshot_v1(%L,%L,%L::jsonb,%L::jsonb)',
    '72727272-7272-4272-8272-727272727211','2020-01-01T00:00:00Z',root,observations)
  from publication_fixture
)) as response(result jsonb);
select extensions.dblink_send_query('snapshot_reader', 'select public.pull_market_rate_snapshots_page_v2()');
select pg_sleep(0.05);
select is(extensions.dblink_is_busy('snapshot_reader'), 1,
  'first-page read waits for uncommitted complete publication');
select extensions.dblink_exec('snapshot_writer', 'commit');
create temp table committed_page as
select result from extensions.dblink_get_result('snapshot_reader') as response(result jsonb);
select * from extensions.dblink_get_result('snapshot_reader') as response(result jsonb);
select ok((select exists(select 1 from jsonb_array_elements(result->'snapshots') item
  where item->>'snapshotId' = '72727272-7272-4272-8272-727272727211') from committed_page),
  'reader fresh statement sees publisher that committed while lock waited');

-- Legacy/import root first, then required children split across two transactions.
select extensions.dblink_exec('snapshot_writer', $sql$
  insert into public.market_rates select (jsonb_populate_record(null::public.market_rates,
    to_jsonb(root) || '{"id":"72727272-7272-4272-8272-727272727212"}'::jsonb)).*
  from public.market_rates root where id='72727272-7272-4272-8272-727272727211'
$sql$);
select extensions.dblink_exec('snapshot_writer', 'begin');
select extensions.dblink_exec('snapshot_writer', $sql$
  insert into public.market_rate_observations select (jsonb_populate_record(null::public.market_rate_observations,
    to_jsonb(observation) || jsonb_build_object('id',extensions.gen_random_uuid(),
      'batch_id','72727272-7272-4272-8272-727272727212'))).*
  from public.market_rate_observations observation
  where batch_id='72727272-7272-4272-8272-727272727211' and instrument_code < 'currency:USD'
$sql$);
select extensions.dblink_send_query('snapshot_reader', $sql$
  insert into public.market_rate_observations select (jsonb_populate_record(null::public.market_rate_observations,
    to_jsonb(observation) || jsonb_build_object('id',extensions.gen_random_uuid(),
      'batch_id','72727272-7272-4272-8272-727272727212'))).*
  from public.market_rate_observations observation
  where batch_id='72727272-7272-4272-8272-727272727211' and instrument_code >= 'currency:USD'
$sql$);
select pg_sleep(0.05);
select is(extensions.dblink_is_busy('snapshot_reader'), 1,
  'second partial observation writer waits before checking completeness');
select extensions.dblink_exec('snapshot_writer', 'commit');
select * from extensions.dblink_get_result('snapshot_reader') as response(result text);
select * from extensions.dblink_get_result('snapshot_reader') as response(result text);
create temp table split_page as
select result from extensions.dblink('snapshot_reader', (select format(
  'select public.pull_market_rate_snapshots_page_v2(p_cursor_created_at=>%L,p_cursor_id=>%L)',
  result->>'upperWatermark','ffffffff-ffff-ffff-ffff-ffffffffffff') from committed_page
)) as response(result jsonb);
select ok((select exists(select 1 from jsonb_array_elements(result->'snapshots') item
  where item->>'snapshotId' = '72727272-7272-4272-8272-727272727212') from split_page),
  'concurrent partial child transactions publish complete snapshot after previous watermark');
select is((select count(*)::integer from private.market_rate_publications
  where snapshot_id='72727272-7272-4272-8272-727272727212'), 1,
  'split delivery creates exactly one publication identity');

-- Remote sessions commit outside the test transaction; clean only these fixture IDs.
select extensions.dblink_exec('snapshot_writer', $sql$
  delete from public.market_rates where id in
    ('72727272-7272-4272-8272-727272727211','72727272-7272-4272-8272-727272727212')
$sql$);
select extensions.dblink_disconnect('snapshot_writer');
select extensions.dblink_disconnect('snapshot_reader');
select * from finish();
rollback;
