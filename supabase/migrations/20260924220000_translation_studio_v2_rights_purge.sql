-- Revoking rights starts a retryable delete of private R2 files tied to the project id.
-- This migration is only local preparation; it does not apply to live data by itself.

create table app_private.studio_purge_targets (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.studio_projects(id) on delete restrict,
  target_kind text not null check (target_kind in ('page', 'publication')),
  target_id uuid not null,
  state text not null default 'pending' check (state in ('pending', 'leased', 'complete')),
  not_before timestamptz not null default now() + interval '15 minutes',
  lease_token uuid,
  lease_until timestamptz,
  first_empty_at timestamptz,
  completed_at timestamptz,
  deleted_count bigint not null default 0 check (deleted_count >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_purge_target_unique unique (project_id, target_kind, target_id),
  constraint studio_purge_lease_check check (
    (state = 'leased' and lease_token is not null and lease_until is not null)
    or (state <> 'leased' and lease_token is null and lease_until is null)
  )
);

create index studio_purge_due_idx on app_private.studio_purge_targets (not_before, id)
  where state in ('pending', 'complete');
create index studio_purge_lease_idx on app_private.studio_purge_targets (lease_until, id)
  where state = 'leased';
alter table app_private.studio_purge_targets enable row level security;
revoke all on app_private.studio_purge_targets from public, anon, authenticated;
grant select on app_private.studio_purge_targets to service_role;

-- Reactivating a revoked project must not race with a leased Worker delete.
create or replace function app_private.studio_project_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.fansub_id is distinct from old.fansub_id
    or new.manga_id is distinct from old.manga_id
    or new.chapter_number is distinct from old.chapter_number
    or new.source_language is distinct from old.source_language then
    raise sqlstate 'PT409' using message = 'Proje kimliği değiştirilemez.';
  end if;
  if old.rights_status = 'revoked' and new.rights_status is distinct from 'revoked' then
    raise sqlstate 'PT409' using message = 'İptal edilen yayın hakkı yeniden açılamaz.';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$function$;

-- The fansub/site admin changes the right through a narrow RPC; on a durable revoke the trigger opens the queue.
create or replace function app_private.studio_rights_set(p_project_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_project public.studio_projects%rowtype;
begin
  if auth.role() is distinct from 'authenticated' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı için giriş gerekiyor.';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'revoked') then
    raise sqlstate '22023' using message = 'Yayın hakkı durumu geçersiz.';
  end if;
  select * into v_project from public.studio_projects project
  where project.id = p_project_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Proje bulunamadı.'; end if;
  if not (app_private.is_admin() or app_private.is_fansub_admin(v_project.fansub_id)) then
    raise sqlstate 'PT403' using message = 'Yayın hakkını değiştirme yetkisi yok.';
  end if;
  if v_project.rights_status = 'revoked' and p_status <> 'revoked' then
    raise sqlstate 'PT409' using message = 'İptal edilen yayın hakkı yeniden açılamaz.';
  end if;
  if v_project.rights_status <> p_status then
    update public.studio_projects set rights_status = p_status
    where id = p_project_id returning * into v_project;
  end if;
  return pg_catalog.jsonb_build_object('project_id', v_project.id,
    'rights_status', v_project.rights_status, 'version', v_project.version);
end;
$function$;

create or replace function public.studio_rights_set(p_project_id uuid, p_status text)
returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_rights_set(p_project_id, p_status);
$function$;

revoke all on function app_private.studio_rights_set(uuid, text),
  public.studio_rights_set(uuid, text) from public, anon, authenticated;
grant execute on function app_private.studio_rights_set(uuid, text),
  public.studio_rights_set(uuid, text) to authenticated;

create or replace function app_private.studio_purge_queue_on_revoke()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if old.rights_status = 'revoked' or new.rights_status <> 'revoked' then return null; end if;

  insert into app_private.studio_purge_targets as target
    (project_id, target_kind, target_id, not_before)
  select new.id, 'page', page.id, now() + interval '15 minutes'
  from public.studio_pages page where page.project_id = new.id
  on conflict (project_id, target_kind, target_id) do update
    set state = 'pending', not_before = greatest(
          excluded.not_before, target.not_before),
        lease_token = null, lease_until = null, first_empty_at = null,
        completed_at = null, updated_at = now();

  insert into app_private.studio_purge_targets as target
    (project_id, target_kind, target_id, not_before)
  select new.id, 'publication', publication.id, now() + interval '15 minutes'
  from public.studio_publications publication where publication.project_id = new.id
  on conflict (project_id, target_kind, target_id) do update
    set state = 'pending', not_before = greatest(
          excluded.not_before, target.not_before),
        lease_token = null, lease_until = null, first_empty_at = null,
        completed_at = null, updated_at = now();

  -- Only a chapter still carrying its own V2 proxy pages leaves the visible catalog.
  update public.chapters chapter set is_active = false, is_approved = false
  where chapter.manga_id = new.manga_id and chapter.fansub_id = new.fansub_id
    and chapter.chapter_number = new.chapter_number
    and (chapter.is_active or chapter.is_approved)
    and exists (
      select 1 from public.studio_publications publication
      where publication.project_id = new.id and publication.chapter_id = chapter.id
        and publication.status = 'published'
        and chapter.pages = app_private.studio_proxy_pages(
          publication.id, publication.manifest)
    );
  return null;
end;
$function$;

create trigger studio_purge_project_revoked
after update of rights_status on public.studio_projects
for each row execute function app_private.studio_purge_queue_on_revoke();

-- The general moderation guard only allows a revoked V2 publish to close.
create or replace function public.enforce_chapter_approval_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if public.can_manage_moderation_state() then return new; end if;
  if tg_op = 'INSERT' and coalesce(new.is_approved, false) then
    raise exception 'Bolum onay durumunu yalniz admin true yapabilir.';
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(old.is_approved, false) then
      if new.is_approved = false and new.is_active = false
        and pg_catalog.to_jsonb(new) - 'is_active' - 'is_approved' - 'updated_at'
          = pg_catalog.to_jsonb(old) - 'is_active' - 'is_approved' - 'updated_at'
        and exists (
          select 1 from public.studio_publications publication
          join public.studio_projects project on project.id = publication.project_id
          where publication.chapter_id = old.id and publication.status = 'published'
            and project.rights_status = 'revoked'
            and project.manga_id = old.manga_id
            and project.fansub_id = old.fansub_id
            and project.chapter_number = old.chapter_number
            and old.pages = app_private.studio_proxy_pages(
              publication.id, publication.manifest)
        ) then return new; end if;
      raise exception 'Onayli bolumu yalniz admin guncelleyebilir.';
    end if;
    if old.is_approved is distinct from new.is_approved then
      raise exception 'Bolum onay durumunu yalniz admin degistirebilir.';
    end if;
  end if;
  return new;
end;
$function$;

-- Child creation serializes on the same project row as the revoke transaction.
create or replace function app_private.studio_purge_child_insert_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_rights text;
begin
  if exists (select 1 from app_private.studio_purge_targets target
      where target.target_kind = case when tg_table_name = 'studio_pages'
        then 'page' else 'publication' end
        and target.target_id = new.id and target.project_id <> new.project_id) then
    raise sqlstate 'PT409' using message = 'Özel görsel kimliği başka projede kullanılmış.';
  end if;
  select project.rights_status into v_rights from public.studio_projects project
  where project.id = new.project_id for update;
  if v_rights is distinct from 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  return new;
end;
$function$;

create trigger studio_purge_page_insert_guard before insert on public.studio_pages
for each row execute function app_private.studio_purge_child_insert_guard();
create trigger studio_purge_publication_insert_guard before insert on public.studio_publications
for each row execute function app_private.studio_purge_child_insert_guard();

-- A deleted page or old draft also stays tracked by its own UUID prefix.
create or replace function app_private.studio_purge_queue_child_delete()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  insert into app_private.studio_purge_targets (project_id, target_kind, target_id)
  values (old.project_id,
    case when tg_table_name = 'studio_pages' then 'page' else 'publication' end, old.id)
  on conflict (project_id, target_kind, target_id) do nothing;
  return null;
end;
$function$;

create trigger studio_purge_page_deleted after delete on public.studio_pages
for each row execute function app_private.studio_purge_queue_child_delete();
create trigger studio_purge_publication_deleted after delete on public.studio_publications
for each row execute function app_private.studio_purge_queue_child_delete();

-- A tombstone project keeps the daily R2 check of old uploads finishing late.
create or replace function app_private.studio_purge_project_delete_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if exists (select 1 from public.studio_pages page
      where page.project_id = old.id)
    or exists (select 1 from public.studio_publications publication
      where publication.project_id = old.id)
    or exists (select 1 from app_private.studio_purge_targets target
      where target.project_id = old.id) then
    raise sqlstate 'PT409' using message = 'Özel görsel denetimi süren proje kaldırılamaz.';
  end if;
  return old;
end;
$function$;

create trigger studio_purge_project_delete_guard before delete on public.studio_projects
for each row execute function app_private.studio_purge_project_delete_guard();

-- Dry-run shows the really next targets without changing a lease or timestamp.
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
    where project.rights_status = 'revoked'
      and ((target.state in ('pending', 'complete') and target.not_before <= now())
        or (target.state = 'leased' and target.lease_until <= now()))
    order by target.not_before, target.id limit p_limit
  ) due;
  return pg_catalog.jsonb_build_object('state', 'preview', 'targets', v_targets);
end;
$function$;

-- Identity and prefix are produced only by the DB. If the lease runs out the job is retaken.
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
  where project.rights_status = 'revoked'
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
  if not exists (select 1 from public.studio_projects project
      where project.id = v_target.project_id and project.rights_status = 'revoked') then
    raise sqlstate 'PT403' using message = 'Proje hakkı iptal edilmemiş.';
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

create or replace function app_private.studio_purge_fail(
  p_target_id bigint, p_attempt_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_target app_private.studio_purge_targets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Temizlik yalnız sunucu işlemidir.';
  end if;
  select * into v_target from app_private.studio_purge_targets target
  where target.id = p_target_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Temizlik hedefi bulunamadı.'; end if;
  if v_target.state <> 'leased' or v_target.lease_token is distinct from p_attempt_token then
    raise sqlstate 'PT409' using message = 'Temizlik kirası artık geçerli değil.';
  end if;
  update app_private.studio_purge_targets target
  set state = 'pending', not_before = now() + interval '5 minutes',
    lease_token = null, lease_until = null, last_error_at = now(), updated_at = now()
  where target.id = p_target_id;
  return pg_catalog.jsonb_build_object('state', 'pending', 'id', p_target_id);
end;
$function$;

create or replace function public.studio_purge_claim()
returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_purge_claim();
$function$;
create or replace function public.studio_purge_preview(p_limit integer default 4)
returns jsonb language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_purge_preview(p_limit);
$function$;
create or replace function public.studio_purge_finish(
  p_target_id bigint, p_attempt_token uuid, p_deleted_count integer, p_had_objects boolean
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_purge_finish(p_target_id, p_attempt_token,
    p_deleted_count, p_had_objects);
$function$;
create or replace function public.studio_purge_fail(p_target_id bigint, p_attempt_token uuid)
returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_purge_fail(p_target_id, p_attempt_token);
$function$;

revoke all on function app_private.studio_purge_preview(integer),
  app_private.studio_purge_claim(),
  app_private.studio_purge_finish(bigint, uuid, integer, boolean),
  app_private.studio_purge_fail(bigint, uuid), public.studio_purge_preview(integer),
  public.studio_purge_claim(),
  public.studio_purge_finish(bigint, uuid, integer, boolean),
  public.studio_purge_fail(bigint, uuid) from public, anon, authenticated;
grant execute on function app_private.studio_purge_preview(integer),
  app_private.studio_purge_claim(),
  app_private.studio_purge_finish(bigint, uuid, integer, boolean),
  app_private.studio_purge_fail(bigint, uuid), public.studio_purge_preview(integer),
  public.studio_purge_claim(),
  public.studio_purge_finish(bigint, uuid, integer, boolean),
  public.studio_purge_fail(bigint, uuid) to service_role;
