-- Content revisions: on a change pending approval the OLD version stays published.
--
-- The existing revision system (pending_content_revisions, 20260214_037) is extended;
-- no parallel second version table is built:
-- * On a published (approved) series/chapter a fansub change is NOT WRITTEN to the live row;
-- it waits in after_data (submit_chapter_revision; studio: tl_submit_*_revision).
-- Formerly a chapter edit set is_approved=false and hid the chapter from readers.
-- * Approval (approve_content_revision): after_data applies to the live row. The previous
-- version stays STORED as before_data on the same row = archive (chapter page
-- references are not deleted from R2; no flow deletes old page objects).
-- * Reject: the live row stays as is.
-- * Restore from archive (restore_content_revision, site admin only): archived
-- before_data applies to live as a new approved revision; the chain is kept.
-- Readers always read the live chapters/mangas row; public read paths and
-- RLS do not change.
--
-- LIVE DB FACT: of 037 only the pending_content_revisions TABLE exists. 037's
-- public.manga_revision_snapshot / chapter_revision_snapshot functions,
-- capture_pending_* / trg_resolve_pending_* triggers and the updated_at
-- trigger DO NOT EXIST. This migration does not rely on them: it defines every function it needs
-- itself (security definer, set search_path = ''), writes updated_at by hand.
-- Notification triggers (notify_pending_content_revision_created/reviewed) if present
-- run normally: a new pending record notifies admins, a decision notifies the sender.
--
-- APPROVAL GUARDS: on live trg_enforce_chapter_approval_guard and
-- trg_enforce_manga_approval_guard update an approved row only for can_manage_moderation_state()
-- (site admin / service). The live row changes ONLY with apply_content_revision;
-- that runs only from approve_content_revision (can_manage_moderation_state) and
-- restore_content_revision (is_admin), with the caller own admin session
-- ; guards are not loosened or bypassed. The fansub side never writes to the live row.
--
-- DEPENDENCY: not dependent on 20260929180000 (PR "studio my series");
-- both migrations define the meta column and content_revision_snapshot the same way.

