-- Content workflow for the fansub admin panel:
-- - Chapter and post listing RPCs for staff (admin/mod)
-- - Update RPCs requiring admin approval on staff changes
-- - Extra indexes for performance

create index if not exists chapters_fansub_active_updated_idx
  on public.chapters (fansub_id, is_active, updated_at desc);

create index if not exists community_posts_author_status_updated_idx
  on public.community_posts (author_id, status, updated_at desc);

create index if not exists fansub_members_fansub_user_role_idx
  on public.fansub_members (fansub_id, user_id, role);

create or replace function public.is_fansub_staff_of_user(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fansub_members actor
    join public.fansub_members target
      on target.fansub_id = actor.fansub_id
    join public.fansubs f
      on f.id = actor.fansub_id
    where actor.user_id = public.current_public_user_id()
      and actor.role in ('admin', 'moderator')
      and target.user_id = p_target_user_id
      and f.is_active = true
  );
$$;

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

create or replace function public.update_fansub_chapter_for_review(
  p_fansub_id uuid,
  p_chapter_id uuid,
  p_title text default null
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

  update public.chapters
  set
    title = v_title,
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
    'status', 'pending_admin_review'
  );
end;
$$;

create or replace function public.list_fansub_manage_posts(
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
    raise exception 'Bu fansubun postlarini yonetme yetkiniz yok.';
  end if;

  if v_status not in ('all', 'approved', 'pending', 'rejected') then
    v_status := 'all';
  end if;

  v_offset := (v_page - 1) * v_limit;

  select count(*)
  into v_total
  from public.community_posts cp
  join public.users u
    on u.id = cp.author_id
  join public.fansub_members fm
    on fm.user_id = cp.author_id
   and fm.fansub_id = p_fansub_id
  where cp.is_active = true
    and (
      v_status = 'all'
      or cp.status = v_status
    )
    and (
      v_search is null
      or coalesce(cp.title, '') ilike ('%' || v_search || '%')
      or coalesce(cp.body, '') ilike ('%' || v_search || '%')
      or coalesce(cp.category, '') ilike ('%' || v_search || '%')
      or u.username ilike ('%' || v_search || '%')
    );

  with filtered as (
    select
      cp.id,
      cp.author_id,
      u.username as author_username,
      u.avatar_url as author_avatar_url,
      cp.category,
      cp.title,
      cp.body,
      cp.status,
      cp.created_at,
      cp.updated_at
    from public.community_posts cp
    join public.users u
      on u.id = cp.author_id
    join public.fansub_members fm
      on fm.user_id = cp.author_id
     and fm.fansub_id = p_fansub_id
    where cp.is_active = true
      and (
        v_status = 'all'
        or cp.status = v_status
      )
      and (
        v_search is null
        or coalesce(cp.title, '') ilike ('%' || v_search || '%')
        or coalesce(cp.body, '') ilike ('%' || v_search || '%')
        or coalesce(cp.category, '') ilike ('%' || v_search || '%')
        or u.username ilike ('%' || v_search || '%')
      )
    order by cp.updated_at desc, cp.created_at desc
    offset v_offset
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'author_id', f.author_id,
        'author_username', f.author_username,
        'author_avatar_url', f.author_avatar_url,
        'category', f.category,
        'title', f.title,
        'body', f.body,
        'status', f.status,
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

create or replace function public.update_fansub_post_for_review(
  p_fansub_id uuid,
  p_post_id uuid,
  p_title text,
  p_body text,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_post public.community_posts%rowtype;
  v_title text;
  v_body text;
  v_category text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_post_id is null then
    raise exception 'Fansub ve post bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun postlarini guncelleme yetkiniz yok.';
  end if;

  select cp.*
  into v_post
  from public.community_posts cp
  join public.fansub_members fm
    on fm.user_id = cp.author_id
   and fm.fansub_id = p_fansub_id
  where cp.id = p_post_id
    and cp.is_active = true
  for update;

  if not found then
    raise exception 'Post bulunamadi veya bu fansubun uye icerigi degil.';
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  v_body := nullif(trim(coalesce(p_body, '')), '');
  v_category := nullif(trim(coalesce(p_category, '')), '');

  if v_title is null or char_length(v_title) < 2 then
    raise exception 'Post basligi en az 2 karakter olmali.';
  end if;
  if char_length(v_title) > 160 then
    raise exception 'Post basligi en fazla 160 karakter olabilir.';
  end if;

  if v_body is null or char_length(v_body) < 2 then
    raise exception 'Post icerigi en az 2 karakter olmali.';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'Post icerigi en fazla 5000 karakter olabilir.';
  end if;

  if v_category is not null and lower(v_category) = 'duyuru' then
    raise exception 'Duyuru kategorisi topluluk postlari icin kapatilmis durumda.';
  end if;

  update public.community_posts
  set
    title = v_title,
    body = v_body,
    category = v_category,
    status = 'pending',
    approved_at = null,
    approved_by = null,
    rejected_at = null,
    rejected_by = null,
    reject_reason = null,
    updated_at = now()
  where id = v_post.id;

  return jsonb_build_object(
    'success', true,
    'post_id', v_post.id,
    'fansub_id', p_fansub_id,
    'status', 'pending_admin_review'
  );
end;
$$;

grant execute on function public.is_fansub_staff_of_user(uuid) to authenticated;
grant execute on function public.list_fansub_manage_chapters(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.update_fansub_chapter_for_review(uuid, uuid, text) to authenticated;
grant execute on function public.list_fansub_manage_posts(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.update_fansub_post_for_review(uuid, uuid, text, text, text) to authenticated;

