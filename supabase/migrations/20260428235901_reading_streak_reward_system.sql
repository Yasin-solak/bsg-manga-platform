-- MangaZone | Reading streak reward system
-- Manages daily reading, streak milestones and weekly activity rewards.

begin;

create table if not exists public.reading_streak_reward_rules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(trim(slug)) >= 3),
  title text not null,
  description text not null default '',
  trigger_type text not null
    check (trigger_type in ('daily_read', 'streak_milestone', 'weekly_active_days')),
  target_value integer not null check (target_value > 0),
  coin_reward integer not null default 0 check (coin_reward >= 0),
  recurrence text not null default 'once'
    check (recurrence in ('daily', 'weekly', 'once')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (trigger_type = 'daily_read' and recurrence = 'daily')
    or (trigger_type = 'weekly_active_days' and recurrence = 'weekly')
    or (trigger_type = 'streak_milestone' and recurrence = 'once')
  )
);

create index if not exists reading_streak_reward_rules_active_sort_idx
  on public.reading_streak_reward_rules (is_active, sort_order asc, target_value asc);

drop trigger if exists trg_reading_streak_reward_rules_updated_at
  on public.reading_streak_reward_rules;
create trigger trg_reading_streak_reward_rules_updated_at
  before update on public.reading_streak_reward_rules
  for each row
  execute function public.set_updated_at();

alter table public.reading_streak_reward_rules enable row level security;

drop policy if exists reading_streak_reward_rules_select_authenticated
  on public.reading_streak_reward_rules;
create policy reading_streak_reward_rules_select_authenticated
  on public.reading_streak_reward_rules
  for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists reading_streak_reward_rules_admin_write
  on public.reading_streak_reward_rules;
create policy reading_streak_reward_rules_admin_write
  on public.reading_streak_reward_rules
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.reading_streak_reward_rules to authenticated;

create table if not exists public.reading_streak_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rule_id uuid not null references public.reading_streak_reward_rules(id) on delete restrict,
  trigger_type text not null
    check (trigger_type in ('daily_read', 'streak_milestone', 'weekly_active_days')),
  period_start date,
  progress_value integer not null default 0 check (progress_value >= 0),
  streak_days integer not null default 0 check (streak_days >= 0),
  active_days_this_week integer not null default 0 check (active_days_this_week >= 0),
  credited_coin integer not null default 0 check (credited_coin >= 0),
  metadata jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now()
);

create unique index if not exists reading_streak_reward_claims_once_unique_idx
  on public.reading_streak_reward_claims (user_id, rule_id)
  where period_start is null;

create unique index if not exists reading_streak_reward_claims_period_unique_idx
  on public.reading_streak_reward_claims (user_id, rule_id, period_start)
  where period_start is not null;

create index if not exists reading_streak_reward_claims_user_claimed_idx
  on public.reading_streak_reward_claims (user_id, claimed_at desc);

create index if not exists reading_streak_reward_claims_rule_claimed_idx
  on public.reading_streak_reward_claims (rule_id, claimed_at desc);

alter table public.reading_streak_reward_claims enable row level security;

drop policy if exists reading_streak_reward_claims_select_own_or_admin
  on public.reading_streak_reward_claims;
create policy reading_streak_reward_claims_select_own_or_admin
  on public.reading_streak_reward_claims
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

grant select on table public.reading_streak_reward_claims to authenticated;

insert into public.reading_streak_reward_rules (
  slug,
  title,
  description,
  trigger_type,
  target_value,
  coin_reward,
  recurrence,
  sort_order,
  is_active
)
values
  ('daily-read', 'Gunluk Okuma', 'Bugun en az bir bolum oku.', 'daily_read', 1, 10, 'daily', 10, true),
  ('streak-3', '3 Gunluk Seri', 'Uc gun ust uste okuma serisini tamamla.', 'streak_milestone', 3, 50, 'once', 20, true),
  ('streak-7', '7 Gunluk Seri', 'Bir haftalik okuma serisini tamamla.', 'streak_milestone', 7, 140, 'once', 30, true),
  ('weekly-5-days', 'Haftada 5 Gun', 'Bu hafta 5 farkli gunde okuma yap.', 'weekly_active_days', 5, 160, 'weekly', 40, true),
  ('streak-14', '14 Gunluk Seri', 'Iki haftalik okuma serisine ulas.', 'streak_milestone', 14, 350, 'once', 50, true),
  ('weekly-7-days', 'Kusursuz Hafta', 'Haftanin 7 gunu okuma yap.', 'weekly_active_days', 7, 320, 'weekly', 60, true),
  ('streak-30', '30 Gunluk Seri', 'Otuz gunluk okuma disiplinini tamamla.', 'streak_milestone', 30, 900, 'once', 70, true)
