-- ============================================
-- MangaZone | Admin Quest Event RPCs (Event entity, Phase 1)
-- FULL admin control through the event entity (quest_events):
-- * admin_list_quest_events    -> events + summary (tasks/participants/live)
-- * admin_upsert_quest_event   -> create/edit an event + CASCADE window/activity to child tasks
-- * admin_delete_quest_event   -> delete an event (child tasks FK cascade)
-- * admin_list_event_quests    -> an event's tasks + per-task participation
-- * admin_upsert_event_quest   -> create/edit an event task (event_id + custom name + chain)
-- * admin_delete_event_quest   -> delete one event task
-- Flat (entity-less) versions of 259 are superseded -> dropped since the signature changes.
-- Date: 2026-07-06
-- ============================================

begin;

-- Remove flat RPCs of 259 (signature changes)
drop function if exists public.admin_list_event_quests();
drop function if exists public.admin_upsert_event_quest(uuid, text, text, text, text, integer, integer, text, integer, timestamptz, timestamptz, boolean);

-- ---- 1) admin_list_quest_events: events + summary ----
create or replace function public.admin_list_quest_events()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  theme_key text,
  banner_url text,
  structure text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean,
  sort_order integer,
  is_live boolean,
  quest_count bigint,
  participant_count bigint,
  coin_credited bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  return query
  select
    e.id, e.slug, e.title, e.description, e.theme_key, e.banner_url, e.structure,
    e.starts_at, e.ends_at, e.is_active, e.sort_order,
    (
      e.is_active
      and (e.starts_at is null or e.starts_at <= now())
      and (e.ends_at is null or e.ends_at >= now())
    ) as is_live,
    coalesce(s.quest_count, 0) as quest_count,
    coalesce(s.participant_count, 0) as participant_count,
    coalesce(s.coin_credited, 0) as coin_credited,
    e.created_at, e.updated_at
  from public.quest_events e
  left join lateral (
    select
      count(distinct q.id) as quest_count,
      count(distinct qp.subject_id) as participant_count,
      coalesce(sum(qp.credited_coin), 0) as coin_credited
    from public.quests q
    left join public.quest_progress qp
      on qp.quest_id = q.id and qp.period_key = 'event'
    where q.event_id = e.id
  ) s on true
  order by e.sort_order, e.starts_at desc nulls last, e.title;
end;
$$;

grant execute on function public.admin_list_quest_events() to authenticated;

