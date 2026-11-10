-- Fansub role and permission system (the fansub equivalent of the community server model).
-- The fansub admin creates roles, gives permissions to each role and assigns roles to members.
-- * admin (fansub_members.role = 'admin') has every permission, no role assigned.
-- * The default "Uye" role (is_default) applies to all members automatically.
-- * The old "moderator" role moves to the "Moderator" role with the same rights
-- (system_key = 'moderator'); the old column stays in sync with this role.
-- * app_private.is_fansub_staff now looks at the 'panel.erisim' permission: existing
-- moderator behavior does not change, an admin can take this permission from the role.

create or replace function app_private.fansub_permission_catalog()
returns text[] language sql immutable set search_path = '' as $function$
  select array[
    'panel.erisim', 'panel.mangalar', 'panel.bolumler', 'panel.topluluk', 'panel.duyurular',
    'panel.kredi', 'panel.gorevler', 'panel.ifadeler', 'panel.uyelik', 'panel.istatistik',
    'panel.kasa', 'panel.takviye',
    'ceviri.gor', 'ceviri.proje', 'ceviri.metin', 'ceviri.dizgi', 'ceviri.temizlik',
    'ceviri.kaynak', 'ceviri.yayinla'
  ]::text[];
$function$;

create table public.fansub_roles (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 40),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 100 check (position between 0 and 1000),
  is_default boolean not null default false,
  system_key text check (system_key in ('member', 'moderator')),
  permissions text[] not null default '{}'::text[]
    check (permissions <@ app_private.fansub_permission_catalog()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fansub_roles_name_unique unique (fansub_id, name),
  constraint fansub_roles_default_is_member check (is_default = (system_key is not distinct from 'member'))
);

create unique index fansub_roles_default_unique on public.fansub_roles (fansub_id) where is_default;
create unique index fansub_roles_system_unique on public.fansub_roles (fansub_id, system_key) where system_key is not null;
create index fansub_roles_fansub_idx on public.fansub_roles (fansub_id, position);

create table public.fansub_member_roles (
  fansub_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.fansub_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id),
  foreign key (fansub_id, user_id) references public.fansub_members(fansub_id, user_id) on delete cascade
);

create index fansub_member_roles_member_idx on public.fansub_member_roles (fansub_id, user_id);
create index fansub_member_roles_role_idx on public.fansub_member_roles (role_id);

-- Role and assignment must belong to the same fansub; the default role is not assigned (applies to all anyway).
create or replace function app_private.fansub_member_roles_guard()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_role public.fansub_roles%rowtype;
begin
  select * into v_role from public.fansub_roles where id = new.role_id;
  if v_role.fansub_id is distinct from new.fansub_id then
    raise exception 'Rol bu fansuba ait degil.' using errcode = 'PT422';
  end if;
  if v_role.is_default then
    raise exception 'Varsayilan rol atanamaz.' using errcode = 'PT422';
  end if;
  return new;
end;
$function$;

create trigger fansub_member_roles_guard before insert or update on public.fansub_member_roles
  for each row execute function app_private.fansub_member_roles_guard();

alter table public.fansub_roles enable row level security;
alter table public.fansub_member_roles enable row level security;
revoke all on public.fansub_roles from anon, authenticated;
revoke all on public.fansub_member_roles from anon, authenticated;
-- Reads and writes only with RPCs below (same pattern as community servers).

-- ---------------------------------------------------------------------------
-- Izin cozumleme
-- ---------------------------------------------------------------------------

create or replace function app_private.fansub_user_permissions(p_fansub_id uuid, p_user_id uuid)
returns text[] language sql stable security definer set search_path = '' as $function$
  select case
    when p_user_id is null or p_fansub_id is null then '{}'::text[]
    when exists (
      select 1 from public.fansub_members fm join public.fansubs f on f.id = fm.fansub_id
      where fm.fansub_id = p_fansub_id and fm.user_id = p_user_id and fm.role = 'admin' and f.is_active
    ) then app_private.fansub_permission_catalog()
    when not exists (
      select 1 from public.fansub_members fm join public.fansubs f on f.id = fm.fansub_id
      where fm.fansub_id = p_fansub_id and fm.user_id = p_user_id and f.is_active
    ) then '{}'::text[]
    else coalesce((
      select pg_catalog.array_agg(distinct perm order by perm)
      from public.fansub_roles r
      cross join lateral pg_catalog.unnest(r.permissions) as perm
      where r.fansub_id = p_fansub_id
        and (r.is_default or exists (
          select 1 from public.fansub_member_roles mr where mr.role_id = r.id and mr.user_id = p_user_id
        ))
    ), '{}'::text[])
  end;
