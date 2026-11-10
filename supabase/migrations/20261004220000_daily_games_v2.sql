-- Games Corner v2: Panel Hunt (daily chapter frame), Murek Run and Cover Match.
--
-- * Panel Hunt uses the same engine as Cover of the Day (kind = 'panel'). The source is picked from REAL pages of approved/published
-- chapters (not placeholders, excluding the first two pages). No puzzle is produced until at least 8 series
-- have eligible pages (available = false -> "Yakinda").
-- * Run and Cover Match are "attempt" (run) games: 3 attempts a day; starting an attempt uses a credit
-- (quitting midway gives no credit back). The score forms on the client, so the server:
-- - in the run clips the score to a plausible upper limit by elapsed time,
-- - in the match measures time ITSELF (client time is not used),
-- - gives rewards INCREMENTALLY by the day's best tier (3 attempts is not 3x reward),
-- - applies a shared daily coin cap for all games.

alter table public.daily_game_puzzles drop constraint if exists daily_game_puzzles_kind_check;
alter table public.daily_game_puzzles add constraint daily_game_puzzles_kind_check check (kind in ('cover', 'panel'));
alter table public.daily_game_plays drop constraint if exists daily_game_plays_kind_check;
alter table public.daily_game_plays add constraint daily_game_plays_kind_check check (kind in ('cover', 'panel'));

create table if not exists public.daily_game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('runner', 'match')),
  run_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score integer,
  moves integer,
  coin_awarded integer not null default 0 check (coin_awarded >= 0),
  board jsonb
);
create index if not exists daily_game_runs_user_day_idx on public.daily_game_runs (user_id, run_date, kind);

alter table public.daily_game_runs enable row level security;
revoke all on table public.daily_game_runs from public, anon, authenticated;

create or replace function app_private.daily_game_run_attempts()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- Gunun bulmacasi: kapak ya da panel.
create or replace function app_private.ensure_daily_game_puzzle(p_kind text, p_date date)
returns public.daily_game_puzzles
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.daily_game_puzzles;
begin
  if p_kind not in ('cover', 'panel') then
    raise exception 'GAME_KIND_INVALID' using errcode = '22023';
  end if;

  select * into v_row from public.daily_game_puzzles where puzzle_date = p_date and kind = p_kind;
  if found then
    return v_row;
  end if;

  if p_kind = 'cover' then
    insert into public.daily_game_puzzles (puzzle_date, kind, manga_id, image_source)
    select p_date, p_kind, c.id, c.cover_image_url
    from (
      select m.id, m.cover_image_url
      from public.mangas m
      where m.is_active and m.is_approved
        and pg_catalog.btrim(coalesce(m.cover_image_url, '')) <> ''
        and (select count(*) from public.mangas o
             where o.is_active and o.is_approved and o.cover_image_url = m.cover_image_url) = 1
        and not exists (
          select 1 from public.daily_game_puzzles p
          where p.kind = p_kind and p.manga_id = m.id and p.puzzle_date > p_date - 45
        )
      order by coalesce(m.total_views, 0) desc, m.id
      limit 60
    ) c
    order by pg_catalog.md5(p_date::text || ':' || p_kind || ':' || c.id::text)
    limit 1
    on conflict (puzzle_date, kind) do nothing;
  else
    -- Without enough variety no panel puzzle is produced.
    if (
      select count(distinct c.manga_id)
      from public.chapters c
      join public.mangas m on m.id = c.manga_id
      cross join lateral pg_catalog.jsonb_array_elements_text(coalesce(c.pages, '[]'::jsonb)) with ordinality as pg(page, ord)
      where m.is_active and m.is_approved and c.is_active and c.is_approved
        and (c.publish_at is null or c.publish_at <= pg_catalog.now())
        and pg.ord >= 3 and pg.page not ilike '%placehold%'
    ) < 8 then
      return v_row;
    end if;

    insert into public.daily_game_puzzles (puzzle_date, kind, manga_id, image_source)
    select p_date, p_kind, x.manga_id, x.page
    from (
      select c.manga_id, pg.page
      from public.chapters c
      join public.mangas m on m.id = c.manga_id
      cross join lateral pg_catalog.jsonb_array_elements_text(coalesce(c.pages, '[]'::jsonb)) with ordinality as pg(page, ord)
      where m.is_active and m.is_approved and c.is_active and c.is_approved
        and (c.publish_at is null or c.publish_at <= pg_catalog.now())
        and pg.ord >= 3 and pg.page not ilike '%placehold%'
        and not exists (
          select 1 from public.daily_game_puzzles p
          where p.kind = p_kind and p.manga_id = c.manga_id and p.puzzle_date > p_date - 30
        )
    ) x
    order by pg_catalog.md5(p_date::text || ':' || p_kind || ':' || x.manga_id::text || ':' || x.page)
    limit 1
    on conflict (puzzle_date, kind) do nothing;
  end if;

  select * into v_row from public.daily_game_puzzles where puzzle_date = p_date and kind = p_kind;
  return v_row;
