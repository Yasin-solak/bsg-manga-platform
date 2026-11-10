-- Translation Studio V2: chapter publish awaiting approval from private R2 segments.
-- A finished publish returning to draft is forbidden; the old version is withdrawn.

alter table public.studio_publications
  drop constraint studio_publications_language_unique;
create unique index studio_publications_one_draft_idx
  on public.studio_publications (project_id, language) where status = 'draft';
create unique index studio_publications_one_published_idx
  on public.studio_publications (project_id, language) where status = 'published';
alter table public.studio_publications add constraint studio_publications_manifest_size_check
  check (pg_catalog.octet_length(manifest::text) <= 1048576);

create or replace function app_private.studio_proxy_pages(p_publication_id uuid, p_manifest jsonb)
returns jsonb language sql immutable set search_path = '' as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.format('/api/studio/reader-image?publication_id=%s&page_index=%s',
      p_publication_id, (page.value->>'page_index')::integer)
    order by page.ordinality), '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(p_manifest->'pages') with ordinality as page(value, ordinality);
$function$;

create or replace function app_private.studio_proxy_page_dimensions(
  p_publication_id uuid, p_manifest jsonb
) returns jsonb language sql immutable set search_path = '' as $function$
  select coalesce(pg_catalog.jsonb_object_agg(
    pg_catalog.format('/api/studio/reader-image?publication_id=%s&page_index=%s',
      p_publication_id, (page.value->>'page_index')::integer),
    pg_catalog.jsonb_build_object('w', (page.value->>'width')::integer,
      'h', (page.value->>'height')::integer)), '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(p_manifest->'pages') as page(value);
$function$;

create or replace function app_private.studio_publication_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.chapter_id is not null and not exists (
    select 1 from public.chapters c join public.studio_projects p on p.id = new.project_id
    where c.id = new.chapter_id and c.manga_id = p.manga_id
      and c.fansub_id = p.fansub_id and c.chapter_number = p.chapter_number
  ) then
    raise sqlstate 'PT409' using message = 'Yayın bölümü proje ile eşleşmiyor.';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.chapter_id is not null or new.published_at is not null then
      raise sqlstate 'PT409' using message = 'Yayın önce taslak olarak hazırlanmalıdır.';
    end if;
  else
    if new.project_id is distinct from old.project_id
      or new.language is distinct from old.language
      or new.source_version is distinct from old.source_version then
      raise sqlstate 'PT409' using message = 'Yayın kimliği ve kaynak sürümü değiştirilemez.';
    end if;
    if old.status = 'published' and new.status <> 'withdrawn' then
      raise sqlstate 'PT409' using message = 'Yayımlanan sürüm yalnız geri çekilebilir.';
    end if;
    if old.status = 'withdrawn' then
      raise sqlstate 'PT409' using message = 'Geri çekilen yayın değiştirilemez.';
    end if;
    if old.status = 'published' and (
      new.manifest is distinct from old.manifest or new.chapter_id is distinct from old.chapter_id
      or new.published_at is distinct from old.published_at) then
      raise sqlstate 'PT409' using message = 'Yayımlanan görsel manifesti değiştirilemez.';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

-- The shared entitlement gate runs at a fixed cost on each image GET.
create or replace function app_private.studio_publication_rights_allowed(p_publication_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_publications publication
    join public.studio_projects project on project.id = publication.project_id
    join public.chapters chapter on chapter.id = publication.chapter_id
    join public.mangas manga on manga.id = chapter.manga_id
    where publication.id = p_publication_id
      and publication.status = 'published'
      and project.rights_status = 'active'
      and publication.source_version = project.content_revision
      and chapter.manga_id = project.manga_id
      and chapter.fansub_id = project.fansub_id
      and chapter.chapter_number = project.chapter_number
      and chapter.is_active and chapter.is_approved
      and manga.is_active and manga.is_approved
      and (not manga.is_mature or app_private.current_user_is_adult())
      and app_private.can_current_user_access_chapter(chapter.publish_at)
  );
$function$;

-- Layer and source text list want the whole chapter array to match the publish.
create or replace function app_private.studio_publication_reader_allowed(p_publication_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.studio_publication_rights_allowed(p_publication_id) and exists (
    select 1 from public.studio_publications publication
    join public.chapters chapter on chapter.id = publication.chapter_id
    where publication.id = p_publication_id
      and chapter.pages = app_private.studio_proxy_pages(publication.id, publication.manifest)
  );
$function$;

create or replace function app_private.studio_publish_readiness(
  p_project_id uuid, p_language text
) returns table (
  page_count bigint, unready_page_count bigint,
  region_review_count bigint, missing_translation_count bigint
) language sql stable security definer set search_path = '' as $function$
  select
    (select pg_catalog.count(*) from public.studio_pages page
      where page.project_id = p_project_id),
    (select pg_catalog.count(*) from public.studio_pages page
      where page.project_id = p_project_id and page.raw_status <> 'ready'),
    (select pg_catalog.count(*) from public.studio_regions region
      join public.studio_pages page on page.id = region.page_id
      where page.project_id = p_project_id
        and (region.needs_review or pg_catalog.btrim(region.source_text) = '')),
    (select pg_catalog.count(*) from public.studio_regions region
      join public.studio_pages page on page.id = region.page_id
      left join public.studio_translations translation
        on translation.region_id = region.id
        and translation.language = p_language
        and translation.source_version = region.source_version
        and translation.review_state in ('machine', 'reviewed', 'approved')
      where page.project_id = p_project_id
        and pg_catalog.btrim(region.source_text) <> ''
        and translation.id is null);
$function$;

create or replace function app_private.studio_publication_begin(
  p_project_id uuid, p_language text
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_project record;
  v_publication record;
  v_reuse boolean;
  v_readiness record;
begin
  if auth.role() is distinct from 'authenticated' then
    raise sqlstate 'PT403' using message = 'Yayın hazırlamak için giriş gerekiyor.';
  end if;
  if not app_private.studio_language_valid(p_language) then
    raise sqlstate '22023' using message = 'Yayın dili geçersiz.';
  end if;
  select * into v_project from public.studio_projects p where p.id = p_project_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Proje bulunamadı.'; end if;
  if v_project.rights_status <> 'active'
    or not app_private.studio_rollout_allowed(v_project.fansub_id)
    or not (app_private.is_admin() or app_private.is_fansub_admin(v_project.fansub_id)) then
    raise sqlstate 'PT403' using message = 'Bölüm yayını için yetki veya hak bulunmuyor.';
  end if;
  if p_language <> v_project.primary_target_language then
    raise sqlstate 'PT409' using message = 'Temiz taban ana hedef dil için hazırlanır.';
  end if;
  select * into v_readiness from app_private.studio_publish_readiness(p_project_id, p_language);
  if v_readiness.page_count = 0 or v_readiness.unready_page_count > 0
    or v_readiness.region_review_count > 0 or v_readiness.missing_translation_count > 0 then
    raise sqlstate 'PT409' using message = pg_catalog.format(
      'Yayın hazır değil: %s bekleyen sayfa, %s incelenecek bölge, %s eksik çeviri.',
      v_readiness.unready_page_count, v_readiness.region_review_count,
      v_readiness.missing_translation_count);
  end if;
  select * into v_publication from public.studio_publications publication
  where publication.project_id = p_project_id and publication.language = p_language
    and publication.status = 'draft' for update;
  v_reuse := found;
  if v_reuse then
    if v_publication.source_version <> v_project.content_revision then
      update public.studio_publications set status = 'withdrawn' where id = v_publication.id;
      v_reuse := false;
    end if;
  end if;
  if not v_reuse then
    insert into public.studio_publications
      (project_id, language, quality_label, source_version)
    values (p_project_id, p_language, 'original', v_project.content_revision)
    returning * into v_publication;
  end if;
  return pg_catalog.jsonb_build_object(
    'publication_id', v_publication.id, 'project_id', p_project_id,
    'language', p_language, 'source_version', v_publication.source_version,
    'status', 'draft', 'chapter_number', v_project.chapter_number
  );
end;
$function$;

create or replace function app_private.studio_publication_segment_allowed(
  p_publication_id uuid
) returns boolean language sql stable security definer set search_path = '' as $function$
  select auth.role() = 'authenticated' and exists (
    select 1 from public.studio_publications publication
    join public.studio_projects project on project.id = publication.project_id
    where publication.id = p_publication_id and publication.status = 'draft'
      and publication.source_version = project.content_revision
      and project.rights_status = 'active'
      and app_private.studio_rollout_allowed(project.fansub_id)
      and (app_private.is_admin() or app_private.is_fansub_admin(project.fansub_id))
  );
$function$;

create or replace function app_private.studio_publication_complete(
  p_publication_id uuid, p_chapter_id uuid, p_manifest jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_project record;
  v_publication record;
  v_chapter record;
  v_previous_publication record;
  v_page record;
  v_part jsonb;
  v_previous_page uuid;
  v_previous_height integer := 0;
  v_next_page_index integer := 0;
  v_next_y integer := 0;
  v_raw_page_count integer;
  v_segment_count integer;
  v_machine_count integer;
  v_human_count integer;
  v_quality text;
  v_expected_pages jsonb;
  v_readiness record;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Yayın tamamlama yalnız sunucu işlemidir.';
  end if;
  if not app_private.studio_manifest_valid(p_manifest)
    or pg_catalog.octet_length(p_manifest::text) > 1048576 then
    raise sqlstate '22023' using message = 'Yayın manifesti geçersiz.';
  end if;
  select project_id into v_publication from public.studio_publications
  where id = p_publication_id;
  if not found then raise sqlstate 'PT404' using message = 'Yayın taslağı bulunamadı.'; end if;
  -- The project lock pins the revision; no raw page row is locked, no reverse lock order forms.
  select * into v_project from public.studio_projects p
  where p.id = v_publication.project_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Proje bulunamadı.'; end if;
  select * into v_publication from public.studio_publications publication
  where publication.id = p_publication_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Yayın taslağı bulunamadı.'; end if;
  if v_publication.status <> 'draft'
    or v_publication.source_version <> v_project.content_revision then
    raise sqlstate 'PT409' using message = 'Yayın taslağının kaynak sürümü eskidi.';
  end if;
  if v_project.rights_status <> 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  if v_publication.language <> v_project.primary_target_language then
    raise sqlstate 'PT409' using message = 'Temiz taban dili projeyle eşleşmiyor.';
  end if;
  select * into v_readiness from app_private.studio_publish_readiness(
    v_project.id, v_publication.language);
  if v_readiness.page_count = 0 or v_readiness.unready_page_count > 0
    or v_readiness.region_review_count > 0 or v_readiness.missing_translation_count > 0 then
    raise sqlstate 'PT409' using message = 'Yayın öncesi sayfa, OCR veya çeviri içeriği değişti.';
  end if;
  select * into v_chapter from public.chapters c where c.id = p_chapter_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Bölüm bulunamadı.'; end if;
  v_expected_pages := app_private.studio_proxy_pages(p_publication_id, p_manifest);
  if v_chapter.manga_id is distinct from v_project.manga_id
    or v_chapter.fansub_id is distinct from v_project.fansub_id
    or v_chapter.chapter_number is distinct from v_project.chapter_number
    or not v_chapter.is_active then
    raise sqlstate 'PT409' using message = 'Bölüm proje ile eşleşmiyor.';
  end if;
  select * into v_previous_publication from public.studio_publications old_publication
  where old_publication.project_id = v_project.id
    and old_publication.language = v_publication.language
    and old_publication.status = 'published' for update;
  if found then
    if v_previous_publication.chapter_id is distinct from p_chapter_id
      or v_chapter.pages <> app_private.studio_proxy_pages(
        v_previous_publication.id, v_previous_publication.manifest) then
      raise sqlstate 'PT409' using message = 'Önceki V2 bölüm görselleri değişmiş.';
    end if;
  elsif v_chapter.is_approved or v_chapter.pages <> v_expected_pages then
    raise sqlstate 'PT409' using message = 'İlk yayın için bekleyen bölüm adresleri eşleşmiyor.';
  end if;
  v_segment_count := pg_catalog.jsonb_array_length(p_manifest->'pages');
  for v_part in select value from pg_catalog.jsonb_array_elements(p_manifest->'pages') loop
    select * into v_page from public.studio_pages page
    where page.id = (v_part->>'studio_page_id')::uuid;
    if not found then
      raise sqlstate 'PT409' using message = 'Yayın parçasının raw sayfası bulunamadı.';
    end if;
    if v_page.project_id is distinct from v_project.id or v_page.raw_status <> 'ready' then
      raise sqlstate 'PT409' using message = 'Yayın parçasının raw sayfası hazır değil.';
    end if;
    if v_previous_page is distinct from v_page.id then
      if v_previous_page is not null and v_next_y <> v_previous_height then
        raise sqlstate 'PT409' using message = 'Raw sayfada yayımlanmamış alan var.';
      end if;
      if v_page.page_index <> v_next_page_index then
        raise sqlstate 'PT409' using message = 'Raw sayfa sırası eksik veya tekrarlı.';
      end if;
      v_next_page_index := v_next_page_index + 1;
      v_next_y := 0;
      v_previous_page := v_page.id;
      v_previous_height := v_page.raw_height;
    end if;
    if (v_part->>'source_x')::integer <> 0
      or (v_part->>'source_y')::integer <> v_next_y
      or (v_part->>'source_width')::integer <> v_page.raw_width
      or (v_part->>'source_height')::integer > 2048
      or (v_part->>'width')::integer * (v_part->>'height')::integer > 4000000
      or (v_part->>'byte_size')::integer > 26214400
      or (v_part->>'source_y')::integer + (v_part->>'source_height')::integer > v_page.raw_height
      or v_part->>'object_key' <> pg_catalog.format(
        'published/%s/page-%s/%s.%s', p_publication_id, v_part->>'page_index',
        v_part->>'sha256', case v_part->>'mime_type'
          when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end) then
      raise sqlstate 'PT409' using message = 'Yayın parçasının kırpımı veya anahtarı geçersiz.';
    end if;
    v_next_y := v_next_y + (v_part->>'source_height')::integer;
  end loop;
  select pg_catalog.count(*) into v_raw_page_count from public.studio_pages page
  where page.project_id = v_project.id;
  if v_next_y <> v_previous_height or v_next_page_index <> v_raw_page_count then
    raise sqlstate 'PT409' using message = 'Yayın bütün raw sayfaları kapsamıyor.';
  end if;
  select pg_catalog.count(*) filter (where t.origin = 'machine'),
    pg_catalog.count(*) filter (where t.origin = 'human')
    into v_machine_count, v_human_count
  from public.studio_regions region
  join public.studio_pages page on page.id = region.page_id
  join public.studio_translations t on t.region_id = region.id
    and t.language = v_publication.language and t.source_version = region.source_version
  where page.project_id = v_project.id;
  v_quality := case
    when v_machine_count > 0 and v_human_count > 0 then 'mixed'
    when v_machine_count > 0 then 'machine'
    when v_human_count > 0 then 'human'
    else 'original' end;
  update public.studio_publications set status = 'withdrawn'
  where project_id = v_project.id and language = v_publication.language
    and status = 'published';
  if v_chapter.pages is distinct from v_expected_pages or v_chapter.is_approved then
    -- The old V2 chapter returns to moderation in the same transaction; readers see no half move.
    update public.chapters set pages = v_expected_pages,
      page_dimensions = app_private.studio_proxy_page_dimensions(p_publication_id, p_manifest),
      is_approved = false where id = p_chapter_id;
  end if;
  update public.studio_publications set chapter_id = p_chapter_id,
    manifest = p_manifest, quality_label = v_quality,
    status = 'published', published_at = now()
  where id = p_publication_id;
  return pg_catalog.jsonb_build_object(
    'publication_id', p_publication_id, 'chapter_id', p_chapter_id,
    'language', v_publication.language, 'status', 'published',
    'source_version', v_publication.source_version,
    'segment_count', v_segment_count, 'quality_label', v_quality);
end;
$function$;

create or replace function public.studio_publication_begin(p_project_id uuid, p_language text)
returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_publication_begin(p_project_id, p_language);
$function$;

-- Moderation cannot approve private proxy pages before the Worker finalize finishes.
create or replace function app_private.studio_chapter_approval_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_has_proxy boolean;
begin
  if not new.is_approved or pg_catalog.jsonb_typeof(new.pages) is distinct from 'array' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_approved and new.pages is not distinct from old.pages then
      return new;
    end if;
  end if;
  select exists (
    select 1 from pg_catalog.jsonb_array_elements_text(new.pages) as ref(value)
    where ref.value like '/api/studio/reader-image?publication_id=%'
  ) into v_has_proxy;
  if not v_has_proxy then return new; end if;
  if not exists (
    select 1 from public.studio_publications publication
    join public.studio_projects project on project.id = publication.project_id
    where publication.chapter_id = new.id
      and publication.status = 'published'
      and publication.source_version = project.content_revision
      and project.rights_status = 'active'
      and new.manga_id = project.manga_id
      and new.fansub_id = project.fansub_id
      and new.chapter_number = project.chapter_number
      and new.pages = app_private.studio_proxy_pages(publication.id, publication.manifest)
  ) then
    raise sqlstate 'PT409' using message = 'V2 yayın tamamlanmadan bölüm onaylanamaz.';
  end if;
  return new;
end;
$function$;

create trigger studio_chapter_approval_guard before insert or update on public.chapters
for each row execute function app_private.studio_chapter_approval_guard();

create or replace function public.studio_publication_segment_allowed(p_publication_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_publication_segment_allowed(p_publication_id);
$function$;
create or replace function public.studio_publication_complete(
  p_publication_id uuid, p_chapter_id uuid, p_manifest jsonb
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_publication_complete(p_publication_id, p_chapter_id, p_manifest);
$function$;

revoke all on function app_private.studio_proxy_pages(uuid, jsonb),
  app_private.studio_proxy_page_dimensions(uuid, jsonb),
  app_private.studio_publish_readiness(uuid, text),
  app_private.studio_publication_rights_allowed(uuid),
  app_private.studio_chapter_approval_guard(),
  app_private.studio_publication_begin(uuid, text),
  app_private.studio_publication_segment_allowed(uuid),
  app_private.studio_publication_complete(uuid, uuid, jsonb),
  public.studio_publication_begin(uuid, text),
  public.studio_publication_segment_allowed(uuid),
  public.studio_publication_complete(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function app_private.studio_proxy_pages(uuid, jsonb),
  app_private.studio_proxy_page_dimensions(uuid, jsonb),
  app_private.studio_publish_readiness(uuid, text) to service_role;
grant execute on function app_private.studio_publication_rights_allowed(uuid)
  to anon, authenticated, service_role;
grant execute on function app_private.studio_publication_begin(uuid, text),
  app_private.studio_publication_segment_allowed(uuid),
  public.studio_publication_begin(uuid, text),
  public.studio_publication_segment_allowed(uuid) to authenticated, service_role;
grant execute on function app_private.studio_publication_complete(uuid, uuid, jsonb),
  public.studio_publication_complete(uuid, uuid, jsonb) to service_role;
