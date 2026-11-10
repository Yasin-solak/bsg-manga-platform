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

  v_snapshot := public.refresh_fansub_boost_snapshot(p_fansub_id);

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

create or replace function public.purchase_fansub_boost(
  p_fansub_id uuid,
  p_plan_code text,
  p_supporter_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_plan public.fansub_boost_plans%rowtype;
  v_grant public.fansub_boost_grants%rowtype;
  v_supporter_state public.fansub_boost_supporter_states%rowtype;
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_supporter_note text := nullif(trim(coalesce(p_supporter_note, '')), '');
  v_event_key text;
  v_member record;
  v_supporter_preview jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if not public.is_feature_enabled('boost.system', false) then
    raise exception 'Fansub takviye sistemi su anda aktif degil.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found or coalesce(v_user.is_active, true) = false then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
    and coalesce(is_active, true) = true
  limit 1;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  select *
  into v_plan
  from public.fansub_boost_plans
  where code = lower(trim(coalesce(p_plan_code, '')))
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Takviye plani bulunamadi.';
  end if;

  if v_supporter_note is not null and char_length(v_supporter_note) > 220 then
    raise exception 'Destek notu en fazla 220 karakter olabilir.';
  end if;

  if coalesce(v_user.stones, 0) < v_plan.coin_cost then
    raise exception 'Yeterli coin bulunamadi.';
  end if;

  update public.users
  set stones = stones - v_plan.coin_cost
  where id = v_user_id;

  insert into public.fansub_boost_grants (
    fansub_id,
    supporter_user_id,
    plan_id,
    plan_code,
    coin_cost,
    boost_power,
    duration_days,
    supporter_reward_tier,
    supporter_note,
    is_self_boost,
    starts_at,
    expires_at,
    metadata
  )
  values (
    p_fansub_id,
    v_user_id,
    v_plan.id,
    v_plan.code,
    v_plan.coin_cost,
    v_plan.boost_power,
    v_plan.duration_days,
    v_plan.supporter_reward_tier,
    v_supporter_note,
    exists (
      select 1
      from public.fansub_members fm
      where fm.fansub_id = p_fansub_id
        and fm.user_id = v_user_id
    ),
    now(),
    now() + make_interval(days => v_plan.duration_days),
    jsonb_build_object(
      'planName', v_plan.name,
      'supporterUsername', v_user.username
    )
  )
  returning *
  into v_grant;

  v_supporter_state := public.refresh_fansub_boost_supporter_state(p_fansub_id, v_user_id);
  v_snapshot := public.refresh_fansub_boost_snapshot(p_fansub_id);
  v_event_key := format('fansub-boost:%s:%s', v_grant.id::text, p_fansub_id::text);
  v_supporter_preview := coalesce((
    select jsonb_agg(row_to_json(preview_row))
    from public.list_public_fansub_boost_supporters_preview(p_fansub_id, 6) preview_row
  ), '[]'::jsonb);

  for v_member in
    select fm.user_id
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.role = 'admin'
      and fm.user_id <> v_user_id
  loop
    perform public.push_notification(
      v_member.user_id,
      'system',
      'Fansub takviyesi alindi',
      format('%s, %s planini etkinlestirdi.', coalesce(v_user.username, 'Bir destekci'), v_plan.name),
      jsonb_build_object(
        'event', 'fansub_boost_purchased',
        'fansub_id', p_fansub_id,
        'grant_id', v_grant.id,
        'plan_code', v_plan.code,
        'plan_name', v_plan.name,
        'supporter_user_id', v_user_id,
        'supporter_username', v_user.username,
        'event_key', format('%s:%s', v_event_key, v_member.user_id::text)
      ),
      'bolt'
    );
  end loop;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'fansubId', p_fansub_id,
    'planCode', v_plan.code,
    'planName', v_plan.name,
    'coinCost', v_plan.coin_cost,
    'boostPower', v_plan.boost_power,
    'durationDays', v_plan.duration_days,
    'supporterRewardTier', v_plan.supporter_reward_tier,
    'startsAt', v_grant.starts_at,
    'expiresAt', v_grant.expires_at,
    'newUserStones', greatest(coalesce(v_user.stones, 0) - v_plan.coin_cost, 0),
    'supporterPreview', v_supporter_preview,
    'supporterState', row_to_json(v_supporter_state),
    'snapshot', row_to_json(v_snapshot)
  );
end;
$$;

grant execute on function public.purchase_fansub_boost(uuid, text, text) to authenticated;

commit;
