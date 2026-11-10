begin;

create or replace function public.build_fansub_boost_supporter_capabilities(
  p_reward_tier integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_reward_tier, 0), 0)
    when 3 then jsonb_build_object(
      'rewardTier', 3,
      'rewardLabel', 'Efsane destekci',
      'rewardSummary', 'En yuksek supporter kademesi; gorunur destek kimligini en guclu noktaya tasir.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti ve supporter emojileri acik kalir.',
        'Supporter notu ve gorunurlugu public yuzeylerde daha belirgin olur.',
        'Kurucu destekci ve destek serisi kimligi daha premium sunulur.'
      ),
      'supporterPitch', 'Bu kademe, hem fansuba en guclu katkidir hem de kullaniciya en gorunur supporter kimligini verir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', true,
      'hasSupporterSpotlight', true
    )
    when 2 then jsonb_build_object(
      'rewardTier', 2,
      'rewardLabel', 'Sadik destekci',
      'rewardSummary', 'Tekrarlayan destek ve gorunur kimlik katmani burada belirginlesir.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti ve supporter emojileri acik kalir.',
        'Supporter notu ve supporter listesinde gorunurluk devam eder.',
        'Kurucu destekci ve destek serisi kimligi daha okunur hale gelir.'
      ),
      'supporterPitch', 'Bu kademe, sadece bir kere destek verip cikmak yerine ritim kuran destekciyi one cikarir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    when 1 then jsonb_build_object(
      'rewardTier', 1,
      'rewardLabel', 'Destekci',
      'rewardSummary', 'Temel supporter kademesi; destegin gorunur hale gelmesini ve isimle anilmani saglar.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti acilir.',
        'Supporter emojileri ve destek notu kullanilabilir.',
        'Supporter listesi ve kredi yuzeyinde gorunebilirsin.'
      ),
      'supporterPitch', 'Bu kademe, fansuba destek verirken kendine de gorunur bir supporter kimligi kazandirir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    else jsonb_build_object(
      'rewardTier', 0,
      'rewardLabel', 'Henuz destekci degilsin',
      'rewardSummary', 'Ilk takviyeyle birlikte supporter kimligi, not gorunurlugu ve kredi yuzeyi acilir.',
      'rewardHighlights', jsonb_build_array(),
      'supporterPitch', 'Ilk takviyeyle birlikte hem fansuba guc katarsin hem de supporter kimligin gorunur olur.',
      'hasActiveSupporterBadge', false,
      'canUseSupporterEmojis', false,
      'canShowSupporterNote', false,
      'canAppearInSupporterList', false,
      'canAppearInCreditPage', false,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
  end;
$$;

grant execute on function public.build_fansub_boost_supporter_capabilities(integer) to anon, authenticated;