$function$;

/** Oturumdaki kullanicinin izinleri; site admini her izne sahiptir. */
create or replace function app_private.fansub_permissions(p_fansub_id uuid)
returns text[] language sql stable security definer set search_path = '' as $function$
  select case
    when app_private.is_admin() then app_private.fansub_permission_catalog()
    else app_private.fansub_user_permissions(p_fansub_id, app_private.current_public_user_id())
  end;
$function$;

create or replace function app_private.fansub_can(p_fansub_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select p_permission = any(app_private.fansub_permissions(p_fansub_id));
$function$;

-- The old "staff" check (admin + moderator) is now the panel access permission.
create or replace function app_private.is_fansub_staff(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = 'public' as $function$
  select 'panel.erisim' = any(app_private.fansub_user_permissions(p_fansub_id, app_private.current_public_user_id()));
$function$;

create or replace function app_private.is_fansub_staff_from_jwt(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = 'public', 'auth' as $function$
  select 'panel.erisim' = any(app_private.fansub_user_permissions(p_fansub_id, app_private.current_public_user_id_from_jwt()));
$function$;

-- ---------------------------------------------------------------------------
-- Old moderator column <-> Moderator role sync
-- ---------------------------------------------------------------------------

create or replace function app_private.fansub_seed_roles(p_fansub_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.fansub_roles (fansub_id, name, color, position, is_default, system_key, permissions)
  values (p_fansub_id, 'Üye', null, 1000, true, 'member', '{}'::text[])
  on conflict do nothing;
  insert into public.fansub_roles (fansub_id, name, color, position, is_default, system_key, permissions)
  values (
    p_fansub_id, 'Moderatör', '#5b8def', 10, false, 'moderator',
    array[
      'panel.erisim', 'panel.mangalar', 'panel.bolumler', 'panel.topluluk', 'panel.duyurular',
      'panel.kredi', 'panel.gorevler', 'panel.ifadeler', 'panel.uyelik', 'panel.istatistik',
      'panel.kasa', 'panel.takviye',
      'ceviri.gor', 'ceviri.proje', 'ceviri.metin', 'ceviri.dizgi', 'ceviri.temizlik', 'ceviri.kaynak'
    ]::text[]
  )
  on conflict do nothing;
end;
$function$;

create or replace function app_private.fansub_roles_after_fansub_insert()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform app_private.fansub_seed_roles(new.id);
  return new;
end;
$function$;

create trigger fansub_roles_seed after insert on public.fansubs
  for each row execute function app_private.fansub_roles_after_fansub_insert();

-- A member becoming moderator by invite or the old role picker gets the Moderator role; loses it when taken back.
create or replace function app_private.fansub_members_sync_legacy_role()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.fansub_roles where fansub_id = new.fansub_id and system_key = 'moderator';
  if v_role_id is null then return new; end if;
  if new.role = 'moderator' then
    insert into public.fansub_member_roles (fansub_id, user_id, role_id)
    values (new.fansub_id, new.user_id, v_role_id) on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.role = 'moderator' then
    delete from public.fansub_member_roles where user_id = new.user_id and role_id = v_role_id;
  end if;
  return new;
end;
$function$;

create trigger fansub_members_sync_legacy_role after insert or update of role on public.fansub_members
  for each row execute function app_private.fansub_members_sync_legacy_role();

-- Existing fansubs and moderators.
select app_private.fansub_seed_roles(f.id) from public.fansubs f;
insert into public.fansub_member_roles (fansub_id, user_id, role_id)
select fm.fansub_id, fm.user_id, r.id
from public.fansub_members fm
join public.fansub_roles r on r.fansub_id = fm.fansub_id and r.system_key = 'moderator'
where fm.role = 'moderator'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RPC'ler
-- ---------------------------------------------------------------------------

create or replace function public.get_my_fansub_permissions(p_fansub_id uuid)
returns text[] language sql stable security definer set search_path = '' as $function$
  select app_private.fansub_permissions(p_fansub_id);
$function$;

create or replace function public.fansub_can(p_fansub_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.fansub_can(p_fansub_id, p_permission);
$function$;

/** Roller ve atamalar: panel erisimi olan herkes gorur (uyelik ekrani rozetleri icin). */
create or replace function public.list_fansub_roles(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (app_private.is_admin() or app_private.fansub_can(p_fansub_id, 'panel.erisim')) then
    raise exception 'Bu fansubun rollerini gorme yetkin yok.' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'roles', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'name', r.name, 'color', r.color, 'position', r.position,
        'is_default', r.is_default, 'system_key', r.system_key, 'permissions', pg_catalog.to_jsonb(r.permissions),
        'member_count', (select pg_catalog.count(*) from public.fansub_member_roles mr where mr.role_id = r.id)
      ) order by r.position, r.name)
      from public.fansub_roles r where r.fansub_id = p_fansub_id
    ), '[]'::jsonb),
    'assignments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', a.user_id, 'role_ids', a.role_ids))
      from (
        select mr.user_id, pg_catalog.jsonb_agg(mr.role_id) as role_ids
        from public.fansub_member_roles mr where mr.fansub_id = p_fansub_id group by mr.user_id
      ) a
    ), '[]'::jsonb),
    'catalog', pg_catalog.to_jsonb(app_private.fansub_permission_catalog()),
    'can_manage', app_private.is_admin() or app_private.is_fansub_admin(p_fansub_id)
  );
