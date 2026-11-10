-- ============================================
-- Manga suggestion engine V1 (rule based, explainable)
-- Date: 2026-07-09
--
-- get_recommended_mangas(p_limit):
-- 1) The user weighted genre profile is built:
-- genres of read mangas (last 50, weight 2)
-- + genres of followed mangas (weight 3)
-- + onboarding genre preferences (users.preferred_genres, weight 2)
-- 2) Candidate pool: active + approved mangas; read and followed ones are ELIMINATED.
-- 3) Score = genre overlap * 3 + rating * 1.5 + ln(1+views) * 0.5
-- + 2 if updated in the last 30 days
-- + 1.5 if it is a manga of a followed fansub
-- 4) The matched_genres column allows a "why suggested" explanation in the UI.
--
-- Cold start / anon: the profile stays empty, ordering naturally falls to
-- popularity+quality+freshness; the same RPC also works for anon.
--
-- NOTE (RLS helper rule): even as definer, like everything called in client context
-- identity is read with app_private.current_public_user_id()
-- (public.current_public_user_id is closed to client roles, migration 208).
-- ============================================

begin;

create or replace function public.get_recommended_mangas(p_limit integer default 12)
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
    select app_private.current_public_user_id() as user_id
  ),
  recent_reads as (
    select rh.manga_id
    from public.reading_history rh
    join viewer v on rh.user_id = v.user_id
    order by rh.read_at desc
    limit 50
  ),
  signal_genres as (
    select g.genre, 2::numeric as weight
    from recent_reads rr
    join public.mangas m on m.id = rr.manga_id
    cross join lateral unnest(m.genres) as g(genre)
    union all
    select g.genre, 3::numeric
    from public.manga_follows mf
    join viewer v on mf.user_id = v.user_id
    join public.mangas m on m.id = mf.manga_id
    cross join lateral unnest(m.genres) as g(genre)
    union all
    select g.genre, 2::numeric
    from public.users u
    join viewer v on u.id = v.user_id
    cross join lateral unnest(u.preferred_genres) as g(genre)
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
  order by
    (
      c.genre_score * 3
      + coalesce(c.rating, 0) * 1.5
      + ln(1 + c.total_views) * 0.5
      + case when c.updated_at > (now() - interval '30 days') then 2 else 0 end
      + case when c.from_followed_fansub then 1.5 else 0 end
    ) desc,
    c.total_views desc,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 40))
$$;

revoke all on function public.get_recommended_mangas(integer) from public;
grant execute on function public.get_recommended_mangas(integer) to anon, authenticated;

-- ---------- Feature flag ----------

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
  'home.recommendations',
  'Ana Sayfa Oneri Motoru',
  'Ana sayfadaki "Senin icin" rayini ve kisisel oneri kaynagini acar.',
  true,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    rollout_percent = excluded.rollout_percent,
    is_public = excluded.is_public,
    metadata = excluded.metadata;

notify pgrst, 'reload schema';

commit;
