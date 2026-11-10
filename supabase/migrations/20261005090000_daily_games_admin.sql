-- Games Corner admin: all game rules read from one settings row; changed from the admin panel
-- . The admin also sees daily stats, the day's puzzles, top earners and
-- suspicious runs; can pick tomorrow's (or today's not yet played) puzzle.
-- Fixed values are kept as settings row defaults (behavior does not change).

create table if not exists public.daily_game_settings (
  id boolean primary key default true check (id),
  daily_coin_cap integer not null default 30 check (daily_coin_cap between 0 and 500),
  cover_enabled boolean not null default true,
  panel_enabled boolean not null default true,
  runner_enabled boolean not null default true,
  match_enabled boolean not null default true,
  guess_rewards integer[] not null default '{20,15,12,9,6,4}'::integer[]
    check (pg_catalog.cardinality(guess_rewards) = 6 and 0 <= all (guess_rewards) and 200 >= all (guess_rewards)),
  run_attempts integer not null default 3 check (run_attempts between 1 and 20),
  runner_tiers jsonb not null default '[{"score":1500,"coin":8},{"score":800,"coin":6},{"score":400,"coin":4},{"score":150,"coin":2}]'::jsonb,
  match_tiers jsonb not null default '[{"seconds":35,"coin":8},{"seconds":50,"coin":6},{"seconds":80,"coin":4}]'::jsonb,
  match_finish_coin integer not null default 2 check (match_finish_coin between 0 and 200),
  panel_min_series integer not null default 8 check (panel_min_series between 1 and 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
insert into public.daily_game_settings (id) values (true) on conflict (id) do nothing;
alter table public.daily_game_settings enable row level security;
revoke all on table public.daily_game_settings from public, anon, authenticated;

create or replace function app_private.daily_game_settings_row()
returns public.daily_game_settings language sql stable security definer set search_path = '' as $$
  select s from public.daily_game_settings s where s.id limit 1
$$;

create or replace function app_private.daily_game_enabled(p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(case p_kind
    when 'cover' then s.cover_enabled
    when 'panel' then s.panel_enabled
    when 'runner' then s.runner_enabled
    when 'match' then s.match_enabled
  end, false)
  from public.daily_game_settings s where s.id
$$;

create or replace function app_private.daily_game_daily_coin_cap()
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select s.daily_coin_cap from public.daily_game_settings s where s.id), 30)
$$;

create or replace function app_private.daily_game_reward_for_guess(p_guess_count integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select s.guess_rewards[p_guess_count] from public.daily_game_settings s where s.id), 0)
$$;

create or replace function app_private.daily_game_run_attempts()
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select s.run_attempts from public.daily_game_settings s where s.id), 3)
$$;

-- Kademe: kosuda gecilen en yuksek esigin coini; eslemede suresi sigan en kucuk esigin coini,
-- hicbiri degilse bitirme coini.
create or replace function app_private.daily_game_run_tier(p_kind text, p_value integer)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when p_kind = 'runner' then coalesce((
      select max((t ->> 'coin')::integer)
      from public.daily_game_settings s, pg_catalog.jsonb_array_elements(s.runner_tiers) t
      where s.id and p_value >= (t ->> 'score')::integer
    ), 0)
    when p_kind = 'match' then coalesce((
      select (t ->> 'coin')::integer
      from public.daily_game_settings s, pg_catalog.jsonb_array_elements(s.match_tiers) t
      where s.id and p_value <= (t ->> 'seconds')::integer
      order by (t ->> 'seconds')::integer
      limit 1
    ), (select s.match_finish_coin from public.daily_game_settings s where s.id), 0)
    else 0
  end
$$;

-- Rule change: with a game off a guess/attempt is rejected, the panel threshold comes from settings.
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
    ) < (app_private.daily_game_settings_row()).panel_min_series then
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
  if not app_private.daily_game_enabled(p_kind) then
    return pg_catalog.jsonb_build_object('kind', p_kind, 'date', v_date, 'available', false, 'disabled', true);
  end if;
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
    'rewards', pg_catalog.to_jsonb((app_private.daily_game_settings_row()).guess_rewards),
    'answer', v_answer
  );
end;
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
  if not app_private.daily_game_enabled(p_kind) then
    raise exception 'GAME_DISABLED' using errcode = 'P0001';
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
  if not app_private.daily_game_enabled(p_kind) then
    raise exception 'GAME_DISABLED' using errcode = 'P0001';
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
    'dailyCoinCap', app_private.daily_game_daily_coin_cap(),
    'enabled', app_private.daily_game_enabled(p_kind),
    'tiers', case when p_kind = 'match' then (app_private.daily_game_settings_row()).match_tiers else (app_private.daily_game_settings_row()).runner_tiers end,
    'finishCoin', case when p_kind = 'match' then (app_private.daily_game_settings_row()).match_finish_coin else 0 end
  )
