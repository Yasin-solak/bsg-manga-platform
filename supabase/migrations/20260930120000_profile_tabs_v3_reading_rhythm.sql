-- Profile tabs v3: rhythm data added to the reading summary.
-- daily     : last 26 weeks, chapter count per day (activity heat map)
-- hourly    : chapter distribution by hour (Europe/Istanbul, 0-23)
-- weekdays  : chapter distribution by weekday (1 = Monday ... 7 = Sunday)
-- topSeries : 6 most read series by chapters (active + approved series)
-- Same privacy: only the owner or a visitor able to see stats (stats_visible).

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
  v_from date := (now() at time zone 'Europe/Istanbul')::date - 181;
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
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'chapters', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') as d(day)
      left join (
        select (h.read_at at time zone 'Europe/Istanbul')::date as day, count(*) as n
        from public.reading_history h
        where h.user_id = p_user_id and h.read_at >= v_from::timestamp at time zone 'Europe/Istanbul'
        group by 1
      ) c on c.day = d.day::date
    ),
    'hourly', (
      select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.hour), '[]'::jsonb)
      from generate_series(0, 23) as g(hour)
      left join (
        select extract(hour from (h.read_at at time zone 'Europe/Istanbul'))::integer as hour, count(*) as n
        from public.reading_history h
        where h.user_id = p_user_id and h.read_at is not null
        group by 1
      ) c on c.hour = g.hour
    ),
    'weekdays', (
      select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.dow), '[]'::jsonb)
      from generate_series(1, 7) as g(dow)
      left join (
        select extract(isodow from (h.read_at at time zone 'Europe/Istanbul'))::integer as dow, count(*) as n
        from public.reading_history h
        where h.user_id = p_user_id and h.read_at is not null
        group by 1
      ) c on c.dow = g.dow
    ),
    'topSeries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'slug', t.slug, 'title', t.title, 'coverImage', t.cover_image_url,
        'chapters', t.n, 'lastChapterNumber', t.last_chapter_number
      ) order by t.n desc, t.title), '[]'::jsonb)
      from (
        select m.id, m.slug, m.title, m.cover_image_url, m.last_chapter_number, count(*) as n
        from public.reading_history h
        join public.mangas m on m.id = h.manga_id
        where h.user_id = p_user_id and m.is_active and m.is_approved
        group by m.id
        order by count(*) desc, m.title
        limit 6
      ) t
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
