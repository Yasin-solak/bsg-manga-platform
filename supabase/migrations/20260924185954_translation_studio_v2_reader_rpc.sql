-- Translation Studio V2: readers see only the keyless publish layer.
-- Entitlement and chapter access recompute through the same private gate on each request.

create or replace function app_private.studio_reader_image_allowed(
  p_publication_id uuid, p_page_index integer
) returns boolean language sql stable security definer set search_path = '' as $function$
  select p_page_index is not null and p_page_index between 0 and 999
    and app_private.studio_publication_rights_allowed(p_publication_id)
    and exists (
      select 1 from public.studio_publications publication
      join public.chapters chapter on chapter.id = publication.chapter_id
      where publication.id = p_publication_id
        and publication.status = 'published'
        and case when pg_catalog.jsonb_typeof(chapter.pages) = 'array'
          then pg_catalog.jsonb_array_length(chapter.pages) =
            pg_catalog.jsonb_array_length(publication.manifest->'pages')
          else false end
        and chapter.pages->>p_page_index = pg_catalog.format(
          '/api/studio/reader-image?publication_id=%s&page_index=%s',
          p_publication_id, p_page_index)
        and pg_catalog.jsonb_typeof(publication.manifest->'pages'->p_page_index) = 'object'
        and (publication.manifest->'pages'->p_page_index->>'page_index')::integer = p_page_index
    );
$function$;

create or replace function app_private.studio_reader_overlay(
  p_chapter_id uuid, p_language text
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_publication record;
  v_part jsonb;
  v_page record;
  v_pages jsonb := '[]'::jsonb;
  v_regions jsonb;
  v_missing_count integer := 0;
  v_machine_count integer := 0;
  v_human_count integer := 0;
  v_quality text;
  v_source_x integer;
  v_source_y integer;
  v_width integer;
  v_height integer;
begin
  if not app_private.studio_language_valid(p_language) then
    raise sqlstate '22023' using message = 'Okuma dili geçersiz.';
  end if;
  select publication.*, project.source_language, project.primary_target_language
    into v_publication
  from public.studio_publications publication
  join public.studio_projects project on project.id = publication.project_id
  where publication.chapter_id = p_chapter_id
    and publication.status = 'published'
    and publication.language = project.primary_target_language
  limit 1;
  if not found then return null; end if;
  if not app_private.studio_publication_reader_allowed(v_publication.id) then
    return null;
  end if;

  if p_language <> v_publication.source_language then
    select pg_catalog.count(*) filter (where t.id is null),
      pg_catalog.count(*) filter (where t.origin = 'machine'),
      pg_catalog.count(*) filter (where t.origin = 'human')
      into v_missing_count, v_machine_count, v_human_count
    from public.studio_regions region
    join public.studio_pages page on page.id = region.page_id
    left join public.studio_translations t on t.region_id = region.id
      and t.language = p_language and t.source_version = region.source_version
      and t.review_state in ('machine', 'reviewed', 'approved')
    where page.project_id = v_publication.project_id and region.source_text <> '';
  end if;
  v_quality := case
    when p_language = v_publication.source_language then 'original'
    when v_machine_count > 0 and v_human_count > 0 then 'mixed'
    when v_machine_count > 0 then 'machine'
    when v_human_count > 0 then 'human'
    else 'original' end;

  for v_part in select value from pg_catalog.jsonb_array_elements(v_publication.manifest->'pages') loop
    v_source_x := (v_part->>'source_x')::integer;
    v_source_y := (v_part->>'source_y')::integer;
    v_width := (v_part->>'source_width')::integer;
    v_height := (v_part->>'source_height')::integer;
    select page.id, page.project_id into v_page from public.studio_pages page
    where page.id = (v_part->>'studio_page_id')::uuid;
    if not found then return null; end if;
    if v_page.project_id is distinct from v_publication.project_id then return null; end if;
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', region.id, 'kind', region.kind, 'polygon', region.polygon,
        'text', case when p_language = v_publication.source_language
          then region.source_text else translation.text end,
        'origin', case when p_language = v_publication.source_language
          then 'human' else translation.origin end,
        'review_state', case when p_language = v_publication.source_language
          then 'approved' else translation.review_state end,
        'source_version', region.source_version)
      order by region.reading_order, region.id), '[]'::jsonb)
      into v_regions
    from public.studio_regions region
    left join public.studio_translations translation on translation.region_id = region.id
      and translation.language = p_language
      and translation.source_version = region.source_version
      and translation.review_state in ('machine', 'reviewed', 'approved')
    cross join lateral (
      select pg_catalog.min((point.value->>'x')::numeric) as min_x,
        pg_catalog.max((point.value->>'x')::numeric) as max_x,
        pg_catalog.min((point.value->>'y')::numeric) as min_y,
        pg_catalog.max((point.value->>'y')::numeric) as max_y
      from pg_catalog.jsonb_array_elements(region.polygon) as point(value)
    ) bounds
    where region.page_id = v_page.id
      and bounds.max_x >= v_source_x and bounds.min_x < v_source_x + v_width
      and bounds.max_y >= v_source_y and bounds.min_y < v_source_y + v_height;
    v_pages := v_pages || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'page_index', (v_part->>'page_index')::integer,
        'width', (v_part->>'width')::integer,
        'height', (v_part->>'height')::integer,
        'source_x', v_source_x, 'source_y', v_source_y,
        'source_width', v_width, 'source_height', v_height,
        'regions', v_regions));
  end loop;
  return pg_catalog.jsonb_build_object(
    'publication_id', v_publication.id, 'language', p_language,
    'base_language', v_publication.language,
    'source_language', v_publication.source_language,
    'quality_label', v_quality, 'missing_count', v_missing_count,
    'pages', v_pages);
