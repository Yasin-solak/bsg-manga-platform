-- Translation Studio V2 is the site admin production area only.
-- Old typesetting records do not move to V2; old tables stay until a separate data cleanup
-- but client roles cannot use them.
begin;

create or replace function app_private.studio_rollout_allowed(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select p_fansub_id is not null and app_private.is_admin();
$function$;

create or replace function app_private.studio_can_project(
  p_project_id uuid, p_write boolean default false
)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.is_admin() and exists (
    select 1 from public.studio_projects project
    where project.id = p_project_id and project.rights_status = 'active'
  );
$function$;

drop policy if exists studio_projects_read on public.studio_projects;
create policy studio_projects_read on public.studio_projects for select to authenticated
  using (app_private.is_admin());

-- No direct table write; the publish right changes only through this compare RPC.
create or replace function app_private.studio_rights_set(p_project_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_project public.studio_projects%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or not app_private.is_admin() then
    raise sqlstate 'PT403' using message = 'Yayın hakkını yalnız site yöneticisi değiştirebilir.';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'revoked') then
    raise sqlstate '22023' using message = 'Yayın hakkı durumu geçersiz.';
  end if;
  select * into v_project from public.studio_projects project
  where project.id = p_project_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Proje bulunamadı.'; end if;
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

-- The old studio UI is removed; no client access to old storage tables remains.
revoke all on public.admin_typeset_works,
  public.admin_typeset_glossary_terms from public, anon, authenticated;

commit;
