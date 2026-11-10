-- The series link is added keeping the old channel API contract.
create or replace function community_v2.manage_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); s uuid:=(p->>'server_id')::uuid;
  r uuid:=nullif(p->>'role_id','')::uuid; c uuid:=nullif(p->>'channel_id','')::uuid;
  target uuid:=nullif(p->>'user_id','')::uuid; owner boolean; actor_rank integer;
  old_role community_v2.roles; old_channel community_v2.channels;
  perms text[]; ids uuid[]; old_ids uuid[]; changed_ids uuid[];
  namev text; colorv text; pos integer; topicv text; categoryv text; privatev boolean; mangav uuid;
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
      mangav:=case when p ? 'manga_id' then nullif(p->>'manga_id','')::uuid else old_channel.manga_id end;
      if mangav is distinct from old_channel.manga_id then
        if old_channel.manga_id is not null then raise exception 'Seri bağlantısı değiştirilemez. Mevcut kanalı arşivleyebilirsin.'; end if;
        if coalesce(old_channel.last_seq,0)>0 then raise exception 'Mesaj geçmişi olan genel kanal bir seriye bağlanamaz. Yeni kanal oluştur.'; end if;
        if c is not null and not community_v2.has_permission(s,u,'channels.manage') then raise exception 'Seri bağlama iznin yok.' using errcode='42501'; end if;
        if not community_v2.series_audience(mangav,u) then raise exception 'Bu seriye erişimin yok.' using errcode='42501'; end if;
        perform community_v2.lock_series(s,mangav);
        if exists(select 1 from community_v2.channels where server_id=s and manga_id=mangav and id is distinct from c) then
          raise exception 'Bu seri için zaten bir kanal var; arşivlenen kanallar da bu kapsama dahildir.';
        end if;
      end if;
      select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into ids from jsonb_array_elements_text(p->'role_ids');
      if exists(select 1 from unnest(ids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s)) then raise exception 'Kanal rolleri bu sunucuya ait olmalı.'; end if;
      if c is null then
        if not community_v2.has_permission(s,u,'channels.create') then raise exception 'Kanal oluşturma iznin yok.' using errcode='42501'; end if;
        if privatev and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Özel oda açmak için kanal erişimini yönetme izni gerekli.' using errcode='42501'; end if;
        if (select count(*) from community_v2.channels where server_id=s)>=100 then raise exception 'En fazla 100 kanal oluşturabilirsin.'; end if;
        insert into community_v2.channels(server_id,name,topic,category,is_private,position,manga_id) values(s,namev,topicv,categoryv,privatev,pos,mangav) returning id,version into c,new_version;
      else
        if not exists(select 1 from unnest(array['channels.manage','channels.permissions.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Kanal düzenleme iznin yok.' using errcode='42501'; end if;
        if (namev is distinct from old_channel.name or topicv is distinct from old_channel.topic or categoryv is distinct from old_channel.category or pos is distinct from old_channel.position)
          and not community_v2.has_permission(s,u,'channels.manage') then raise exception 'Kanal bilgilerini düzenleme iznin yok.' using errcode='42501'; end if;
        if (privatev is distinct from old_channel.is_private or ids is distinct from old_ids)
          and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Kanal erişim ayarlarını değiştirme iznin yok.' using errcode='42501'; end if;
        update community_v2.channels set name=namev,topic=topicv,category=categoryv,is_private=privatev,position=pos,manga_id=mangav,version=version+1 where id=c returning version into new_version;
      end if;
      delete from community_v2.channel_roles where channel_id=c;
      insert into community_v2.channel_roles select s,c,v from unnest(ids)v;
      if not community_v2.can_view(c,u) then raise exception 'Kendi erişimini kaldıran bir özel oda ayarı kaydedemezsin.' using errcode='42501'; end if;
      detailsv:=jsonb_build_object('label',namev,'before',case when old_channel.id is null then null else jsonb_build_object('name',old_channel.name,'topic',old_channel.topic,'category',old_channel.category,'position',old_channel.position,'private',old_channel.is_private,'roles',old_ids,'manga_id',old_channel.manga_id) end,'after',jsonb_build_object('name',namev,'topic',topicv,'category',categoryv,'position',pos,'private',privatev,'roles',ids,'manga_id',mangav));
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

create or replace function community_v2.read_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; result jsonb; offn integer := greatest(0,least(coalesce((p->>'offset')::integer,0),100000));
begin
  if p_action='series_candidates' then return community_v2.series_candidates(s,p->>'search',offn);
  elsif p_action='channel_entry' then return community_v2.channel_entry(c); end if;
  if p_action='home' then
    return jsonb_build_object(
      'auto_join',coalesce((select auto_join from community_v2.preferences where user_id=u),true),
      'servers',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select v.id,f.name,f.avatar_url,f.slug,v.owner_id from community_v2.servers v
        join public.fansubs f on f.id=v.fansub_id join community_v2.members m on m.server_id=v.id and m.user_id=u
        where f.is_active and m.state='active' order by (v.id=s) desc nulls last,f.name,v.id limit 100)x),'[]'::jsonb),
      'owned_fansubs',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select f.id,f.name from public.fansubs f join public.fansub_members m on m.fansub_id=f.id
        where m.user_id=u and m.role='admin' and f.is_active
        and not exists(select 1 from community_v2.servers v where v.fansub_id=f.id)
        and (select count(*) from public.fansub_members mm where mm.fansub_id=f.id and mm.role='admin')=1
        order by f.name limit 100)x),'[]'::jsonb));
  elsif p_action='discover' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select v.id,f.name,f.avatar_url,f.description,m.state from community_v2.servers v
      join public.fansubs f on f.id=v.fansub_id left join community_v2.members m on m.server_id=v.id and m.user_id=u
      where f.is_active and (m.state is null or m.state='left')
      and f.name ilike '%'||left(coalesce(p->>'search',''),60)||'%'
      order by f.name,v.id limit 21 offset offn)x),'[]'::jsonb);
  end if;
  if c is not null then select server_id into s from community_v2.channels where id=c; end if;
  if not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  if p_action='server' then
    return jsonb_build_object('is_owner',community_v2.is_owner(s,u),
      'permissions',coalesce((select jsonb_agg(key) from unnest(community_v2.permission_catalog())key where community_v2.has_permission(s,u,key)),'[]'::jsonb),
      'my_rank',community_v2.rank_of(s,u),
      'timeout_until',(select timeout_until from community_v2.members where server_id=s and user_id=u),
      'channels',coalesce((select jsonb_agg(to_jsonb(x) order by x.position,x.id) from (
        select ch.id,ch.name,ch.topic,ch.is_private,ch.position,ch.category,ch.archived_at,ch.version,ch.manga_id,
          ch.last_seq=0 and ch.manga_id is null as can_link_series,
          case when ch.archived_at is not null then 'archived' else community_v2.series_status(s,ch.manga_id) end as read_only_reason,
          (select jsonb_build_object('id',m.id,'title',m.title,'slug',m.slug) from public.mangas m
            where m.id=ch.manga_id and m.is_active and m.is_approved and community_v2.series_audience(m.id,u)) as series,
          community_v2.can_read(ch.id,u) as can_read,
          case when ch.archived_at is null and community_v2.series_status(s,ch.manga_id) is null and community_v2.can_read(ch.id,u) then least(999,(select count(*) from (
            select 1 from community_v2.messages msg where msg.channel_id=ch.id
            and msg.seq>coalesce(rd.last_seq,0) and msg.author_id<>u and msg.deleted_at is null limit 999) n)) else 0 end as unread,
          case when community_v2.is_owner(s,u) or exists(select 1 from unnest(array['channels.manage','channels.permissions.manage','channels.archive'])k where community_v2.has_permission(s,u,k)) then coalesce((select jsonb_agg(role_id) from community_v2.channel_roles where channel_id=ch.id),'[]'::jsonb) else '[]'::jsonb end as role_ids
        from community_v2.channels ch left join community_v2.reads rd on rd.channel_id=ch.id and rd.user_id=u
        where ch.server_id=s and community_v2.can_view(ch.id,u))x),'[]'::jsonb),
      'roles',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('manageable',community_v2.can_delegate_role(s,u,r.id)) order by r.position,r.id) from community_v2.roles r where r.server_id=s),'[]'::jsonb));
  elsif p_action='members' then
    if not exists(select 1 from unnest(array['members.list','roles.assign','members.timeout','members.kick','members.ban'])k where community_v2.has_permission(s,u,k)) then return '[]'::jsonb; end if;
    if c is not null and not community_v2.can_view(c,u) then raise exception 'Bu kanala erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select m.user_id,usr.username,usr.display_name,usr.avatar_url,m.state,m.timeout_until,
        community_v2.is_owner(s,m.user_id) as is_owner,
        community_v2.rank_of(s,m.user_id) as rank,
        community_v2.outranks_member(s,u,m.user_id) as manageable,
        coalesce((select jsonb_agg(mr.role_id) from community_v2.member_roles mr where mr.server_id=s and mr.user_id=m.user_id),'[]'::jsonb) role_ids
      from community_v2.members m join public.users usr on usr.id=m.user_id where m.server_id=s
      and (m.state='active' or (exists(select 1 from unnest(array['roles.assign','members.timeout','members.kick','members.ban'])k where community_v2.has_permission(s,u,k)) and coalesce((p->>'include_inactive')::boolean,false)))
      and (c is null or community_v2.can_view(c,m.user_id))
      and usr.username ilike '%'||left(coalesce(p->>'search',''),60)||'%'
      order by community_v2.is_owner(s,m.user_id) desc,
        coalesce((select rr.position from community_v2.member_roles mr join community_v2.roles rr on rr.id=mr.role_id
          where mr.server_id=s and mr.user_id=m.user_id and not rr.is_default order by rr.position,rr.id limit 1),1001),
        (select rr.id from community_v2.member_roles mr join community_v2.roles rr on rr.id=mr.role_id
          where mr.server_id=s and mr.user_id=m.user_id and not rr.is_default order by rr.position,rr.id limit 1),
        usr.username,m.user_id limit 51 offset offn)x),'[]'::jsonb);
  elsif p_action='messages' then
    if not community_v2.can_read(c,u) then raise exception 'Bu kanalın mesajlarını okuma iznin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x) order by x.seq::bigint) from (
      select msg.id,msg.seq::text,msg.author_id,msg.body,msg.created_at,msg.edited_at,msg.deleted_at,
        usr.username,usr.display_name,usr.avatar_url from community_v2.messages msg join public.users usr on usr.id=msg.author_id
      where msg.channel_id=c and (p->>'before' is null or msg.seq<(p->>'before')::bigint)
      order by msg.seq desc limit 50)x),'[]'::jsonb);
  elsif p_action='audit' then
    if not community_v2.has_permission(s,u,'server.audit.read') then raise exception 'İşlem geçmişine erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select a.id,a.action,a.target_id,a.created_at,a.details,usr.username from community_v2.audit a left join public.users usr on usr.id=a.actor_id
      where a.server_id=s order by a.id desc limit 50 offset offn)x),'[]'::jsonb);
  end if;
  raise exception 'Bilinmeyen topluluk sorgusu.';
