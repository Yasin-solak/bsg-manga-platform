begin;

create or replace function public.get_fansub_manage_boost_reward_summary(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not public.is_admin() and not public.is_fansub_admin(p_fansub_id) then
    raise exception 'Bu fansub icin supporter reward ozeti gorme yetkiniz yok.';
  end if;

  select jsonb_build_object(
    'activeSupporterCount', count(*) filter (where state.active_grant_count > 0),
    'visibleSupporterCount', count(*) filter (where state.active_grant_count > 0 and state.is_visible),
    'foundingSupporterCount', count(*) filter (where state.is_founding),
    'activeFoundingSupporterCount', count(*) filter (where state.is_founding and state.active_grant_count > 0),
    'activeStreakSupporterCount', count(*) filter (where state.streak_count >= 2 and state.active_grant_count > 0),
    'bestActiveStreakCount', coalesce(max(state.streak_count) filter (where state.active_grant_count > 0), 0),
    'bestLifetimeStreakCount', coalesce(max(state.best_streak_count), 0),
    'remainingFoundingSlots', greatest(0, 10 - count(*) filter (where state.is_founding)),
    'monthlySupporterCount', count(*) filter (where state.active_grant_count > 0 and state.supporter_reward_tier = 1),
    'megaSupporterCount', count(*) filter (where state.active_grant_count > 0 and state.supporter_reward_tier = 2),
    'topSupporterCount', count(*) filter (where state.active_grant_count > 0 and state.supporter_reward_tier >= 3),
    'lastGrantedAt', max(state.last_granted_at),
    'hasAnyRewardState', count(*) > 0
  )
  into v_payload
  from (
    select
      supporter_state.*,
      coalesce((supporter_state.reward_capabilities ->> 'isFoundingSupporter')::boolean, false) as is_founding,
      greatest(coalesce((supporter_state.reward_capabilities ->> 'streakCount')::integer, 0), 0) as streak_count,
      greatest(coalesce((supporter_state.reward_capabilities ->> 'bestStreakCount')::integer, 0), 0) as best_streak_count
    from public.fansub_boost_supporter_states supporter_state
    where supporter_state.fansub_id = p_fansub_id
  ) state;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_fansub_manage_boost_reward_summary(uuid) to authenticated;

commit;