end;
$function$;

create or replace function app_private.studio_reader_translation_source(
  p_chapter_id uuid, p_target_language text, p_offset integer default 0,
  p_limit integer default 12
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_publication record;
  v_region record;
  v_regions jsonb := '[]'::jsonb;
  v_seen integer := 0;
  v_next_offset integer;
begin
  if not app_private.studio_language_valid(p_target_language)
    or p_offset is null or p_offset not between 0 and 100000
    or p_limit is null or p_limit not between 1 and 12 then
    raise sqlstate '22023' using message = 'Okur çeviri isteği geçersiz.';
  end if;
  select publication.*, project.source_language into v_publication
  from public.studio_publications publication
  join public.studio_projects project on project.id = publication.project_id
  where publication.chapter_id = p_chapter_id
    and publication.status = 'published'
    and publication.language = project.primary_target_language
  limit 1;
  if not found then return null; end if;
  if not app_private.studio_publication_reader_allowed(v_publication.id) then
    return null;
  end if;
  -- Offset is only over an unchanging source order; a new translation row does not shift paging.
  for v_region in
    select region.id, region.source_text, region.source_version,
      exists (
        select 1 from public.studio_translations t
        where t.region_id = region.id and t.language = p_target_language
          and t.source_version = region.source_version
      ) as has_current_translation,
      exists (
        select 1 from public.studio_translations t
        where t.region_id = region.id and t.language = p_target_language
          and t.origin = 'human'
      ) as has_human_translation,
      coalesce((
        select t.version from public.studio_translations t
        where t.region_id = region.id and t.language = p_target_language
          and t.origin = 'machine'
      ), 0) as machine_expected_version
    from public.studio_regions region
    join public.studio_pages page on page.id = region.page_id
    where page.project_id = v_publication.project_id and region.source_text <> ''
    order by page.page_index, region.reading_order, region.id
    offset p_offset limit p_limit + 1
  loop
    v_seen := v_seen + 1;
    if v_seen <= p_limit then
      v_regions := v_regions || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_region.id, 'source_text', v_region.source_text,
          'source_version', v_region.source_version,
          'has_current_translation', v_region.has_current_translation,
          'has_human_translation', v_region.has_human_translation,
          'machine_expected_version', v_region.machine_expected_version));
    end if;
  end loop;
  v_next_offset := case when v_seen > p_limit then p_offset + p_limit else null end;
  return pg_catalog.jsonb_build_object(
    'project_id', v_publication.project_id,
    'source_language', v_publication.source_language,
    'publication_id', v_publication.id,
    'publication_version', v_publication.source_version,
    'regions', v_regions, 'next_offset', v_next_offset);
end;
$function$;

create or replace function public.studio_reader_image_allowed(
  p_publication_id uuid, p_page_index integer
) returns boolean language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_reader_image_allowed(p_publication_id, p_page_index);
$function$;
create or replace function public.studio_reader_overlay(
  p_chapter_id uuid, p_language text
) returns jsonb language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_reader_overlay(p_chapter_id, p_language);
$function$;
create or replace function public.studio_reader_translation_source(
  p_chapter_id uuid, p_target_language text, p_offset integer default 0,
  p_limit integer default 12
) returns jsonb language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_reader_translation_source(
    p_chapter_id, p_target_language, p_offset, p_limit);
$function$;

revoke all on function app_private.studio_reader_image_allowed(uuid, integer),
  app_private.studio_reader_overlay(uuid, text),
  app_private.studio_reader_translation_source(uuid, text, integer, integer),
  public.studio_reader_image_allowed(uuid, integer),
  public.studio_reader_overlay(uuid, text),
  public.studio_reader_translation_source(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function app_private.studio_reader_image_allowed(uuid, integer),
  app_private.studio_reader_overlay(uuid, text),
  app_private.studio_reader_translation_source(uuid, text, integer, integer),
  public.studio_reader_image_allowed(uuid, integer),
  public.studio_reader_overlay(uuid, text),
  public.studio_reader_translation_source(uuid, text, integer, integer)
  to anon, authenticated, service_role;
