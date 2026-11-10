begin;

drop function if exists public.get_public_fansub_boost_bundle(uuid, integer);

create or replace function public.get_public_fansub_boost_bundle(
  p_fansub_id uuid,
  p_supporter_preview_limit integer default 6
)
returns jsonb
language sql
security definer
set search_path = public
as $boost_bundle$
  with params as (
    select greatest(1, least(coalesce(p_supporter_preview_limit, 6), 12)) as supporter_limit
  ),
  snapshot_payload as (
    select coalesce((
      select row_to_json(snapshot_row)::jsonb
      from public.get_public_fansub_boost_snapshot(p_fansub_id) snapshot_row
    ), '{}'::jsonb) as snapshot
  ),
  active_supporters as (
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
  select jsonb_build_object(
    'snapshot', snapshot_payload.snapshot,
    'supporterPreview',
      case
        when coalesce((snapshot_payload.snapshot -> 'capabilities' ->> 'canUseSupporterList')::boolean, false) = true then
          coalesce((
            select jsonb_agg(row_to_json(preview_row) order by preview_row.sort_rank)
            from (
              select *
              from (
                select
                  row_number() over (
                    order by
                      active.supporter_reward_tier desc,
                      active.active_total_power desc,
                      active.last_granted_at desc,
                      active.supporter_user_id
                  ) as sort_rank,
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
              ) ranked_preview
              cross join params
              where ranked_preview.sort_rank <= params.supporter_limit
            ) preview_row
          ), '[]'::jsonb)
        else '[]'::jsonb
      end
  )
  from snapshot_payload;
$boost_bundle$;

grant execute on function public.get_public_fansub_boost_bundle(uuid, integer) to anon, authenticated;

commit;
