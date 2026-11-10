-- ============================================
-- Public release schedule (site-wide + fansub scoped)
-- Date: 2026-03-04
-- ============================================

begin;

create index if not exists chapters_public_schedule_idx
  on public.chapters (publish_at asc, fansub_id, manga_id)
  where is_active = true and is_approved = true;

create or replace function public.list_public_release_schedule(
  p_fansub_id uuid default null,
  p_from timestamptz default null,
  p_days_ahead integer default 30,
  p_limit integer default 200
)
returns table (
  chapter_id uuid,
  manga_id uuid,
  manga_title text,
  manga_slug text,
  manga_cover_image_url text,
  fansub_id uuid,
  fansub_name text,
  fansub_slug text,
  chapter_number numeric,
  chapter_title text,
  publish_at timestamptz,
  is_upcoming boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_days_ahead integer := least(greatest(coalesce(p_days_ahead, 30), 1), 120);
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_to timestamptz := v_from + make_interval(days => v_days_ahead);
begin
  return query
  select
    c.id as chapter_id,
    m.id as manga_id,
    m.title as manga_title,
    m.slug as manga_slug,
    m.cover_image_url as manga_cover_image_url,
    coalesce(c.fansub_id, m.fansub_id) as fansub_id,
    f.name as fansub_name,
    f.slug as fansub_slug,
    c.chapter_number,
    c.title as chapter_title,
    c.publish_at,
    (c.publish_at > now()) as is_upcoming
  from public.chapters c
  join public.mangas m on m.id = c.manga_id
  left join public.fansubs f on f.id = coalesce(c.fansub_id, m.fansub_id)
  where c.is_active = true
    and c.is_approved = true
    and m.is_active = true
    and m.is_approved = true
    and coalesce(f.is_active, true) = true
    and c.publish_at is not null
    and c.publish_at >= v_from
    and c.publish_at < v_to
    and (
      p_fansub_id is null
      or coalesce(c.fansub_id, m.fansub_id) = p_fansub_id
    )
  order by c.publish_at asc, m.title asc, c.chapter_number asc
  limit v_limit;
end;
$$;

revoke all on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) from public;
grant execute on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) to anon;
grant execute on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) to authenticated;

commit;
