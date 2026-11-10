-- The permission union does not change; rank only sets the limit of the target to manage.
create function community_v2.permission_catalog() returns text[]
language sql immutable set search_path='' as $$
  select array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban','roles.create','roles.appearance.manage',
    'roles.permissions.manage','roles.order.manage','roles.assign','roles.delete',
    'channels.create','channels.manage','channels.permissions.manage','channels.archive']::text[];
$$;
revoke all on function community_v2.permission_catalog() from public,anon,authenticated;
alter table community_v2.roles drop constraint roles_permissions_check;
alter table community_v2.roles add constraint roles_permissions_check
  check (permissions <@ community_v2.permission_catalog());
alter table community_v2.roles add column version integer not null default 1;
alter table community_v2.channels add column version integer not null default 1;
alter table community_v2.channels add column category text not null default '' check(char_length(category)<=60);
alter table community_v2.channels add column archived_at timestamptz;
alter table community_v2.audit add column details jsonb not null default '{}'::jsonb;
-- Even with roles of a banned member removed a lower officer cannot lift the ban.
alter table community_v2.members add column protected_rank integer;

create function community_v2.rank_of(s uuid,u uuid) returns integer
language sql stable security definer set search_path='' as $$
  select case when community_v2.is_owner(s,u) then -1 else coalesce((
    select min(r.position) from community_v2.member_roles mr join community_v2.roles r
      on r.server_id=mr.server_id and r.id=mr.role_id
    where mr.server_id=s and mr.user_id=u and not r.is_default),
    (select protected_rank from community_v2.members where server_id=s and user_id=u and state='banned'),1001) end;
