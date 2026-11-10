-- ============================================
-- MangaZone | Popular Manga Windows (Weekly/Monthly)
-- Date: 2026-02-07
-- ============================================
-- Goal:
-- Sort the sidebar popular manga list by weekly/monthly read views
-- .

create index if not exists reading_history_popular_window_idx
  on public.reading_history (read_at desc, manga_id);

create or replace function public.get_popular_mangas_by_views_window(
  p_days integer default 7,
  p_limit integer default 5
)
returns table (
  id uuid,
  title text,
  cover_image_url text,
  last_chapter_number numeric,
  is_new boolean,
  rating numeric,
  total_views bigint,
  recent_views bigint,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with recent_reads as (
    select
      rh.manga_id,
      count(*)::bigint as recent_views
    from public.reading_history rh
    where rh.read_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
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
  limit greatest(coalesce(p_limit, 0), 0);
$$;

grant execute on function public.get_popular_mangas_by_views_window(integer, integer) to anon, authenticated;