-- ---- 2) admin_upsert_quest_event: olustur/duzenle + CASCADE ----
create or replace function public.admin_upsert_quest_event(
  p_id uuid default null,
  p_slug text default null,
  p_title text default null,
  p_description text default '',
  p_theme_key text default 'ozel',
  p_banner_url text default null,
  p_structure text default 'independent',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_is_active boolean default true,
  p_sort_order integer default 0
)
returns table (id uuid, slug text, title text, is_active boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_structure text;
  v_event_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Etkinlik basligi zorunludur.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Bitis tarihi baslangictan sonra olmalidir.';
  end if;

  v_structure := lower(trim(coalesce(p_structure, 'independent')));
  if v_structure not in ('independent', 'chain') then
    v_structure := 'independent';
  end if;

  if p_id is not null then
    update public.quest_events e set
      title = trim(p_title),
      description = coalesce(p_description, ''),
      theme_key = coalesce(nullif(trim(p_theme_key), ''), 'ozel'),
      banner_url = nullif(trim(coalesce(p_banner_url, '')), ''),
      structure = v_structure,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      is_active = coalesce(p_is_active, true),
      sort_order = coalesce(p_sort_order, 0),
      updated_at = now()
    where e.id = p_id;
    if not found then
      raise exception 'Duzenlenecek etkinlik bulunamadi.';
    end if;
    v_event_id := p_id;
  else
    v_slug := lower(regexp_replace(trim(coalesce(p_slug, p_title, '')), '[^a-z0-9-]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    if length(v_slug) < 3 then
      raise exception 'Etkinlik slug en az 3 karakter olmalidir.';
    end if;
    insert into public.quest_events (
      slug, title, description, theme_key, banner_url, structure,
      starts_at, ends_at, is_active, sort_order
    )
    values (
      v_slug, trim(p_title), coalesce(p_description, ''),
      coalesce(nullif(trim(p_theme_key), ''), 'ozel'),
      nullif(trim(coalesce(p_banner_url, '')), ''), v_structure,
      p_starts_at, p_ends_at, coalesce(p_is_active, true), coalesce(p_sort_order, 0)
    )
    on conflict (slug) do update set
      title = excluded.title, updated_at = now()
    returning quest_events.id into v_event_id;
  end if;

  -- CASCADE: event window/activity + task_group copy to child tasks
  -- (the engine runs on quest fields; the event = the single source of truth).
  update public.quests q set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    is_active = coalesce(p_is_active, true),
    task_group = (select e.slug from public.quest_events e where e.id = v_event_id),
    updated_at = now()
  where q.event_id = v_event_id and q.kind = 'event';

  return query select e.id, e.slug, e.title, e.is_active from public.quest_events e where e.id = v_event_id;
end;
$$;

grant execute on function public.admin_upsert_quest_event(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, integer) to authenticated;

-- ---- 3) admin_delete_quest_event ----
create or replace function public.admin_delete_quest_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;
  delete from public.quest_events where id = p_id;
end;
$$;

grant execute on function public.admin_delete_quest_event(uuid) to authenticated;

-- ---- 4) admin_list_event_quests(p_event_id): an event's tasks + participation ----
create or replace function public.admin_list_event_quests(p_event_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_key text,
  target_value integer,
  coin_reward integer,
  sort_order integer,
  is_active boolean,
  unlock_requires_quest_id uuid,
  participant_count bigint,
  completed_count bigint,
  claimed_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  return query
  select
    q.id, q.slug, q.title, coalesce(q.description, ''), q.metric_key,
    q.target_value, q.coin_reward, q.sort_order, q.is_active, q.unlock_requires_quest_id,
    coalesce(s.participant_count, 0), coalesce(s.completed_count, 0), coalesce(s.claimed_count, 0)
  from public.quests q
  left join lateral (
    select
      count(distinct qp.subject_id) as participant_count,
      count(*) filter (where qp.is_completed) as completed_count,
      count(*) filter (where qp.claimed_at is not null) as claimed_count
    from public.quest_progress qp
    where qp.quest_id = q.id and qp.period_key = 'event'
  ) s on true
  where q.event_id = p_event_id and q.kind = 'event'
  order by q.sort_order, q.title;
end;
$$;

grant execute on function public.admin_list_event_quests(uuid) to authenticated;

-- ---- 5) admin_upsert_event_quest: create/edit an event task ----
create or replace function public.admin_upsert_event_quest(
  p_event_id uuid,
  p_id uuid default null,
  p_title text default null,
  p_description text default '',
  p_metric_key text default null,
  p_target_value integer default 1,
  p_coin_reward integer default 0,
  p_sort_order integer default 0,
  p_unlock_requires_quest_id uuid default null,
  p_is_active boolean default true
)
returns table (id uuid, slug text, title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.quest_events%rowtype;
  v_slug text;
  v_metric text;
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  select * into v_event from public.quest_events where id = p_event_id;
  if not found then
    raise exception 'Etkinlik bulunamadi.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Gorev basligi zorunludur.';
  end if;

  v_metric := lower(trim(coalesce(p_metric_key, '')));
  if v_metric not in ('chapters_read', 'rating_count', 'manga_comment_count', 'total_comment_count', 'community_post_count') then
    raise exception 'Event gorevi yalniz pencereli metrik kullanabilir (chapters_read, rating_count, manga_comment_count, total_comment_count, community_post_count).';
  end if;
  if coalesce(p_target_value, 0) <= 0 then
    raise exception 'Hedef deger 0''dan buyuk olmalidir.';
  end if;

  if p_id is not null then
    update public.quests q set
      title = trim(p_title),
      description = coalesce(p_description, ''),
      metric_key = v_metric,
      target_value = p_target_value,
      coin_reward = greatest(coalesce(p_coin_reward, 0), 0),
      sort_order = coalesce(p_sort_order, 0),
      unlock_requires_quest_id = p_unlock_requires_quest_id,
      is_active = coalesce(p_is_active, v_event.is_active),
      -- pencere/tema etkinlikten
      starts_at = v_event.starts_at,
      ends_at = v_event.ends_at,
      task_group = v_event.slug,
      updated_at = now()
    where q.id = p_id and q.event_id = p_event_id;
    if not found then
      raise exception 'Duzenlenecek etkinlik gorevi bulunamadi.';
    end if;
    return query select q.id, q.slug, q.title from public.quests q where q.id = p_id;
    return;
  end if;

  v_slug := v_event.slug || '-' || lower(regexp_replace(trim(p_title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 4);
  v_slug := trim(both '-' from v_slug);

  return query
  insert into public.quests (
    slug, title, description, audience, kind, metric_key, target_value,
    reward_kind, coin_reward, task_group, tier_level, sort_order, is_active,
    starts_at, ends_at, event_id, unlock_requires_quest_id
  )
  values (
    v_slug, trim(p_title), coalesce(p_description, ''), 'user', 'event', v_metric, p_target_value,
    'coin', greatest(coalesce(p_coin_reward, 0), 0), v_event.slug, 1, coalesce(p_sort_order, 0),
    coalesce(p_is_active, v_event.is_active), v_event.starts_at, v_event.ends_at, p_event_id, p_unlock_requires_quest_id
  )
  returning quests.id, quests.slug, quests.title;
end;
$$;

grant execute on function public.admin_upsert_event_quest(uuid, uuid, text, text, text, integer, integer, integer, uuid, boolean) to authenticated;

-- ---- 6) admin_delete_event_quest ----
create or replace function public.admin_delete_event_quest(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;
  delete from public.quests where id = p_id and kind = 'event';
end;
$$;

grant execute on function public.admin_delete_event_quest(uuid) to authenticated;

commit;
