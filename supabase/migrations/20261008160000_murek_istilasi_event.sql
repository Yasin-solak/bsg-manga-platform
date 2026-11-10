-- Murek Invasion event (Halloween, 2026-10-08 -> 2026-11-02 23:59 TRT).
-- While browsing a Murek cousin sometimes appears; the one who clicks catches it and earns Coins.
--
-- Anti-cheat: the SERVER decides whether a cousin spawns and each spawn is a single-use
-- ticket (istila_spawns). A catch works only with your own, unexpired, uncaught ticket;
-- Coins write uniquely to the ledger (store_wallet_ledger) by ticket id, the same catch is not paid
-- twice. At most 10 catches a day, at least 75 s between spawns; even with abuse
-- earnings are capped by the daily limit. Catching all five cousins gets the "Invasion Hunter" badge.

create table if not exists public.istila_spawns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('vampir', 'cadi', 'hayalet', 'balkabagi', 'mumya')),
  reward integer not null check (reward between 1 and 100),
  surface text check (surface is null or char_length(surface) <= 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  caught_at timestamptz
);
create index if not exists istila_spawns_user_created_idx on public.istila_spawns (user_id, created_at desc);
create index if not exists istila_spawns_caught_idx on public.istila_spawns (user_id, caught_at) where caught_at is not null;
alter table public.istila_spawns enable row level security;
revoke all on table public.istila_spawns from public, anon, authenticated;

insert into public.badges (name, description, image_url, category, subcategory, price, rarity, is_active, target_type, requirements, available_until)
values (
  'İstila Avcısı',
  'Mürek İstilası''nda beş kuzenin hepsini yakaladı: Vampir, Cadı, Hayalet, Balkabağı ve Mumya.',
  '/badges/istila-avcisi.webp',
  'event', 'event', null, 'epic', true, 'user', '{"event": "murek-istilasi"}'::jsonb, null
)
on conflict (name) do nothing;

-- Event settings in one place.
create or replace function app_private.istila_config()
returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'startsAt', '2026-10-08T00:00:00+03:00'::timestamptz,
    'endsAt', '2026-11-02T23:59:00+03:00'::timestamptz,
    'dailyLimit', 10,
    'cooldownSeconds', 75,
    'chance', 0.35,
    'ttlSeconds', 8,
    'graceSeconds', 3
  )
$$;

create or replace function app_private.istila_active()
returns boolean language sql stable set search_path = '' as $$
  select pg_catalog.now() between (app_private.istila_config() ->> 'startsAt')::timestamptz
    and (app_private.istila_config() ->> 'endsAt')::timestamptz
$$;

