-- Translation Studio V3: reader languages.
-- TR images of a published chapter show in the normal reader. If the reader picks another language
-- the text is generated from the original + TR context and laid on the clean base at the same bbox
-- positions. The clean base is in private R2 (translation_pages.clean_object_key)
-- and served through the Worker only when reader access rules are met.

-- Access: chapter/series active and approved, adult gate, publish time and early
-- access rule (can_current_user_access_chapter), clean base of all pages ready.
create or replace function app_private.tl_reader_project(p_chapter_id uuid)
returns uuid language sql stable security definer set search_path = '' as $function$
  select project.id
  from public.translation_projects project
  join public.chapters chapter on chapter.id = project.chapter_id
  join public.mangas manga on manga.id = chapter.manga_id
  where project.chapter_id = p_chapter_id
    and project.stage in ('published', 'scheduled')
    and chapter.fansub_id = project.fansub_id
    and chapter.manga_id = project.manga_id
    and chapter.chapter_number = project.chapter_number
    and chapter.is_active and chapter.is_approved
    and manga.is_active and manga.is_approved
    and (not manga.is_mature or app_private.current_user_is_adult())
    and app_private.can_current_user_access_chapter(chapter.publish_at)
    and not exists (
      select 1 from public.translation_pages page
      where page.project_id = project.id and page.raw_status = 'ready' and page.clean_object_key is null
    )
  limit 1;
$function$;

revoke all on function app_private.tl_reader_project(uuid) from public;

-- Reader layer: page sizes + area geometry/style + text in the requested language.
-- TR text returns as context and fallback. Raw/clean keys do not return.
create or replace function public.tl_reader_overlay(p_chapter_id uuid, p_language text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_project uuid;
  v_result jsonb;
begin
  if not app_private.tl_language_valid(p_language) then
    raise exception 'dil gecersiz' using errcode = '22023';
  end if;
  v_project := app_private.tl_reader_project(p_chapter_id);
  if v_project is null then return null; end if;

  with pages as (
    select page.id, row_number() over (order by page.page_index) - 1 as idx, page.width, page.height
    from public.translation_pages page
    where page.project_id = v_project and page.raw_status = 'ready'
  ),
  items as (
    select item.*, pages.idx as page_idx,
      (select t.text from public.translation_item_texts t where t.item_id = item.id and t.language = p_language and t.source_version = item.source_version and t.text <> '') as lang_text,
      (select t.text from public.translation_item_texts t where t.item_id = item.id and t.language = 'tr' and t.text <> '') as tr_text
    from public.translation_items item
    join pages on pages.id = item.page_id
  )
  select pg_catalog.jsonb_build_object(
    'project_id', v_project,
    'language', p_language,
    'pages', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('index', idx, 'width', width, 'height', height) order by idx) from pages), '[]'::jsonb),
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', id, 'page_index', page_idx, 'type', type, 'shape', shape,
        'x', bbox_x, 'y', bbox_y, 'w', bbox_w, 'h', bbox_h, 'rotation', rotation,
        'style', style, 'font_suggestion', font_suggestion,
        'text', case when p_language = 'tr' then tr_text else lang_text end,
        'fallback_text', tr_text
      ) order by page_idx, reading_order, id) from items where tr_text is not null), '[]'::jsonb),
    'missing_count', (select pg_catalog.count(*) from items where tr_text is not null and p_language <> 'tr' and lang_text is null)
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.tl_reader_overlay(uuid, text) from public;
grant execute on function public.tl_reader_overlay(uuid, text) to anon, authenticated;

-- For the Worker: the clean base key of the requested page if reader access exists.
create or replace function public.tl_reader_clean_key(p_chapter_id uuid, p_index integer)
returns text language sql stable security definer set search_path = '' as $function$
  select page.clean_object_key
  from public.translation_pages page
  where page.project_id = app_private.tl_reader_project(p_chapter_id)
    and page.raw_status = 'ready'
  order by page.page_index
  offset greatest(p_index, 0) limit 1;
$function$;

revoke all on function public.tl_reader_clean_key(uuid, integer) from public;
grant execute on function public.tl_reader_clean_key(uuid, integer) to anon, authenticated;

-- Translation source: items with no current text in the requested language (having TR), in a fixed order.
create or replace function public.tl_reader_translation_source(p_chapter_id uuid, p_language text, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_project uuid;
begin
  if not app_private.tl_language_valid(p_language) or p_language = 'tr' then
    raise exception 'dil gecersiz' using errcode = '22023';
  end if;
  v_project := app_private.tl_reader_project(p_chapter_id);
  if v_project is null then return null; end if;
  return (
    select pg_catalog.jsonb_build_object(
      'project_id', v_project,
      'fansub_id', (select fansub_id from public.translation_projects where id = v_project),
      'source_language', (select source_language from public.translation_projects where id = v_project),
      'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
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

revoke all on function public.tl_reader_translation_source(uuid, text, integer) from public;
grant execute on function public.tl_reader_translation_source(uuid, text, integer) to anon, authenticated;
