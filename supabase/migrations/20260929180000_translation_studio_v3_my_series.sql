-- Translation Studio: "My series" and published chapter revision.
--
-- 1) Series list / series detail: the fansub site series (mangas.fansub_id; including those uploaded
-- with the classic flow without the studio) + series with a studio project +
-- series drafts awaiting approval. Read with "ceviri.gor" permission (tl_can_fansub).
-- 2) Revision project: a published (approved) chapter moves into a new translation_project
-- (revision_of = chapter). For a studio chapter raw pages, areas, texts and the
-- cleanup layer are copied; for a classic chapter pages are imported as raw
-- (functions/api/ceviri/import.js). The live project and chapter stay UNTOUCHED.
-- 3) Republish = an "edit" record in the existing revision system (pending_content_revisions)
-- . Until approval readers see the old version. Wherever approve/reject comes from
-- (admin revision approval) the trigger takes the studio project live or reopens it
-- for editing; the old project is not deleted, it goes "archived" (meta.previous_project_id).
-- 4) Series info edits (name, description, genres, cover, +18) also land in the same revision
-- table as "edit"; the live series does not change until approval.
--
-- LIVE DB FACT: of 037 only the pending_content_revisions TABLE exists; 037 snapshot
-- functions, capture/resolve triggers and the updated_at trigger
-- DO NOT EXIST. This migration does not rely on them: app_private.content_revision_snapshot for snapshots
-- is defined here (body IDENTICAL to 20260929190000), updated_at is written by hand.
--
-- DEPENDENCY / ORDER: no code dependency with 20260929190000 (live revision approval);
-- the two migrations can apply in any order. But admin approval of revisions here
-- going live happens with approve_content_revision in 20260929190000
-- ; until that applies submitted revisions wait as "pending" (live chapter/series
-- unaffected). This migration NEVER writes to a live row; approved row guards
-- (trg_enforce_chapter_approval_guard / trg_enforce_manga_approval_guard) stay in force.
-- The decision trigger below touches only translation_projects.

-- ---------------------------------------------------------------------------
-- Sema
-- ---------------------------------------------------------------------------

alter table public.pending_content_revisions
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.translation_projects
  add column if not exists revision_of uuid references public.chapters(id) on delete cascade;

do $constraint$
begin
  if not exists (select 1 from pg_constraint where conname = 'translation_projects_revision_check') then
    alter table public.translation_projects
      add constraint translation_projects_revision_check check (revision_of is null or manga_id is not null);
  end if;
end
$constraint$;

-- A live chapter project stays unique; revision and archived projects are outside this rule.
drop index if exists public.translation_projects_manga_unique;
create unique index translation_projects_manga_unique
  on public.translation_projects (fansub_id, manga_id, chapter_number)
  where manga_id is not null and revision_of is null and stage <> 'archived';

-- One open revision per chapter at a time.
create unique index if not exists translation_projects_revision_open_unique
  on public.translation_projects (revision_of) where revision_of is not null;

-- revision_of is written only by server functions.
create or replace function app_private.tl_project_revision_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if app_private.tl_is_service() then return new; end if;
  if tg_op = 'INSERT' and new.revision_of is not null then
    raise exception 'revizyon projesi yalniz sunucu tarafindan acilir' using errcode = 'PT403';
  end if;
  if tg_op = 'UPDATE' and new.revision_of is distinct from old.revision_of then
    raise exception 'revizyon baglantisi degistirilemez' using errcode = 'PT403';
  end if;
  return new;
end;
$function$;

drop trigger if exists translation_projects_revision_guard on public.translation_projects;
create trigger translation_projects_revision_guard before insert or update on public.translation_projects
  for each row execute function app_private.tl_project_revision_guard();

