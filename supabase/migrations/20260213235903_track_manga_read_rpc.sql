-- ============================================
-- Manga read tracking and total view increment
-- Date: 2026-02-13
-- ============================================

begin;

create or replace function public.track_manga_read(
  p_manga_id uuid,
  p_chapter_id uuid default null,
  p_chapter_number numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_should_increment boolean := true;
  v_existing public.reading_history%rowtype;
  v_total_views bigint;
begin
  if p_manga_id is null then
    raise exception 'Manga id zorunludur.';
  end if;

  v_user_id := public.current_public_user_id();

  if v_user_id is not null then
    select *
    into v_existing
    from public.reading_history
    where user_id = v_user_id
      and manga_id = p_manga_id
    for update;

    if found then
      if v_existing.chapter_id is not distinct from p_chapter_id
         and v_existing.read_at >= v_now - interval '90 seconds' then
        v_should_increment := false;
      end if;

      update public.reading_history
      set chapter_id = coalesce(p_chapter_id, v_existing.chapter_id),
          chapter_number = coalesce(p_chapter_number, v_existing.chapter_number),
          read_at = v_now
      where id = v_existing.id;
    else
      insert into public.reading_history (
        user_id,
        manga_id,
        chapter_id,
        chapter_number,
        read_at
      )
      values (
        v_user_id,
        p_manga_id,
        p_chapter_id,
        p_chapter_number,
        v_now
      );
    end if;
  end if;

  if v_should_increment then
    update public.mangas
    set total_views = total_views + 1
    where id = p_manga_id
      and is_active = true
      and is_approved = true
    returning total_views into v_total_views;
  else
    select total_views
    into v_total_views
    from public.mangas
    where id = p_manga_id;
  end if;

  return coalesce(v_total_views, 0);
end;
$$;

grant execute on function public.track_manga_read(uuid, uuid, numeric) to anon, authenticated;

commit;