create or replace function public.build_fansub_boost_supporter_runtime_capabilities(
  p_fansub_id uuid,
  p_supporter_user_id uuid,
  p_reward_tier integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base jsonb := public.build_fansub_boost_supporter_capabilities(p_reward_tier);
  v_highlights text[] := array[]::text[];
  v_founding_limit integer := 10;
  v_founding_order integer := null;
  v_is_founding boolean := false;
  v_streak_count integer := 0;
  v_best_streak_count integer := 0;
  v_latest_chain_count integer := 0;
  v_latest_chain_expires_at timestamptz := null;
  v_supporter_status_line text := null;
  v_identity_badge_label text := null;
begin
  select coalesce(array_agg(highlight.value), array[]::text[])
  into v_highlights
  from jsonb_array_elements_text(coalesce(v_base -> 'rewardHighlights', '[]'::jsonb)) as highlight(value);

  if p_fansub_id is not null and p_supporter_user_id is not null then
    with supporter_firsts as (
      select
        g.supporter_user_id,
        min(g.granted_at) as first_granted_at
      from public.fansub_boost_grants g
      where g.fansub_id = p_fansub_id
        and g.status in ('active', 'expired')
      group by g.supporter_user_id
    ),
    ranked_supporters as (
      select
        supporter_user_id,
        row_number() over (order by first_granted_at asc, supporter_user_id asc) as founding_order
      from supporter_firsts
    )
    select ranked_supporters.founding_order
    into v_founding_order
    from ranked_supporters
    where ranked_supporters.supporter_user_id = p_supporter_user_id;

    v_is_founding := v_founding_order is not null and v_founding_order <= v_founding_limit;

    with historical_grants as (
      select
        g.id,
        g.starts_at,
        g.expires_at,
        g.granted_at,
        lag(g.expires_at) over (
          order by g.starts_at asc, g.granted_at asc, g.id asc
        ) as prev_expires_at
      from public.fansub_boost_grants g
      where g.fansub_id = p_fansub_id
        and g.supporter_user_id = p_supporter_user_id
        and g.status in ('active', 'expired')
    ),
    streak_groups as (
      select
        historical_grants.*,
        sum(
          case
            when historical_grants.prev_expires_at is null
              or historical_grants.starts_at > historical_grants.prev_expires_at + interval '7 days'
              then 1
            else 0
          end
        ) over (
          order by historical_grants.starts_at asc, historical_grants.granted_at asc, historical_grants.id asc
          rows between unbounded preceding and current row
        ) as streak_group
      from historical_grants
    ),
    streak_counts as (
      select
        streak_group,
        count(*)::integer as streak_count,
        max(expires_at) as chain_expires_at,
        max(granted_at) as chain_last_granted_at
      from streak_groups
      group by streak_group
    )
    select
      coalesce(max(streak_count), 0)::integer,
      coalesce((
        select streak_count
        from streak_counts
        order by chain_last_granted_at desc nulls last
        limit 1
      ), 0)::integer,
      (
        select chain_expires_at
        from streak_counts
        order by chain_last_granted_at desc nulls last
        limit 1
      )
    into
      v_best_streak_count,
      v_latest_chain_count,
      v_latest_chain_expires_at
    from streak_counts;

    if v_latest_chain_expires_at is not null and v_latest_chain_expires_at > now() then
      v_streak_count := v_latest_chain_count;
    else
      v_streak_count := 0;
    end if;
  end if;

  if v_is_founding then
    v_highlights := array_append(v_highlights, format('Kurucu destekci #%s olarak gorunursun.', v_founding_order));
    v_identity_badge_label := format('Kurucu #%s', v_founding_order);
  end if;

  if v_streak_count >= 2 then
    v_highlights := array_append(v_highlights, format('%s donemlik destek serin aktif durumda.', v_streak_count));
    if v_identity_badge_label is null then
      v_identity_badge_label := format('%s seri', v_streak_count);
    end if;
  elsif v_best_streak_count >= 2 then
    v_highlights := array_append(v_highlights, format('En iyi destek serin %s donem.', v_best_streak_count));
  end if;

  if v_is_founding and v_streak_count >= 2 then
    v_supporter_status_line := format('Kurucu destekci #%s · %s donemlik seri', v_founding_order, v_streak_count);
  elsif v_is_founding then
    v_supporter_status_line := format('Kurucu destekci #%s', v_founding_order);
  elsif v_streak_count >= 2 then
    v_supporter_status_line := format('%s donemlik destek serisi', v_streak_count);
  end if;

  return v_base || jsonb_build_object(
    'isFoundingSupporter', v_is_founding,
    'foundingOrder', v_founding_order,
    'foundingLabel', case when v_is_founding then format('Kurucu destekci #%s', v_founding_order) else null end,
    'streakCount', v_streak_count,
    'bestStreakCount', v_best_streak_count,
    'supporterStatusLine', v_supporter_status_line,
    'identityBadgeLabel', v_identity_badge_label,
    'rewardHighlights', to_jsonb(v_highlights)
  );
end;
$$;

grant execute on function public.build_fansub_boost_supporter_runtime_capabilities(uuid, uuid, integer) to anon, authenticated;

create or replace function public.refresh_fansub_boost_supporter_state(
  p_fansub_id uuid,
  p_supporter_user_id uuid
)
returns public.fansub_boost_supporter_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_grant_count integer := 0;
  v_active_total_power integer := 0;
  v_supporter_reward_tier integer := 0;
  v_active_until timestamptz := null;
  v_last_granted_at timestamptz := null;
  v_lifetime_grant_count integer := 0;
  v_lifetime_total_power integer := 0;
  v_highest_active_plan_code text := null;
  v_latest_supporter_note text := null;
  v_reward_capabilities jsonb := '{}'::jsonb;
  v_state public.fansub_boost_supporter_states%rowtype;
begin
  if p_fansub_id is null or p_supporter_user_id is null then
    raise exception 'Fansub ve destekci kimligi zorunludur.';
  end if;

  update public.fansub_boost_grants
  set status = 'expired'
  where fansub_id = p_fansub_id
    and supporter_user_id = p_supporter_user_id
    and status = 'active'
    and expires_at <= now();

  select
    count(*)::integer,
    coalesce(sum(g.boost_power), 0)::integer,
    coalesce(max(g.supporter_reward_tier), 0)::integer,
    max(g.expires_at),
    max(g.granted_at)
  into
    v_active_grant_count,
    v_active_total_power,
    v_supporter_reward_tier,
    v_active_until,
    v_last_granted_at
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and g.status = 'active'
    and g.expires_at > now();

  select
    count(*)::integer,
    coalesce(sum(g.boost_power), 0)::integer
  into
    v_lifetime_grant_count,
    v_lifetime_total_power
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and g.status in ('active', 'expired');

  select g.plan_code
  into v_highest_active_plan_code
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and g.status = 'active'
    and g.expires_at > now()
  order by g.supporter_reward_tier desc, g.boost_power desc, g.granted_at desc
  limit 1;

  select nullif(trim(coalesce(g.supporter_note, '')), '')
  into v_latest_supporter_note
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and nullif(trim(coalesce(g.supporter_note, '')), '') is not null
  order by g.granted_at desc
  limit 1;

  v_reward_capabilities := public.build_fansub_boost_supporter_runtime_capabilities(
    p_fansub_id,
    p_supporter_user_id,
    v_supporter_reward_tier
  );

  insert into public.fansub_boost_supporter_states (
    fansub_id,
    supporter_user_id,
    active_grant_count,
    active_total_power,
    highest_active_plan_code,
    supporter_reward_tier,
    reward_capabilities,
    active_until,
    lifetime_grant_count,
    lifetime_total_power,
    latest_supporter_note,
    last_granted_at
  )
  values (
    p_fansub_id,
    p_supporter_user_id,
    v_active_grant_count,
    v_active_total_power,
    v_highest_active_plan_code,
    v_supporter_reward_tier,
    v_reward_capabilities,
    v_active_until,
    v_lifetime_grant_count,
    v_lifetime_total_power,
    v_latest_supporter_note,
    v_last_granted_at
  )
  on conflict (fansub_id, supporter_user_id) do update
    set active_grant_count = excluded.active_grant_count,
        active_total_power = excluded.active_total_power,
        highest_active_plan_code = excluded.highest_active_plan_code,
        supporter_reward_tier = excluded.supporter_reward_tier,
        reward_capabilities = excluded.reward_capabilities,
        active_until = excluded.active_until,
        lifetime_grant_count = excluded.lifetime_grant_count,
        lifetime_total_power = excluded.lifetime_total_power,
        latest_supporter_note = excluded.latest_supporter_note,
        last_granted_at = excluded.last_granted_at
  returning *
  into v_state;

  return v_state;
end;
$$;

grant execute on function public.refresh_fansub_boost_supporter_state(uuid, uuid) to authenticated;

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
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  perform public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);

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
      when coalesce((supporter_caps.reward_capabilities ->> 'canShowSupporterNote')::boolean, false)
        then latest_note.latest_supporter_note
      else null
    end as latest_supporter_note,
    active.active_until,
    supporter_caps.reward_capabilities
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
  cross join lateral (
    select coalesce(
      supporter_state.reward_capabilities,
      public.build_fansub_boost_supporter_runtime_capabilities(
        p_fansub_id,
        active.supporter_user_id,
        active.supporter_reward_tier
      )
    ) as reward_capabilities
  ) supporter_caps
  where coalesce(u.is_active, true) = true
    and coalesce(supporter_state.is_visible, true) = true
  order by
    active.supporter_reward_tier desc,
    coalesce((supporter_caps.reward_capabilities ->> 'isFoundingSupporter')::boolean, false) desc,
    coalesce((supporter_caps.reward_capabilities ->> 'streakCount')::integer, 0) desc,
    active.active_total_power desc,
    active.last_granted_at desc,
    active.supporter_user_id
  limit v_limit;
