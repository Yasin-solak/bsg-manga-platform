-- ============================================
-- MangaZone | Admin event upsert -> returns void (400 fix)
-- Problem: admin_upsert_quest_event / admin_upsert_event_quest RETURNS TABLE
-- column names (id/slug/title/is_active) clashed with columns inside DML and
-- could give a mystic 400 in plpgsql. The frontend does not use the return anyway ->
-- RETURNS TABLE fully removed with returns void (ends the clash class).
-- Signature (arg list) is the same; only the return type changed -> DROP + CREATE.
-- Date: 2026-07-06
-- ============================================

begin;

drop function if exists public.admin_upsert_quest_event(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, integer);
drop function if exists public.admin_upsert_event_quest(uuid, uuid, text, text, text, integer, integer, integer, uuid, boolean);

-- ---- admin_upsert_quest_event (returns void) ----
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
returns void
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

  update public.quests q set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    is_active = coalesce(p_is_active, true),
    task_group = (select e.slug from public.quest_events e where e.id = v_event_id),
    updated_at = now()
  where q.event_id = v_event_id and q.kind = 'event';
end;
$$;

grant execute on function public.admin_upsert_quest_event(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, integer) to authenticated;

-- ---- admin_upsert_event_quest (returns void) ----
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
returns void
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
      starts_at = v_event.starts_at,
      ends_at = v_event.ends_at,
      task_group = v_event.slug,
      updated_at = now()
    where q.id = p_id and q.event_id = p_event_id;
    if not found then
      raise exception 'Duzenlenecek etkinlik gorevi bulunamadi.';
    end if;
    return;
  end if;

  v_slug := v_event.slug || '-' || lower(regexp_replace(trim(p_title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 4);
  v_slug := trim(both '-' from v_slug);

  insert into public.quests (
    slug, title, description, audience, kind, metric_key, target_value,
    reward_kind, coin_reward, task_group, tier_level, sort_order, is_active,
    starts_at, ends_at, event_id, unlock_requires_quest_id
  )
  values (
    v_slug, trim(p_title), coalesce(p_description, ''), 'user', 'event', v_metric, p_target_value,
    'coin', greatest(coalesce(p_coin_reward, 0), 0), v_event.slug, 1, coalesce(p_sort_order, 0),
    coalesce(p_is_active, v_event.is_active), v_event.starts_at, v_event.ends_at, p_event_id, p_unlock_requires_quest_id
  );
end;
$$;

grant execute on function public.admin_upsert_event_quest(uuid, uuid, text, text, text, integer, integer, integer, uuid, boolean) to authenticated;

commit;
