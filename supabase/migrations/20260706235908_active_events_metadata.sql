-- ============================================
-- MangaZone | list_active_events + Event metadata (Phase 2)
-- The sidebar/panel now shows the event title/theme/banner from the DB
-- and can group multiple events. Also returns is_locked for chains (unlock).
-- Activity/window is set from the event entity (quest_events).
-- Date: 2026-07-06
-- ============================================

begin;

-- return type (OUT columns) changes so create-or-replace is not enough; drop first.
drop function if exists public.list_active_events();

create or replace function public.list_active_events()
returns table (
  quest_id uuid,
  slug text,
  title text,
  description text,
  metric_key text,
  target_value integer,
  progress_value bigint,
  is_completed boolean,
  is_claimed boolean,
  is_claimable boolean,
  is_locked boolean,
  coin_reward integer,
  sort_order integer,
  unlock_requires_quest_id uuid,
  event_id uuid,
  event_slug text,
  event_title text,
  event_description text,
  event_theme text,
  event_banner text,
  event_structure text,
  event_sort_order integer,
  event_ends_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := public.current_public_user_id();
  if v_user is null then
    return;
  end if;
  if not public.is_feature_enabled('rewards.user_tasks', false) then
    return;
  end if;

  return query
  select
    q.id,
    q.slug,
    q.title,
    coalesce(q.description, ''),
    q.metric_key,
    q.target_value,
    coalesce(qp.progress_value, 0)::bigint as progress_value,
    (coalesce(qp.progress_value, 0) >= q.target_value) as is_completed,
    (qp.claimed_at is not null) as is_claimed,
    (
      coalesce(qp.progress_value, 0) >= q.target_value
      and qp.claimed_at is null
      and (
        q.unlock_requires_quest_id is null
        or exists (
          select 1 from public.quest_progress uqp
          where uqp.quest_id = q.unlock_requires_quest_id
            and uqp.subject_type = 'user'
            and uqp.subject_id = v_user
            and uqp.claimed_at is not null
        )
      )
    ) as is_claimable,
    (
      q.unlock_requires_quest_id is not null
      and not exists (
        select 1 from public.quest_progress uqp
        where uqp.quest_id = q.unlock_requires_quest_id
          and uqp.subject_type = 'user'
          and uqp.subject_id = v_user
          and uqp.claimed_at is not null
      )
    ) as is_locked,
    q.coin_reward,
    q.sort_order,
    q.unlock_requires_quest_id,
    e.id as event_id,
    e.slug as event_slug,
    e.title as event_title,
    e.description as event_description,
    e.theme_key as event_theme,
    e.banner_url as event_banner,
    e.structure as event_structure,
    e.sort_order as event_sort_order,
    e.ends_at as event_ends_at
  from public.quests q
  join public.quest_events e on e.id = q.event_id
  left join public.quest_progress qp
    on qp.quest_id = q.id
   and qp.subject_type = 'user'
   and qp.subject_id = v_user
   and qp.period_key = 'event'
  where q.kind = 'event'
    and q.is_active = true
    and e.is_active = true
    and (e.starts_at is null or e.starts_at <= now())
    and (e.ends_at is null or e.ends_at >= now())
  order by e.sort_order, e.title, q.sort_order, q.title;
end;
$$;

grant execute on function public.list_active_events() to authenticated;

commit;
