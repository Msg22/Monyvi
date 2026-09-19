-- Capture/provider times are evidence, not commit-visible delivery cursors.
-- A transaction holds the singleton row lock from publication through commit.
-- First-page readers take the same lock before choosing a millisecond watermark.
-- Consequently every publication <= that watermark is already committed, while
-- every later publisher receives a strictly greater time. No overlap cutoff or
-- historical evidence rewrite is needed.
lock table public.market_rates, public.market_rate_observations in share row exclusive mode;

create table private.market_rate_publication_barrier (
  singleton boolean primary key default true check (singleton),
  watermark timestamptz not null check (isfinite(watermark))
);
insert into private.market_rate_publication_barrier(singleton, watermark)
values (true, date_trunc('milliseconds', clock_timestamp()));

create table private.market_rate_publications (
  snapshot_id uuid primary key references public.market_rates(id) on delete cascade,
  published_at timestamptz not null check (isfinite(published_at))
);
create index market_rate_publications_time_id_idx
  on private.market_rate_publications(published_at, snapshot_id);
alter table private.market_rate_publication_barrier enable row level security;
alter table private.market_rate_publications enable row level security;
revoke all on private.market_rate_publication_barrier, private.market_rate_publications
  from public, anon, authenticated, service_role;

-- Existing complete roots become discoverable at rollout time. Their capture,
-- provider dates, exact values and observation identities remain untouched.
insert into private.market_rate_publications(snapshot_id, published_at)
select root.id, barrier.watermark
from public.market_rates root
cross join private.market_rate_publication_barrier barrier
where private.market_rate_snapshot_is_complete_v1(root.id);

create or replace function private.publish_complete_market_rate_snapshot_v1()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_barrier timestamptz;
  v_publication timestamptz;
begin
  if tg_table_name = 'market_rates' then
    v_id := new.id;
  else
    v_id := new.batch_id;
  end if;
  if exists (select 1 from private.market_rate_publications where snapshot_id = v_id) then
    return null;
  end if;
  select watermark into strict v_barrier
  from private.market_rate_publication_barrier where singleton for update;
  -- Check after locking, in its own fresh statement: concurrent partial child
  -- transactions must see the earlier commit before deciding completeness.
  if not coalesce(private.market_rate_snapshot_is_complete_v1(v_id), false) then
    return null;
  end if;

  -- Do not synthesize a future global watermark. Fail closed on a server clock
  -- regression; at equality only, wait for the next representable millisecond.
  loop
    v_publication := date_trunc('milliseconds', clock_timestamp());
    if v_publication < v_barrier then
      raise exception 'market_rate_snapshot_clock_regressed';
    end if;
    exit when v_publication > v_barrier;
    perform pg_sleep(0.001);
  end loop;
  update private.market_rate_publication_barrier set watermark = v_publication where singleton;
  insert into private.market_rate_publications(snapshot_id, published_at)
  values(v_id, v_publication) on conflict (snapshot_id) do nothing;
  return null;
end;
$$;
revoke all on function private.publish_complete_market_rate_snapshot_v1()
  from public, anon, authenticated, service_role;

-- Both paths matter: the atomic RPC creates all rows in one transaction, while
-- local QA imports can attach observations after an earlier root transaction.
create trigger publish_complete_market_rate_root
after insert or update on public.market_rates
for each row execute function private.publish_complete_market_rate_snapshot_v1();
create trigger publish_complete_market_rate_observations
after insert or update on public.market_rate_observations
for each row execute function private.publish_complete_market_rate_snapshot_v1();

create function public.pull_market_rate_snapshots_page_v2(
  p_upper_watermark timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_upper_watermark timestamptz;
  v_barrier timestamptz;
  v_snapshots jsonb;
  v_has_more boolean;
  v_cursor jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_limit';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_cursor_created_at is not null and not isfinite(p_cursor_created_at))
  then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_cursor';
  end if;
  if p_upper_watermark is null then
    select watermark into strict v_barrier
    from private.market_rate_publication_barrier where singleton for update;
    v_upper_watermark := date_trunc('milliseconds', clock_timestamp());
    if v_upper_watermark < v_barrier then
      raise exception 'market_rate_snapshot_clock_regressed';
    end if;
    update private.market_rate_publication_barrier set watermark = v_upper_watermark where singleton;
  else
    select watermark into strict v_barrier
    from private.market_rate_publication_barrier where singleton;
    if not isfinite(p_upper_watermark) or p_upper_watermark > v_barrier then
      raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_upper_watermark';
    end if;
    v_upper_watermark := p_upper_watermark;
  end if;
  if p_cursor_created_at is not null and p_cursor_created_at > v_upper_watermark then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_cursor';
  end if;

  -- VOLATILE and a separate statement after acquiring the lock are essential:
  -- this query must see publishers which committed while the reader waited.
  with candidates as (
    select publication.snapshot_id as id, publication.published_at
    from private.market_rate_publications publication
    where publication.published_at <= v_upper_watermark
      and (p_cursor_created_at is null or
        (publication.published_at, publication.snapshot_id) > (p_cursor_created_at, p_cursor_id))
      and private.market_rate_snapshot_is_complete_v1(publication.snapshot_id)
    order by publication.published_at, publication.snapshot_id limit p_limit + 1
  ), page as (
    select * from candidates order by published_at, id limit p_limit
  )
  select coalesce((select jsonb_agg(
      private.market_rate_snapshot_envelope_v1(page.id)
        || jsonb_build_object('publishedAt', page.published_at)
      order by page.published_at, page.id) from page), '[]'::jsonb),
    (select count(*) > p_limit from candidates),
    (select jsonb_build_object('createdAt', published_at, 'id', id)
      from page order by published_at desc, id desc limit 1)
  into v_snapshots, v_has_more, v_cursor;
  return jsonb_build_object('snapshots', v_snapshots, 'upperWatermark', v_upper_watermark,
    'nextCursor', case when v_has_more then v_cursor else null end);
end;
$$;
revoke all on function public.pull_market_rate_snapshots_page_v2(timestamptz,timestamptz,uuid,integer)
  from public, anon;
grant execute on function public.pull_market_rate_snapshots_page_v2(timestamptz,timestamptz,uuid,integer)
  to authenticated, service_role;
comment on function public.pull_market_rate_snapshots_page_v2(timestamptz,timestamptz,uuid,integer)
  is 'Commit-visible publication paging; cursor createdAt is publication time, never rate capture/freshness.';
