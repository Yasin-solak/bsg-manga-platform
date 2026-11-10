create or replace function public.admin_list_reading_streak_reward_rules()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  trigger_type text,
  target_value integer,
  coin_reward integer,
  recurrence text,
  is_active boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  return query
  select
    r.id,
    r.slug,
    r.title,
    r.description,
    r.trigger_type,
    r.target_value,
    r.coin_reward,
    r.recurrence,
    r.is_active,
    r.sort_order,
    r.created_at,
    r.updated_at
  from public.reading_streak_reward_rules r
  order by r.sort_order asc, r.target_value asc, r.created_at asc;
end;
$$;

grant execute on function public.admin_list_reading_streak_reward_rules() to authenticated;

create or replace function public.admin_upsert_reading_streak_reward_rule(
  p_id uuid default null,
  p_slug text default null,
  p_title text default null,
  p_description text default '',
  p_trigger_type text default 'streak_milestone',
  p_target_value integer default 1,
  p_coin_reward integer default 0,
  p_is_active boolean default true,
  p_sort_order integer default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  trigger_type text,
  target_value integer,
  coin_reward integer,
  recurrence text,
  is_active boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_trigger_type text;
  v_recurrence text;
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  v_trigger_type := lower(trim(coalesce(p_trigger_type, '')));
  if v_trigger_type not in ('daily_read', 'streak_milestone', 'weekly_active_days') then
    raise exception 'Gecersiz odul tetikleyicisi.';
  end if;

  v_recurrence := case
    when v_trigger_type = 'daily_read' then 'daily'
    when v_trigger_type = 'weekly_active_days' then 'weekly'
    else 'once'
  end;

  v_slug := lower(regexp_replace(trim(coalesce(p_slug, p_title, '')), '[^a-z0-9-]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 3 then
    raise exception 'Odul slug en az 3 karakter olmalidir.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Odul basligi zorunludur.';
  end if;

  if p_id is null then
    return query
    insert into public.reading_streak_reward_rules (
      slug,
      title,
      description,
      trigger_type,
      target_value,
      coin_reward,
      recurrence,
      is_active,
      sort_order
    )
    values (
      v_slug,
      trim(p_title),
      trim(coalesce(p_description, '')),
      v_trigger_type,
      greatest(1, coalesce(p_target_value, 1)),
      greatest(0, coalesce(p_coin_reward, 0)),
      v_recurrence,
      coalesce(p_is_active, true),
      greatest(0, coalesce(p_sort_order, 0))
    )
    returning
      reading_streak_reward_rules.id,
      reading_streak_reward_rules.slug,
      reading_streak_reward_rules.title,
      reading_streak_reward_rules.description,
      reading_streak_reward_rules.trigger_type,
      reading_streak_reward_rules.target_value,
      reading_streak_reward_rules.coin_reward,
      reading_streak_reward_rules.recurrence,
      reading_streak_reward_rules.is_active,
      reading_streak_reward_rules.sort_order,
      reading_streak_reward_rules.created_at,
      reading_streak_reward_rules.updated_at;
    return;
  end if;

  return query
  update public.reading_streak_reward_rules r
  set
    slug = v_slug,
    title = trim(p_title),
    description = trim(coalesce(p_description, '')),
    trigger_type = v_trigger_type,
    target_value = greatest(1, coalesce(p_target_value, 1)),
    coin_reward = greatest(0, coalesce(p_coin_reward, 0)),
    recurrence = v_recurrence,
    is_active = coalesce(p_is_active, true),
    sort_order = greatest(0, coalesce(p_sort_order, 0)),
    updated_at = now()
  where r.id = p_id
  returning
    r.id,
    r.slug,
    r.title,
    r.description,
    r.trigger_type,
    r.target_value,
    r.coin_reward,
    r.recurrence,
    r.is_active,
    r.sort_order,
    r.created_at,
    r.updated_at;

  if not found then
    raise exception 'Odul kurali bulunamadi.';
  end if;
end;
$$;

grant execute on function public.admin_upsert_reading_streak_reward_rule(uuid, text, text, text, text, integer, integer, boolean, integer) to authenticated;

create or replace function public.admin_list_reading_streak_reward_claims(
  p_limit integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  rule_id uuid,
  rule_title text,
  rule_slug text,
  trigger_type text,
  period_start date,
  progress_value integer,
  streak_days integer,
  active_days_this_week integer,
  credited_coin integer,
  claimed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  return query
  select
    c.id,
    c.user_id,
    u.username,
    u.avatar_url,
    c.rule_id,
    r.title as rule_title,
    r.slug as rule_slug,
    c.trigger_type,
    c.period_start,
    c.progress_value,
    c.streak_days,
    c.active_days_this_week,
    c.credited_coin,
    c.claimed_at
  from public.reading_streak_reward_claims c
  join public.users u on u.id = c.user_id
  join public.reading_streak_reward_rules r on r.id = c.rule_id
  order by c.claimed_at desc
  limit v_limit;
end;
$$;

grant execute on function public.admin_list_reading_streak_reward_claims(integer) to authenticated;

create or replace function public.admin_get_reading_streak_reward_dashboard()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_active_rules integer := 0;
  v_total_rules integer := 0;
  v_claims_30d integer := 0;
  v_total_coin_30d integer := 0;
  v_readers_today integer := 0;
  v_longest_claim_streak integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  select
    count(*)::integer,
    count(*) filter (where is_active)::integer
  into v_total_rules, v_active_rules
  from public.reading_streak_reward_rules;

  select
    count(*)::integer,
    coalesce(sum(c.credited_coin), 0)::integer,
    coalesce(max(c.streak_days), 0)::integer
  into v_claims_30d, v_total_coin_30d, v_longest_claim_streak
  from public.reading_streak_reward_claims c
  where c.claimed_at >= now() - interval '30 days';

  with today_readers as (
    select distinct ae.actor_user_id as user_id
    from public.activity_events ae
    where ae.actor_type = 'user'
      and ae.event_type = 'user_read'
      and ae.is_active = true
      and (ae.created_at at time zone 'Europe/Istanbul')::date = v_today

    union

    select distinct rh.user_id
    from public.reading_history rh
    where (rh.read_at at time zone 'Europe/Istanbul')::date = v_today
  )
  select count(*)::integer
  into v_readers_today
  from today_readers
  where user_id is not null;

  return jsonb_build_object(
    'total_rules', v_total_rules,
    'active_rules', v_active_rules,
    'claims_30d', v_claims_30d,
    'total_coin_30d', v_total_coin_30d,
    'readers_today', v_readers_today,
    'longest_claim_streak', v_longest_claim_streak
  );
end;
$$;

grant execute on function public.admin_get_reading_streak_reward_dashboard() to authenticated;
