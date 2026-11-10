begin;

create or replace function public.list_public_fansub_boost_supporters_preview(
  p_fansub_id uuid,
  p_limit integer default 6
)
returns table (
  supporter_user_id uuid,
  username text,
  username_slug text,
  avatar_url text,
  supporter_reward_tier integer,
  highest_active_plan_code text,
  latest_supporter_note text,
  active_until timestamptz,
  reward_capabilities jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 12));
  v_snapshot public.fansub_boost_snapshots%rowtype;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  v_snapshot := public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);

  if coalesce((v_snapshot.capabilities ->> 'canUseSupporterList')::boolean, false) = false then
    return;
  end if;

  return query
  with active_supporters as (
    select
      g.supporter_user_id,
      count(*)::integer as active_grant_count,
      coalesce(sum(g.boost_power), 0)::integer as active_total_power,
      coalesce(max(g.supporter_reward_tier), 0)::integer as supporter_reward_tier,
      max(g.expires_at) as active_until,
      max(g.granted_at) as last_granted_at
    from public.fansub_boost_grants g
    where g.fansub_id = p_fansub_id
      and g.status = 'active'
      and g.expires_at > now()
    group by g.supporter_user_id
  ),
  highest_plan as (
    select distinct on (g.supporter_user_id)
      g.supporter_user_id,
      g.plan_code as highest_active_plan_code
    from public.fansub_boost_grants g
    where g.fansub_id = p_fansub_id
      and g.status = 'active'
      and g.expires_at > now()
    order by g.supporter_user_id, g.supporter_reward_tier desc, g.boost_power desc, g.granted_at desc
  ),
  latest_note as (
    select distinct on (g.supporter_user_id)
      g.supporter_user_id,
      nullif(trim(coalesce(g.supporter_note, '')), '') as latest_supporter_note
    from public.fansub_boost_grants g
    where g.fansub_id = p_fansub_id
      and g.status = 'active'
      and g.expires_at > now()
      and nullif(trim(coalesce(g.supporter_note, '')), '') is not null
    order by g.supporter_user_id, g.granted_at desc
  )
  select
    active.supporter_user_id,
    u.username,
    u.username_slug,
    u.avatar_url,
    active.supporter_reward_tier,
    highest_plan.highest_active_plan_code,
    case
      when coalesce((public.build_fansub_boost_supporter_capabilities(active.supporter_reward_tier) ->> 'canShowSupporterNote')::boolean, false)
        then latest_note.latest_supporter_note
      else null
    end as latest_supporter_note,
    active.active_until,
    public.build_fansub_boost_supporter_capabilities(active.supporter_reward_tier) as reward_capabilities
  from active_supporters active
  join public.users u
    on u.id = active.supporter_user_id
  left join public.fansub_boost_supporter_states supporter_state
    on supporter_state.fansub_id = p_fansub_id
   and supporter_state.supporter_user_id = active.supporter_user_id
  left join highest_plan
    on highest_plan.supporter_user_id = active.supporter_user_id
  left join latest_note
    on latest_note.supporter_user_id = active.supporter_user_id
  where coalesce(u.is_active, true) = true
    and coalesce(supporter_state.is_visible, true) = true
  order by
    active.supporter_reward_tier desc,
    active.active_total_power desc,
    active.last_granted_at desc,
    active.supporter_user_id
  limit v_limit;
end;
$$;

grant execute on function public.list_public_fansub_boost_supporters_preview(uuid, integer) to anon, authenticated;

commit;