-- Revision snapshot (live row -> jsonb). 037's public.*_revision_snapshot
-- functions DO NOT EXIST on live; this definition stands alone. In 20260929180000 (studio
-- my series) and 20260929190000 (live revision) migrations it is defined with an IDENTICAL body
-- : whichever applies first the result is the same.
create or replace function app_private.content_revision_snapshot(p_target_type text, p_target_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select case p_target_type
    when 'manga' then (
      select jsonb_build_object(
        'title', m.title, 'slug', m.slug, 'description', m.description, 'status', m.status,
        'genres', coalesce(to_jsonb(m.genres), '[]'::jsonb), 'cover_image_url', m.cover_image_url,
        'author', m.author, 'artist', m.artist, 'release_date', m.release_date,
        'original_lang', m.original_lang, 'is_new', m.is_new, 'is_mature', coalesce(m.is_mature, false))
      from public.mangas m where m.id = p_target_id)
    when 'chapter' then (
      select jsonb_build_object(
        'manga_id', c.manga_id, 'chapter_number', c.chapter_number, 'title', c.title,
        'pages', coalesce(c.pages, '[]'::jsonb), 'page_dimensions', coalesce(c.page_dimensions, '{}'::jsonb),
        'publish_at', c.publish_at)
      from public.chapters c where c.id = p_target_id)
  end;
$function$;

revoke all on function app_private.content_revision_snapshot(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Series list
-- ---------------------------------------------------------------------------

create or replace function public.tl_fansub_series(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_result jsonb;
begin
  if p_fansub_id is null or not app_private.tl_can_fansub(p_fansub_id) then
    raise exception 'Bu ekibin serilerini görme iznin yok.' using errcode = '42501';
  end if;

  with series as (
    select m.id from public.mangas m where m.fansub_id = p_fansub_id
    union
    select p.manga_id from public.translation_projects p where p.fansub_id = p_fansub_id and p.manga_id is not null
  ),
  series_rows as (
    select
      m.id, m.title, m.slug, m.description, m.cover_image_url, m.genres, m.original_lang,
      coalesce(m.is_mature, false) as is_mature,
      coalesce(m.is_approved, false) as is_approved,
      coalesce(m.is_active, false) as is_active,
      coalesce(m.fansub_id = p_fansub_id, false) as is_mine,
      (select count(*) from public.chapters c where c.manga_id = m.id and c.fansub_id = p_fansub_id) as chapter_count,
      (select count(*) from public.chapters c where c.manga_id = m.id and c.fansub_id = p_fansub_id and c.is_approved and c.is_active) as live_chapter_count,
      (select count(*) from public.translation_projects p where p.manga_id = m.id and p.fansub_id = p_fansub_id and p.stage not in ('published', 'archived')) as open_project_count,
      greatest(
        m.updated_at,
        (select max(c.updated_at) from public.chapters c where c.manga_id = m.id and c.fansub_id = p_fansub_id),
        (select max(p.updated_at) from public.translation_projects p where p.manga_id = m.id and p.fansub_id = p_fansub_id)
      ) as last_update,
      exists (
        select 1 from public.pending_content_revisions r
        where r.status = 'pending'
          and ((r.target_type = 'manga' and r.target_id = m.id)
            or (r.target_type = 'chapter' and r.fansub_id = p_fansub_id
              and r.target_id in (select c.id from public.chapters c where c.manga_id = m.id)))
      ) as pending_revision
    from public.mangas m
    where m.id in (select id from series)
  )
  select coalesce(jsonb_agg(item order by (item->>'last_update') desc nulls last), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'kind', 'manga', 'id', r.id, 'title', r.title, 'slug', r.slug, 'description', r.description,
      'cover_url', r.cover_image_url, 'genres', coalesce(to_jsonb(r.genres), '[]'::jsonb),
      'original_lang', r.original_lang, 'is_mature', r.is_mature, 'is_approved', r.is_approved,
      'is_active', r.is_active, 'is_mine', r.is_mine, 'chapter_count', r.chapter_count,
      'live_chapter_count', r.live_chapter_count, 'open_project_count', r.open_project_count,
      'last_update', r.last_update, 'pending_revision', r.pending_revision
    ) as item
    from series_rows r
    union all
    select jsonb_build_object(
      'kind', 'draft', 'id', d.id, 'title', d.title, 'slug', null, 'description', null,
      'cover_url', d.cover_object_key, 'genres', to_jsonb(d.genres),
      'original_lang', d.source_language, 'is_mature', d.is_mature, 'is_approved', false,
      'is_active', false, 'is_mine', true, 'chapter_count', 0, 'live_chapter_count', 0,
      'open_project_count', (select count(*) from public.translation_projects p where p.series_draft_id = d.id),
      'last_update', d.updated_at, 'pending_revision', false
    )
    from public.translation_series_drafts d
    where d.fansub_id = p_fansub_id and d.status = 'pending'
  ) listed;
  return v_result;
end;
$function$;

revoke all on function public.tl_fansub_series(uuid) from public, anon;
grant execute on function public.tl_fansub_series(uuid) to authenticated;

-- Series detail: this team's chapters + open projects not tied to a chapter.
create or replace function public.tl_fansub_series_chapters(p_fansub_id uuid, p_manga_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if p_fansub_id is null or not app_private.tl_can_fansub(p_fansub_id) then
    raise exception 'Bu ekibin serilerini görme iznin yok.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'chapter_number', c.chapter_number, 'title', c.title,
        'page_count', case when jsonb_typeof(c.pages) = 'array' then jsonb_array_length(c.pages) else 0 end,
        'is_approved', coalesce(c.is_approved, false), 'is_active', coalesce(c.is_active, false),
        'publish_at', c.publish_at, 'updated_at', c.updated_at,
        'project_id', (select p.id from public.translation_projects p where p.chapter_id = c.id and p.stage in ('published', 'scheduled') limit 1),
        'revision_project_id', (select p.id from public.translation_projects p where p.revision_of = c.id limit 1),
        'revision_stage', (select p.stage from public.translation_projects p where p.revision_of = c.id limit 1),
        'pending_revision', exists (select 1 from public.pending_content_revisions r where r.target_type = 'chapter' and r.target_id = c.id and r.status = 'pending')
      ) order by c.chapter_number desc)
      from public.chapters c
      where c.manga_id = p_manga_id and c.fansub_id = p_fansub_id
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'chapter_number', p.chapter_number, 'stage', p.stage, 'updated_at', p.updated_at
      ) order by p.chapter_number desc)
      from public.translation_projects p
      where p.fansub_id = p_fansub_id and p.chapter_id is null and p.revision_of is null
        and p.stage not in ('published', 'archived')
        and (p.manga_id = p_manga_id or p.series_draft_id = p_manga_id)
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.tl_fansub_series_chapters(uuid, uuid) from public, anon;
grant execute on function public.tl_fansub_series_chapters(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Revizyon projesi
-- ---------------------------------------------------------------------------

create or replace function public.tl_open_chapter_revision(p_chapter_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_chapter public.chapters%rowtype;
  v_existing uuid;
  v_source public.translation_projects%rowtype;
  v_language text;
  v_project uuid;
  v_page public.translation_pages%rowtype;
  v_item public.translation_items%rowtype;
  v_new_page uuid;
  v_new_item uuid;
  v_prev_role text;
begin
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then
    raise exception 'Bölüm bulunamadı.' using errcode = 'P0002';
  end if;
  if v_chapter.fansub_id is null or not app_private.tl_perm(v_chapter.fansub_id, 'ceviri.proje') then
    raise exception 'Revizyon açmak için proje yönetimi izni gerekir.' using errcode = '42501';
  end if;
  if not coalesce(v_chapter.is_approved, false) then
    raise exception 'Onay bekleyen bölüm revizyonla değil, bölümler sekmesinden düzenlenir.' using errcode = 'PT409';
  end if;

  select id into v_existing from public.translation_projects where revision_of = p_chapter_id limit 1;
  if v_existing is not null then return v_existing; end if;

  select * into v_source from public.translation_projects
  where chapter_id = p_chapter_id and stage in ('published', 'scheduled') limit 1;

  if v_source.id is not null then
    v_language := v_source.source_language;
  else
    select case when m.original_lang in ('ja', 'jp') then 'ja' when m.original_lang in ('ko', 'zh') then m.original_lang else 'ja' end
    into v_language from public.mangas m where m.id = v_chapter.manga_id;
  end if;

  -- Raw keys and machine texts are written only by the service role (tl_page_guard,
  -- tl_item_text_guard). A copy comes only from this team's own live project; the role
  -- is taken back at the end of the transaction.
  v_prev_role := current_setting('request.jwt.claim.role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.translation_projects (
    fansub_id, manga_id, chapter_number, chapter_title, source_language, stage, revision_of
  ) values (
    v_chapter.fansub_id, v_chapter.manga_id, v_chapter.chapter_number, v_chapter.title,
    coalesce(v_language, 'ja'), case when v_source.id is not null then 'edit' else 'upload' end, p_chapter_id
  ) returning id into v_project;

  if v_source.id is not null then
    for v_page in select * from public.translation_pages where project_id = v_source.id order by page_index loop
      v_new_page := gen_random_uuid();
      insert into public.translation_pages
      select * from jsonb_populate_record(null::public.translation_pages,
        to_jsonb(v_page) || jsonb_build_object('id', v_new_page, 'project_id', v_project, 'version', 1));
      insert into public.translation_page_cleanup
      select copied.* from public.translation_page_cleanup cleanup
      cross join lateral jsonb_populate_record(null::public.translation_page_cleanup,
        to_jsonb(cleanup) || jsonb_build_object('page_id', v_new_page)) copied
      where cleanup.page_id = v_page.id;
      for v_item in select * from public.translation_items where page_id = v_page.id loop
        v_new_item := gen_random_uuid();
        insert into public.translation_items
        select * from jsonb_populate_record(null::public.translation_items,
          to_jsonb(v_item) || jsonb_build_object('id', v_new_item, 'page_id', v_new_page));
        insert into public.translation_item_texts
        select copied.* from public.translation_item_texts text_row
        cross join lateral jsonb_populate_record(null::public.translation_item_texts,
          to_jsonb(text_row) || jsonb_build_object('id', gen_random_uuid(), 'item_id', v_new_item)) copied
        where text_row.item_id = v_item.id;
      end loop;
    end loop;
  else
    -- Classic chapter: page rows open empty, images come as raw through import.js.
    insert into public.translation_pages (project_id, page_index, file_name)
    select v_project, (ordinality - 1)::integer, 'sayfa-' || lpad(ordinality::text, 3, '0')
    from jsonb_array_elements_text(case when jsonb_typeof(v_chapter.pages) = 'array' then v_chapter.pages else '[]'::jsonb end)
      with ordinality
    where ordinality <= 1000;
  end if;

  perform set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);
  return v_project;
end;
$function$;

revoke all on function public.tl_open_chapter_revision(uuid) from public, anon;
grant execute on function public.tl_open_chapter_revision(uuid) to authenticated;

-- import.js: the source chapter image of an empty revision page (mapped by page order).
create or replace function public.tl_revision_import_ref(p_page_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $function$
declare
  v_ref text;
  v_fansub uuid := app_private.tl_page_fansub(p_page_id);
begin
  if v_fansub is null or not app_private.tl_perm(v_fansub, 'ceviri.proje') then
    raise exception 'Bu sayfaya erişimin yok.' using errcode = '42501';
  end if;
  select c.pages ->> page.page_index into v_ref
  from public.translation_pages page
  join public.translation_projects project on project.id = page.project_id
  join public.chapters c on c.id = project.revision_of
  where page.id = p_page_id and page.raw_status = 'empty' and jsonb_typeof(c.pages) = 'array';
  return v_ref;
end;
$function$;

revoke all on function public.tl_revision_import_ref(uuid) from public, anon;
grant execute on function public.tl_revision_import_ref(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Revision submit (live record does not change)
-- ---------------------------------------------------------------------------

create or replace function public.tl_submit_chapter_revision(p_project_id uuid, p_pages jsonb, p_page_dimensions jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_project public.translation_projects%rowtype;
  v_chapter public.chapters%rowtype;
  v_before jsonb;
  v_revision uuid;
begin
  select * into v_project from public.translation_projects where id = p_project_id;
  if not found or v_project.revision_of is null then
    raise exception 'Revizyon projesi bulunamadı.' using errcode = 'P0002';
  end if;
  if not app_private.tl_perm(v_project.fansub_id, 'ceviri.yayinla') then
    raise exception 'Revizyonu göndermek için yayınlama izni gerekir.' using errcode = '42501';
  end if;
  select * into v_chapter from public.chapters where id = v_project.revision_of;
  if not found or v_chapter.fansub_id is distinct from v_project.fansub_id or not coalesce(v_chapter.is_approved, false) then
    raise exception 'Bölüm yayında değil.' using errcode = 'PT409';
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

  v_before := app_private.content_revision_snapshot('chapter', v_chapter.id);

  -- A new one replaces an old pending revision for the same chapter.
  update public.pending_content_revisions
  set status = 'rejected', reviewed_at = now(), updated_at = now(), review_note = 'Yerine yeni revizyon gönderildi.'
  where target_type = 'chapter' and target_id = v_chapter.id and status = 'pending';

  insert into public.pending_content_revisions (
    target_type, target_id, fansub_id, requested_by, change_action, before_data, after_data, status, meta
  ) values (
    'chapter', v_chapter.id, v_chapter.fansub_id, app_private.current_public_user_id(), 'edit', v_before,
    v_before || jsonb_build_object(
      'title', coalesce(v_project.chapter_title, v_chapter.title),
      'pages', p_pages,
      'page_dimensions', coalesce(p_page_dimensions, '{}'::jsonb)
    ),
    'pending',
    jsonb_build_object('source', 'studio', 'project_id', v_project.id)
  ) returning id into v_revision;

  update public.translation_projects set stage = 'publish' where id = v_project.id;
  return v_revision;
end;
$function$;

revoke all on function public.tl_submit_chapter_revision(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.tl_submit_chapter_revision(uuid, jsonb, jsonb) to authenticated;

create or replace function public.tl_submit_manga_revision(p_fansub_id uuid, p_manga_id uuid, p_changes jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_manga public.mangas%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_revision uuid;
begin
  if not (app_private.tl_perm(p_fansub_id, 'ceviri.proje') or app_private.fansub_staff_bolumler(p_fansub_id)) then
    raise exception 'Seri bilgilerini düzenlemek için izin gerekir.' using errcode = '42501';
  end if;
  select * into v_manga from public.mangas where id = p_manga_id;
  if not found or v_manga.fansub_id is distinct from p_fansub_id then
    raise exception 'Bu seri ekibine ait değil.' using errcode = '42501';
  end if;
  if not coalesce(v_manga.is_approved, false) then
    raise exception 'Seri henüz onay bekliyor; onaydan sonra düzenlenebilir.' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object'
    or p_changes - 'title' - 'description' - 'genres' - 'cover_image_url' - 'is_mature' <> '{}'::jsonb then
    raise exception 'Değişiklik alanları geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'title' and (jsonb_typeof(p_changes->'title') <> 'string'
    or length(btrim(p_changes->>'title')) not between 1 and 200) then
    raise exception 'Seri adı 1-200 karakter olmalı.' using errcode = '22023';
  end if;
  if p_changes ? 'description' and (jsonb_typeof(p_changes->'description') <> 'string'
    or length(p_changes->>'description') > 5000) then
    raise exception 'Açıklama en fazla 5000 karakter olabilir.' using errcode = '22023';
  end if;
  if p_changes ? 'genres' and (jsonb_typeof(p_changes->'genres') <> 'array'
    or jsonb_array_length(p_changes->'genres') > 12
    or exists (select 1 from jsonb_array_elements(p_changes->'genres') g
      where jsonb_typeof(g) <> 'string' or length(g #>> '{}') not between 1 and 40)) then
    raise exception 'Türler geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'cover_image_url' and (jsonb_typeof(p_changes->'cover_image_url') <> 'string'
    or length(p_changes->>'cover_image_url') not between 1 and 1000) then
    raise exception 'Kapak adresi geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'is_mature' and jsonb_typeof(p_changes->'is_mature') <> 'boolean' then
    raise exception '+18 alanı geçersiz.' using errcode = '22023';
  end if;

  v_before := app_private.content_revision_snapshot('manga', p_manga_id);
  v_after := v_before || p_changes;
  if v_after = v_before then
    raise exception 'Değişiklik yok.' using errcode = '22023';
  end if;

  update public.pending_content_revisions
  set status = 'rejected', reviewed_at = now(), updated_at = now(), review_note = 'Yerine yeni revizyon gönderildi.'
  where target_type = 'manga' and target_id = p_manga_id and change_action = 'edit' and status = 'pending';

  insert into public.pending_content_revisions (
    target_type, target_id, fansub_id, requested_by, change_action, before_data, after_data, status, meta
  ) values (
    'manga', p_manga_id, p_fansub_id, app_private.current_public_user_id(), 'edit', v_before, v_after, 'pending',
    jsonb_build_object('source', 'studio')
  ) returning id into v_revision;
  return v_revision;
end;
$function$;

revoke all on function public.tl_submit_manga_revision(uuid, uuid, jsonb) from public, anon;
grant execute on function public.tl_submit_manga_revision(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Revision decision -> studio project (independent of approval source)
-- ---------------------------------------------------------------------------
-- Approval: the live project is archived (not deleted), the revision project ties to the chapter and
-- goes published; the reader language layer (tl_reader_project) thus follows the new version.
-- An approval with meta.project_id = null (e.g. returning from archive to a classic version) only
-- archives the live project. Reject: the revision project reopens for editing.

create or replace function app_private.tl_revision_project_sync()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_target uuid;
  v_live uuid;
  v_prev_role text;
begin
  if new.target_type <> 'chapter' or not (new.meta ? 'project_id') then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  v_target := nullif(new.meta->>'project_id', '')::uuid;
  v_prev_role := current_setting('request.jwt.claim.role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  if new.status = 'approved' then
    select id into v_live from public.translation_projects
    where chapter_id = new.target_id and stage in ('published', 'scheduled') and id is distinct from v_target
    limit 1;
    new.meta := new.meta || jsonb_build_object('previous_project_id', v_live);
    update public.translation_projects set chapter_id = null, stage = 'archived'
    where chapter_id = new.target_id and id is distinct from v_target;
    if v_target is not null then
      update public.translation_projects
      set revision_of = null, chapter_id = new.target_id, stage = 'published'
      where id = v_target;
    end if;
  elsif new.status = 'rejected' and tg_op = 'UPDATE' and old.status = 'pending' and v_target is not null then
    update public.translation_projects set stage = 'edit'
    where id = v_target and revision_of = new.target_id;
  end if;
  perform set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);
  return new;
end;
$function$;

revoke all on function app_private.tl_revision_project_sync() from public;

drop trigger if exists pending_content_revisions_studio_sync on public.pending_content_revisions;
create trigger pending_content_revisions_studio_sync
  before insert or update of status on public.pending_content_revisions
  for each row execute function app_private.tl_revision_project_sync();