end $$;

create or replace function community_v2.write_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; r uuid := nullif(p->>'role_id','')::uuid;
  target uuid := nullif(p->>'user_id','')::uuid; ident uuid; seqn bigint; bodyv text;
  perms text[]; roleids uuid[]; owner boolean; msg community_v2.messages; member community_v2.members;
begin
  if p_action in ('save_role','delete_role','assign_roles','save_channel','archive_channel','moderate') then
    return community_v2.manage_api(p_action,p);
  end if;
  if p_action='preference' then
    insert into community_v2.preferences values(u,(p->>'auto_join')::boolean)
      on conflict(user_id) do update set auto_join=excluded.auto_join;
    return jsonb_build_object('ok',true);
  elsif p_action='create_server' then
    ident := community_v2.create_server((p->>'fansub_id')::uuid,u,false);
    return jsonb_build_object('id',ident);
  end if;
  if c is not null then select server_id into s from community_v2.channels where id=c; end if;
  -- A management change and message send cannot create a permission gap at the same time.
  if p_action in ('send','read','edit_message','delete_message') then
    perform 1 from community_v2.servers where id=s for share;
  else
    perform 1 from community_v2.servers where id=s for update;
  end if;
  if not found then raise exception 'Sunucu bulunamadı.'; end if;
  if p_action='join' then
    if not exists(select 1 from community_v2.servers v join public.fansubs f on f.id=v.fansub_id where v.id=s and f.is_active) then raise exception 'Sunucu aktif değil.'; end if;
    if exists(select 1 from community_v2.members where server_id=s and user_id=u and state='banned') then raise exception 'Bu sunucuya katılamazsın.' using errcode='42501'; end if;
    insert into community_v2.members(server_id,user_id) values(s,u)
      on conflict(server_id,user_id) do update set state='active';
    perform community_v2.emit(s);
    return jsonb_build_object('ok',true);
  end if;
  if not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  owner := community_v2.is_owner(s,u);
  if p_action='leave' then
    if owner then raise exception 'Sunucu sahibi sunucudan ayrılamaz.'; end if;
    update community_v2.members set state='left' where server_id=s and user_id=u;
    delete from community_v2.member_roles where server_id=s and user_id=u;
  elsif p_action='read' then
    if not community_v2.can_read(c,u) then raise exception 'Okuma iznin yok.' using errcode='42501'; end if;
    select least(last_seq,greatest(0,(p->>'seq')::bigint)) into seqn from community_v2.channels where id=c;
    insert into community_v2.reads values(c,u,seqn) on conflict(channel_id,user_id)
      do update set last_seq=greatest(community_v2.reads.last_seq,excluded.last_seq);
    return jsonb_build_object('ok',true);
  elsif p_action='send' then
    if exists(select 1 from community_v2.channels where id=c and archived_at is not null) then raise exception 'Arşivlenen kanala mesaj gönderilemez.' using errcode='42501'; end if;
    if not community_v2.can_view(c,u) or not community_v2.has_permission(s,u,'messages.send') then raise exception 'Bu kanala yazma iznin yok.' using errcode='42501'; end if;
    perform community_v2.lock_series(s,(select manga_id from community_v2.channels where id=c));
    select * into member from community_v2.members where server_id=s and user_id=u for update;
    if member.timeout_until>now() then raise exception 'Yazma kısıtlaman henüz bitmedi.' using errcode='42501'; end if;
    bodyv := btrim(p->>'body');
    if bodyv is null or char_length(bodyv) not between 1 and 4000 then raise exception 'Mesaj 1–4000 karakter olmalı.'; end if;
    select * into msg from community_v2.messages where author_id=u and client_id=(p->>'client_id')::uuid;
    if found then
      if msg.channel_id<>c or msg.body<>bodyv then raise exception 'Mesaj anahtarı farklı içerik için kullanılamaz.'; end if;
      return jsonb_build_object('id',msg.id,'seq',msg.seq::text);
    end if;
    if member.last_message_at>clock_timestamp()-interval '750 milliseconds' then raise exception 'Biraz yavaşla; mesajın yazı alanında korunuyor.' using errcode='P0001'; end if;
    update community_v2.members set last_message_at=clock_timestamp() where server_id=s and user_id=u;
    update community_v2.channels set last_seq=last_seq+1 where id=c returning last_seq into seqn;
    insert into community_v2.messages(channel_id,seq,author_id,client_id,body)
      values(c,seqn,u,(p->>'client_id')::uuid,bodyv) returning id into ident;
    perform community_v2.emit(s,c);
    return jsonb_build_object('id',ident,'seq',seqn::text);
  elsif p_action in ('edit_message','delete_message') then
    if not community_v2.can_view(c,u) then raise exception 'Kanal erişimi yok.' using errcode='42501'; end if;
    select * into msg from community_v2.messages where id=(p->>'message_id')::uuid and channel_id=c for update;
    if not found or msg.deleted_at is not null then raise exception 'Mesaj bulunamadı.'; end if;
    if p_action='edit_message' then
      if exists(select 1 from community_v2.channels where id=c and archived_at is not null) then raise exception 'Arşivlenen kanaldaki mesaj düzenlenemez.' using errcode='42501'; end if;
      if msg.author_id<>u or not community_v2.has_permission(s,u,'messages.self.edit') then raise exception 'Bu mesajı düzenleyemezsin.' using errcode='42501'; end if;
      if exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then raise exception 'Yazma kısıtlaman henüz bitmedi.' using errcode='42501'; end if;
      perform community_v2.lock_series(s,(select manga_id from community_v2.channels where id=c));
      bodyv:=btrim(p->>'body');
      if bodyv is null or char_length(bodyv) not between 1 and 4000 then raise exception 'Mesaj 1–4000 karakter olmalı.'; end if;
      update community_v2.messages set body=bodyv,edited_at=now() where id=msg.id;
    else
      if not ((msg.author_id=u and community_v2.has_permission(s,u,'messages.self.delete')) or community_v2.has_permission(s,u,'messages.others.delete')) then raise exception 'Bu mesajı silemezsin.' using errcode='42501'; end if;
      update community_v2.messages set body='',deleted_at=now() where id=msg.id;
      insert into community_v2.audit(server_id,actor_id,action,target_id) values(s,u,p_action,msg.id);
    end if;
    perform community_v2.emit(s,c);
    return jsonb_build_object('ok',true);
  else raise exception 'Bilinmeyen topluluk işlemi.';
  end if;
  perform community_v2.emit(s);
  return jsonb_build_object('ok',true,'id',ident);
end $$;
