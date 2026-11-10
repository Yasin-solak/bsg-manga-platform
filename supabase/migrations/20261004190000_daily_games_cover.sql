-- Games Corner v1: Cover of the Day (daily cover puzzle).
--
-- Rules (on purpose):
-- * No money entry / luck; knowledge only. Same daily puzzle for everyone (Europe/Istanbul day).
-- * Answer and image source NEVER go to the client: until the game ends the cover comes only through the
-- server-side blurring /api/game/daily-image proxy (service_role RPC). The cover URL holds a slug
-- so otherwise the answer could be read from the URL.
-- * Guess check and coins only on the server; a daily game coin cap (total of all games).
-- * Coin writes are idempotent with a unique (source_kind, source_ref, entry_type) on store_wallet_ledger.

create table if not exists public.daily_game_puzzles (
  puzzle_date date not null,
  kind text not null check (kind in ('cover')),
  manga_id uuid not null references public.mangas(id) on delete cascade,
  image_source text not null,
  created_at timestamptz not null default now(),
  primary key (puzzle_date, kind)
);

create table if not exists public.daily_game_plays (
  user_id uuid not null references public.users(id) on delete cascade,
  puzzle_date date not null,
  kind text not null check (kind in ('cover')),
  guesses uuid[] not null default '{}',
  solved boolean not null default false,
  finished_at timestamptz,
  coin_awarded integer not null default 0 check (coin_awarded >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, puzzle_date, kind)
);

-- Tables read/write only with SECURITY DEFINER RPCs.
alter table public.daily_game_puzzles enable row level security;
alter table public.daily_game_plays enable row level security;
revoke all on table public.daily_game_puzzles from public, anon, authenticated;
revoke all on table public.daily_game_plays from public, anon, authenticated;

create or replace function app_private.daily_game_today()
returns date language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone 'Europe/Istanbul')::date
$$;

create or replace function app_private.daily_game_max_guesses()
returns integer language sql immutable set search_path = '' as $$ select 6 $$;

create or replace function app_private.daily_game_daily_coin_cap()
returns integer language sql immutable set search_path = '' as $$ select 30 $$;

-- Reward by the guess number that got it: 1 -> 20, 2 -> 15, ... 6 -> 4.
create or replace function app_private.daily_game_reward_for_guess(p_guess_count integer)
returns integer language sql immutable set search_path = '' as $$
  select coalesce((array[20, 15, 12, 9, 6, 4])[p_guess_count], 0)
$$;

-- Sets the day's puzzle (if absent). Only active/approved mangas with a unique cover; those used in the last 45 days
-- do not repeat; selection is deterministic by day (md5) and popularity weighted.
create or replace function app_private.ensure_daily_game_puzzle(p_kind text, p_date date)
returns public.daily_game_puzzles
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.daily_game_puzzles;
begin
  if p_kind <> 'cover' then
    raise exception 'GAME_KIND_INVALID' using errcode = '22023';
  end if;

  select * into v_row from public.daily_game_puzzles where puzzle_date = p_date and kind = p_kind;
  if found then
    return v_row;
  end if;

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

  select * into v_row from public.daily_game_puzzles where puzzle_date = p_date and kind = p_kind;
  return v_row;
end;
$$;

create or replace function app_private.daily_game_coin_earned(p_user_id uuid, p_date date)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coin_awarded), 0)::integer
  from public.daily_game_plays
  where user_id = p_user_id and puzzle_date = p_date
$$;

-- State going to the client. The answer (manga) is added only when the game ended.
create or replace function app_private.daily_game_snapshot(p_kind text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := app_private.daily_game_today();
  v_puzzle public.daily_game_puzzles;
  v_play public.daily_game_plays;
  v_max integer := app_private.daily_game_max_guesses();
  v_finished boolean;
  v_guesses jsonb := '[]'::jsonb;
  v_answer jsonb := null;
begin
  v_puzzle := app_private.ensure_daily_game_puzzle(p_kind, v_date);
  if v_puzzle.manga_id is null then
    return pg_catalog.jsonb_build_object('kind', p_kind, 'date', v_date, 'available', false);
  end if;

  if p_user_id is not null then
    select * into v_play from public.daily_game_plays
    where user_id = p_user_id and puzzle_date = v_date and kind = p_kind;
  end if;

  v_finished := coalesce(v_play.finished_at is not null, false);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'mangaId', g.manga_id,
      'title', m.title,
      'correct', g.manga_id = v_puzzle.manga_id
    ) order by g.ord), '[]'::jsonb)
  into v_guesses
  from pg_catalog.unnest(coalesce(v_play.guesses, '{}'::uuid[])) with ordinality as g(manga_id, ord)
  left join public.mangas m on m.id = g.manga_id;

  if v_finished then
    select pg_catalog.jsonb_build_object('id', m.id, 'title', m.title, 'slug', m.slug, 'coverImage', m.cover_image_url)
    into v_answer
    from public.mangas m where m.id = v_puzzle.manga_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'date', v_date,
    'available', true,
    'maxGuesses', v_max,
    'guesses', v_guesses,
    'stage', case when v_finished then v_max else pg_catalog.cardinality(coalesce(v_play.guesses, '{}'::uuid[])) end,
    'solved', coalesce(v_play.solved, false),
    'finished', v_finished,
    'coinAwarded', coalesce(v_play.coin_awarded, 0),
    'dailyCoinEarned', case when p_user_id is null then 0 else app_private.daily_game_coin_earned(p_user_id, v_date) end,
    'dailyCoinCap', app_private.daily_game_daily_coin_cap(),
    'answer', v_answer
  );
end;
$$;