on conflict (slug)
do update set
  title = excluded.title,
  description = excluded.description,
  trigger_type = excluded.trigger_type,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  recurrence = excluded.recurrence,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.get_current_user_reading_streak_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_week_start date;
  v_current_streak integer := 0;
  v_has_read_today boolean := false;
  v_active_days_this_week integer := 0;
  v_last_read_at timestamptz;
  v_week_days jsonb := '[]'::jsonb;
  v_claimable_rewards jsonb := '[]'::jsonb;
  v_recent_rewards jsonb := '[]'::jsonb;
  v_next_reward jsonb;
  v_earned_today_coin integer := 0;
  v_total_claimed_coin integer := 0;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);

  with read_entries as (
    select (ae.created_at at time zone 'Europe/Istanbul')::date as active_day,
           ae.created_at as read_at
    from public.activity_events ae
    where ae.actor_user_id = v_user_id
      and ae.actor_type = 'user'
      and ae.event_type = 'user_read'
      and ae.is_active = true
      and ae.created_at >= now() - interval '365 days'

    union all

    select (rh.read_at at time zone 'Europe/Istanbul')::date as active_day,
           rh.read_at
    from public.reading_history rh
    where rh.user_id = v_user_id
      and rh.read_at >= now() - interval '365 days'
  ),
  read_days as (
    select active_day, max(read_at) as last_read_at
    from read_entries
    group by active_day
  ),
  anchor as (
    select
      case
        when exists (select 1 from read_days where active_day = v_today) then v_today
        when exists (select 1 from read_days where active_day = v_today - 1) then v_today - 1
        else null::date
      end as anchor_day
  ),
  streaks as (
    select
      rd.active_day,
      rd.active_day - (row_number() over (order by rd.active_day))::integer as streak_group
    from read_days rd
    cross join anchor a
    where a.anchor_day is not null
      and rd.active_day <= a.anchor_day
  ),
  anchor_group as (
    select s.streak_group
    from streaks s
    cross join anchor a
    where s.active_day = a.anchor_day
    limit 1
  )
  select
    coalesce((select count(*)::integer from streaks s join anchor_group ag on ag.streak_group = s.streak_group), 0),
    exists (select 1 from read_days where active_day = v_today),
    coalesce((select count(*)::integer from read_days where active_day between v_week_start and v_today), 0),
    (select max(last_read_at) from read_days)
  into v_current_streak, v_has_read_today, v_active_days_this_week, v_last_read_at;

  with read_entries as (
    select (ae.created_at at time zone 'Europe/Istanbul')::date as active_day
    from public.activity_events ae
    where ae.actor_user_id = v_user_id
      and ae.actor_type = 'user'
      and ae.event_type = 'user_read'
      and ae.is_active = true
      and ae.created_at >= (v_week_start::timestamptz - interval '1 day')

    union

    select (rh.read_at at time zone 'Europe/Istanbul')::date as active_day
    from public.reading_history rh
    where rh.user_id = v_user_id
      and rh.read_at >= (v_week_start::timestamptz - interval '1 day')
  ),
  week_days as (
    select (v_week_start + offsets.day_offset)::date as active_day
    from generate_series(0, 6) as offsets(day_offset)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', wd.active_day,
        'label',
          case extract(isodow from wd.active_day)::integer
            when 1 then 'Pzt'
            when 2 then 'Sal'
            when 3 then 'Car'
            when 4 then 'Per'
            when 5 then 'Cum'
            when 6 then 'Cmt'
            else 'Bugun'
          end,
        'is_read', exists (select 1 from read_entries re where re.active_day = wd.active_day),
        'is_today', wd.active_day = v_today
      )
      order by wd.active_day
    ),
    '[]'::jsonb
  )
  into v_week_days
  from week_days wd;

  with rule_progress as (
    select
      r.*,
      case
        when r.trigger_type = 'daily_read' then case when v_has_read_today then 1 else 0 end
        when r.trigger_type = 'weekly_active_days' then v_active_days_this_week
        else v_current_streak
      end as progress_value,
      case
        when r.recurrence = 'daily' then v_today
        when r.recurrence = 'weekly' then v_week_start
        else null::date
      end as reward_period_start
    from public.reading_streak_reward_rules r
    where r.is_active = true
  ),
  claimable as (
    select rp.*
    from rule_progress rp
    where rp.progress_value >= rp.target_value
      and not exists (
        select 1
        from public.reading_streak_reward_claims c
        where c.user_id = v_user_id
          and c.rule_id = rp.id
          and (
            (rp.reward_period_start is null and c.period_start is null)
            or c.period_start = rp.reward_period_start
          )
      )
    order by rp.sort_order asc, rp.target_value asc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ruleId', c.id,
        'slug', c.slug,
        'title', c.title,
        'description', c.description,
        'triggerType', c.trigger_type,
        'targetValue', c.target_value,
        'progressValue', c.progress_value,
        'coinReward', c.coin_reward,
        'recurrence', c.recurrence
      )
      order by c.sort_order asc, c.target_value asc
    ),
    '[]'::jsonb
  )
  into v_claimable_rewards
  from claimable c;

  with rule_progress as (
    select
      r.*,
      case
        when r.trigger_type = 'daily_read' then case when v_has_read_today then 1 else 0 end
        when r.trigger_type = 'weekly_active_days' then v_active_days_this_week
        else v_current_streak
      end as progress_value,
      case
        when r.recurrence = 'daily' then v_today
        when r.recurrence = 'weekly' then v_week_start
        else null::date
      end as reward_period_start
    from public.reading_streak_reward_rules r
    where r.is_active = true
  )
  select jsonb_build_object(
    'ruleId', rp.id,
    'slug', rp.slug,
    'title', rp.title,
    'description', rp.description,
    'triggerType', rp.trigger_type,
    'targetValue', rp.target_value,
    'progressValue', rp.progress_value,
    'coinReward', rp.coin_reward,
    'recurrence', rp.recurrence,
    'isClaimable', rp.progress_value >= rp.target_value
  )
  into v_next_reward
  from rule_progress rp
  where not exists (
    select 1
    from public.reading_streak_reward_claims c
    where c.user_id = v_user_id
      and c.rule_id = rp.id
      and (
        (rp.reward_period_start is null and c.period_start is null)
        or c.period_start = rp.reward_period_start
      )
  )
  order by
    case when rp.progress_value >= rp.target_value then 0 else 1 end,
    greatest(rp.target_value - rp.progress_value, 0) asc,
    rp.sort_order asc
  limit 1;

  select coalesce(sum(c.credited_coin), 0)::integer
  into v_earned_today_coin
  from public.reading_streak_reward_claims c
  where c.user_id = v_user_id
    and (c.claimed_at at time zone 'Europe/Istanbul')::date = v_today;

  select coalesce(sum(c.credited_coin), 0)::integer
  into v_total_claimed_coin
  from public.reading_streak_reward_claims c
  where c.user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'claimId', recent.id,
        'ruleId', recent.rule_id,
        'title', recent.title,
        'triggerType', recent.trigger_type,
        'creditedCoin', recent.credited_coin,
        'streakDays', recent.streak_days,
        'activeDaysThisWeek', recent.active_days_this_week,
        'claimedAt', recent.claimed_at
      )
      order by recent.claimed_at desc
    ),
    '[]'::jsonb
  )
  into v_recent_rewards
  from (
    select c.*, r.title
    from public.reading_streak_reward_claims c
    join public.reading_streak_reward_rules r on r.id = c.rule_id
    where c.user_id = v_user_id
    order by c.claimed_at desc
    limit 5
  ) recent;

  return jsonb_build_object(
    'current_streak', v_current_streak,
    'has_read_today', v_has_read_today,
    'active_days_this_week', v_active_days_this_week,
    'last_read_at', v_last_read_at,
    'week_days', v_week_days,
    'claimable_rewards', v_claimable_rewards,
    'next_reward', v_next_reward,
    'recent_rewards', v_recent_rewards,
    'earned_today_coin', v_earned_today_coin,
    'total_claimed_coin', v_total_claimed_coin
  );
