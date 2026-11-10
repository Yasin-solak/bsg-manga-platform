-- Desktop tabs sort from their own source; the existing mobile/All RPC is kept.
begin;
create or replace function public.get_recommended_mangas_by_source(p_source text, p_limit integer default 12)
returns table (
  id uuid,
  fansub_id uuid,
  title text,
  slug text,
  cover_image_url text,
  description text,
  status text,
  rating numeric,
  total_ratings integer,
  total_views bigint,
  is_new boolean,
  last_chapter_number numeric,
  genres text[],
  created_at timestamptz,
  updated_at timestamptz,
  matched_genres text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select app_private.current_public_user_id() as user_id where auth.uid() is not null
  ),
  recent_reads as (
    select rh.manga_id
    from public.reading_history rh
    join viewer v on rh.user_id = v.user_id
    group by rh.manga_id
    order by max(rh.read_at) desc, rh.manga_id
    limit 50
  ),
  signal_genres as (
    select g.genre, 2::numeric as weight
    from recent_reads rr
    join public.mangas m on m.id = rr.manga_id
    cross join lateral unnest(m.genres) as g(genre)
    where p_source = 'reading'
    union all
    select g.genre, 2::numeric
    from public.users u
    join viewer v on u.id = v.user_id
    cross join lateral unnest(u.preferred_genres) as g(genre)
    where p_source = 'genres'
  ),
  profile as (
    select genre, sum(weight) as weight
    from signal_genres
    group by genre
  ),
  excluded as (
    select rh.manga_id
    from public.reading_history rh
    join viewer v on rh.user_id = v.user_id
    union
    select mf.manga_id
    from public.manga_follows mf
    join viewer v on mf.user_id = v.user_id
  ),
  followed_fansubs as (
    select ff.fansub_id
    from public.fansub_follows ff
    join viewer v on ff.user_id = v.user_id
  ),
  candidates as (
    select
      m.*,
      coalesce((select sum(p.weight) from profile p where p.genre = any (m.genres)), 0) as genre_score,
      coalesce(
        (select array_agg(p.genre order by p.weight desc) from profile p where p.genre = any (m.genres)),
        '{}'::text[]
      ) as matched,
      (m.fansub_id is not null and m.fansub_id in (select ff.fansub_id from followed_fansubs ff)) as from_followed_fansub
    from public.mangas m
    where m.is_active = true
      and m.is_approved = true
      and not exists (select 1 from excluded e where e.manga_id = m.id)
  )
  select
    c.id,
    c.fansub_id,
    c.title,
    c.slug,
    c.cover_image_url,
    c.description,
    c.status,
    c.rating,
    c.total_ratings,
    c.total_views,
    c.is_new,
    c.last_chapter_number,
    c.genres,
    c.created_at,
    c.updated_at,
    c.matched as matched_genres
  from candidates c
  where c.genre_score > 0
  order by
    (
      c.genre_score * 3
      + coalesce(c.rating, 0) * 1.5
      + ln(1 + c.total_views) * 0.5
      + case when c.updated_at > (now() - interval '30 days') then 2 else 0 end
      + case when c.from_followed_fansub then 1.5 else 0 end
    ) desc,
    c.total_views desc,
    c.created_at desc, c.id
  limit greatest(1, least(coalesce(p_limit, 12), 40))
$$;

revoke all on function public.get_recommended_mangas_by_source(text, integer) from public;
grant execute on function public.get_recommended_mangas_by_source(text, integer) to authenticated;


notify pgrst, 'reload schema';
commit;
