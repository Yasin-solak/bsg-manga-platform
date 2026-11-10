begin;

create or replace function public.get_public_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with reading_rows as (
    select m.genres
    from public.reading_history rh
    join public.mangas m on m.id = rh.manga_id
    where rh.user_id = p_user_id
      and coalesce(m.is_active, false) = true
      and coalesce(m.is_approved, false) = true
  ),
  reading_count as (
    select count(*)::int as value
    from reading_rows
  ),
  comments_count as (
    select count(*)::int as value
    from public.manga_comments mc
    where mc.user_id = p_user_id
      and coalesce(mc.is_active, true) = true
  ),
  followers_count as (
    select count(*)::int as value
    from public.user_follows uf
    where uf.following_id = p_user_id
  ),
  following_count as (
    select count(*)::int as value
    from public.user_follows uf
    where uf.follower_id = p_user_id
  ),
  genre_counts as (
    select
      btrim(genre) as genre,
      count(*)::int as count
    from reading_rows rr
    cross join lateral unnest(coalesce(rr.genres, array[]::text[])) as genre
    where nullif(btrim(genre), '') is not null
    group by btrim(genre)
  ),
  genre_totals as (
    select coalesce(sum(gc.count), 0)::int as total
    from genre_counts gc
  ),
  favorite_genres as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', top_genres.genre,
          'count', top_genres.count,
          'percent',
            case
              when genre_totals.total > 0 then round((top_genres.count::numeric * 100.0) / genre_totals.total)::int
              else 0
            end
        )
        order by top_genres.count desc, top_genres.genre asc
      ),
      '[]'::jsonb
    ) as data
    from (
      select gc.genre, gc.count
      from genre_counts gc
      order by gc.count desc, gc.genre asc
      limit 5
    ) top_genres
    cross join genre_totals
  )
  select jsonb_build_object(
    'reading', coalesce((select value from reading_count), 0),
    'comments', coalesce((select value from comments_count), 0),
    'followers', coalesce((select value from followers_count), 0),
    'following', coalesce((select value from following_count), 0),
    'time_spent_minutes', coalesce((select value from reading_count), 0) * 5,
    'favorite_genres', coalesce((select data from favorite_genres), '[]'::jsonb)
  );
$$;

grant execute on function public.get_public_profile_stats(uuid) to anon, authenticated;

comment on function public.get_public_profile_stats(uuid)
  is 'Profil sayfasinin public veya follower-visible istatistiklerini tek RPC cevabinda dondurur; reading_history ve user_follows tekrarlarini azaltir.';

commit;
