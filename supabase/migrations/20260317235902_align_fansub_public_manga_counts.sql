-- Brings the manga counter on fansub cards and the manga pool preview to the same rule.
-- The public catalog counter now counts not only fansub ownership but also series with the team's published chapters.

begin;

alter table public.fansubs
  add column if not exists active_profile_effect_id uuid references public.store_items(id) on delete set null;

drop function if exists public.get_fansubs_with_stats();

create or replace function public.get_fansubs_with_stats()
returns table (
  id uuid,
  name text,
  slug text,
  avatar_url text,
  description text,
  frame_type text,
  primary_color text,
  secondary_color text,
  manga_count bigint,
  follower_count bigint,
  active_frame_id uuid,
  active_background_id uuid,
  active_pattern_id uuid,
  active_profile_effect_id uuid,
  coin_balance integer
)
language sql
stable
set search_path = public
as $$
  select
    f.id,
    f.name,
    f.slug,
    f.avatar_url,
    f.description,
    f.frame_type,
    f.primary_color,
    f.secondary_color,
    coalesce((
      select count(distinct m.id)
      from public.mangas m
      where m.is_active = true
        and m.is_approved = true
        and (
          m.fansub_id = f.id
          or exists (
            select 1
            from public.chapters c
            where c.manga_id = m.id
              and c.fansub_id = f.id
              and c.is_active = true
              and c.is_approved = true
              and public.is_chapter_publicly_unlocked(c.publish_at)
          )
        )
    ), 0)::bigint as manga_count,
    coalesce((
      select count(*)
      from public.fansub_follows ff
      where ff.fansub_id = f.id
    ), 0)::bigint as follower_count,
    f.active_frame_id,
    f.active_background_id,
    f.active_pattern_id,
    f.active_profile_effect_id,
    f.coin_balance
  from public.fansubs f
  where f.is_active = true
  order by f.name asc;
$$;

grant execute on function public.get_fansubs_with_stats() to anon, authenticated;

commit;