end;
$function$;

/**
 * Rol yonetimi (yalniz fansub admini ve site admini):
 *   save_role        {id?, name, color?, position?, permissions[]}
 *   delete_role      {id}
 *   set_member_roles {user_id, role_ids[]}
 */
create or replace function public.manage_fansub_roles(p_fansub_id uuid, p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := app_private.current_public_user_id();
  v_role public.fansub_roles%rowtype;
  v_permissions text[];
  v_role_ids uuid[];
  v_user uuid;
  v_member_role text;
  v_moderator uuid;
begin
  if not (app_private.is_admin() or app_private.is_fansub_admin(p_fansub_id)) then
    raise exception 'Rolleri yalnız fansub admini yönetebilir.' using errcode = '42501';
  end if;
  perform app_private.fansub_seed_roles(p_fansub_id);

  if p_action = 'save_role' then
    select coalesce(pg_catalog.array_agg(distinct value order by value), '{}'::text[]) into v_permissions
    from pg_catalog.jsonb_array_elements_text(coalesce(p->'permissions', '[]'::jsonb)) as value;
    if not v_permissions <@ app_private.fansub_permission_catalog() then
      raise exception 'Bilinmeyen izin.' using errcode = 'PT422';
    end if;
    if p ? 'id' and nullif(p->>'id', '') is not null then
      update public.fansub_roles set
        name = pg_catalog.btrim(coalesce(p->>'name', name)),
        color = case when p ? 'color' then nullif(p->>'color', '') else color end,
        position = case when is_default then 1000 else coalesce((p->>'position')::integer, position) end,
        permissions = v_permissions,
        updated_at = now()
      where id = (p->>'id')::uuid and fansub_id = p_fansub_id
      returning * into v_role;
      if v_role.id is null then raise exception 'Rol bulunamadı.' using errcode = 'P0002'; end if;
    else
      if (select pg_catalog.count(*) from public.fansub_roles where fansub_id = p_fansub_id) >= 30 then
        raise exception 'Bir fansubda en fazla 30 rol olabilir.' using errcode = 'PT422';
      end if;
      insert into public.fansub_roles (fansub_id, name, color, position, permissions)
      values (p_fansub_id, pg_catalog.btrim(p->>'name'), nullif(p->>'color', ''), coalesce((p->>'position')::integer, 100), v_permissions)
      returning * into v_role;
    end if;
    insert into public.fansub_audit_logs (fansub_id, actor_user_id, actor_role, action, resource_type, resource_id, summary, metadata)
    values (p_fansub_id, v_actor, 'admin', 'fansub_role_saved', 'fansub_role', v_role.id::text,
      'Rol kaydedildi: ' || v_role.name, pg_catalog.jsonb_build_object('permissions', pg_catalog.to_jsonb(v_role.permissions)));
    return pg_catalog.to_jsonb(v_role);

  elsif p_action = 'delete_role' then
    select * into v_role from public.fansub_roles where id = (p->>'id')::uuid and fansub_id = p_fansub_id;
    if v_role.id is null then raise exception 'Rol bulunamadı.' using errcode = 'P0002'; end if;
    if v_role.is_default then raise exception 'Varsayılan rol silinemez.' using errcode = 'PT422'; end if;
    if v_role.system_key = 'moderator' then
      update public.fansub_members set role = 'member' where fansub_id = p_fansub_id and role = 'moderator';
    end if;
    delete from public.fansub_roles where id = v_role.id;
    insert into public.fansub_audit_logs (fansub_id, actor_user_id, actor_role, action, resource_type, resource_id, summary, metadata)
    values (p_fansub_id, v_actor, 'admin', 'fansub_role_deleted', 'fansub_role', v_role.id::text, 'Rol silindi: ' || v_role.name, '{}'::jsonb);
    return pg_catalog.jsonb_build_object('deleted', v_role.id);

  elsif p_action = 'set_member_roles' then
    v_user := (p->>'user_id')::uuid;
    select role into v_member_role from public.fansub_members where fansub_id = p_fansub_id and user_id = v_user;
    if v_member_role is null then raise exception 'Kullanıcı bu fansubun üyesi değil.' using errcode = 'P0002'; end if;
    if v_member_role = 'admin' then raise exception 'Fansub adminine rol atanmaz; tüm izinlere sahiptir.' using errcode = 'PT422'; end if;
    select coalesce(pg_catalog.array_agg(distinct value::uuid), '{}'::uuid[]) into v_role_ids
    from pg_catalog.jsonb_array_elements_text(coalesce(p->'role_ids', '[]'::jsonb)) as value;
    if exists (
      select 1 from pg_catalog.unnest(v_role_ids) as rid
      where not exists (select 1 from public.fansub_roles r where r.id = rid and r.fansub_id = p_fansub_id and not r.is_default)
    ) then
      raise exception 'Geçersiz rol.' using errcode = 'PT422';
    end if;
    delete from public.fansub_member_roles where fansub_id = p_fansub_id and user_id = v_user and not (role_id = any(v_role_ids));
    insert into public.fansub_member_roles (fansub_id, user_id, role_id)
    select p_fansub_id, v_user, rid from pg_catalog.unnest(v_role_ids) as rid on conflict do nothing;
    -- The old column follows the Moderator role (other screens still read the "moderator" label).
    select id into v_moderator from public.fansub_roles where fansub_id = p_fansub_id and system_key = 'moderator';
    update public.fansub_members
      set role = case when v_moderator = any(v_role_ids) then 'moderator' else 'member' end
      where fansub_id = p_fansub_id and user_id = v_user and role <> 'admin'
        and role is distinct from case when v_moderator = any(v_role_ids) then 'moderator' else 'member' end;
    insert into public.fansub_audit_logs (fansub_id, actor_user_id, actor_role, action, resource_type, resource_id, summary, metadata)
    values (p_fansub_id, v_actor, 'admin', 'fansub_member_roles_set', 'fansub_member', v_user::text,
      'Üye rolleri güncellendi', pg_catalog.jsonb_build_object('role_ids', pg_catalog.to_jsonb(v_role_ids)));
    return pg_catalog.jsonb_build_object('user_id', v_user, 'role_ids', pg_catalog.to_jsonb(v_role_ids));
  end if;

  raise exception 'Bilinmeyen işlem.' using errcode = 'PT422';
end;
$function$;

revoke all on function public.get_my_fansub_permissions(uuid) from public;
revoke all on function public.fansub_can(uuid, text) from public;
revoke all on function public.list_fansub_roles(uuid) from public;
revoke all on function public.manage_fansub_roles(uuid, text, jsonb) from public;
grant execute on function public.get_my_fansub_permissions(uuid) to authenticated;
grant execute on function public.fansub_can(uuid, text) to authenticated;
grant execute on function public.list_fansub_roles(uuid) to authenticated;
grant execute on function public.manage_fansub_roles(uuid, text, jsonb) to authenticated;

revoke all on function app_private.fansub_user_permissions(uuid, uuid) from public;
revoke all on function app_private.fansub_seed_roles(uuid) from public;
