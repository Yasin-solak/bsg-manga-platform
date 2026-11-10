-- On a ready raw fix the old UUID and tied edits retire atomically.
-- A new UUID opens at the same page order; the old R2 prefix falls to the tombstone queue.

create or replace function app_private.studio_page_replace(
  p_page_id uuid, p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_page public.studio_pages%rowtype;
  v_project public.studio_projects%rowtype;
  v_publication public.studio_publications%rowtype;
  v_chapter public.chapters%rowtype;
  v_replacement public.studio_pages%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or not app_private.is_admin() then
    raise sqlstate 'PT403' using message = 'Raw görseli yalnız site yöneticisi değiştirebilir.';
  end if;
  if p_page_id is null or p_expected_version is null or p_expected_version < 1 then
    raise sqlstate '22023' using message = 'Sayfa kimliği veya sürümü geçersiz.';
  end if;

  -- Existing raw/edit operations go from page to project. NOWAIT prevents publish or job operations
  -- from the reverse direction turning into a lock cycle.
  select * into v_page from public.studio_pages page
  where page.id = p_page_id for update nowait;
  if not found then raise sqlstate 'PT404' using message = 'Sayfa bulunamadı.'; end if;
  if v_page.version <> p_expected_version or v_page.raw_status <> 'ready' then
    raise sqlstate 'PT409' using message = 'Sayfa değişmiş veya hazır değil; listeyi yenileyin.';
  end if;

  perform region.id from public.studio_regions region
  where region.page_id = p_page_id for update nowait;
  perform translation.id from public.studio_translations translation
  join public.studio_regions region on region.id = translation.region_id
  where region.page_id = p_page_id for update of translation nowait;
  perform layer.id from public.studio_page_layers layer
  where layer.page_id = p_page_id for update nowait;
  perform job.id from public.studio_jobs job
  where job.page_id = p_page_id for update nowait;

  select * into v_project from public.studio_projects project
  where project.id = v_page.project_id for update nowait;
  if not found or v_project.rights_status <> 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;

  select * into v_publication from public.studio_publications publication
  where publication.project_id = v_project.id
    and publication.language = v_project.primary_target_language
    and publication.status = 'published';
  if found then
    select * into v_chapter from public.chapters chapter
    where chapter.id = v_publication.chapter_id for update nowait;
    if not found or v_chapter.manga_id is distinct from v_project.manga_id
      or v_chapter.fansub_id is distinct from v_project.fansub_id
      or v_chapter.chapter_number is distinct from v_project.chapter_number
      or v_chapter.pages is distinct from app_private.studio_proxy_pages(
        v_publication.id, v_publication.manifest) then
      raise sqlstate 'PT409' using message = 'Yayınlı bölüm görselleri değişmiş; raw değiştirilmedi.';
    end if;
    if v_chapter.is_approved then
      update public.chapters set is_approved = false where id = v_chapter.id;
    end if;
  end if;

  -- The old draft can no longer finish with the new raw; the old published row is kept for republish
  -- ownership and withdrawn only by the finalizer.
  update public.studio_publications set status = 'withdrawn'
  where project_id = v_project.id and status = 'draft';

  delete from public.studio_pages where id = p_page_id;
  insert into public.studio_pages (project_id, page_index)
  values (v_project.id, v_page.page_index) returning * into v_replacement;

  return pg_catalog.jsonb_build_object(
    'id', v_replacement.id, 'project_id', v_replacement.project_id,
    'page_index', v_replacement.page_index, 'raw_status', v_replacement.raw_status,
    'raw_width', v_replacement.raw_width, 'raw_height', v_replacement.raw_height,
    'version', v_replacement.version);
exception when lock_not_available then
  raise sqlstate 'PT409' using message = 'Sayfa şu anda işleniyor; biraz sonra yeniden deneyin.';
end;
$function$;

create or replace function public.studio_page_replace(
  p_page_id uuid, p_expected_version bigint
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_page_replace(p_page_id, p_expected_version);
$function$;

revoke all on function app_private.studio_page_replace(uuid, bigint),
  public.studio_page_replace(uuid, bigint) from public, anon, authenticated;
grant execute on function app_private.studio_page_replace(uuid, bigint),
  public.studio_page_replace(uuid, bigint) to authenticated;

-- When the first publish stops midway the chapter's unapproved proxy list can point to the old draft
-- . Only a V2 array of the exact same project and language is taken over.
create or replace function app_private.studio_review_chapter_reclaim(
  p_publication_id uuid, p_chapter_id uuid, p_manifest jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_project public.studio_projects%rowtype;
  v_publication public.studio_publications%rowtype;
  v_chapter public.chapters%rowtype;
  v_orphan public.studio_publications%rowtype;
  v_old_pages jsonb;
begin
  if auth.role() is distinct from 'authenticated' or not app_private.is_admin() then
    raise sqlstate 'PT403' using message = 'Bölüm taslağını yalnız site yöneticisi devralabilir.';
  end if;
  if p_publication_id is null or p_chapter_id is null
    or not app_private.studio_manifest_valid(p_manifest)
    or pg_catalog.octet_length(p_manifest::text) > 1048576 then
    raise sqlstate '22023' using message = 'Bölüm taslağı bilgileri geçersiz.';
  end if;

  select project.* into v_project from public.studio_publications publication
  join public.studio_projects project on project.id = publication.project_id
  where publication.id = p_publication_id for update of project nowait;
  if not found then raise sqlstate 'PT404' using message = 'Yayın taslağı bulunamadı.'; end if;
  select * into v_publication from public.studio_publications publication
  where publication.id = p_publication_id for update nowait;
  if v_project.rights_status <> 'active' or v_publication.status <> 'draft'
    or v_publication.language <> v_project.primary_target_language
    or v_publication.source_version <> v_project.content_revision then
    raise sqlstate 'PT409' using message = 'Yayın taslağının kaynak sürümü eskidi.';
  end if;
  select * into v_chapter from public.chapters chapter
  where chapter.id = p_chapter_id for update nowait;
  if not found or v_chapter.manga_id is distinct from v_project.manga_id
    or v_chapter.fansub_id is distinct from v_project.fansub_id
    or v_chapter.chapter_number is distinct from v_project.chapter_number
    or not v_chapter.is_active or v_chapter.is_approved
    or pg_catalog.jsonb_typeof(v_chapter.pages) is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_chapter.pages) not between 1 and 1000 then
    raise sqlstate 'PT409' using message = 'Onaysız V2 bölümü eşleşmiyor.';
  end if;
  if exists (select 1 from public.studio_publications publication
      where publication.project_id = v_project.id
        and publication.language = v_publication.language
        and publication.status = 'published') then
    raise sqlstate 'PT409' using message = 'Yayınlı bölüm taslak gibi devralınamaz.';
  end if;

  select publication.* into v_orphan from public.studio_publications publication
  where publication.project_id = v_project.id
    and publication.language = v_publication.language
    and publication.status = 'withdrawn' and publication.chapter_id is null
    and publication.id <> v_publication.id
    and v_chapter.pages = (
      select pg_catalog.jsonb_agg(pg_catalog.format(
        '/api/studio/reader-image?publication_id=%s&page_index=%s',
        publication.id, page_index) order by page_index)
      from pg_catalog.generate_series(0,
        pg_catalog.jsonb_array_length(v_chapter.pages) - 1) as series(page_index))
  order by publication.created_at desc limit 1 for update nowait;
  if not found then
    raise sqlstate 'PT409' using message = 'Bu bölüm önceki V2 taslağına ait değil.';
  end if;
  v_old_pages := v_chapter.pages;
  update public.chapters set
    pages = app_private.studio_proxy_pages(v_publication.id, p_manifest),
    page_dimensions = app_private.studio_proxy_page_dimensions(v_publication.id, p_manifest)
  where id = v_chapter.id and pages = v_old_pages and not is_approved;
  if not found then raise sqlstate 'PT409' using message = 'Bölüm bu sırada değişti.'; end if;
  return pg_catalog.jsonb_build_object('chapter_id', v_chapter.id);
exception when lock_not_available then
  raise sqlstate 'PT409' using message = 'Bölüm şu anda işleniyor; biraz sonra yeniden deneyin.';
end;
$function$;

create or replace function public.studio_review_chapter_reclaim(
  p_publication_id uuid, p_chapter_id uuid, p_manifest jsonb
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_review_chapter_reclaim(
    p_publication_id, p_chapter_id, p_manifest);
$function$;

revoke all on function app_private.studio_review_chapter_reclaim(uuid, uuid, jsonb),
  public.studio_review_chapter_reclaim(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function app_private.studio_review_chapter_reclaim(uuid, uuid, jsonb),
  public.studio_review_chapter_reclaim(uuid, uuid, jsonb) to authenticated;

-- A tombstone UUID cannot be reused in the same project either; the Worker deletes only that old
-- UUID prefix so a new file is not deleted by mistake.
create or replace function app_private.studio_purge_child_insert_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_rights text;
begin
  select project.rights_status into v_rights from public.studio_projects project
  where project.id = new.project_id for update;
  if v_rights is distinct from 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  if exists (select 1 from app_private.studio_purge_targets target
      where target.target_kind = case when tg_table_name = 'studio_pages'
        then 'page' else 'publication' end
        and target.target_id = new.id) then
    raise sqlstate 'PT409' using message = 'Özel görsel kimliği daha önce kullanılmış.';
  end if;
  return new;
end;
$function$;

-- A deleted page and a withdrawn unlinked draft can be cleaned even with the right still active
-- . A tied private prefix of a published chapter does not pass this gate.
create or replace function app_private.studio_purge_target_allowed(
  p_project_id uuid, p_target_kind text, p_target_id uuid
) returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_projects project
    where project.id = p_project_id and (
      project.rights_status = 'revoked'
      or (p_target_kind = 'page' and not exists (
        select 1 from public.studio_pages page
        where page.id = p_target_id and page.project_id = p_project_id))
      or (p_target_kind = 'publication' and (
        not exists (select 1 from public.studio_publications publication
          where publication.id = p_target_id and publication.project_id = p_project_id)
        or exists (select 1 from public.studio_publications publication
          where publication.id = p_target_id and publication.project_id = p_project_id
            and publication.status = 'withdrawn' and publication.chapter_id is null
            and not exists (
              select 1 from public.chapters chapter
              where chapter.is_approved and exists (
                select 1 from pg_catalog.jsonb_array_elements_text(
                  case when pg_catalog.jsonb_typeof(chapter.pages) = 'array'
                    then chapter.pages else '[]'::jsonb end) as ref(value)
                where pg_catalog.starts_with(ref.value, pg_catalog.format(
                  '/api/studio/reader-image?publication_id=%s&page_index=',
                  p_target_id))))))
    )));
$function$;

revoke all on function app_private.studio_purge_target_allowed(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function app_private.studio_purge_target_allowed(uuid, text, uuid)
  to service_role;

-- The old draft goes withdrawn in the same transaction; the R2 prefix queues with a short delay
-- . For a PUT finishing late the finished target is rescanned daily.
create or replace function app_private.studio_purge_queue_withdrawn_draft()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if old.status <> 'draft' or new.status <> 'withdrawn'
    or new.chapter_id is not null then return null; end if;
  insert into app_private.studio_purge_targets (project_id, target_kind, target_id)
  values (new.project_id, 'publication', new.id)
  on conflict (project_id, target_kind, target_id) do nothing;
  return null;
end;
$function$;

create trigger studio_purge_withdrawn_draft
after update of status on public.studio_publications
for each row execute function app_private.studio_purge_queue_withdrawn_draft();

revoke all on function app_private.studio_purge_queue_withdrawn_draft()
  from public, anon, authenticated;

create or replace function app_private.studio_purge_preview(p_limit integer default 4)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_targets jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Temizlik önizlemesi yalnız sunucu işlemidir.';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then
    raise sqlstate '22023' using message = 'Temizlik önizleme sınırı geçersiz.';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id', due.id, 'project_id', due.project_id,
      'target_kind', due.target_kind, 'target_id', due.target_id,
      'prefix', case due.target_kind when 'page'
        then 'pages/' || due.target_id::text || '/'
        else 'published/' || due.target_id::text || '/' end)
    order by due.not_before, due.id), '[]'::jsonb)
  into v_targets
  from (
    select target.* from app_private.studio_purge_targets target
    join public.studio_projects project on project.id = target.project_id
    where app_private.studio_purge_target_allowed(
      target.project_id, target.target_kind, target.target_id)
      and ((target.state in ('pending', 'complete') and target.not_before <= now())
        or (target.state = 'leased' and target.lease_until <= now()))
    order by target.not_before, target.id limit p_limit
  ) due;
  return pg_catalog.jsonb_build_object('state', 'preview', 'targets', v_targets);
end;
$function$;

create or replace function app_private.studio_purge_claim()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_target app_private.studio_purge_targets%rowtype;
  v_token uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Temizlik yalnız sunucu işlemidir.';
  end if;
  select target.* into v_target
  from app_private.studio_purge_targets target
  join public.studio_projects project on project.id = target.project_id
  where app_private.studio_purge_target_allowed(
      target.project_id, target.target_kind, target.target_id)
    and ((target.state in ('pending', 'complete') and target.not_before <= now())
      or (target.state = 'leased' and target.lease_until <= now()))
  order by target.not_before, target.id
  limit 1 for update of target skip locked;
  if not found then return pg_catalog.jsonb_build_object('state', 'idle'); end if;

  v_token := gen_random_uuid();
  update app_private.studio_purge_targets target
  set state = 'leased', lease_token = v_token,
    lease_until = now() + interval '2 minutes', attempts = target.attempts + 1,
    updated_at = now()
  where target.id = v_target.id;
  return pg_catalog.jsonb_build_object('state', 'claimed', 'id', v_target.id,
    'project_id', v_target.project_id, 'target_kind', v_target.target_kind,
    'target_id', v_target.target_id, 'attempt_token', v_token,
    'prefix', case v_target.target_kind when 'page'
      then 'pages/' || v_target.target_id::text || '/'
      else 'published/' || v_target.target_id::text || '/' end);
end;
$function$;

create or replace function app_private.studio_purge_finish(
  p_target_id bigint, p_attempt_token uuid, p_deleted_count integer, p_had_objects boolean
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_target app_private.studio_purge_targets%rowtype;
  v_status text;
  v_next timestamptz;
  v_empty timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Temizlik yalnız sunucu işlemidir.';
  end if;
  if p_target_id is null or p_attempt_token is null or p_had_objects is null
    or p_deleted_count is null or p_deleted_count not between 0 and 100
    or (p_had_objects and p_deleted_count = 0)
    or (not p_had_objects and p_deleted_count <> 0) then
    raise sqlstate '22023' using message = 'Temizlik sonucu geçersiz.';
  end if;
  select * into v_target from app_private.studio_purge_targets target
  where target.id = p_target_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Temizlik hedefi bulunamadı.'; end if;
  if v_target.state <> 'leased' or v_target.lease_token is distinct from p_attempt_token
    or v_target.lease_until <= now() then
    raise sqlstate 'PT409' using message = 'Temizlik kirası artık geçerli değil.';
  end if;
  if not app_private.studio_purge_target_allowed(
      v_target.project_id, v_target.target_kind, v_target.target_id) then
    raise sqlstate 'PT403' using message = 'Temizlik hedefi artık uygun değil.';
  end if;

  if p_had_objects then
    v_status := 'pending';
    v_next := now() + interval '1 minute';
    v_empty := null;
  elsif v_target.first_empty_at is null then
    v_status := 'pending';
    v_next := now() + interval '5 minutes';
    v_empty := now();
  else
    -- For old uploads finishing later the finished prefix is rescanned daily.
    v_status := 'complete';
    v_next := now() + interval '1 day';
    v_empty := v_target.first_empty_at;
  end if;
  update app_private.studio_purge_targets target
  set state = v_status, not_before = v_next, lease_token = null,
    lease_until = null, first_empty_at = v_empty,
    completed_at = case when v_status = 'complete' then
      coalesce(target.completed_at, now()) else null end,
    deleted_count = target.deleted_count + p_deleted_count,
    updated_at = now()
  where target.id = p_target_id;
  return pg_catalog.jsonb_build_object('state', v_status, 'id', p_target_id,
    'deleted_count', p_deleted_count);
end;
$function$;