end;
$$;

-- Ortak gunluk coin: tahmin oyunlari + deneme oyunlari.
create or replace function app_private.daily_game_coin_earned(p_user_id uuid, p_date date)
returns integer language sql stable security definer set search_path = '' as $$
  select (
    coalesce((select sum(coin_awarded) from public.daily_game_plays where user_id = p_user_id and puzzle_date = p_date), 0)
    + coalesce((select sum(coin_awarded) from public.daily_game_runs where user_id = p_user_id and run_date = p_date), 0)
  )::integer
$$;

-- Tier: score in the run, seconds (measured by the server) in the match.
create or replace function app_private.daily_game_run_tier(p_kind text, p_value integer)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'runner' then
      case when p_value >= 1500 then 8 when p_value >= 800 then 6 when p_value >= 400 then 4 when p_value >= 150 then 2 else 0 end
    when p_kind = 'match' then
      case when p_value <= 35 then 8 when p_value <= 50 then 6 when p_value <= 80 then 4 else 2 end
    else 0
  end
$$;

create or replace function app_private.daily_game_run_status(p_kind text, p_user_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with today as (select app_private.daily_game_today() as d),
  runs as (
    select r.* from public.daily_game_runs r, today
    where p_user_id is not null and r.user_id = p_user_id and r.run_date = today.d and r.kind = p_kind
  )
  select pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'date', (select d from today),
    'maxAttempts', app_private.daily_game_run_attempts(),
    'attemptsUsed', (select count(*) from runs),
    'attemptsLeft', greatest(0, app_private.daily_game_run_attempts() - (select count(*) from runs)::integer),
    'bestScore', (select case when p_kind = 'match' then min(score) else max(score) end from runs where finished_at is not null),
    'coinFromKind', coalesce((select sum(coin_awarded) from runs), 0),
    'dailyCoinEarned', case when p_user_id is null then 0 else app_private.daily_game_coin_earned(p_user_id, (select d from today)) end,
    'dailyCoinCap', app_private.daily_game_daily_coin_cap()
  )
$$;

create or replace function app_private.start_daily_game_run(p_kind text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_date date := app_private.daily_game_today();
  v_used integer;
  v_board jsonb := null;
  v_run_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_kind not in ('runner', 'match') then
    raise exception 'GAME_KIND_INVALID' using errcode = '22023';
  end if;

  -- Concurrent starts of one user go in order (credit count stays consistent).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('daily_game_run:' || v_user_id::text || ':' || p_kind));

  select count(*) into v_used from public.daily_game_runs
  where user_id = v_user_id and run_date = v_date and kind = p_kind;
  if v_used >= app_private.daily_game_run_attempts() then
    raise exception 'GAME_ATTEMPTS_EXHAUSTED' using errcode = 'P0001';
  end if;

  if p_kind = 'match' then
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', s.id, 'title', s.title, 'coverImage', s.cover_image_url))
    into v_board
    from (
      select m.id, m.title, m.cover_image_url
      from public.mangas m
      where m.is_active and m.is_approved
        and pg_catalog.btrim(coalesce(m.cover_image_url, '')) <> ''
        and (select count(*) from public.mangas o
             where o.is_active and o.is_approved and o.cover_image_url = m.cover_image_url) = 1
      order by pg_catalog.random()
      limit 6
    ) s;
    if coalesce(pg_catalog.jsonb_array_length(v_board), 0) < 6 then
      raise exception 'GAME_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  insert into public.daily_game_runs (user_id, kind, run_date, board)
  values (v_user_id, p_kind, v_date, v_board)
  returning id into v_run_id;

  return app_private.daily_game_run_status(p_kind, v_user_id)
    || pg_catalog.jsonb_build_object('runId', v_run_id, 'board', coalesce(v_board, '[]'::jsonb));
end;
$$;