-- Bugunku (Istanbul saati) yakalama sayisi.
create or replace function app_private.istila_today_count(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select pg_catalog.count(*)::integer from public.istila_spawns s
  where s.user_id = p_user_id and s.caught_at is not null
    and (s.caught_at at time zone 'Europe/Istanbul')::date = (pg_catalog.now() at time zone 'Europe/Istanbul')::date
$$;

create or replace function app_private.istila_request_spawn(p_surface text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_cfg jsonb := app_private.istila_config();
  v_roll double precision;
  v_kind text;
  v_spawn public.istila_spawns;
begin
  if v_user_id is null or not app_private.istila_active() then
    return null;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('istila:' || v_user_id::text));

  if app_private.istila_today_count(v_user_id) >= (v_cfg ->> 'dailyLimit')::integer then
    return pg_catalog.jsonb_build_object('limitReached', true);
  end if;
  -- With an open ticket or a very recent spawn no new one.
  if exists (
    select 1 from public.istila_spawns s
    where s.user_id = v_user_id
      and (
        (s.caught_at is null and s.expires_at > pg_catalog.now())
        or s.created_at > pg_catalog.now() - pg_catalog.make_interval(secs => (v_cfg ->> 'cooldownSeconds')::integer)
      )
  ) then
    return null;
  end if;
  if pg_catalog.random() > (v_cfg ->> 'chance')::double precision then
    return null;
  end if;

  -- Nadirlik: Vampir %6 (25 Coin), Cadi %18, Mumya %18, Hayalet %29, Balkabagi %29 (5 Coin).
  v_roll := pg_catalog.random();
  v_kind := case when v_roll < 0.06 then 'vampir' when v_roll < 0.24 then 'cadi' when v_roll < 0.42 then 'mumya'
    when v_roll < 0.71 then 'hayalet' else 'balkabagi' end;

  insert into public.istila_spawns (user_id, kind, reward, surface, expires_at)
  values (v_user_id, v_kind, case when v_kind = 'vampir' then 25 else 5 end, left(nullif(p_surface, ''), 40),
    pg_catalog.now() + pg_catalog.make_interval(secs => (v_cfg ->> 'ttlSeconds')::integer))
  returning * into v_spawn;

  return pg_catalog.jsonb_build_object(
    'spawnId', v_spawn.id, 'kind', v_spawn.kind, 'reward', v_spawn.reward,
    'ttlMs', (v_cfg ->> 'ttlSeconds')::integer * 1000
  );
end;
$$;

create or replace function app_private.istila_catch(p_spawn_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_cfg jsonb := app_private.istila_config();
  v_spawn public.istila_spawns;
  v_balance integer;
  v_kinds text[];
  v_badge_id uuid;
  v_badge_new boolean := false;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('istila:' || v_user_id::text));

  select * into v_spawn from public.istila_spawns s where s.id = p_spawn_id and s.user_id = v_user_id for update;
  if not found then
    raise exception 'ISTILA_SPAWN_INVALID' using errcode = 'P0001';
  end if;
  if v_spawn.caught_at is not null then
    raise exception 'ISTILA_ALREADY_CAUGHT' using errcode = 'P0001';
  end if;
  if pg_catalog.now() > v_spawn.expires_at + pg_catalog.make_interval(secs => (v_cfg ->> 'graceSeconds')::integer) then
    raise exception 'ISTILA_ESCAPED' using errcode = 'P0001';
  end if;
  if app_private.istila_today_count(v_user_id) >= (v_cfg ->> 'dailyLimit')::integer then
    raise exception 'ISTILA_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.istila_spawns set caught_at = pg_catalog.now() where id = v_spawn.id;

  -- Coins: balance row locked, unique by ticket id in the ledger (not paid twice).
  perform 1 from public.users u where u.id = v_user_id for update;
  perform set_config('app.store_purchase_user_update', 'true', true);
  update public.users set stones = coalesce(stones, 0) + v_spawn.reward where id = v_user_id returning stones into v_balance;
  perform set_config('app.store_purchase_user_update', '', true);
  insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
  values (v_user_id, null, 'istila_catch', v_spawn.id::text, 'credit', 'Coin', v_spawn.reward, v_balance,
    pg_catalog.jsonb_build_object('kind', v_spawn.kind, 'event', 'murek-istilasi'));

  select coalesce(pg_catalog.array_agg(distinct s.kind order by s.kind), '{}') into v_kinds
  from public.istila_spawns s where s.user_id = v_user_id and s.caught_at is not null;

  if pg_catalog.cardinality(v_kinds) = 5 then
    select b.id into v_badge_id from public.badges b where b.name = 'İstila Avcısı';
    if v_badge_id is not null then
      insert into public.user_badges (user_id, badge_id) values (v_user_id, v_badge_id)
      on conflict (user_id, badge_id) do nothing;
      v_badge_new := found;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'kind', v_spawn.kind, 'reward', v_spawn.reward, 'balance', v_balance,
    'today', app_private.istila_today_count(v_user_id), 'dailyLimit', (v_cfg ->> 'dailyLimit')::integer,
    'kinds', pg_catalog.to_jsonb(v_kinds), 'badgeAwarded', v_badge_new
  );
end;
$$;

-- Event state (with no sign-in only date / activity).
create or replace function app_private.istila_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_cfg jsonb := app_private.istila_config();
  v_total integer;
  v_kinds text[];
  v_rank integer;