$$;
create function community_v2.outranks_member(s uuid,u uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select community_v2.is_member(s,u) and u<>target
    and not exists(select 1 from community_v2.servers where id=s and owner_id=target)
    and exists(select 1 from community_v2.members where server_id=s and user_id=target)
    and (community_v2.is_owner(s,u) or community_v2.rank_of(s,u)<community_v2.rank_of(s,target));
$$;
create function community_v2.can_manage_role(s uuid,u uuid,r uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select community_v2.is_member(s,u) and exists(select 1 from community_v2.roles role
    where role.server_id=s and role.id=r and (community_v2.is_owner(s,u) or
      (not role.is_default and role.position>community_v2.rank_of(s,u)
       and not exists(select 1 from community_v2.member_roles where server_id=s and user_id=u and role_id=r))));
$$;
create function community_v2.can_delegate_role(s uuid,u uuid,r uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select community_v2.can_manage_role(s,u,r) and (community_v2.is_owner(s,u) or not exists(
    select 1 from community_v2.roles role cross join lateral unnest(role.permissions)p
    where role.id=r and not community_v2.has_permission(s,u,p)));
$$;
revoke all on function community_v2.rank_of(uuid,uuid),community_v2.outranks_member(uuid,uuid,uuid),
  community_v2.can_manage_role(uuid,uuid,uuid),community_v2.can_delegate_role(uuid,uuid,uuid)
  from public,anon,authenticated;

create function community_v2.manage_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); s uuid:=(p->>'server_id')::uuid;
  r uuid:=nullif(p->>'role_id','')::uuid; c uuid:=nullif(p->>'channel_id','')::uuid;
  target uuid:=nullif(p->>'user_id','')::uuid; owner boolean; actor_rank integer;
  old_role community_v2.roles; old_channel community_v2.channels;
  perms text[]; ids uuid[]; old_ids uuid[]; changed_ids uuid[];
  namev text; colorv text; pos integer; topicv text; categoryv text; privatev boolean;
  action_permission text; new_version integer; ident uuid; detailsv jsonb:='{}';
begin
  -- All management operations take the same server lock; no operation races through an old role.
  perform 1 from community_v2.servers where id=s for update;
  if not found or not community_v2.is_member(s,u) then
    raise exception 'Bu sunucuya erişimin yok.' using errcode='42501';
  end if;
  owner:=community_v2.is_owner(s,u); actor_rank:=community_v2.rank_of(s,u);
  if not owner and exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then
    raise exception 'Yazma kısıtlaman sırasında yönetim işlemi yapamazsın.' using errcode='42501';
  end if;

  if p_action='save_role' then
    namev:=btrim(p->>'name'); colorv:=p->>'color'; pos:=(p->>'position')::integer;
    select coalesce(array_agg(distinct value order by value),'{}') into perms from jsonb_array_elements_text(p->'permissions');
    if perms is null or not perms <@ community_v2.permission_catalog() then raise exception 'Geçersiz rol izni.'; end if;
    if not owner and (pos<=actor_rank or exists(select 1 from unnest(perms)k where not community_v2.has_permission(s,u,k))) then
      raise exception 'Kendi rolünün altında kalmalı ve yalnız sahip olduğun izinleri vermelisin.' using errcode='42501';
    end if;
    if r is null then
      if not community_v2.has_permission(s,u,'roles.create') then raise exception 'Rol oluşturma iznin yok.' using errcode='42501'; end if;
      if (select count(*) from community_v2.roles where server_id=s)>=50 then raise exception 'En fazla 50 rol oluşturabilirsin.'; end if;
      insert into community_v2.roles(server_id,name,color,position,permissions) values(s,namev,colorv,pos,perms) returning id,version into r,new_version;
      detailsv:=jsonb_build_object('label',namev,'after',jsonb_build_object('permissions',perms,'position',pos,'color',colorv));
    else
      select * into old_role from community_v2.roles where id=r and server_id=s;
      if not found or not community_v2.can_delegate_role(s,u,r) then raise exception 'Bu rolü yönetemezsin; eşit, üst ve kendi rollerin korunur.' using errcode='42501'; end if;
      if not exists(select 1 from unnest(array['roles.appearance.manage','roles.permissions.manage','roles.order.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Rol düzenleme iznin yok.' using errcode='42501'; end if;
      if p ? 'version' and (p->>'version')::integer<>old_role.version then raise exception 'Bu rol başka bir işlemle değişti. Rolü yeniden açıp tekrar dene.'; end if;
      if (namev is distinct from old_role.name or colorv is distinct from old_role.color) and not community_v2.has_permission(s,u,'roles.appearance.manage') then raise exception 'Rol görünümünü değiştirme iznin yok.' using errcode='42501'; end if;
      if pos is distinct from old_role.position and not community_v2.has_permission(s,u,'roles.order.manage') then raise exception 'Rol sırasını değiştirme iznin yok.' using errcode='42501'; end if;
      if not (perms @> old_role.permissions and perms <@ old_role.permissions) and not community_v2.has_permission(s,u,'roles.permissions.manage') then raise exception 'Rol izinlerini değiştirme iznin yok.' using errcode='42501'; end if;
      update community_v2.roles set name=namev,color=colorv,position=pos,permissions=perms,version=version+1 where id=r returning version into new_version;
      detailsv:=jsonb_build_object('label',namev,'before',jsonb_build_object('permissions',old_role.permissions,'position',old_role.position,'color',old_role.color,'name',old_role.name),'after',jsonb_build_object('permissions',perms,'position',pos,'color',colorv,'name',namev));
    end if;
    ident:=r;
  elsif p_action='delete_role' then
    select * into old_role from community_v2.roles where id=r and server_id=s;
    if not found or old_role.is_default or not community_v2.can_delegate_role(s,u,r) or not community_v2.has_permission(s,u,'roles.delete') then
      raise exception 'Bu rolü silme iznin yok.' using errcode='42501';
    end if;
    if p ? 'version' and (p->>'version')::integer<>old_role.version then raise exception 'Rol değişti. Yeniden açıp tekrar dene.'; end if;
    detailsv:=jsonb_build_object('label',old_role.name,'before',to_jsonb(old_role));
    delete from community_v2.roles where id=r; ident:=r;
  elsif p_action='assign_roles' then
    if not community_v2.has_permission(s,u,'roles.assign') or (not owner and not community_v2.outranks_member(s,u,target)) then
      raise exception 'Yalnız kendi seviyenin altındaki üyelerin rollerini değiştirebilirsin.' using errcode='42501';
    end if;
    if not exists(select 1 from community_v2.members where server_id=s and user_id=target and state='active') then raise exception 'Aktif üye bulunamadı.'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(p->'role_ids');
    select coalesce(array_agg(role_id),'{}') into old_ids from community_v2.member_roles where server_id=s and user_id=target;
    if p ? 'expected_role_ids' and exists(
      select 1 from ((select value::uuid from jsonb_array_elements_text(p->'expected_role_ids') except select unnest(old_ids))
      union (select unnest(old_ids) except select value::uuid from jsonb_array_elements_text(p->'expected_role_ids'))) difference) then
      raise exception 'Üyenin rolleri değişti. Güncel rolleri açıp tekrar dene.';
    end if;
    if exists(select 1 from unnest(ids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s and not is_default)) then raise exception 'Roller bu sunucuya ait olmalı.'; end if;
    select coalesce(array_agg(v),'{}') into changed_ids from (
      (select unnest(ids) except select unnest(old_ids)) union (select unnest(old_ids) except select unnest(ids))) changed(v);
    if not owner and exists(select 1 from unnest(changed_ids)v where not community_v2.can_delegate_role(s,u,v)) then
      raise exception 'Kendi seviyenin altında ve izinlerinin kapsamında kalan rolleri verebilir veya kaldırabilirsin.' using errcode='42501';
    end if;
    delete from community_v2.member_roles where server_id=s and user_id=target;
    insert into community_v2.member_roles select s,target,v from unnest(ids)v;
    ident:=target; detailsv:=jsonb_build_object('label',(select username from public.users where id=target),'before',to_jsonb(old_ids),'after',to_jsonb(ids));
  elsif p_action in ('save_channel','archive_channel') then
    if c is not null then
      select * into old_channel from community_v2.channels where id=c and server_id=s;
      if not found or not community_v2.can_view(c,u) then raise exception 'Bu kanalı yönetemezsin.' using errcode='42501'; end if;
      if p ? 'version' and (p->>'version')::integer<>old_channel.version then raise exception 'Kanal başka bir işlemle değişti. Yeniden açıp tekrar dene.'; end if;
      select coalesce(array_agg(role_id order by role_id),'{}') into old_ids from community_v2.channel_roles where channel_id=c;
    end if;
    if p_action='archive_channel' then
      if c is null or not community_v2.has_permission(s,u,'channels.archive') then raise exception 'Kanal arşivleme iznin yok.' using errcode='42501'; end if;
      if p->>'archived' is null then raise exception 'Arşiv durumu gerekli.'; end if;
      update community_v2.channels set archived_at=case when (p->>'archived')::boolean then coalesce(archived_at,now()) else null end,version=version+1 where id=c returning version into new_version;
      detailsv:=jsonb_build_object('label',old_channel.name,'archived',(p->>'archived')::boolean);
    else
      namev:=btrim(p->>'name'); topicv:=coalesce(p->>'topic',''); categoryv:=btrim(coalesce(p->>'category','')); pos:=(p->>'position')::integer; privatev:=(p->>'is_private')::boolean;
      select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into ids from jsonb_array_elements_text(p->'role_ids');
      if exists(select 1 from unnest(ids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s)) then raise exception 'Kanal rolleri bu sunucuya ait olmalı.'; end if;
      if c is null then
        if not community_v2.has_permission(s,u,'channels.create') then raise exception 'Kanal oluşturma iznin yok.' using errcode='42501'; end if;
        if privatev and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Özel oda açmak için kanal erişimini yönetme izni gerekli.' using errcode='42501'; end if;
        if (select count(*) from community_v2.channels where server_id=s)>=100 then raise exception 'En fazla 100 kanal oluşturabilirsin.'; end if;
        insert into community_v2.channels(server_id,name,topic,category,is_private,position) values(s,namev,topicv,categoryv,privatev,pos) returning id,version into c,new_version;
      else
        if not exists(select 1 from unnest(array['channels.manage','channels.permissions.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Kanal düzenleme iznin yok.' using errcode='42501'; end if;
        if (namev is distinct from old_channel.name or topicv is distinct from old_channel.topic or categoryv is distinct from old_channel.category or pos is distinct from old_channel.position)
          and not community_v2.has_permission(s,u,'channels.manage') then raise exception 'Kanal bilgilerini düzenleme iznin yok.' using errcode='42501'; end if;
        if (privatev is distinct from old_channel.is_private or ids is distinct from old_ids)
          and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Kanal erişim ayarlarını değiştirme iznin yok.' using errcode='42501'; end if;
        update community_v2.channels set name=namev,topic=topicv,category=categoryv,is_private=privatev,position=pos,version=version+1 where id=c returning version into new_version;
      end if;
      delete from community_v2.channel_roles where channel_id=c;
      insert into community_v2.channel_roles select s,c,v from unnest(ids)v;
      if not community_v2.can_view(c,u) then raise exception 'Kendi erişimini kaldıran bir özel oda ayarı kaydedemezsin.' using errcode='42501'; end if;
      detailsv:=jsonb_build_object('label',namev,'before',case when old_channel.id is null then null else jsonb_build_object('name',old_channel.name,'topic',old_channel.topic,'category',old_channel.category,'position',old_channel.position,'private',old_channel.is_private,'roles',old_ids) end,'after',jsonb_build_object('name',namev,'topic',topicv,'category',categoryv,'position',pos,'private',privatev,'roles',ids));
    end if;
    ident:=c;
  elsif p_action='moderate' then
    action_permission:=case p->>'operation' when 'timeout' then 'members.timeout' when 'kick' then 'members.kick' when 'ban' then 'members.ban' when 'unban' then 'members.ban' end;
    if action_permission is null or not community_v2.has_permission(s,u,action_permission) or not community_v2.outranks_member(s,u,target) then
      raise exception 'Yalnız kendi seviyenin altındaki üyeye bu işlemi uygulayabilirsin.' using errcode='42501';
    end if;
    if p->>'operation'='timeout' then
      if p->>'minutes' is null or (p->>'minutes')::integer not between 0 and 10080 then raise exception 'Kısıtlama süresi 0–10080 dakika olmalı.'; end if;
      update community_v2.members set timeout_until=case when (p->>'minutes')::integer=0 then null else now()+make_interval(mins=>(p->>'minutes')::integer) end where server_id=s and user_id=target;
    else
      if p->>'operation'='unban' and not exists(select 1 from community_v2.members where server_id=s and user_id=target and state='banned') then raise exception 'Üye yasaklı değil.'; end if;
      update community_v2.members set protected_rank=case when p->>'operation'='ban' then community_v2.rank_of(s,target) else null end,
        state=case when p->>'operation'='ban' then 'banned' else 'left' end where server_id=s and user_id=target;
      delete from community_v2.member_roles where server_id=s and user_id=target;
    end if;
    ident:=target; p_action:='member.'||(p->>'operation');
    detailsv:=jsonb_build_object('label',(select username from public.users where id=target),'minutes',p->'minutes');
  else raise exception 'Bilinmeyen yönetim işlemi.';
  end if;
  insert into community_v2.audit(server_id,actor_id,action,target_id,details) values(s,u,p_action,ident,detailsv);
  perform community_v2.emit(s);
  return jsonb_build_object('ok',true,'id',ident,'version',new_version);
end $$;
revoke all on function community_v2.manage_api(text,jsonb) from public,anon,authenticated;