create or replace function app_private.finish_daily_game_run(p_run_id uuid, p_score integer, p_moves integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_run public.daily_game_runs;
  v_elapsed_s integer;
  v_score integer;
  v_tier integer;
  v_prev integer;
  v_reward integer := 0;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_run from public.daily_game_runs where id = p_run_id and user_id = v_user_id for update;
  if not found then
    raise exception 'GAME_RUN_INVALID' using errcode = '22023';
  end if;
  if v_run.finished_at is not null then
    raise exception 'GAME_FINISHED' using errcode = 'P0001';
  end if;

  v_elapsed_s := greatest(0, floor(extract(epoch from (pg_catalog.now() - v_run.started_at)))::integer);

  if v_elapsed_s > 20 * 60 then
    -- A very old attempt: closes, no reward.
    v_score := 0;
    v_tier := 0;
  elsif v_run.kind = 'runner' then
    -- Kosu hizi sinirli: saniyede en fazla ~12 puan (+ kucuk tolerans).
    v_score := least(greatest(coalesce(p_score, 0), 0), v_elapsed_s * 12 + 20);
    v_tier := app_private.daily_game_run_tier('runner', v_score);
  else
    -- Match: for 6 pairs at least 6 moves and at least 6 s; time is the server measure.
    if coalesce(p_moves, 0) < 6 or v_elapsed_s < 6 then
      raise exception 'GAME_RUN_IMPLAUSIBLE' using errcode = 'P0001';
    end if;
    v_score := v_elapsed_s;
    v_tier := app_private.daily_game_run_tier('match', v_score);
  end if;

  -- Incremental reward: today's total reward in this game rises to the best tier.
  select coalesce(sum(coin_awarded), 0) into v_prev from public.daily_game_runs
  where user_id = v_user_id and run_date = v_run.run_date and kind = v_run.kind;
  v_reward := least(
    greatest(0, v_tier - v_prev),
    greatest(0, app_private.daily_game_daily_coin_cap() - app_private.daily_game_coin_earned(v_user_id, v_run.run_date))
  );

  update public.daily_game_runs
  set finished_at = pg_catalog.now(), score = v_score, moves = p_moves, coin_awarded = v_reward
  where id = v_run.id;

  if v_reward > 0 then
    perform set_config('app.store_purchase_user_update', 'true', true);
    update public.users set stones = coalesce(stones, 0) + v_reward where id = v_user_id returning stones into v_balance;
    perform set_config('app.store_purchase_user_update', '', true);

    insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
    values (v_user_id, null, 'daily_game', 'run:' || v_run.id::text, 'credit', 'Coin', v_reward, v_balance,
      pg_catalog.jsonb_build_object('kind', v_run.kind, 'run_date', v_run.run_date, 'score', v_score));
  end if;

  return app_private.daily_game_run_status(v_run.kind, v_user_id)
    || pg_catalog.jsonb_build_object('runId', v_run.id, 'score', v_score, 'coinAwarded', v_reward);
end;
$$;

create or replace function app_private.get_daily_game_run_status(p_kind text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select app_private.daily_game_run_status(p_kind, public.current_public_user_id())
$$;

revoke all on function app_private.daily_game_run_attempts() from public;
revoke all on function app_private.daily_game_run_tier(text, integer) from public;
revoke all on function app_private.daily_game_run_status(text, uuid) from public;
revoke all on function app_private.start_daily_game_run(text) from public;
revoke all on function app_private.finish_daily_game_run(uuid, integer, integer) from public;
revoke all on function app_private.get_daily_game_run_status(text) from public;
grant execute on function app_private.start_daily_game_run(text) to authenticated;
grant execute on function app_private.finish_daily_game_run(uuid, integer, integer) to authenticated;
grant execute on function app_private.get_daily_game_run_status(text) to anon, authenticated;

create or replace function public.start_daily_game_run(p_kind text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.start_daily_game_run(p_kind)
$$;

create or replace function public.finish_daily_game_run(p_run_id uuid, p_score integer, p_moves integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.finish_daily_game_run(p_run_id, p_score, p_moves)
$$;

create or replace function public.get_daily_game_run_status(p_kind text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_daily_game_run_status(p_kind)
$$;

revoke all on function public.start_daily_game_run(text) from public;
revoke all on function public.finish_daily_game_run(uuid, integer, integer) from public;
revoke all on function public.get_daily_game_run_status(text) from public;
grant execute on function public.start_daily_game_run(text) to authenticated;
grant execute on function public.finish_daily_game_run(uuid, integer, integer) to authenticated;
grant execute on function public.get_daily_game_run_status(text) to anon, authenticated;
