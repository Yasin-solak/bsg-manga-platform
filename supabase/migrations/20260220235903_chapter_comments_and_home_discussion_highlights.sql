-- ============================================
-- BSG Manga | Chapter comments + home discussion highlights
-- Date: 2026-02-20
-- ============================================

begin;

alter table public.manga_comments
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null;

create index if not exists manga_comments_manga_created_active_idx
  on public.manga_comments (manga_id, created_at desc)
  where is_active = true;

create index if not exists manga_comments_chapter_created_active_idx
  on public.manga_comments (chapter_id, created_at desc)
  where is_active = true and chapter_id is not null;

create or replace function public.validate_manga_comment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chapter_manga_id uuid;
  v_parent_manga_id uuid;
  v_parent_chapter_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.manga_id is distinct from old.manga_id then
      raise exception 'Yorumun manga baglami degistirilemez.';
    end if;

    if new.parent_id is distinct from old.parent_id then
      raise exception 'Yorumun parent baglami degistirilemez.';
    end if;

    if new.chapter_id is distinct from old.chapter_id then
      raise exception 'Yorumun bolum baglami degistirilemez.';
    end if;
  end if;

  if new.chapter_id is not null then
    select c.manga_id
    into v_chapter_manga_id
    from public.chapters c
    where c.id = new.chapter_id
      and c.is_active = true
      and c.is_approved = true
      and (c.publish_at is null or c.publish_at <= now());

    if v_chapter_manga_id is null then
      raise exception 'Yorum yapilacak bolum bulunamadi veya yayinlanmamis.';
    end if;

    if v_chapter_manga_id <> new.manga_id then
      raise exception 'Yorum bolumu secili manga ile uyusmuyor.';
    end if;
  end if;

  if new.parent_id is not null then
    select mc.manga_id, mc.chapter_id
    into v_parent_manga_id, v_parent_chapter_id
    from public.manga_comments mc
    where mc.id = new.parent_id;

    if v_parent_manga_id is null then
      raise exception 'Yanitlanacak yorum bulunamadi.';
    end if;

    if v_parent_manga_id <> new.manga_id then
      raise exception 'Yanit yorumunun manga baglami gecersiz.';
    end if;

    if v_parent_chapter_id is not null then
      if new.chapter_id is null then
        new.chapter_id := v_parent_chapter_id;
      elsif new.chapter_id <> v_parent_chapter_id then
        raise exception 'Yanit yorumunun bolum baglami gecersiz.';
      end if;
    elsif new.chapter_id is not null then
      raise exception 'Manga seviyesindeki yoruma bolum baglamli yanit verilemez.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists manga_comments_scope_guard on public.manga_comments;
create trigger manga_comments_scope_guard
before insert or update on public.manga_comments
for each row
execute function public.validate_manga_comment_scope();

create or replace function public.get_home_discussion_highlights(
  p_manga_limit integer default 6,
  p_chapter_limit integer default 6,
  p_window_days integer default 14
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with params as (
    select
      greatest(least(coalesce(p_manga_limit, 6), 20), 1) as manga_limit,
      greatest(least(coalesce(p_chapter_limit, 6), 20), 1) as chapter_limit,
      greatest(least(coalesce(p_window_days, 14), 90), 1) as window_days,
      now() - make_interval(days => greatest(least(coalesce(p_window_days, 14), 90), 1)) as window_start
  ),
  base_comments as (
    select
      mc.id,
      mc.manga_id,
      mc.chapter_id,
      mc.created_at
    from public.manga_comments mc
    join public.mangas m
      on m.id = mc.manga_id
     and m.is_active = true
     and m.is_approved = true
    where mc.is_active = true
  ),
  manga_rank as (
    select
      m.id as manga_id,
      m.title as manga_title,
      m.cover_image_url,
      count(*)::int as comment_count,
      count(*) filter (where bc.created_at >= p.window_start)::int as recent_comment_count,
      max(bc.created_at) as last_comment_at
    from params p
    join base_comments bc on true
    join public.mangas m on m.id = bc.manga_id
    group by m.id, m.title, m.cover_image_url, p.window_start
  ),
  top_mangas as (
    select
      mr.manga_id,
      mr.manga_title,
      mr.cover_image_url,
      mr.comment_count,
      mr.recent_comment_count,
      mr.last_comment_at
    from manga_rank mr
    order by mr.recent_comment_count desc, mr.comment_count desc, mr.last_comment_at desc
    limit (select manga_limit from params)
  ),
  chapter_rank as (
    select
      c.id as chapter_id,
      c.manga_id,
      c.chapter_number,
      c.title as chapter_title,
      m.title as manga_title,
      m.cover_image_url,
      count(*)::int as comment_count,
      count(*) filter (where bc.created_at >= p.window_start)::int as recent_comment_count,
      max(bc.created_at) as last_comment_at
    from params p
    join base_comments bc
      on bc.chapter_id is not null
    join public.chapters c
      on c.id = bc.chapter_id
     and c.is_active = true
     and c.is_approved = true
     and (c.publish_at is null or c.publish_at <= now())
    join public.mangas m
      on m.id = c.manga_id
     and m.is_active = true
     and m.is_approved = true
    group by c.id, c.manga_id, c.chapter_number, c.title, m.title, m.cover_image_url, p.window_start
  ),
  top_chapters as (
    select
      cr.chapter_id,
      cr.manga_id,
      cr.chapter_number,
      cr.chapter_title,
      cr.manga_title,
      cr.cover_image_url,
      cr.comment_count,
      cr.recent_comment_count,
      cr.last_comment_at
    from chapter_rank cr
    order by cr.recent_comment_count desc, cr.comment_count desc, cr.last_comment_at desc
    limit (select chapter_limit from params)
  )
  select jsonb_build_object(
    'window_days', (select window_days from params),
    'top_mangas',
    coalesce(
      (
        select jsonb_agg(to_jsonb(tm) order by tm.recent_comment_count desc, tm.comment_count desc, tm.last_comment_at desc)
        from top_mangas tm
      ),
      '[]'::jsonb
    ),
    'top_chapters',
    coalesce(
      (
        select jsonb_agg(to_jsonb(tc) order by tc.recent_comment_count desc, tc.comment_count desc, tc.last_comment_at desc)
        from top_chapters tc
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_home_discussion_highlights(integer, integer, integer) from public;
grant execute on function public.get_home_discussion_highlights(integer, integer, integer) to anon, authenticated;

commit;
