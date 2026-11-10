-- ============================================
-- MangaZone | Admin Event Management RPCs (Task D)
-- Full site-admin management of kind='event' tasks + participation review:
-- 1) admin_list_event_quests   -> all events (active/inactive/expired) + participation summary
-- 2) admin_upsert_event_quest  -> create/edit an event task (date + reward)
-- 3) admin_set_event_quest_active -> active/inactive
-- All with an is_admin() gate + security definer. Metric limited to WINDOWED (advancing in events)
-- counters: no event task that accidentally does not flow.
-- Date: 2026-07-06
-- ============================================

begin;

-- ---- 1) admin_list_event_quests: event'ler + quest_progress katilim ozeti ----
create or replace function public.admin_list_event_quests()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_key text,
  target_value integer,
  coin_reward integer,
  task_group text,
  sort_order integer,
  is_active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  is_live boolean,
  participant_count bigint,
  completed_count bigint,
  claimed_count bigint,
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
    q.id, q.slug, q.title, coalesce(q.description, ''), q.metric_key,
    q.target_value, q.coin_reward, q.task_group, q.sort_order, q.is_active,
    q.starts_at, q.ends_at,
    (
      q.is_active
      and (q.starts_at is null or q.starts_at <= now())
      and (q.ends_at is null or q.ends_at >= now())
    ) as is_live,
    coalesce(s.participant_count, 0) as participant_count,
    coalesce(s.completed_count, 0) as completed_count,
    coalesce(s.claimed_count, 0) as claimed_count,
    coalesce(s.coin_credited, 0) as coin_credited,
    q.created_at, q.updated_at
  from public.quests q
  left join lateral (
    select
      count(distinct qp.subject_id) as participant_count,
      count(*) filter (where qp.is_completed) as completed_count,
      count(*) filter (where qp.claimed_at is not null) as claimed_count,
      coalesce(sum(qp.credited_coin), 0) as coin_credited
    from public.quest_progress qp
    where qp.quest_id = q.id and qp.period_key = 'event'
  ) s on true
  where q.kind = 'event'
  order by q.starts_at desc nulls last, q.task_group, q.sort_order, q.title;
end;
$$;

grant execute on function public.admin_list_event_quests() to authenticated;

-- ---- 2) admin_upsert_event_quest: olustur/duzenle ----
create or replace function public.admin_upsert_event_quest(
  p_id uuid default null,
  p_slug text default null,
  p_title text default null,
  p_description text default '',
  p_metric_key text default null,
  p_target_value integer default 1,
  p_coin_reward integer default 0,
  p_task_group text default 'etkinlik',
  p_sort_order integer default 0,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_is_active boolean default true
)
returns table (
  id uuid,
  slug text,
  title text,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_metric text;
  v_group text;
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Etkinlik gorev basligi zorunludur.';
  end if;

  v_metric := lower(trim(coalesce(p_metric_key, '')));
  -- Event progress is fed by record_quest_event; only windowed metrics flow.
  if v_metric not in ('chapters_read', 'rating_count', 'manga_comment_count', 'total_comment_count', 'community_post_count') then
    raise exception 'Event gorevi yalniz pencereli metrik kullanabilir (chapters_read, rating_count, manga_comment_count, total_comment_count, community_post_count).';
  end if;

  if coalesce(p_target_value, 0) <= 0 then
    raise exception 'Hedef deger 0''dan buyuk olmalidir.';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Bitis tarihi baslangictan sonra olmalidir.';
  end if;

  v_group := nullif(trim(coalesce(p_task_group, '')), '');
  if v_group is null then v_group := 'etkinlik'; end if;

  if p_id is not null then
    update public.quests q set
      title = trim(p_title),
      description = coalesce(p_description, ''),
      metric_key = v_metric,
      target_value = p_target_value,
      coin_reward = greatest(coalesce(p_coin_reward, 0), 0),
      task_group = v_group,
      sort_order = coalesce(p_sort_order, 0),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    where q.id = p_id and q.kind = 'event';
    if not found then
      raise exception 'Duzenlenecek event gorevi bulunamadi.';
    end if;
    return query select q.id, q.slug, q.title, q.is_active from public.quests q where q.id = p_id;
    return;
  end if;

  v_slug := lower(regexp_replace(trim(coalesce(p_slug, p_title, '')), '[^a-z0-9-]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 3 then
    raise exception 'Event slug en az 3 karakter olmalidir.';
  end if;

  return query
  insert into public.quests (
    slug, title, description, audience, kind, metric_key, target_value,
    reward_kind, coin_reward, task_group, tier_level, sort_order, is_active,
    starts_at, ends_at
  )
  values (
    v_slug, trim(p_title), coalesce(p_description, ''), 'user', 'event', v_metric, p_target_value,
    'coin', greatest(coalesce(p_coin_reward, 0), 0), v_group, 1, coalesce(p_sort_order, 0),
    coalesce(p_is_active, true), p_starts_at, p_ends_at
  )
  on conflict (slug) do update set
    title = excluded.title,
    description = excluded.description,
    metric_key = excluded.metric_key,
    target_value = excluded.target_value,
    coin_reward = excluded.coin_reward,
    task_group = excluded.task_group,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now()
  returning quests.id, quests.slug, quests.title, quests.is_active;
end;
$$;

grant execute on function public.admin_upsert_event_quest(uuid, text, text, text, text, integer, integer, text, integer, timestamptz, timestamptz, boolean) to authenticated;

-- ---- 3) admin_set_event_quest_active: aktif/pasif ----
create or replace function public.admin_set_event_quest_active(
  p_quest_id uuid,
  p_is_active boolean
)
returns table (id uuid, is_active boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;
  return query
  update public.quests q set is_active = coalesce(p_is_active, false), updated_at = now()
  where q.id = p_quest_id and q.kind = 'event'
  returning q.id, q.is_active;
end;
$$;

grant execute on function public.admin_set_event_quest_active(uuid, boolean) to authenticated;

commit;
