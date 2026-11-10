-- Fansub roles: delegable role management (the rank model of community servers).
-- * New permission: ekip.roller (Manage roles). Fansub admin and site admin always.
-- * Rank: smaller role position = higher. Admin -1; others the smallest of assigned roles.
-- * A delegate edits/deletes/assigns only roles BELOW them, cannot touch own roles,
-- the default role and members above them; can only grant permissions they
-- hold.

create or replace function app_private.fansub_permission_catalog()
returns text[] language sql immutable set search_path = '' as $function$
  select array[
    'panel.erisim', 'panel.mangalar', 'panel.bolumler', 'panel.topluluk', 'panel.duyurular',
    'panel.kredi', 'panel.gorevler', 'panel.ifadeler', 'panel.uyelik', 'panel.istatistik',
    'panel.kasa', 'panel.takviye', 'ekip.roller',
    'ceviri.gor', 'ceviri.proje', 'ceviri.metin', 'ceviri.dizgi', 'ceviri.temizlik',
    'ceviri.kaynak', 'ceviri.yayinla'
  ]::text[];
$function$;

/** Kullanicinin fansubdaki sirasi: admin -1, rolsuz uye 1001. */
create or replace function app_private.fansub_rank(p_fansub_id uuid, p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select case
    when exists (select 1 from public.fansub_members fm where fm.fansub_id = p_fansub_id and fm.user_id = p_user_id and fm.role = 'admin') then -1
    else coalesce((
      select pg_catalog.min(r.position) from public.fansub_member_roles mr
      join public.fansub_roles r on r.id = mr.role_id
      where mr.fansub_id = p_fansub_id and mr.user_id = p_user_id
    ), 1001)
  end;
$function$;

create or replace function app_private.fansub_can_manage_roles(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.is_admin() or app_private.is_fansub_admin(p_fansub_id)
    or (app_private.fansub_can(p_fansub_id, 'panel.erisim') and app_private.fansub_can(p_fansub_id, 'ekip.roller'));
$function$;

revoke all on function app_private.fansub_rank(uuid, uuid) from public;

create or replace function public.list_fansub_roles(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_actor uuid := app_private.current_public_user_id();
  v_owner boolean := app_private.is_admin() or app_private.is_fansub_admin(p_fansub_id);
  v_rank integer;
begin
  if not (app_private.is_admin() or app_private.fansub_can(p_fansub_id, 'panel.erisim')) then
    raise exception 'Bu fansubun rollerini gorme yetkin yok.' using errcode = '42501';
  end if;
  v_rank := case when v_owner then -1 else app_private.fansub_rank(p_fansub_id, v_actor) end;
  return pg_catalog.jsonb_build_object(
    'roles', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'name', r.name, 'color', r.color, 'position', r.position,
        'is_default', r.is_default, 'system_key', r.system_key, 'permissions', pg_catalog.to_jsonb(r.permissions),
        'member_count', (select pg_catalog.count(*) from public.fansub_member_roles mr where mr.role_id = r.id),
        'manageable', v_owner or (not r.is_default and r.position > v_rank
          and not exists (select 1 from public.fansub_member_roles own where own.role_id = r.id and own.user_id = v_actor))
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
    'can_manage', app_private.fansub_can_manage_roles(p_fansub_id),
    'is_owner', v_owner,
    'my_rank', v_rank,
    'my_user_id', v_actor,
    'my_permissions', pg_catalog.to_jsonb(app_private.fansub_permissions(p_fansub_id))
  );
end;
$function$;

create or replace function public.manage_fansub_roles(p_fansub_id uuid, p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := app_private.current_public_user_id();
  v_owner boolean := app_private.is_admin() or app_private.is_fansub_admin(p_fansub_id);
  v_rank integer;
  v_mine text[];
  v_role public.fansub_roles%rowtype;
  v_permissions text[];
  v_position integer;
  v_role_ids uuid[];
  v_final uuid[];
  v_user uuid;
  v_member_role text;
  v_moderator uuid;
begin
  if not app_private.fansub_can_manage_roles(p_fansub_id) then
    raise exception 'Rolleri yönetme iznin yok.' using errcode = '42501';
  end if;
  perform app_private.fansub_seed_roles(p_fansub_id);
  v_rank := case when v_owner then -1 else app_private.fansub_rank(p_fansub_id, v_actor) end;
  v_mine := app_private.fansub_permissions(p_fansub_id);

  if p_action = 'save_role' then
    select coalesce(pg_catalog.array_agg(distinct value order by value), '{}'::text[]) into v_permissions
    from pg_catalog.jsonb_array_elements_text(coalesce(p->'permissions', '[]'::jsonb)) as value;
    if not v_permissions <@ app_private.fansub_permission_catalog() then
      raise exception 'Bilinmeyen izin.' using errcode = 'PT422';
    end if;
    v_position := (p->>'position')::integer;
    if not v_owner then
      if v_position is not null and v_position <= v_rank then
        raise exception 'Rolü kendi sıranın üstüne taşıyamazsın.' using errcode = '42501';
      end if;
    end if;
    if p ? 'id' and nullif(p->>'id', '') is not null then
      select * into v_role from public.fansub_roles where id = (p->>'id')::uuid and fansub_id = p_fansub_id;
      if v_role.id is null then raise exception 'Rol bulunamadı.' using errcode = 'P0002'; end if;
      if not v_owner and (v_role.is_default or v_role.position <= v_rank
        or exists (select 1 from public.fansub_member_roles own where own.role_id = v_role.id and own.user_id = v_actor)) then
        raise exception 'Bu rolü düzenleyemezsin (kendi rolün ya da senden üstte).' using errcode = '42501';
      end if;
      -- A delegate can only add permissions they hold; permissions in the role that they lack
      -- stay as is (can neither add nor remove).
      if not v_owner then
        if exists (select 1 from pg_catalog.unnest(v_permissions) as x where not x = any(v_role.permissions) and not x = any(v_mine)) then
          raise exception 'Yalnız kendinde olan izinleri verebilirsin.' using errcode = '42501';
        end if;
        v_permissions := (select coalesce(pg_catalog.array_agg(distinct x order by x), '{}'::text[]) from (
          select pg_catalog.unnest(v_permissions) as x
          union select perm from pg_catalog.unnest(v_role.permissions) as perm where not perm = any(v_mine)
        ) s);
      end if;
      update public.fansub_roles set
        name = pg_catalog.btrim(coalesce(p->>'name', name)),
        color = case when p ? 'color' then nullif(p->>'color', '') else color end,
        position = case when is_default then 1000 else coalesce(v_position, position) end,
        permissions = v_permissions,
        updated_at = now()
      where id = v_role.id
      returning * into v_role;
    else
      if not v_owner and not v_permissions <@ v_mine then
        raise exception 'Yalnız kendinde olan izinleri verebilirsin.' using errcode = '42501';
      end if;
      if (select pg_catalog.count(*) from public.fansub_roles where fansub_id = p_fansub_id) >= 30 then
        raise exception 'Bir fansubda en fazla 30 rol olabilir.' using errcode = 'PT422';
      end if;
      insert into public.fansub_roles (fansub_id, name, color, position, permissions)
      values (p_fansub_id, pg_catalog.btrim(p->>'name'), nullif(p->>'color', ''),
        coalesce(v_position, pg_catalog.greatest(100, v_rank + 1)), v_permissions)
      returning * into v_role;
    end if;
    insert into public.fansub_audit_logs (fansub_id, actor_user_id, actor_role, action, resource_type, resource_id, summary, metadata)
    values (p_fansub_id, v_actor, case when v_owner then 'admin' else 'role_manager' end, 'fansub_role_saved', 'fansub_role', v_role.id::text,
      'Rol kaydedildi: ' || v_role.name, pg_catalog.jsonb_build_object('permissions', pg_catalog.to_jsonb(v_role.permissions), 'position', v_role.position));
    return pg_catalog.to_jsonb(v_role);

  elsif p_action = 'delete_role' then
    select * into v_role from public.fansub_roles where id = (p->>'id')::uuid and fansub_id = p_fansub_id;
    if v_role.id is null then raise exception 'Rol bulunamadı.' using errcode = 'P0002'; end if;
    if v_role.is_default then raise exception 'Varsayılan rol silinemez.' using errcode = 'PT422'; end if;
    if not v_owner and (v_role.position <= v_rank
      or exists (select 1 from public.fansub_member_roles own where own.role_id = v_role.id and own.user_id = v_actor)) then
      raise exception 'Bu rolü silemezsin (kendi rolün ya da senden üstte).' using errcode = '42501';
    end if;
    if v_role.system_key = 'moderator' then
      update public.fansub_members set role = 'member' where fansub_id = p_fansub_id and role = 'moderator';
    end if;
    delete from public.fansub_roles where id = v_role.id;
    insert into public.fansub_audit_logs (fansub_id, actor_user_id, actor_role, action, resource_type, resource_id, summary, metadata)
    values (p_fansub_id, v_actor, case when v_owner then 'admin' else 'role_manager' end, 'fansub_role_deleted', 'fansub_role', v_role.id::text, 'Rol silindi: ' || v_role.name, '{}'::jsonb);
    return pg_catalog.jsonb_build_object('deleted', v_role.id);

  elsif p_action = 'set_member_roles' then
    v_user := (p->>'user_id')::uuid;
    select role into v_member_role from public.fansub_members where fansub_id = p_fansub_id and user_id = v_user;
    if v_member_role is null then raise exception 'Kullanıcı bu fansubun üyesi değil.' using errcode = 'P0002'; end if;
    if v_member_role = 'admin' then raise exception 'Fansub adminine rol atanmaz; tüm izinlere sahiptir.' using errcode = 'PT422'; end if;
    if not v_owner and (v_user = v_actor or app_private.fansub_rank(p_fansub_id, v_user) <= v_rank) then
      raise exception 'Kendinin ya da senden üstteki bir üyenin rollerini değiştiremezsin.' using errcode = '42501';
    end if;
    select coalesce(pg_catalog.array_agg(distinct value::uuid), '{}'::uuid[]) into v_role_ids
    from pg_catalog.jsonb_array_elements_text(coalesce(p->'role_ids', '[]'::jsonb)) as value;
    if exists (
      select 1 from pg_catalog.unnest(v_role_ids) as rid
      where not exists (select 1 from public.fansub_roles r where r.id = rid and r.fansub_id = p_fansub_id and not r.is_default)
    ) then
      raise exception 'Geçersiz rol.' using errcode = 'PT422';
    end if;
    -- A delegate adds/removes only roles below them; roles above stay as is.
    select coalesce(pg_catalog.array_agg(distinct rid), '{}'::uuid[]) into v_final from (
      select mr.role_id as rid from public.fansub_member_roles mr join public.fansub_roles r on r.id = mr.role_id
      where mr.fansub_id = p_fansub_id and mr.user_id = v_user and not v_owner and r.position <= v_rank
      union
      select rid from pg_catalog.unnest(v_role_ids) as rid join public.fansub_roles r on r.id = rid
      where v_owner or r.position > v_rank
    ) s;
    delete from public.fansub_member_roles where fansub_id = p_fansub_id and user_id = v_user and not (role_id = any(v_final));
    insert into public.fansub_member_roles (fansub_id, user_id, role_id)
    select p_fansub_id, v_user, rid from pg_catalog.unnest(v_final) as rid on conflict do nothing;
    select id into v_moderator from public.fansub_roles where fansub_id = p_fansub_id and system_key = 'moderator';
    update public.fansub_members
      set role = case when v_moderator = any(v_final) then 'moderator' else 'member' end
      where fansub_id = p_fansub_id and user_id = v_user and role <> 'admin'
        and role is distinct from case when v_moderator = any(v_final) then 'moderator' else 'member' end;
    insert into public.fansub_audit_logs (fansub_id, actor_user_id, actor_role, action, resource_type, resource_id, summary, metadata)
    values (p_fansub_id, v_actor, case when v_owner then 'admin' else 'role_manager' end, 'fansub_member_roles_set', 'fansub_member', v_user::text,
      'Üye rolleri güncellendi', pg_catalog.jsonb_build_object('role_ids', pg_catalog.to_jsonb(v_final)));
    return pg_catalog.jsonb_build_object('user_id', v_user, 'role_ids', pg_catalog.to_jsonb(v_final));
  end if;

  raise exception 'Bilinmeyen işlem.' using errcode = 'PT422';
end;
$function$;