begin
  if v_user_id is null then
    return pg_catalog.jsonb_build_object('active', app_private.istila_active(), 'startsAt', v_cfg -> 'startsAt', 'endsAt', v_cfg -> 'endsAt',
      'dailyLimit', v_cfg -> 'dailyLimit');
  end if;
  select pg_catalog.count(*)::integer, coalesce(pg_catalog.array_agg(distinct s.kind order by s.kind), '{}')
  into v_total, v_kinds
  from public.istila_spawns s where s.user_id = v_user_id and s.caught_at is not null;
  select r.rank::integer into v_rank from (
    select s.user_id, pg_catalog.rank() over (order by pg_catalog.count(*) desc) as rank
    from public.istila_spawns s where s.caught_at is not null group by s.user_id
  ) r where r.user_id = v_user_id;
  return pg_catalog.jsonb_build_object(
    'active', app_private.istila_active(), 'startsAt', v_cfg -> 'startsAt', 'endsAt', v_cfg -> 'endsAt',
    'dailyLimit', v_cfg -> 'dailyLimit', 'today', app_private.istila_today_count(v_user_id),
    'total', v_total, 'kinds', pg_catalog.to_jsonb(v_kinds), 'rank', v_rank
  );
end;
$$;

-- Leaderboard: private accounts are nameless ("Gizli avci"), banned users are not listed.
create or replace function app_private.istila_leaderboard(p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(x order by x.rank, x.total desc), '[]'::jsonb) from (
    select pg_catalog.rank() over (order by pg_catalog.count(*) desc)::integer as rank,
      pg_catalog.count(*)::integer as total,
      case when u.profile_visibility = 'private' then null else u.username end as username,
      case when u.profile_visibility = 'private' then 'Gizli avcı' else coalesce(nullif(u.display_name, ''), u.username) end as "displayName",
      case when u.profile_visibility = 'private' then null else u.avatar_url end as "avatarUrl"
    from public.istila_spawns s join public.users u on u.id = s.user_id
    where s.caught_at is not null and coalesce(u.is_banned, false) = false
    group by u.id, u.username, u.display_name, u.avatar_url, u.profile_visibility
    order by pg_catalog.count(*) desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) x
$$;

revoke all on function app_private.istila_config() from public;
revoke all on function app_private.istila_active() from public;
revoke all on function app_private.istila_today_count(uuid) from public;
revoke all on function app_private.istila_request_spawn(text) from public;
revoke all on function app_private.istila_catch(uuid) from public;
revoke all on function app_private.istila_status() from public;
revoke all on function app_private.istila_leaderboard(integer) from public;
grant execute on function app_private.istila_config() to anon, authenticated;
grant execute on function app_private.istila_active() to anon, authenticated;
grant execute on function app_private.istila_request_spawn(text) to authenticated;
grant execute on function app_private.istila_catch(uuid) to authenticated;
grant execute on function app_private.istila_status() to anon, authenticated;
grant execute on function app_private.istila_leaderboard(integer) to anon, authenticated;

create or replace function public.istila_request_spawn(p_surface text default null)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.istila_request_spawn(p_surface) $$;
create or replace function public.istila_catch(p_spawn_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.istila_catch(p_spawn_id) $$;
create or replace function public.istila_status()
returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.istila_status() $$;
create or replace function public.istila_leaderboard(p_limit integer default 10)
returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.istila_leaderboard(p_limit) $$;

revoke all on function public.istila_request_spawn(text) from public;
revoke all on function public.istila_catch(uuid) from public;
revoke all on function public.istila_status() from public;
revoke all on function public.istila_leaderboard(integer) from public;
grant execute on function public.istila_request_spawn(text) to authenticated;
grant execute on function public.istila_catch(uuid) to authenticated;
grant execute on function public.istila_status() to anon, authenticated;
grant execute on function public.istila_leaderboard(integer) to anon, authenticated;