end;
$$;

revoke all on function public.get_current_user_reading_streak_summary() from public;
grant execute on function public.get_current_user_reading_streak_summary() to authenticated;

create or replace function public.claim_current_user_reading_streak_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_week_start date;
  v_current_streak integer := 0;
  v_has_read_today boolean := false;
  v_active_days_this_week integer := 0;
  v_rule public.reading_streak_reward_rules%rowtype;
  v_progress_value integer;
  v_period_start date;
  v_claim_id uuid;
  v_claimed_at timestamptz := now();
  v_total_coin integer := 0;
  v_new_balance integer;
  v_claimed_rewards jsonb := '[]'::jsonb;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);

  with read_entries as (
    select (ae.created_at at time zone 'Europe/Istanbul')::date as active_day
    from public.activity_events ae
    where ae.actor_user_id = v_user_id
      and ae.actor_type = 'user'
      and ae.event_type = 'user_read'
      and ae.is_active = true
      and ae.created_at >= now() - interval '365 days'

    union

    select (rh.read_at at time zone 'Europe/Istanbul')::date as active_day
    from public.reading_history rh
    where rh.user_id = v_user_id
      and rh.read_at >= now() - interval '365 days'
  ),
  read_days as (
    select distinct active_day
    from read_entries
  ),
  anchor as (
    select
      case
        when exists (select 1 from read_days where active_day = v_today) then v_today
        when exists (select 1 from read_days where active_day = v_today - 1) then v_today - 1
        else null::date
      end as anchor_day
  ),
  streaks as (
    select
      rd.active_day,
      rd.active_day - (row_number() over (order by rd.active_day))::integer as streak_group
    from read_days rd
    cross join anchor a
    where a.anchor_day is not null
      and rd.active_day <= a.anchor_day
  ),
  anchor_group as (
    select s.streak_group
    from streaks s
    cross join anchor a
    where s.active_day = a.anchor_day
    limit 1
  )
  select
    coalesce((select count(*)::integer from streaks s join anchor_group ag on ag.streak_group = s.streak_group), 0),
    exists (select 1 from read_days where active_day = v_today),
    coalesce((select count(*)::integer from read_days where active_day between v_week_start and v_today), 0)
  into v_current_streak, v_has_read_today, v_active_days_this_week;

  for v_rule in
    select *
    from public.reading_streak_reward_rules
    where is_active = true
    order by sort_order asc, target_value asc
  loop
    v_progress_value := case
      when v_rule.trigger_type = 'daily_read' then case when v_has_read_today then 1 else 0 end
      when v_rule.trigger_type = 'weekly_active_days' then v_active_days_this_week
      else v_current_streak
    end;

    if v_progress_value < v_rule.target_value then
      continue;
    end if;

    v_period_start := case
      when v_rule.recurrence = 'daily' then v_today
      when v_rule.recurrence = 'weekly' then v_week_start
      else null::date
    end;
    v_claim_id := null;

    insert into public.reading_streak_reward_claims (
      user_id,
      rule_id,
      trigger_type,
      period_start,
      progress_value,
      streak_days,
      active_days_this_week,
      credited_coin,
      metadata,
      claimed_at
    )
    values (
      v_user_id,
      v_rule.id,
      v_rule.trigger_type,
      v_period_start,
      v_progress_value,
      v_current_streak,
      v_active_days_this_week,
      v_rule.coin_reward,
      jsonb_build_object(
        'rule_slug', v_rule.slug,
        'recurrence', v_rule.recurrence,
        'target_value', v_rule.target_value
      ),
      v_claimed_at
    )
    on conflict do nothing
    returning id into v_claim_id;

    if v_claim_id is null then
      continue;
    end if;

    if v_rule.coin_reward > 0 then
      update public.users
      set stones = coalesce(stones, 0) + v_rule.coin_reward
      where id = v_user_id
      returning stones into v_new_balance;
    else
      select coalesce(u.stones, 0)
      into v_new_balance
      from public.users u
      where u.id = v_user_id;
    end if;

    v_total_coin := v_total_coin + v_rule.coin_reward;
    v_claimed_rewards := v_claimed_rewards || jsonb_build_array(
      jsonb_build_object(
        'claimId', v_claim_id,
        'ruleId', v_rule.id,
        'slug', v_rule.slug,
        'title', v_rule.title,
        'triggerType', v_rule.trigger_type,
        'creditedCoin', v_rule.coin_reward,
        'streakDays', v_current_streak,
        'activeDaysThisWeek', v_active_days_this_week,
        'claimedAt', v_claimed_at
      )
    );

    perform public.push_notification(
      v_user_id,
      'system',
      'Okuma serisi odulu',
      format('"%s" odulunden +%s coin kazandin.', v_rule.title, v_rule.coin_reward),
      jsonb_build_object(
        'event', 'reading_streak_reward_claimed',
        'rule_id', v_rule.id,
        'rule_slug', v_rule.slug,
        'claim_id', v_claim_id,
        'coin_reward', v_rule.coin_reward,
        'streak_days', v_current_streak,
        'route_hint', '/',
        'event_key', format('reading-streak-reward:%s', v_claim_id::text)
      ),
      null
    );
  end loop;

  if v_new_balance is null then
    select coalesce(u.stones, 0)
    into v_new_balance
    from public.users u
    where u.id = v_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'claimed', v_claimed_rewards,
    'total_coin', v_total_coin,
    'new_balance', coalesce(v_new_balance, 0),
    'summary', public.get_current_user_reading_streak_summary()
  );
end;
$$;

revoke all on function public.claim_current_user_reading_streak_rewards() from public;
grant execute on function public.claim_current_user_reading_streak_rewards() to authenticated;

commit;
