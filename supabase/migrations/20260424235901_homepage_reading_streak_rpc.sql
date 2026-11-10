-- MangaZone | Home page reading streak RPC
-- Reading streak is computed per day from activity_events even if reading_history falls to a unique manga row.

begin;

create or replace function public.get_current_user_reading_streak()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select public.current_public_user_id() as user_id
  ),
  read_days as (
    select distinct date_trunc('day', ae.created_at)::date as active_day
    from public.activity_events ae
    join viewer v on v.user_id = ae.actor_user_id
    where v.user_id is not null
      and ae.actor_type = 'user'
      and ae.event_type = 'user_read'
      and ae.is_active = true
      and ae.created_at >= now() - interval '365 days'

    union

    select distinct date_trunc('day', rh.read_at)::date as active_day
    from public.reading_history rh
    join viewer v on v.user_id = rh.user_id
    where v.user_id is not null
      and rh.read_at >= now() - interval '365 days'
  ),
  anchor as (
    select
      case
        when exists (select 1 from read_days where active_day = current_date) then current_date
        when exists (select 1 from read_days where active_day = current_date - 1) then current_date - 1
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
  select coalesce((
    select count(*)::integer
    from streaks s
    join anchor_group ag on ag.streak_group = s.streak_group
  ), 0);
$$;

revoke all on function public.get_current_user_reading_streak() from public;
grant execute on function public.get_current_user_reading_streak() to authenticated;

commit;
