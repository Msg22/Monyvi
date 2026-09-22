begin;
select plan(9);

create function pg_temp.publication_test_root() returns jsonb language sql as $$
  select jsonb_build_object(
    'goldUsdPerGram', '100', 'silverUsdPerGram', '2',
    'platinumUsdPerGram', '3', 'palladiumUsdPerGram', '4',
    'providerMetalObservedAt', null, 'providerCurrencyObservedAt', null,
    'fiatUsdPerUnit', (
      select jsonb_object_agg(code, '0.5'::text)
      from unnest(array[
        'AED','AUD','BHD','BTC','CAD','CHF','CNY','DKK','DZD','EGP','EUR','GBP',
        'HKD','INR','IQD','ISK','JOD','JPY','KPW','KRW','KWD','LYD','MAD','MYR',
        'NOK','NZD','OMR','QAR','RUB','SAR','SEK','SGD','TND','TRY','ZAR'
      ]) code
    )
  );
$$;
create function pg_temp.publication_test_observations() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'instrumentCode', code, 'valueDecimal', case code
      when 'metal:GOLD' then '100' when 'metal:SILVER' then '2'
      when 'currency:USD' then '1' else '0.5' end,
    'unit', case when code like 'metal:%' then 'usd_per_pure_gram'
      else 'usd_per_currency_unit' end,
    'orientation', 'quote_per_base', 'providerObservedAt', null,
    'source', 'publication-regression', 'quality', 'valid'
  )) from unnest(private.market_rate_snapshot_required_instruments_v1()) code;
$$;

create temp table publication_before as
select public.pull_market_rate_snapshots_page_v2() as page;
select public.persist_market_rate_snapshot_v1(
  '72727272-7272-4272-8272-727272727201', '2020-01-01T00:00:00Z',
  pg_temp.publication_test_root(), pg_temp.publication_test_observations()
);
create temp table publication_after as
select public.pull_market_rate_snapshots_page_v2(
  p_cursor_created_at => (select (page->>'upperWatermark')::timestamptz from publication_before),
  p_cursor_id => 'ffffffff-ffff-ffff-ffff-ffffffffffff'
) as page;
select is((select jsonb_array_length(page->'snapshots') from publication_after), 1,
  'late-published snapshot is delivered despite capture predating last sync');
select is((select (page#>>'{snapshots,0,capturedAt}')::timestamptz from publication_after),
  '2020-01-01T00:00:00Z'::timestamptz, 'capture evidence remains unchanged');
select ok((select (page#>>'{snapshots,0,publishedAt}')::timestamptz from publication_after)
  > (select (page->>'upperWatermark')::timestamptz from publication_before),
  'publication strictly exceeds prior millisecond barrier');
select is((select count(*)::integer from jsonb_array_elements(public.pull_market_rate_snapshots_page_v2(
  p_upper_watermark => (select (page->>'upperWatermark')::timestamptz from publication_before)
)->'snapshots') item where item->>'snapshotId' = '72727272-7272-4272-8272-727272727201'),
  0, 'pinned earlier window excludes later publication');
select ok((select (page->>'upperWatermark')::timestamptz from publication_after) <= clock_timestamp(),
  'global sync watermark never moves into future');
select is(has_function_privilege('anon',
  'public.pull_market_rate_snapshots_page_v2(timestamptz,timestamptz,uuid,integer)', 'EXECUTE'),
  false, 'anonymous clients cannot pull snapshots');
select is(has_table_privilege('authenticated', 'private.market_rate_publications', 'INSERT'),
  false, 'authenticated clients cannot forge publication metadata');
select is(has_table_privilege('authenticated', 'private.market_rate_publication_barrier', 'UPDATE'),
  false, 'authenticated clients cannot advance barrier directly');
set local role authenticated;
select lives_ok('select public.pull_market_rate_snapshots_page_v2()',
  'authenticated caller can read through security-definer boundary with private tables inaccessible');
reset role;
select * from finish();
rollback;
