-- Translation Studio: a chapter published from the studio that is still waiting for moderation
-- can be reopened in the studio and its pages replaced in place. Approved chapters keep using
-- revisions (tl_open_chapter_revision / tl_submit_chapter_revision).
-- The project keeps stage 'published' / 'scheduled' while it is edited: the series chapter list,
-- the reader language layer (tl_reader_project) and revisions look the project up by that stage.

create or replace function public.tl_reopen_pending_chapter(p_chapter_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_chapter public.chapters%rowtype;
  v_project public.translation_projects%rowtype;
begin
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then
    raise exception 'Bölüm bulunamadı.' using errcode = 'P0002';
  end if;
  if v_chapter.fansub_id is null or not app_private.tl_perm(v_chapter.fansub_id, 'ceviri.proje') then
    raise exception 'Bölümü düzenlemek için proje yönetimi izni gerekir.' using errcode = '42501';
  end if;
  if coalesce(v_chapter.is_approved, false) then
    raise exception 'Onaylı bölüm revizyonla düzenlenir.' using errcode = 'PT409';
  end if;

  select * into v_project from public.translation_projects
  where chapter_id = p_chapter_id and revision_of is null and fansub_id = v_chapter.fansub_id
  order by updated_at desc limit 1;
  if not found then
    raise exception 'Bu bölüm stüdyoda hazırlanmadı.' using errcode = 'P0002';
  end if;
  return v_project.id;
end;
$function$;

create or replace function public.tl_update_pending_chapter(p_project_id uuid, p_pages jsonb, p_page_dimensions jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_project public.translation_projects%rowtype;
  v_chapter public.chapters%rowtype;
begin
  select * into v_project from public.translation_projects where id = p_project_id;
  if not found or v_project.chapter_id is null or v_project.revision_of is not null then
    raise exception 'Düzenlenecek bölüm bulunamadı.' using errcode = 'P0002';
  end if;
  if not app_private.tl_perm(v_project.fansub_id, 'ceviri.yayinla') then
    raise exception 'Bölümü güncellemek için yayınlama izni gerekir.' using errcode = '42501';
  end if;
  select * into v_chapter from public.chapters where id = v_project.chapter_id for update;
  if not found or v_chapter.fansub_id is distinct from v_project.fansub_id then
    raise exception 'Düzenlenecek bölüm bulunamadı.' using errcode = 'P0002';
  end if;
  if coalesce(v_chapter.is_approved, false) then
    raise exception 'Bölüm bu arada onaylandı; değişikliği revizyon olarak gönder.' using errcode = 'PT409';
  end if;
  -- Only a chapter this project created (the project predates it); a project linked afterwards
  -- to some other unapproved chapter cannot overwrite it.
  if v_chapter.created_at < v_project.created_at then
    raise exception 'Bu bölüm stüdyoda hazırlanmadı.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_pages) is distinct from 'array'
    or jsonb_array_length(p_pages) not between 1 and 1000
    or exists (select 1 from jsonb_array_elements(p_pages) ref
      where jsonb_typeof(ref) <> 'string' or length(ref #>> '{}') not between 1 and 1000) then
    raise exception 'Sayfa listesi geçersiz.' using errcode = '22023';
  end if;
  if p_page_dimensions is not null and jsonb_typeof(p_page_dimensions) <> 'object' then
    raise exception 'Sayfa ölçüleri geçersiz.' using errcode = '22023';
  end if;

  update public.chapters
  set pages = p_pages,
      page_dimensions = coalesce(p_page_dimensions, '{}'::jsonb),
      title = coalesce(v_project.chapter_title, title)
  where id = v_chapter.id;

  return v_chapter.id;
end;
$function$;

revoke all on function public.tl_reopen_pending_chapter(uuid) from public, anon;
revoke all on function public.tl_update_pending_chapter(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.tl_reopen_pending_chapter(uuid) to authenticated;
grant execute on function public.tl_update_pending_chapter(uuid, jsonb, jsonb) to authenticated;