$$;


-- --- Admin ------------------------------------------------------------------------------------

create or replace function app_private.daily_game_settings_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'dailyCoinCap', s.daily_coin_cap,
    'enabled', pg_catalog.jsonb_build_object('cover', s.cover_enabled, 'panel', s.panel_enabled, 'runner', s.runner_enabled, 'match', s.match_enabled),
    'guessRewards', pg_catalog.to_jsonb(s.guess_rewards),
    'runAttempts', s.run_attempts,
    'runnerTiers', s.runner_tiers,
    'matchTiers', s.match_tiers,
    'matchFinishCoin', s.match_finish_coin,
    'panelMinSeries', s.panel_min_series,
    'updatedAt', s.updated_at
  )
  from public.daily_game_settings s where s.id
$$;

create or replace function public.admin_daily_games_overview(p_days integer default 14)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := app_private.daily_game_today();
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  -- If today's puzzles are absent they are set now (so the admin can see).
  perform app_private.ensure_daily_game_puzzle('cover', v_today);
  perform app_private.ensure_daily_game_puzzle('panel', v_today);

  return pg_catalog.jsonb_build_object(
    'today', v_today,
    'settings', app_private.daily_game_settings_json(),
    'puzzles', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date', p.puzzle_date, 'kind', p.kind, 'mangaId', p.manga_id, 'title', m.title,
        'plays', (select count(*) from public.daily_game_plays g where g.puzzle_date = p.puzzle_date and g.kind = p.kind)
      ) order by p.puzzle_date desc, p.kind)
      from public.daily_game_puzzles p
      left join public.mangas m on m.id = p.manga_id
      where p.puzzle_date between v_today - 6 and v_today + 7
    ), '[]'::jsonb),
    'daily', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date', d.day,
        'coverPlayers', (select count(*) from public.daily_game_plays g where g.puzzle_date = d.day and g.kind = 'cover'),
        'coverSolved', (select count(*) from public.daily_game_plays g where g.puzzle_date = d.day and g.kind = 'cover' and g.solved),
        'panelPlayers', (select count(*) from public.daily_game_plays g where g.puzzle_date = d.day and g.kind = 'panel'),
        'runnerRuns', (select count(*) from public.daily_game_runs r where r.run_date = d.day and r.kind = 'runner'),
        'matchRuns', (select count(*) from public.daily_game_runs r where r.run_date = d.day and r.kind = 'match'),
        'players', (select count(distinct u) from (
            select g.user_id as u from public.daily_game_plays g where g.puzzle_date = d.day
            union select r.user_id from public.daily_game_runs r where r.run_date = d.day) x),
        'coins', (select coalesce(sum(g.coin_awarded), 0) from public.daily_game_plays g where g.puzzle_date = d.day)
               + (select coalesce(sum(r.coin_awarded), 0) from public.daily_game_runs r where r.run_date = d.day)
      ) order by d.day desc)
      from pg_catalog.generate_series(v_today - (v_days - 1), v_today, interval '1 day') as gs(ts),
      lateral (select gs.ts::date as day) d
    ), '[]'::jsonb),
    'topEarners', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('userId', t.user_id, 'username', u.username, 'coins', t.coins) order by t.coins desc)
      from (
        select x.user_id, sum(x.coins)::integer as coins from (
          select g.user_id, g.coin_awarded as coins from public.daily_game_plays g where g.puzzle_date > v_today - 7
          union all select r.user_id, r.coin_awarded from public.daily_game_runs r where r.run_date > v_today - 7
        ) x group by x.user_id order by sum(x.coins) desc limit 10
      ) t join public.users u on u.id = t.user_id
    ), '[]'::jsonb),
    -- Suspicious: runs with scores very close to the server upper limit (12/s).
    'suspiciousRuns', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'runId', r.id, 'userId', r.user_id, 'username', u.username, 'date', r.run_date, 'score', r.score,
        'seconds', floor(extract(epoch from (r.finished_at - r.started_at)))::integer, 'coin', r.coin_awarded
      ) order by r.finished_at desc)
      from public.daily_game_runs r join public.users u on u.id = r.user_id
      where r.kind = 'runner' and r.finished_at is not null and r.run_date > v_today - 7 and r.score >= 150
        and r.score >= 11 * extract(epoch from (r.finished_at - r.started_at))
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_update_daily_game_settings(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rewards integer[];
  v_tier jsonb;
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  if p ? 'guessRewards' then
    select pg_catalog.array_agg(value::integer order by ord) into v_rewards
    from pg_catalog.jsonb_array_elements_text(p -> 'guessRewards') with ordinality as e(value, ord);
  end if;
  for v_tier in select * from pg_catalog.jsonb_array_elements(coalesce(p -> 'runnerTiers', '[]'::jsonb)) loop
    if (v_tier ->> 'score')::integer is null or (v_tier ->> 'coin')::integer not between 0 and 200 then
      raise exception 'Kosu kademesi gecersiz.';
    end if;
  end loop;
  for v_tier in select * from pg_catalog.jsonb_array_elements(coalesce(p -> 'matchTiers', '[]'::jsonb)) loop
    if (v_tier ->> 'seconds')::integer is null or (v_tier ->> 'coin')::integer not between 0 and 200 then
      raise exception 'Esleme kademesi gecersiz.';
    end if;
  end loop;

  update public.daily_game_settings s set
    daily_coin_cap = coalesce((p ->> 'dailyCoinCap')::integer, s.daily_coin_cap),
    cover_enabled = coalesce((p -> 'enabled' ->> 'cover')::boolean, s.cover_enabled),
    panel_enabled = coalesce((p -> 'enabled' ->> 'panel')::boolean, s.panel_enabled),
    runner_enabled = coalesce((p -> 'enabled' ->> 'runner')::boolean, s.runner_enabled),
    match_enabled = coalesce((p -> 'enabled' ->> 'match')::boolean, s.match_enabled),
    guess_rewards = coalesce(v_rewards, s.guess_rewards),
    run_attempts = coalesce((p ->> 'runAttempts')::integer, s.run_attempts),
    runner_tiers = coalesce(p -> 'runnerTiers', s.runner_tiers),
    match_tiers = coalesce(p -> 'matchTiers', s.match_tiers),
    match_finish_coin = coalesce((p ->> 'matchFinishCoin')::integer, s.match_finish_coin),
    panel_min_series = coalesce((p ->> 'panelMinSeries')::integer, s.panel_min_series),
    updated_at = pg_catalog.now(),
    updated_by = public.current_public_user_id()
  where s.id;

  return app_private.daily_game_settings_json();
end;
$$;

-- Puzzle selection: only today (if nobody played yet) or a future date.
create or replace function public.admin_set_daily_puzzle(p_kind text, p_date date, p_manga_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := app_private.daily_game_today();
  v_source text;
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  if p_kind not in ('cover', 'panel') then
    raise exception 'Gecersiz oyun.';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 60 then
    raise exception 'Tarih bugun ile 60 gun sonrasi arasinda olmali.';
  end if;
  if exists (select 1 from public.daily_game_plays g where g.puzzle_date = p_date and g.kind = p_kind) then
    raise exception 'Bu bulmaca oynanmaya basladi; degistirilemez.';
  end if;

  if p_kind = 'cover' then
    select m.cover_image_url into v_source from public.mangas m
    where m.id = p_manga_id and m.is_active and m.is_approved and pg_catalog.btrim(coalesce(m.cover_image_url, '')) <> '';
    if v_source is null then
      raise exception 'Bu serinin kapagi yok ya da seri yayinda degil.';
    end if;
  else
    select pg.page into v_source
    from public.chapters c
    cross join lateral pg_catalog.jsonb_array_elements_text(coalesce(c.pages, '[]'::jsonb)) with ordinality as pg(page, ord)
    where c.manga_id = p_manga_id and c.is_active and c.is_approved
      and (c.publish_at is null or c.publish_at <= pg_catalog.now())
      and pg.ord >= 3 and pg.page not ilike '%placehold%'
    order by pg_catalog.random()
    limit 1;
    if v_source is null then
      raise exception 'Bu serinin uygun (gercek) bolum sayfasi yok.';
    end if;
  end if;

  insert into public.daily_game_puzzles (puzzle_date, kind, manga_id, image_source)
  values (p_date, p_kind, p_manga_id, v_source)
  on conflict (puzzle_date, kind) do update set manga_id = excluded.manga_id, image_source = excluded.image_source, created_at = pg_catalog.now();

  return pg_catalog.jsonb_build_object('date', p_date, 'kind', p_kind, 'mangaId', p_manga_id);
end;
$$;

revoke all on function app_private.daily_game_settings_row() from public;
revoke all on function app_private.daily_game_enabled(text) from public;
revoke all on function app_private.daily_game_settings_json() from public;
revoke all on function public.admin_daily_games_overview(integer) from public, anon;
revoke all on function public.admin_update_daily_game_settings(jsonb) from public, anon;
revoke all on function public.admin_set_daily_puzzle(text, date, uuid) from public, anon;
grant execute on function public.admin_daily_games_overview(integer) to authenticated;
grant execute on function public.admin_update_daily_game_settings(jsonb) to authenticated;
grant execute on function public.admin_set_daily_puzzle(text, date, uuid) to authenticated;