end;
$$;

grant execute on function public.list_public_fansub_boost_supporters_preview(uuid, integer) to anon, authenticated;

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
      coalesce((
        select jsonb_agg(row_to_json(preview_row) order by preview_row.sort_rank)
        from (
          select *
          from (
            select
              row_number() over (
                order by
                  active.supporter_reward_tier desc,
                  coalesce((supporter_caps.reward_capabilities ->> 'isFoundingSupporter')::boolean, false) desc,
                  coalesce((supporter_caps.reward_capabilities ->> 'streakCount')::integer, 0) desc,
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
                when coalesce((supporter_caps.reward_capabilities ->> 'canShowSupporterNote')::boolean, false)
                  then latest_note.latest_supporter_note
                else null
              end as latest_supporter_note,
              active.active_until,
              supporter_caps.reward_capabilities
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
            cross join lateral (
              select coalesce(
                supporter_state.reward_capabilities,
                public.build_fansub_boost_supporter_runtime_capabilities(
                  p_fansub_id,
                  active.supporter_user_id,
                  active.supporter_reward_tier
                )
              ) as reward_capabilities
            ) supporter_caps
            where coalesce(u.is_active, true) = true
              and coalesce(supporter_state.is_visible, true) = true
          ) ranked_preview
          cross join params
          where ranked_preview.sort_rank <= params.supporter_limit
        ) preview_row
      ), '[]'::jsonb)
  )
  from snapshot_payload;
$boost_bundle$;

grant execute on function public.get_public_fansub_boost_bundle(uuid, integer) to anon, authenticated;

do $$
declare
  pair_row record;
begin
  for pair_row in
    select distinct
      g.fansub_id,
      g.supporter_user_id
    from public.fansub_boost_grants g
    where g.status in ('active', 'expired')
  loop
    perform public.refresh_fansub_boost_supporter_state(pair_row.fansub_id, pair_row.supporter_user_id);
  end loop;
end $$;

commit;
