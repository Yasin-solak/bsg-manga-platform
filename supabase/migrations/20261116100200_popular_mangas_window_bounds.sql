-- get_popular_mangas_by_views_window is callable by anonymous visitors and had
-- no upper bound on the window or the row count, so a script could make every
-- call scan the whole reading history and return the whole catalog. Callers
-- use windows of 1, 7 or 30 days and ask for at most 100 rows.

create or replace function public.get_popular_mangas_by_views_window(p_days integer default 7, p_limit integer default 5)
returns table(
  id uuid,
  title text,
  cover_image_url text,
  last_chapter_number numeric,
  is_new boolean,
  rating numeric,
  total_views bigint,
  recent_views bigint,
  updated_at timestamp with time zone
)
language sql
stable
set search_path to 'public'
as $function$
  with recent_reads as (
    select
      rh.manga_id,
      count(*)::bigint as recent_views
    from public.reading_history rh
    where rh.read_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 7), 90), 1))
    group by rh.manga_id
  )
  select
    m.id,
    m.title,
    m.cover_image_url,
    m.last_chapter_number,
    m.is_new,
    m.rating,
    m.total_views,
    coalesce(rr.recent_views, 0)::bigint as recent_views,
    m.updated_at
  from public.mangas m
  left join recent_reads rr on rr.manga_id = m.id
  where m.is_active = true
    and m.is_approved = true
  order by
    coalesce(rr.recent_views, 0) desc,
    m.total_views desc,
    m.updated_at desc
  limit greatest(least(coalesce(p_limit, 0), 100), 0);
$function$;