create or replace function app_private.get_daily_game(p_kind text)
returns jsonb language sql security definer set search_path = '' as $$
  select app_private.daily_game_snapshot(p_kind, public.current_public_user_id())
$$;

create or replace function app_private.submit_daily_game_guess(p_kind text, p_manga_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_date date := app_private.daily_game_today();
  v_puzzle public.daily_game_puzzles;
  v_play public.daily_game_plays;
  v_max integer := app_private.daily_game_max_guesses();
  v_correct boolean;
  v_count integer;
  v_reward integer := 0;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_manga_id is null or not exists (
    select 1 from public.mangas m where m.id = p_manga_id and m.is_active and m.is_approved
  ) then
    raise exception 'GAME_GUESS_INVALID' using errcode = '22023';
  end if;

  v_puzzle := app_private.ensure_daily_game_puzzle(p_kind, v_date);
  if v_puzzle.manga_id is null then
    raise exception 'GAME_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.daily_game_plays (user_id, puzzle_date, kind)
  values (v_user_id, v_date, p_kind)
  on conflict (user_id, puzzle_date, kind) do nothing;

  -- Two concurrent guesses process in order.
  select * into v_play from public.daily_game_plays
  where user_id = v_user_id and puzzle_date = v_date and kind = p_kind
  for update;

  if v_play.finished_at is not null then
    raise exception 'GAME_FINISHED' using errcode = 'P0001';
  end if;
  if p_manga_id = any(v_play.guesses) then
    raise exception 'GAME_GUESS_DUPLICATE' using errcode = 'P0001';
  end if;

  v_correct := p_manga_id = v_puzzle.manga_id;
  v_count := pg_catalog.cardinality(v_play.guesses) + 1;

  if v_correct then
    v_reward := least(
      app_private.daily_game_reward_for_guess(v_count),
      greatest(0, app_private.daily_game_daily_coin_cap() - app_private.daily_game_coin_earned(v_user_id, v_date))
    );
  end if;

  update public.daily_game_plays
  set guesses = guesses || p_manga_id,
      solved = v_correct,
      finished_at = case when v_correct or v_count >= v_max then pg_catalog.now() else null end,
      coin_awarded = v_reward,
      updated_at = pg_catalog.now()
  where user_id = v_user_id and puzzle_date = v_date and kind = p_kind;

  if v_reward > 0 then
    perform set_config('app.store_purchase_user_update', 'true', true);
    update public.users set stones = coalesce(stones, 0) + v_reward where id = v_user_id returning stones into v_balance;
    perform set_config('app.store_purchase_user_update', '', true);

    insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
    values (v_user_id, null, 'daily_game', p_kind || ':' || v_date::text || ':' || v_user_id::text, 'credit', 'Coin', v_reward, v_balance,
      pg_catalog.jsonb_build_object('kind', p_kind, 'puzzle_date', v_date, 'guess_count', v_count));
  end if;

  return app_private.daily_game_snapshot(p_kind, v_user_id) || pg_catalog.jsonb_build_object('lastGuessCorrect', v_correct);
end;
$$;

-- Only for the image proxy (service_role): source + player stage. NOT open to clients.
create or replace function app_private.daily_game_image_source(p_kind text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := app_private.daily_game_today();
  v_puzzle public.daily_game_puzzles;
  v_play public.daily_game_plays;
begin
  v_puzzle := app_private.ensure_daily_game_puzzle(p_kind, v_date);
  if v_puzzle.manga_id is null then
    return null;
  end if;
  if p_user_id is not null then
    select * into v_play from public.daily_game_plays
    where user_id = p_user_id and puzzle_date = v_date and kind = p_kind;
  end if;
  return pg_catalog.jsonb_build_object(
    'source', v_puzzle.image_source,
    'date', v_date,
    'stage', case when v_play.finished_at is not null then app_private.daily_game_max_guesses()
                  else pg_catalog.cardinality(coalesce(v_play.guesses, '{}'::uuid[])) end
  );
end;
$$;

revoke all on function app_private.daily_game_today() from public;
revoke all on function app_private.daily_game_max_guesses() from public;
revoke all on function app_private.daily_game_daily_coin_cap() from public;
revoke all on function app_private.daily_game_reward_for_guess(integer) from public;
revoke all on function app_private.ensure_daily_game_puzzle(text, date) from public;
revoke all on function app_private.daily_game_coin_earned(uuid, date) from public;
revoke all on function app_private.daily_game_snapshot(text, uuid) from public;
revoke all on function app_private.get_daily_game(text) from public;
revoke all on function app_private.submit_daily_game_guess(text, uuid) from public;
revoke all on function app_private.daily_game_image_source(text, uuid) from public;
grant execute on function app_private.get_daily_game(text) to anon, authenticated;
grant execute on function app_private.submit_daily_game_guess(text, uuid) to authenticated;
grant execute on function app_private.daily_game_image_source(text, uuid) to service_role;

create or replace function public.get_daily_game(p_kind text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.get_daily_game(p_kind)
$$;

create or replace function public.submit_daily_game_guess(p_kind text, p_manga_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.submit_daily_game_guess(p_kind, p_manga_id)
$$;

create or replace function public.daily_game_image_source(p_kind text, p_user_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.daily_game_image_source(p_kind, p_user_id)
$$;

revoke all on function public.get_daily_game(text) from public;
revoke all on function public.submit_daily_game_guess(text, uuid) from public;
revoke all on function public.daily_game_image_source(text, uuid) from public, anon, authenticated;
grant execute on function public.get_daily_game(text) to anon, authenticated;
grant execute on function public.submit_daily_game_guess(text, uuid) to authenticated;
grant execute on function public.daily_game_image_source(text, uuid) to service_role;
