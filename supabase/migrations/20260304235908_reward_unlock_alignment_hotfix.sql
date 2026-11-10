-- ============================================
-- MangaZone | Reward unlock alignment hotfix
-- Task lock, fansub feature flag and RPC guard hardening
-- Date: 2026-03-04
-- ============================================

begin;

create or replace function public.is_feature_enabled(
  p_key text,
  p_default boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_key, '')));
  v_enabled boolean;
  v_rollout integer;
  v_hash_input text;
  v_bucket integer;
  v_strict_fail_closed boolean := false;
begin
  if v_key = '' then
    return false;
  end if;

  -- Flags protecting product flows must act closed when the record is missing too.
  v_strict_fail_closed := v_key = any (array[
    'home.follow_feed',
    'reader.comments',
    'notifications.center',
    'economy.coin_codes',
    'economy.fansub_wallet_purchase',
    'economy.store_purchase',
    'community.posting',
    'moderation.reports',
    'rewards.user_tasks',
    'rewards.fansub_tasks',
    'admin.operations_center'
  ]);

  select ff.is_enabled, ff.rollout_percent
  into v_enabled, v_rollout
  from public.feature_flags ff
  where ff.key = v_key
    and (ff.is_public = true or public.is_admin())
  limit 1;

  if not found then
    if v_strict_fail_closed then
      return false;
    end if;
    return coalesce(p_default, false);
  end if;

  if v_enabled is not true then
    return false;
  end if;

  if coalesce(v_rollout, 0) >= 100 then
    return true;
  end if;

  if coalesce(v_rollout, 0) <= 0 then
    return false;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  v_hash_input := auth.uid()::text || ':' || v_key;
  v_bucket := (abs(('x' || substr(md5(v_hash_input), 1, 8))::bit(32)::bigint) % 100)::integer;
  return v_bucket < v_rollout;
end;
$$;

grant execute on function public.is_feature_enabled(text, boolean) to anon, authenticated;

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'rewards.fansub_tasks',
  'Fansub Gorev Sistemi',
  'Fansub gorev paneli ve claim akislarini ac/kapat.',
  true,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    is_enabled = excluded.is_enabled,
    rollout_percent = excluded.rollout_percent,
    is_public = excluded.is_public,
    metadata = excluded.metadata;

with resolved_user_unlocks as (
  select
    t.id as task_id,
    prev.id as unlock_task_id
  from public.user_reward_tasks t
  left join lateral (
    select pt.id
    from public.user_reward_tasks pt
    where pt.is_active = true
      and pt.task_group = t.task_group
      and pt.tier_level = t.tier_level - 1
    order by pt.sort_order asc, pt.created_at asc, pt.id asc
    limit 1
  ) prev on true
  where t.is_active = true
    and coalesce(t.tier_level, 1) > 1
    and t.unlock_requires_task_id is null
)
update public.user_reward_tasks t
set unlock_requires_task_id = ru.unlock_task_id
from resolved_user_unlocks ru
where t.id = ru.task_id
  and ru.unlock_task_id is not null;

