-- Profile tabs v2: new showcase modules (genre signature, level, teams, latest activity)
-- and a reading summary for the stats tab (monthly chapters, streak days). The summary follows the profile
-- stats privacy (get_profile_view_access.stats_visible).

alter table public.user_profile_layouts drop constraint if exists user_profile_layouts_slot_check;
alter table public.user_profile_layouts add constraint user_profile_layouts_slot_check check (
  slot_left in ('badges', 'reading', 'fav', 'list', 'post', 'stats', 'genres', 'level', 'teams', 'activity', 'none')
  and slot_right in ('badges', 'reading', 'fav', 'list', 'post', 'stats', 'genres', 'level', 'teams', 'activity', 'none')
  and (slot_left = 'none' or slot_left <> slot_right)
);

create or replace function public.get_profile_reading_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_visible boolean;
  v_days date[];
  v_longest integer := 0;
  v_run integer := 0;
  v_current integer := 0;
  v_prev date;
  v_day date;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  select coalesce(access.is_owner or access.stats_visible, false) into v_visible
  from public.get_profile_view_access(p_user_id) access;
  if not coalesce(v_visible, false) then
    return null;
  end if;

  select array_agg(distinct (h.read_at at time zone 'Europe/Istanbul')::date order by (h.read_at at time zone 'Europe/Istanbul')::date)
  into v_days
  from public.reading_history h where h.user_id = p_user_id and h.read_at is not null;

  foreach v_day in array coalesce(v_days, array[]::date[]) loop
    v_run := case when v_prev is not null and v_day = v_prev + 1 then v_run + 1 else 1 end;
    v_longest := greatest(v_longest, v_run);
    v_prev := v_day;
  end loop;
  -- Current streak: if the last read is today or yesterday the streak continues.
  if v_prev is not null and v_prev >= v_today - 1 then v_current := v_run; end if;

  return jsonb_build_object(
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'chapters', coalesce(c.n, 0)) order by m.month), '[]'::jsonb)
      from generate_series(date_trunc('month', v_today::timestamp) - interval '5 months', date_trunc('month', v_today::timestamp), interval '1 month') as m(month)
      left join (
        select date_trunc('month', (h.read_at at time zone 'Europe/Istanbul')) as month, count(*) as n
        from public.reading_history h
        where h.user_id = p_user_id and h.read_at >= (date_trunc('month', v_today::timestamp) - interval '5 months')
        group by 1
      ) c on c.month = m.month
    ),
    'activeDays', coalesce(cardinality(v_days), 0),
    'longestStreak', v_longest,
    'currentStreak', v_current,
    'seriesRead', (select count(distinct h.manga_id) from public.reading_history h where h.user_id = p_user_id),
    'chaptersRead', (select count(*) from public.reading_history h where h.user_id = p_user_id),
    'lastReadAt', (select max(h.read_at) from public.reading_history h where h.user_id = p_user_id)
  );
end;
$function$;
revoke all on function public.get_profile_reading_summary(uuid) from public;
grant execute on function public.get_profile_reading_summary(uuid) to anon, authenticated;
