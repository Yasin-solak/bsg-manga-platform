-- ============================================
-- Chapter publish scheduling
-- Date: 2026-02-13
-- ============================================

begin;

alter table public.chapters
  add column if not exists publish_at timestamptz;

update public.chapters
set publish_at = coalesce(publish_at, created_at, now())
where publish_at is null;

alter table public.chapters
  alter column publish_at set default now();

create index if not exists chapters_publish_at_idx
  on public.chapters (publish_at desc);

create index if not exists chapters_manga_public_list_idx
  on public.chapters (manga_id, chapter_number desc, publish_at desc)
  where is_active = true and is_approved = true;

drop policy if exists chapters_select_public on public.chapters;
create policy chapters_select_public
  on public.chapters
  for select
  using (
    (
      is_active = true
      and is_approved = true
      and (publish_at is null or publish_at <= now())
    )
    or public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

create or replace function public.list_fansub_manage_chapters(
  p_fansub_id uuid,
  p_page integer default 1,
  p_limit integer default 20,
  p_search text default null,
  p_status text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := lower(trim(coalesce(p_status, 'all')));
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun bolumlerini yonetme yetkiniz yok.';
  end if;

  if v_status not in ('all', 'approved', 'pending') then
    v_status := 'all';
  end if;

  v_offset := (v_page - 1) * v_limit;

  select count(*)
  into v_total
  from public.chapters c
  join public.mangas m on m.id = c.manga_id
  where c.fansub_id = p_fansub_id
    and c.is_active = true
    and (
      v_status = 'all'
      or (v_status = 'approved' and c.is_approved = true)
      or (v_status = 'pending' and c.is_approved = false)
    )
    and (
      v_search is null
      or m.title ilike ('%' || v_search || '%')
      or coalesce(c.title, '') ilike ('%' || v_search || '%')
      or c.chapter_number::text ilike ('%' || v_search || '%')
      or to_char(coalesce(c.publish_at, c.created_at), 'YYYY-MM-DD HH24:MI') ilike ('%' || v_search || '%')
    );

  with filtered as (
    select
      c.id,
      c.manga_id,
      m.title as manga_title,
      m.slug as manga_slug,
      c.chapter_number,
      c.title,
      c.is_approved,
      c.publish_at,
      c.created_at,
      c.updated_at
    from public.chapters c
    join public.mangas m on m.id = c.manga_id
    where c.fansub_id = p_fansub_id
      and c.is_active = true
      and (
        v_status = 'all'
        or (v_status = 'approved' and c.is_approved = true)
        or (v_status = 'pending' and c.is_approved = false)
      )
      and (
        v_search is null
        or m.title ilike ('%' || v_search || '%')
        or coalesce(c.title, '') ilike ('%' || v_search || '%')
        or c.chapter_number::text ilike ('%' || v_search || '%')
        or to_char(coalesce(c.publish_at, c.created_at), 'YYYY-MM-DD HH24:MI') ilike ('%' || v_search || '%')
      )
    order by c.updated_at desc, c.created_at desc
    offset v_offset
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'manga_id', f.manga_id,
        'manga_title', f.manga_title,
        'manga_slug', f.manga_slug,
        'chapter_number', f.chapter_number,
        'title', f.title,
        'is_approved', f.is_approved,
        'publish_at', f.publish_at,
        'created_at', f.created_at,
        'updated_at', f.updated_at
      )
      order by f.updated_at desc, f.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from filtered f;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'limit', v_limit
  );
end;
$$;

drop function if exists public.update_fansub_chapter_for_review(uuid, uuid, text);

create or replace function public.update_fansub_chapter_for_review(
  p_fansub_id uuid,
  p_chapter_id uuid,
  p_title text default null,
  p_publish_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_chapter public.chapters%rowtype;
  v_title text;
  v_publish_at timestamptz;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_chapter_id is null then
    raise exception 'Fansub ve bolum bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun bolumlerini guncelleme yetkiniz yok.';
  end if;

  select *
  into v_chapter
  from public.chapters c
  where c.id = p_chapter_id
    and c.fansub_id = p_fansub_id
    and c.is_active = true
  for update;

  if not found then
    raise exception 'Bolum bulunamadi veya bu fansuba ait degil.';
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is not null and char_length(v_title) > 140 then
    raise exception 'Bolum basligi en fazla 140 karakter olabilir.';
  end if;

  v_publish_at := coalesce(p_publish_at, v_chapter.publish_at, now());

  update public.chapters
  set
    title = v_title,
    publish_at = v_publish_at,
    is_approved = false,
    updated_at = now()
  where id = v_chapter.id;

  update public.mangas
  set updated_at = now()
  where id = v_chapter.manga_id;

  return jsonb_build_object(
    'success', true,
    'chapter_id', v_chapter.id,
    'fansub_id', p_fansub_id,
    'publish_at', v_publish_at,
    'status', 'pending_admin_review'
  );
end;
$$;

grant execute on function public.list_fansub_manage_chapters(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.update_fansub_chapter_for_review(uuid, uuid, text, timestamptz) to authenticated;

commit;