with resolved_fansub_unlocks as (
  select
    t.id as task_id,
    prev.id as unlock_task_id
  from public.fansub_reward_tasks t
  left join lateral (
    select pt.id
    from public.fansub_reward_tasks pt
    where pt.is_active = true
      and pt.task_group = t.task_group
      and pt.tier_level = t.tier_level - 1
    order by pt.sort_order asc, pt.created_at asc, pt.id asc
    limit 1
  ) prev on true
  where t.is_active = true
    and coalesce(t.tier_level, 1) > 1
    and t.unlock_requires_task_id is null
)
update public.fansub_reward_tasks t
set unlock_requires_task_id = rf.unlock_task_id
from resolved_fansub_unlocks rf
where t.id = rf.task_id
  and rf.unlock_task_id is not null;

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
  if not public.is_feature_enabled('rewards.user_tasks', false) then
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
      t.unlock_requires_task_id,
      b.name as badge_name,
      b.image_url as badge_image_url,
      c.id as claim_id,
      c.claimed_at,
      public.get_user_reward_metric_value(t.metric_key, v_user_id) as metric_value
    from public.user_reward_tasks t
    left join public.badges b on b.id = t.badge_id
    left join public.user_reward_task_claims c
      on c.task_id = t.id and c.user_id = v_user_id
    where t.is_active = true
  ),
  unlock_info as (
    select
      tr.id as task_id,
      tr.unlock_requires_task_id,
      ut.title as unlock_task_title,
      case
        when tr.unlock_requires_task_id is null then false
        when exists (
          select 1 from public.user_reward_task_claims uc
          where uc.user_id = v_user_id and uc.task_id = tr.unlock_requires_task_id
        ) then false
        else true
      end as is_locked
    from task_rows tr
    left join public.user_reward_tasks ut on ut.id = tr.unlock_requires_task_id
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
    (tr.metric_value >= tr.target_value and tr.claim_id is null and ui.is_locked = false) as is_claimable,
    tr.coin_reward,
    tr.badge_id,
    tr.badge_name,
    tr.badge_image_url,
    tr.claimed_at,
    tr.sort_order,
    tr.task_group,
    tr.tier_level,
    ui.is_locked,
    tr.unlock_requires_task_id as unlock_task_id,
    ui.unlock_task_title
  from task_rows tr
  join unlock_info ui on ui.task_id = tr.id
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
  v_unlock_task_title text;
begin
  if not public.is_feature_enabled('rewards.user_tasks', false) then
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

  if v_task.unlock_requires_task_id is not null then
    select t.title
    into v_unlock_task_title
    from public.user_reward_tasks t
    where t.id = v_task.unlock_requires_task_id;

    if not exists (
      select 1
      from public.user_reward_task_claims c
      where c.user_id = v_user_id
        and c.task_id = v_task.unlock_requires_task_id
    ) then
      raise exception 'Onceki gorev tamamlanmadan bu gorev acilmaz: %', coalesce(v_unlock_task_title, 'Kilidi acan gorev');
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

create or replace function public.list_fansub_reward_tasks(
  p_fansub_id uuid
)
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
begin
  if not public.is_feature_enabled('rewards.fansub_tasks', false) then
    raise exception 'Fansub gorev sistemi su anda gecici olarak kapali.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub ID zorunludur.';
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
      t.unlock_requires_task_id,
      b.name as badge_name,
      b.image_url as badge_image_url,
      c.id as claim_id,
      c.claimed_at,
      public.get_fansub_reward_metric_value(t.metric_key, p_fansub_id) as metric_value
    from public.fansub_reward_tasks t
    left join public.badges b on b.id = t.badge_id
    left join public.fansub_reward_task_claims c
      on c.task_id = t.id and c.fansub_id = p_fansub_id
    where t.is_active = true
  ),
  unlock_info as (
    select
      tr.id as task_id,
      tr.unlock_requires_task_id,
      ut.title as unlock_task_title,
      case
        when tr.unlock_requires_task_id is null then false
        when exists (
          select 1 from public.fansub_reward_task_claims uc
          where uc.fansub_id = p_fansub_id and uc.task_id = tr.unlock_requires_task_id
        ) then false
        else true
      end as is_locked
    from task_rows tr
    left join public.fansub_reward_tasks ut on ut.id = tr.unlock_requires_task_id
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
    (tr.metric_value >= tr.target_value and tr.claim_id is null and ui.is_locked = false) as is_claimable,
    tr.coin_reward,
    tr.badge_id,
    tr.badge_name,
    tr.badge_image_url,
    tr.claimed_at,
    tr.sort_order,
    tr.task_group,
    tr.tier_level,
    ui.is_locked,
    tr.unlock_requires_task_id as unlock_task_id,
    ui.unlock_task_title
  from task_rows tr
  join unlock_info ui on ui.task_id = tr.id
  order by tr.task_group asc, tr.tier_level asc, tr.sort_order asc, tr.title asc;
end;
$$;

grant execute on function public.list_fansub_reward_tasks(uuid) to authenticated;

create or replace function public.claim_fansub_reward_task(
  p_fansub_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_task public.fansub_reward_tasks%rowtype;
  v_progress bigint;
  v_new_balance integer;
  v_badge_name text;
  v_badge_awarded boolean := false;
  v_badge_rowcount integer := 0;
  v_claim_id uuid;
  v_claimed_at timestamptz := now();
  v_unlock_task_title text;
begin
  if not public.is_feature_enabled('rewards.fansub_tasks', false) then
    raise exception 'Fansub gorev sistemi su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null or p_task_id is null then
    raise exception 'Fansub ve gorev secimi zorunludur.';
  end if;

  if not public.is_fansub_staff(p_fansub_id) then
    raise exception 'Bu islemi sadece fansub yoneticileri yapabilir.';
  end if;

  select * into v_task
  from public.fansub_reward_tasks
  where id = p_task_id and is_active = true
  for update;

  if not found then
    raise exception 'Gorev bulunamadi veya aktif degil.';
  end if;

  if exists (
    select 1 from public.fansub_reward_task_claims c
    where c.fansub_id = p_fansub_id and c.task_id = v_task.id
  ) then
    raise exception 'Bu gorevin odulu zaten alinmis.';
  end if;

  if v_task.unlock_requires_task_id is not null then
    select t.title
    into v_unlock_task_title
    from public.fansub_reward_tasks t
    where t.id = v_task.unlock_requires_task_id;

    if not exists (
      select 1 from public.fansub_reward_task_claims uc
      where uc.fansub_id = p_fansub_id and uc.task_id = v_task.unlock_requires_task_id
    ) then
      raise exception 'Onceki gorev tamamlanmadan bu gorev acilmaz: %', coalesce(v_unlock_task_title, 'Kilidi acan gorev');
    end if;
  end if;

  v_progress := public.get_fansub_reward_metric_value(v_task.metric_key, p_fansub_id);
  if v_progress < v_task.target_value then
    raise exception 'Gorev henuz tamamlanmadi. Ilerleme: % / %', v_progress, v_task.target_value;
  end if;

  if v_task.coin_reward > 0 then
    update public.fansubs
    set coin_balance = coalesce(coin_balance, 0) + v_task.coin_reward
    where id = p_fansub_id
    returning coin_balance into v_new_balance;

    insert into public.fansub_transactions (fansub_id, amount, type, description, created_by)
    values (
      p_fansub_id,
      v_task.coin_reward,
      'reward_task',
      format('Gorev odulu: "%s"', v_task.title),
      v_user_id
    );
  else
    select coalesce(f.coin_balance, 0)
    into v_new_balance
    from public.fansubs f
    where f.id = p_fansub_id;
  end if;

  if v_new_balance is null then
    raise exception 'Fansub kaydi bulunamadi.';
  end if;

  if v_task.badge_id is not null then
    select b.name
    into v_badge_name
    from public.badges b
    where b.id = v_task.badge_id;

    insert into public.fansub_badges (
      fansub_id,
      badge_id,
      obtained_at,
      is_displayed,
      display_order
    )
    values (
      p_fansub_id,
      v_task.badge_id,
      v_claimed_at,
      false,
      0
    )
    on conflict (fansub_id, badge_id)
    do nothing;

    get diagnostics v_badge_rowcount = row_count;
    v_badge_awarded := v_badge_rowcount > 0;
  end if;

  insert into public.fansub_reward_task_claims (
    fansub_id,
    task_id,
    claimed_by,
    credited_coin,
    badge_id,
    claimed_at
  )
  values (
    p_fansub_id,
    v_task.id,
    v_user_id,
    v_task.coin_reward,
    v_task.badge_id,
    v_claimed_at
  )
  returning id into v_claim_id;

  return jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'task_slug', v_task.slug,
    'task_title', v_task.title,
    'coin_reward', v_task.coin_reward,
    'new_balance', v_new_balance,
    'badge_id', v_task.badge_id,
    'badge_name', v_badge_name,
    'badge_awarded', v_badge_awarded,
    'claimed_at', v_claimed_at,
    'claim_id', v_claim_id
  );
end;
$$;

grant execute on function public.claim_fansub_reward_task(uuid, uuid) to authenticated;

commit;
