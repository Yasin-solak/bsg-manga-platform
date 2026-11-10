-- Translation Studio: admin chapter review (raw + translation, texts, new language).
--
-- On a chapter uploaded with the studio the site admin (Manga Control and Pending Approvals):
-- * sees raw and translated pages side by side: the raw image is in private R2, read only
-- through the /api/ceviri/admin-page Worker and the tl_admin_page_object_key
-- server-side is_admin check;
-- * reads page texts (order, type, original, TR, other languages) in one call;
-- * triggers reader language generation (reader-translate, scope=admin): even with the chapter
-- still pending approval the project source comes from tl_admin_translation_source; the +18 off
-- rule (tl_chapter_ai_allowed) and daily budget/request limits apply as is.
-- All site admin only (app_private.is_admin()); fansub permissions are untouched.

-- The chapter studio project: the live tied project, otherwise the newest project tied to the chapter.
create or replace function app_private.tl_admin_chapter_project(p_chapter_id uuid)
returns uuid language sql stable security definer set search_path = '' as $function$
  select p.id from public.translation_projects p
  where p.chapter_id = p_chapter_id
  order by (p.stage in ('published', 'scheduled')) desc, p.updated_at desc
  limit 1;
$function$;

revoke all on function app_private.tl_admin_chapter_project(uuid) from public, anon, authenticated;

create or replace function public.admin_chapter_studio_review(p_chapter_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_project uuid;
  v_chapter public.chapters%rowtype;
begin
  if not app_private.is_admin() then
    raise exception 'Bölüm incelemesi yalnız site yöneticisine açık.' using errcode = '42501';
  end if;
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then
    raise exception 'Bölüm bulunamadı.' using errcode = 'P0002';
  end if;
  v_project := app_private.tl_admin_chapter_project(p_chapter_id);

  return jsonb_build_object(
    'chapter', jsonb_build_object(
      'id', v_chapter.id, 'chapter_number', v_chapter.chapter_number, 'title', v_chapter.title,
      'pages', case when jsonb_typeof(v_chapter.pages) = 'array' then v_chapter.pages else '[]'::jsonb end,
      'is_approved', coalesce(v_chapter.is_approved, false)
    ),
    'project', (
      select jsonb_build_object(
        'id', p.id, 'stage', p.stage, 'source_language', p.source_language, 'fansub_id', p.fansub_id,
        'is_mature', app_private.tl_project_is_mature(p.id), 'updated_at', p.updated_at
      )
      from public.translation_projects p where p.id = v_project
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id, 'index', ordered.idx, 'file_name', page.file_name,
        'width', page.width, 'height', page.height,
        'raw_ready', page.raw_status = 'ready' and page.raw_object_key is not null,
        'clean_ready', page.clean_object_key is not null
      ) order by ordered.idx)
      from (
        select id, row_number() over (order by page_index) - 1 as idx
        from public.translation_pages where project_id = v_project and raw_status = 'ready'
      ) ordered
      join public.translation_pages page on page.id = ordered.id
    ), '[]'::jsonb),
    'languages', coalesce((
      select jsonb_agg(distinct t.language order by t.language)
      from public.translation_item_texts t
      join public.translation_items item on item.id = t.item_id
      join public.translation_pages page on page.id = item.page_id
      where page.project_id = v_project and t.text <> ''
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'page_id', item.page_id, 'reading_order', item.reading_order, 'type', item.type,
        'source_text', item.source_text,
        'texts', coalesce((
          select jsonb_object_agg(t.language, jsonb_build_object('text', t.text, 'status', t.status, 'origin', t.origin))
          from public.translation_item_texts t where t.item_id = item.id
        ), '{}'::jsonb)
      ) order by page.page_index, item.reading_order, item.id)
      from public.translation_items item
      join public.translation_pages page on page.id = item.page_id
      where page.project_id = v_project
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.admin_chapter_studio_review(uuid) from public, anon;
grant execute on function public.admin_chapter_studio_review(uuid) to authenticated;

-- admin-page.js: raw / clean base key only to the site admin.
create or replace function public.tl_admin_page_object_key(p_page_id uuid, p_kind text default 'raw')
returns text language plpgsql stable security definer set search_path = '' as $function$
begin
  if not app_private.is_admin() then
    raise exception 'Ham sayfa yalnız site yöneticisine açık.' using errcode = '42501';
  end if;
  if p_kind not in ('raw', 'clean') then
    raise exception 'Görsel türü geçersiz.' using errcode = '22023';
  end if;
  return (
    select case when p_kind = 'clean' then page.clean_object_key else page.raw_object_key end
    from public.translation_pages page
    where page.id = p_page_id and page.raw_status = 'ready'
  );
end;
$function$;

revoke all on function public.tl_admin_page_object_key(uuid, text) from public, anon;
grant execute on function public.tl_admin_page_object_key(uuid, text) to authenticated;

-- reader-translate (scope=admin): no reader publish condition (approval, clean base) is required,
-- the source is the studio project tied to the chapter. Output has the same shape as tl_reader_translation_source.
create or replace function public.tl_admin_translation_source(p_chapter_id uuid, p_language text, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_project uuid;
begin
  if not app_private.is_admin() then
    raise exception 'Yalnız site yöneticisi.' using errcode = '42501';
  end if;
  if not app_private.tl_language_valid(p_language) or p_language = 'tr' then
    raise exception 'dil gecersiz' using errcode = '22023';
  end if;
  v_project := app_private.tl_admin_chapter_project(p_chapter_id);
  if v_project is null then return null; end if;
  return (
    select jsonb_build_object(
      'project_id', v_project,
      'fansub_id', (select fansub_id from public.translation_projects where id = v_project),
      'source_language', (select source_language from public.translation_projects where id = v_project),
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', item.id, 'type', item.type, 'source_text', item.source_text,
        'source_version', item.source_version, 'tr_text', tr.text
      ) order by page.page_index, item.reading_order, item.id), '[]'::jsonb)
    )
    from (
      select item.* from public.translation_items item
      join public.translation_pages page on page.id = item.page_id
      where page.project_id = v_project
        and exists (select 1 from public.translation_item_texts t where t.item_id = item.id and t.language = 'tr' and t.text <> '')
        and not exists (select 1 from public.translation_item_texts t where t.item_id = item.id and t.language = p_language and t.source_version = item.source_version and t.text <> '')
      order by page.page_index, item.reading_order, item.id
      limit least(greatest(p_limit, 1), 60)
    ) item
    join public.translation_pages page on page.id = item.page_id
    join public.translation_item_texts tr on tr.item_id = item.id and tr.language = 'tr'
  );
end;
$function$;

revoke all on function public.tl_admin_translation_source(uuid, text, integer) from public, anon;
grant execute on function public.tl_admin_translation_source(uuid, text, integer) to authenticated;
