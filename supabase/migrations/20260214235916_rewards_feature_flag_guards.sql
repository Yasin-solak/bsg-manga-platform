-- ============================================
-- MangaZone | Rewards feature flag guards
-- Date: 2026-02-14
-- ============================================

begin;

create or replace function public.list_user_reward_tasks()
returns table (
  task_id uuid,
  slug text,
  title text,
  description text,
  metric_key text,
  target_value integer,
  progress_value bigint,
  is_completed boolean,
  is_claimed boolean,
  is_claimable boolean,
  coin_reward integer,
  badge_id uuid,
  badge_name text,
  badge_image_url text,
  claimed_at timestamptz,
  sort_order integer,
  task_group text,
  tier_level integer,
  is_locked boolean,
  unlock_task_id uuid,
  unlock_task_title text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_feature_enabled('rewards.user_tasks', true) then
    raise exception 'Kullanici gorev sistemi su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  return query
  with task_rows as (
    select
      t.id,
      t.slug,
      t.title,
      t.description,
      t.metric_key,
      t.target_value,
      t.coin_reward,
      t.badge_id,
      t.sort_order,
      t.task_group,
      t.tier_level,
      b.name as badge_name,
      b.image_url as badge_image_url,
      c.id as claim_id,
      c.claimed_at,
      public.get_user_reward_metric_value(t.metric_key, v_user_id) as metric_value,
      prev.id as prev_task_id,
      prev.title as prev_task_title
    from public.user_reward_tasks t
    left join lateral (
      select pt.id, pt.title
      from public.user_reward_tasks pt
      where pt.is_active = true
        and pt.task_group = t.task_group
        and pt.tier_level = t.tier_level - 1
      order by pt.sort_order asc, pt.created_at asc, pt.id asc
      limit 1
    ) prev on true
    left join public.badges b on b.id = t.badge_id
    left join public.user_reward_task_claims c
      on c.task_id = t.id
     and c.user_id = v_user_id
    where t.is_active = true
  ),
  task_rows_with_prev_claim as (
    select
      tr.*,
      pc.id as prev_claim_id
    from task_rows tr
    left join public.user_reward_task_claims pc
      on pc.task_id = tr.prev_task_id
     and pc.user_id = v_user_id
  )
  select
    tr.id as task_id,
    tr.slug,
    tr.title,
    tr.description,
    tr.metric_key,
    tr.target_value,
    tr.metric_value as progress_value,
    (tr.metric_value >= tr.target_value) as is_completed,
    (tr.claim_id is not null) as is_claimed,
    (
      tr.metric_value >= tr.target_value
      and tr.claim_id is null
      and not (tr.prev_task_id is not null and tr.prev_claim_id is null)
    ) as is_claimable,
    tr.coin_reward,
    tr.badge_id,
    tr.badge_name,
    tr.badge_image_url,
    tr.claimed_at,
    tr.sort_order,
    tr.task_group,
    tr.tier_level,
    (
      tr.prev_task_id is not null
      and tr.prev_claim_id is null
      and tr.claim_id is null
    ) as is_locked,
    tr.prev_task_id as unlock_task_id,
    tr.prev_task_title as unlock_task_title
  from task_rows_with_prev_claim tr
  order by tr.task_group asc, tr.tier_level asc, tr.sort_order asc, tr.title asc;
end;
$$;

grant execute on function public.list_user_reward_tasks() to authenticated;

create or replace function public.claim_user_reward_task(
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_task public.user_reward_tasks%rowtype;
  v_progress bigint;
  v_new_balance integer;
  v_badge_name text;
  v_badge_awarded boolean := false;
  v_badge_rowcount integer := 0;
  v_claim_id uuid;
  v_claimed_at timestamptz := now();
  v_prev_task_id uuid;
  v_prev_task_title text;
  v_prev_claimed boolean := false;
begin
  if not public.is_feature_enabled('rewards.user_tasks', true) then
    raise exception 'Kullanici gorev sistemi su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_task_id is null then
    raise exception 'Gorev secimi zorunludur.';
  end if;

  select *
  into v_task
  from public.user_reward_tasks
  where id = p_task_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Gorev bulunamadi veya aktif degil.';
  end if;

  if exists (
    select 1
    from public.user_reward_task_claims c
    where c.user_id = v_user_id
      and c.task_id = v_task.id
  ) then
    raise exception 'Bu gorevin odulu zaten alinmis.';
  end if;

  if coalesce(v_task.tier_level, 1) > 1 then
    select t.id, t.title
    into v_prev_task_id, v_prev_task_title
    from public.user_reward_tasks t
    where t.is_active = true
      and t.task_group = v_task.task_group
      and t.tier_level = v_task.tier_level - 1
    order by t.sort_order asc, t.created_at asc, t.id asc
    limit 1;

    if v_prev_task_id is not null then
      select exists (
        select 1
        from public.user_reward_task_claims c
        where c.user_id = v_user_id
          and c.task_id = v_prev_task_id
      )
      into v_prev_claimed;

      if not v_prev_claimed then
        raise exception 'Onceki tier tamamlanmadan bu gorev acilmaz: %', coalesce(v_prev_task_title, 'Bir onceki tier');
      end if;
    end if;
  end if;

  v_progress := public.get_user_reward_metric_value(v_task.metric_key, v_user_id);
  if v_progress < v_task.target_value then
    raise exception 'Gorev henuz tamamlanmadi. Ilerleme: % / %', v_progress, v_task.target_value;
  end if;

  if v_task.coin_reward > 0 then
    update public.users
    set stones = coalesce(stones, 0) + v_task.coin_reward
    where id = v_user_id
    returning stones into v_new_balance;
  else
    select coalesce(u.stones, 0)
    into v_new_balance
    from public.users u
    where u.id = v_user_id;
  end if;

  if v_new_balance is null then
    raise exception 'Kullanici kaydi bulunamadi.';
  end if;

  if v_task.badge_id is not null then
    select b.name
    into v_badge_name
    from public.badges b
    where b.id = v_task.badge_id;

    insert into public.user_badges (
      user_id,
      badge_id,
      obtained_at,
      is_displayed,
      display_order
    )
    values (
      v_user_id,
      v_task.badge_id,
      v_claimed_at,
      false,
      0
    )
    on conflict (user_id, badge_id)
    do nothing;

    get diagnostics v_badge_rowcount = row_count;
    v_badge_awarded := v_badge_rowcount > 0;
  end if;

  insert into public.user_reward_task_claims (
    user_id,
    task_id,
    credited_coin,
    badge_id,
    claimed_at
  )
  values (
    v_user_id,
    v_task.id,
    v_task.coin_reward,
    v_task.badge_id,
    v_claimed_at
  )
  returning id into v_claim_id;

  perform public.push_notification(
    v_user_id,
    'system',
    'Gorev odulu alindi',
    format('"%s" gorevinden +%s coin kazandin.', v_task.title, v_task.coin_reward),
    jsonb_build_object(
      'event', 'user_task_claimed',
      'task_id', v_task.id,
      'task_slug', v_task.slug,
      'task_title', v_task.title,
      'task_group', v_task.task_group,
      'tier_level', v_task.tier_level,
      'coin_reward', v_task.coin_reward,
      'claimed_at', v_claimed_at,
      'route_hint', '/',
      'event_key', format('user-task-claim:%s', v_claim_id::text)
    ),
    null
  );

  if v_badge_awarded and v_task.badge_id is not null then
    perform public.push_notification(
      v_user_id,
      'badge_earned',
      'Yeni rozet kazandin',
      format('"%s" gorevinden "%s" rozetini kazandin.', v_task.title, coalesce(v_badge_name, 'Rozet')),
      jsonb_build_object(
        'event', 'user_task_badge_earned',
        'task_id', v_task.id,
        'task_slug', v_task.slug,
        'task_group', v_task.task_group,
        'tier_level', v_task.tier_level,
        'badge_id', v_task.badge_id,
        'badge_name', v_badge_name,
        'route_hint', '/',
        'event_key', format('user-task-badge:%s', v_claim_id::text)
      ),
      null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'task_slug', v_task.slug,
    'task_title', v_task.title,
    'task_group', v_task.task_group,
    'tier_level', v_task.tier_level,
    'coin_reward', v_task.coin_reward,
    'new_balance', v_new_balance,
    'badge_id', v_task.badge_id,
    'badge_name', v_badge_name,
    'badge_awarded', v_badge_awarded,
    'claimed_at', v_claimed_at
  );
end;
$$;

grant execute on function public.claim_user_reward_task(uuid) to authenticated;

commit;

