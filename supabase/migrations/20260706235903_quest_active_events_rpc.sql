-- ============================================
-- MangaZone | list_active_events RPC (sidebar event surface)
-- So the left sidebar can show the active event CHEAPLY: only kind='event',
-- active window, with the caller windowed progress. A separate light RPC to avoid calling
-- the whole list_quests (40+ rows) on each page load.
-- Progress source: quest_progress period_key='event' (Phase 4 engine, 255).
-- Date: 2026-07-06
-- ============================================

begin;

create or replace function public.list_active_events()
returns table (
  quest_id uuid,
  slug text,
  title text,
  description text,
  task_group text,
  metric_key text,
  target_value integer,
  progress_value bigint,
  is_completed boolean,
  is_claimed boolean,
  is_claimable boolean,
  coin_reward integer,
  sort_order integer,
  starts_at timestamptz,
  ends_at timestamptz
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
    q.task_group,
    q.metric_key,
    q.target_value,
    coalesce(qp.progress_value, 0)::bigint as progress_value,
    (coalesce(qp.progress_value, 0) >= q.target_value) as is_completed,
    (qp.claimed_at is not null) as is_claimed,
    (
      coalesce(qp.progress_value, 0) >= q.target_value
      and qp.claimed_at is null
    ) as is_claimable,
    q.coin_reward,
    q.sort_order,
    q.starts_at,
    q.ends_at
  from public.quests q
  left join public.quest_progress qp
    on qp.quest_id = q.id
   and qp.subject_type = 'user'
   and qp.subject_id = v_user
   and qp.period_key = 'event'
  where q.audience = 'user'
    and q.kind = 'event'
    and q.is_active = true
    and (q.starts_at is null or q.starts_at <= now())
    and (q.ends_at is null or q.ends_at >= now())
  order by q.task_group, q.sort_order, q.title;
end;
$$;

grant execute on function public.list_active_events() to authenticated;

commit;