alter table public.pending_content_revisions
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists pending_content_revisions_archive_idx
  on public.pending_content_revisions (status, change_action, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- Applying to the live row (only fields differing between before/after)
-- ---------------------------------------------------------------------------
-- An unchanged field is not touched: a fix an admin made on another field while the revision waited
-- is not overwritten by the old snapshot.

create or replace function app_private.apply_content_revision(
  p_target_type text, p_target_id uuid, p_before jsonb, p_after jsonb
)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_changed text[];
begin
  -- Same gate as approved row guards (trg_enforce_*_approval_guard): admin/service only.
  if not app_private.can_manage_moderation_state() then
    raise exception 'Revizyonu yalnız site yöneticisi uygulayabilir.' using errcode = '42501';
  end if;
  select coalesce(array_agg(key), '{}') into v_changed
  from jsonb_object_keys(p_after) key
  where (p_after -> key) is distinct from (p_before -> key);

  if p_target_type = 'manga' then
    update public.mangas m set
      title = case when 'title' = any(v_changed) then coalesce(nullif(btrim(p_after->>'title'), ''), m.title) else m.title end,
      description = case when 'description' = any(v_changed) then p_after->>'description' else m.description end,
      genres = case when 'genres' = any(v_changed) and jsonb_typeof(p_after->'genres') = 'array'
        then array(select jsonb_array_elements_text(p_after->'genres')) else m.genres end,
      cover_image_url = case when 'cover_image_url' = any(v_changed) then p_after->>'cover_image_url' else m.cover_image_url end,
      status = case when 'status' = any(v_changed) and p_after->>'status' in ('ongoing', 'completed', 'hiatus') then p_after->>'status' else m.status end,
      author = case when 'author' = any(v_changed) then p_after->>'author' else m.author end,
      artist = case when 'artist' = any(v_changed) then p_after->>'artist' else m.artist end,
      is_mature = case when 'is_mature' = any(v_changed) and jsonb_typeof(p_after->'is_mature') = 'boolean'
        then (p_after->>'is_mature')::boolean else m.is_mature end,
      updated_at = now()
    where m.id = p_target_id;
    if not found then
      raise exception 'Revizyon hedefi bulunamadı.' using errcode = 'P0002';
    end if;
  elsif p_target_type = 'chapter' then
    update public.chapters c set
      title = case when 'title' = any(v_changed) then nullif(btrim(coalesce(p_after->>'title', '')), '') else c.title end,
      pages = case when 'pages' = any(v_changed) and jsonb_typeof(p_after->'pages') = 'array'
        and jsonb_array_length(p_after->'pages') > 0 then p_after->'pages' else c.pages end,
      page_dimensions = case when 'page_dimensions' = any(v_changed) and jsonb_typeof(p_after->'page_dimensions') = 'object'
        then p_after->'page_dimensions' else c.page_dimensions end,
      publish_at = case when 'publish_at' = any(v_changed) and p_after->>'publish_at' is not null
        then (p_after->>'publish_at')::timestamptz else c.publish_at end,
      updated_at = now()
    where c.id = p_target_id;
    if not found then
      raise exception 'Revizyon hedefi bulunamadı.' using errcode = 'P0002';
    end if;
    update public.mangas set updated_at = now()
    where id = (select manga_id from public.chapters where id = p_target_id);
  else
    raise exception 'Bilinmeyen revizyon hedefi.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function app_private.apply_content_revision(text, uuid, jsonb, jsonb) from public, anon, authenticated;

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
-- Classic flow (fansub panel): published chapter revision
-- ---------------------------------------------------------------------------

create or replace function public.submit_chapter_revision(
  p_chapter_id uuid,
  p_title text default null,
  p_pages jsonb default null,
  p_page_dimensions jsonb default null,
  p_publish_at timestamptz default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_actor uuid := app_private.current_public_user_id();
  v_chapter public.chapters%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_revision uuid;
begin
  if v_actor is null then
    raise exception 'Kullanici oturumu bulunamadi.' using errcode = '42501';
  end if;
  select * into v_chapter from public.chapters where id = p_chapter_id and is_active = true;
  if not found then
    raise exception 'Bolum bulunamadi.' using errcode = 'P0002';
  end if;
  if not (app_private.is_admin() or (v_chapter.fansub_id is not null
    and (app_private.fansub_staff_bolumler(v_chapter.fansub_id) or app_private.is_fansub_admin(v_chapter.fansub_id)))) then
    raise exception 'Bu bolumu duzenleme yetkiniz yok.' using errcode = '42501';
  end if;
  if not coalesce(v_chapter.is_approved, false) then
    raise exception 'Onay bekleyen bolum revizyonla degil dogrudan duzenlenir.' using errcode = 'PT409';
  end if;
  if v_title is not null and char_length(v_title) > 140 then
    raise exception 'Bolum basligi en fazla 140 karakter olabilir.' using errcode = '22023';
  end if;
  if p_pages is not null and (jsonb_typeof(p_pages) <> 'array'
    or jsonb_array_length(p_pages) not between 1 and 1000
    or exists (select 1 from jsonb_array_elements(p_pages) ref
      where jsonb_typeof(ref) <> 'string' or length(ref #>> '{}') not between 1 and 1000)) then
    raise exception 'Sayfa listesi gecersiz.' using errcode = '22023';
  end if;
  if p_page_dimensions is not null and jsonb_typeof(p_page_dimensions) <> 'object' then
    raise exception 'Sayfa olculeri gecersiz.' using errcode = '22023';
  end if;

  v_before := app_private.content_revision_snapshot('chapter', v_chapter.id);
  v_after := v_before || jsonb_build_object('title', v_title);
  if p_pages is not null then
    v_after := v_after || jsonb_build_object('pages', p_pages, 'page_dimensions', coalesce(p_page_dimensions, '{}'::jsonb));
  end if;
  if p_publish_at is not null then
    v_after := v_after || jsonb_build_object('publish_at', p_publish_at);
  end if;
  if v_after = v_before then
    raise exception 'Degisiklik yok.' using errcode = '22023';
  end if;

  -- A new one replaces an old pending revision of the same chapter.
  update public.pending_content_revisions
  set status = 'rejected', reviewed_at = now(), updated_at = now(), review_note = 'Yerine yeni revizyon gonderildi.'
  where target_type = 'chapter' and target_id = v_chapter.id and status = 'pending';

  insert into public.pending_content_revisions (
    target_type, target_id, fansub_id, requested_by, change_action, before_data, after_data, status, meta
  ) values (
    'chapter', v_chapter.id, v_chapter.fansub_id, v_actor, 'edit', v_before, v_after, 'pending',
    -- project_id = null: if a studio chapter changes from the panel the studio project archives on approval
    -- (20260929180000 trigger); otherwise the key has no effect.
    jsonb_build_object('source', 'panel', 'project_id', null)
  ) returning id into v_revision;

  return jsonb_build_object(
    'success', true, 'chapter_id', v_chapter.id, 'fansub_id', v_chapter.fansub_id,
    'revision_id', v_revision, 'status', 'pending_revision'
  );
end;
$function$;

revoke all on function public.submit_chapter_revision(uuid, text, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.submit_chapter_revision(uuid, text, jsonb, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin karari
-- ---------------------------------------------------------------------------

create or replace function public.approve_content_revision(p_revision_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_revision public.pending_content_revisions%rowtype;
begin
  if not app_private.can_manage_moderation_state() then
    raise exception 'Revizyonu yalnız site yöneticisi onaylayabilir.' using errcode = '42501';
  end if;
  select * into v_revision from public.pending_content_revisions where id = p_revision_id for update;
  if not found or v_revision.status <> 'pending' or v_revision.change_action <> 'edit' then
    raise exception 'Bekleyen revizyon bulunamadı.' using errcode = 'P0002';
  end if;
  -- The previous version stays in before_data (archive); only changed fields are written to the live row.
  perform app_private.apply_content_revision(v_revision.target_type, v_revision.target_id, v_revision.before_data, v_revision.after_data);
  update public.pending_content_revisions
  set status = 'approved', reviewed_at = now(), updated_at = now(), reviewed_by = app_private.current_public_user_id(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_revision_id;
  return jsonb_build_object('success', true, 'revision_id', p_revision_id, 'target_type', v_revision.target_type, 'target_id', v_revision.target_id);
end;
$function$;

create or replace function public.reject_content_revision(p_revision_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_revision public.pending_content_revisions%rowtype;
begin
  if not app_private.can_manage_moderation_state() then
    raise exception 'Revizyonu yalnız site yöneticisi reddedebilir.' using errcode = '42501';
  end if;
  select * into v_revision from public.pending_content_revisions where id = p_revision_id for update;
  if not found or v_revision.status <> 'pending' or v_revision.change_action <> 'edit' then
    raise exception 'Bekleyen revizyon bulunamadı.' using errcode = 'P0002';
  end if;
  -- The live row is not touched: the old version stays published as is.
  update public.pending_content_revisions
  set status = 'rejected', reviewed_at = now(), updated_at = now(), reviewed_by = app_private.current_public_user_id(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_revision_id;
  return jsonb_build_object('success', true, 'revision_id', p_revision_id);
end;
$function$;

create or replace function public.restore_content_revision(p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_source public.pending_content_revisions%rowtype;
  v_current jsonb;
  v_meta jsonb;
  v_restored uuid;
begin
  if not app_private.is_admin() then
    raise exception 'Arşivden geri alma yalnız site yöneticisine açık.' using errcode = '42501';
  end if;
  select * into v_source from public.pending_content_revisions where id = p_revision_id;
  if not found or v_source.status <> 'approved' or v_source.change_action <> 'edit' then
    raise exception 'Arşiv kaydı bulunamadı.' using errcode = 'P0002';
  end if;
  v_current := app_private.content_revision_snapshot(v_source.target_type, v_source.target_id);
  if v_current is null then
    raise exception 'Revizyon hedefi bulunamadı.' using errcode = 'P0002';
  end if;
  -- Bekleyen revizyon varsa geri alma onu gecersiz kilar (baz surum degisiyor).
  update public.pending_content_revisions
  set status = 'rejected', reviewed_at = now(), updated_at = now(), reviewed_by = app_private.current_public_user_id(),
    review_note = 'Arşivden geri alma nedeniyle kapatıldı.'
  where target_type = v_source.target_type and target_id = v_source.target_id
    and status = 'pending' and change_action = 'edit';

  perform app_private.apply_content_revision(v_source.target_type, v_source.target_id, v_current, v_source.before_data);

  -- Studio: the project of the archived version is tied back; if absent (null) the live studio project
  -- archives so the reader language layer does not mismatch restored pages
  -- (20260929180000 trigger; without that migration the key has no effect).
  v_meta := jsonb_build_object('source', 'restore', 'restored_from', v_source.id,
    'project_id', coalesce(v_source.meta->'previous_project_id', 'null'::jsonb));
  insert into public.pending_content_revisions (
    target_type, target_id, fansub_id, requested_by, change_action, before_data, after_data,
    status, reviewed_at, reviewed_by, review_note, meta
  ) values (
    v_source.target_type, v_source.target_id, v_source.fansub_id, app_private.current_public_user_id(), 'edit',
    v_current, v_current || v_source.before_data, 'approved', now(), app_private.current_public_user_id(),
    'Arşivden geri alındı.', v_meta
  ) returning id into v_restored;
  return jsonb_build_object('success', true, 'revision_id', v_restored, 'restored_from', v_source.id);
end;
$function$;

revoke all on function public.approve_content_revision(uuid, text) from public, anon;
revoke all on function public.reject_content_revision(uuid, text) from public, anon;
revoke all on function public.restore_content_revision(uuid) from public, anon;
grant execute on function public.approve_content_revision(uuid, text) to authenticated;
grant execute on function public.reject_content_revision(uuid, text) to authenticated;
grant execute on function public.restore_content_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin list: pending revisions and archive
-- ---------------------------------------------------------------------------
-- pending: a pending change of a published (approved) target. The first record of unapproved content
-- is already listed on its own row in "Pending Approvals".
-- archive: approved changes; before_data = the previous version taken off publish.

create or replace function public.admin_list_content_revisions(p_scope text default 'pending', p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not app_private.can_manage_moderation_state() then
    raise exception 'Yalnız site yöneticisi.' using errcode = '42501';
  end if;
  if p_scope not in ('pending', 'archive') then
    raise exception 'Kapsam geçersiz.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(row_data order by sort_at desc)
    from (
      select
        coalesce(r.reviewed_at, r.created_at) as sort_at,
        jsonb_build_object(
          'id', r.id, 'target_type', r.target_type, 'target_id', r.target_id, 'status', r.status,
          'created_at', r.created_at, 'reviewed_at', r.reviewed_at, 'review_note', r.review_note,
          'before_data', r.before_data, 'after_data', r.after_data, 'meta', r.meta,
          'requested_by', (select u.username from public.users u where u.id = r.requested_by),
          'reviewed_by', (select u.username from public.users u where u.id = r.reviewed_by),
          'fansub_name', (select f.name from public.fansubs f where f.id = r.fansub_id),
          'manga_id', coalesce(m.id, cm.id),
          'manga_title', coalesce(m.title, cm.title),
          'manga_slug', coalesce(m.slug, cm.slug),
          'manga_cover', coalesce(m.cover_image_url, cm.cover_image_url),
          'chapter_number', c.chapter_number,
          'restored', exists (select 1 from public.pending_content_revisions x where x.meta->>'restored_from' = r.id::text)
        ) as row_data
      from public.pending_content_revisions r
      left join public.mangas m on r.target_type = 'manga' and m.id = r.target_id
      left join public.chapters c on r.target_type = 'chapter' and c.id = r.target_id
      left join public.mangas cm on cm.id = c.manga_id
      where r.change_action = 'edit'
        and (
          (p_scope = 'pending' and r.status = 'pending'
            and coalesce(m.is_approved, c.is_approved, false))
          or (p_scope = 'archive' and r.status = 'approved')
        )
      order by coalesce(r.reviewed_at, r.created_at) desc
      limit v_limit
    ) listed
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.admin_list_content_revisions(text, integer) from public, anon;
grant execute on function public.admin_list_content_revisions(text, integer) to authenticated;
