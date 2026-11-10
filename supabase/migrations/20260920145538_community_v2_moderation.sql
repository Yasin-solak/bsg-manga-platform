-- Reports open only to a reviewer with current room access; no message copy is kept.
alter table community_v2.channels add column slowmode_seconds integer not null default 0
  check (slowmode_seconds between 0 and 21600);
create table community_v2.message_cooldowns (
  channel_id uuid not null references community_v2.channels(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_sent_at timestamptz not null,
  primary key(channel_id,user_id)
);
create index community_cooldown_user on community_v2.message_cooldowns(user_id);
create table community_v2.message_reports (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  server_id uuid not null,
  channel_id uuid not null,
  message_id uuid not null,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason text not null check(reason in ('spam','harassment','unsafe','spoiler','other')),
  note text not null default '' check(char_length(note)<=1000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text not null default '' check(char_length(resolution_note)<=1000),
  version integer not null default 1,
  unique(message_id,reporter_id),
  foreign key(server_id,channel_id) references community_v2.channels(server_id,id) on delete cascade,
  foreign key(channel_id,message_id) references community_v2.messages(channel_id,id) on delete cascade
);
create index community_reports_queue on community_v2.message_reports(server_id,status,seq desc);
create index community_reports_channel on community_v2.message_reports(channel_id,message_id);
create index community_reports_reporter on community_v2.message_reports(reporter_id,created_at desc);
create index community_reports_reviewer on community_v2.message_reports(reviewed_by) where reviewed_by is not null;
alter table community_v2.message_cooldowns enable row level security;
alter table community_v2.message_reports enable row level security;
revoke all on community_v2.message_cooldowns,community_v2.message_reports from public,anon,authenticated;
revoke all on sequence community_v2.message_reports_seq_seq from public,anon,authenticated;

create function community_v2.moderation_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); s uuid; c uuid; msg community_v2.messages;
  report community_v2.message_reports; reasonv text:=p->>'reason'; notev text:=btrim(coalesce(p->>'note',''));
  statev text:=coalesce(p->>'status','open'); result jsonb; seqv bigint; lastv timestamptz;
begin
  if p_action='report' then
    c:=(p->>'channel_id')::uuid;
    select server_id into s from community_v2.channels where id=c;
  else s:=(p->>'server_id')::uuid;
  end if;
  -- Same lock order as management: permission/room access does not change until this finishes.
  perform 1 from community_v2.servers where id=s for share;
  if not found or not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  if p_action='report' then
    if not community_v2.can_read(c,u) then raise exception 'Bu kanala erişimin yok.' using errcode='42501'; end if;
    -- Concurrent requests across servers cannot exceed the daily notification limit.
    perform pg_advisory_xact_lock(hashtextextended('community-report:'||u::text,0));
    select * into msg from community_v2.messages where channel_id=c and id=(p->>'message_id')::uuid for share;
    if not found or msg.author_id=u then raise exception 'Bu mesajı bildiremezsin.'; end if;
    select * into report from community_v2.message_reports where message_id=msg.id and reporter_id=u;
    if found then return jsonb_build_object('ok',true,'duplicate',true); end if;
    if msg.deleted_at is not null then raise exception 'Bu mesaj zaten silinmiş.'; end if;
    if reasonv is null or reasonv not in ('spam','harassment','unsafe','spoiler','other') or char_length(notev)>1000 or (reasonv='other' and char_length(notev)<10) then raise exception 'Geçerli bir neden seç. Diğer için en az 10 karakter açıklama yaz.'; end if;
    select max(created_at) into lastv from community_v2.message_reports where reporter_id=u;
    if lastv>clock_timestamp()-interval '5 seconds' then raise exception 'Yeni bir bildirim göndermeden önce 5 saniye bekle.'; end if;
    if (select count(*) from community_v2.message_reports where reporter_id=u and created_at>clock_timestamp()-interval '24 hours')>=20 then raise exception 'Son 24 saatte en fazla 20 mesaj bildirebilirsin.'; end if;
    insert into community_v2.message_reports(server_id,channel_id,message_id,reporter_id,reason,note) values(s,c,msg.id,u,reasonv,notev);
    -- The general server broadcast carries no report existence, person id or content.
    return jsonb_build_object('ok',true,'duplicate',false);
  end if;
  if not community_v2.has_permission(s,u,'reports.review') or exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then raise exception 'Şikâyet inceleme iznin yok.' using errcode='42501'; end if;
  if p_action='list' then
    if statev not in ('open','resolved','dismissed') then raise exception 'Geçersiz inceleme durumu.'; end if;
    seqv:=coalesce((p->>'before')::bigint,9223372036854775807);
    select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_seq desc),'[]'::jsonb) into result from (
      select r.id,r.seq::text as cursor,r.seq as sort_seq,r.channel_id,ch.name as channel_name,r.reason,r.note,r.status,r.version,r.created_at,
        r.reviewed_at,r.resolution_note,reviewer.username as reviewer_username,
        jsonb_build_object('user_id',usr.id,'username',usr.username,'display_name',usr.display_name,'avatar_url',usr.avatar_url) as reporter,
        community_v2.message_json(m,u) as message
      from community_v2.message_reports r join community_v2.channels ch on ch.id=r.channel_id
      join community_v2.messages m on m.id=r.message_id
      join public.users usr on usr.id=r.reporter_id left join public.users reviewer on reviewer.id=r.reviewed_by
      where r.server_id=s and r.status=statev and r.seq<seqv and community_v2.can_read(r.channel_id,u)
      order by r.seq desc limit 26
    )x;
    return result;
  elsif p_action='decide' then
    select * into report from community_v2.message_reports where id=(p->>'report_id')::uuid and server_id=s for update;
    if not found or not community_v2.can_read(report.channel_id,u) then raise exception 'Bu şikâyete erişimin yok.' using errcode='42501'; end if;
    if statev not in ('resolved','dismissed') or char_length(notev)>1000 then raise exception 'Geçerli bir karar ve en fazla 1000 karakter not gerekli.'; end if;
    if report.status=statev and report.reviewed_by=u and report.resolution_note=notev then return jsonb_build_object('ok',true); end if;
    if report.status<>'open' or (p->>'version')::integer is distinct from report.version then raise exception 'Bu şikâyet başka bir işlemle değişti. Listeyi yenile.'; end if;
    update community_v2.message_reports set status=statev,reviewed_by=u,reviewed_at=clock_timestamp(),resolution_note=notev,version=version+1 where id=report.id;
    -- The audit record holds only the decision type; private content and review notes do not leak.
    insert into community_v2.audit(server_id,actor_id,action,target_id) values(s,u,'report.'||statev,report.id);
    return jsonb_build_object('ok',true);
  else raise exception 'Bilinmeyen inceleme işlemi.';
  end if;
end $$;
create function public.community_v2_moderation(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.moderation_api(p_action,p_payload); $$;
revoke all on function community_v2.moderation_api(text,jsonb),public.community_v2_moderation(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.moderation_api(text,jsonb),public.community_v2_moderation(text,jsonb) to authenticated;

create or replace function community_v2.permission_catalog() returns text[]
language sql immutable set search_path='' as $$
  select array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban','roles.create','roles.appearance.manage',
    'roles.permissions.manage','roles.order.manage','roles.assign','roles.delete',
    'channels.create','channels.manage','channels.permissions.manage','channels.archive',
    'messages.reply','reactions.add','mentions.users','mentions.roles','messages.pin','attachments.send','slowmode.bypass','reports.review']::text[];
$$;

create or replace function community_v2.manage_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); s uuid:=(p->>'server_id')::uuid;
  r uuid:=nullif(p->>'role_id','')::uuid; c uuid:=nullif(p->>'channel_id','')::uuid;
  target uuid:=nullif(p->>'user_id','')::uuid; owner boolean; actor_rank integer;
  old_role community_v2.roles; old_channel community_v2.channels;
  perms text[]; ids uuid[]; old_ids uuid[]; changed_ids uuid[];
  namev text; colorv text; pos integer; topicv text; categoryv text; privatev boolean; mangav uuid; slowv integer;
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
      insert into community_v2.roles(server_id,name,color,position,permissions,mentionable) values(s,namev,colorv,pos,perms,coalesce((p->>'mentionable')::boolean,false)) returning id,version into r,new_version;
      detailsv:=jsonb_build_object('label',namev,'after',jsonb_build_object('permissions',perms,'position',pos,'color',colorv,'mentionable',coalesce((p->>'mentionable')::boolean,false)));
    else
      select * into old_role from community_v2.roles where id=r and server_id=s;
      if not found or not community_v2.can_delegate_role(s,u,r) then raise exception 'Bu rolü yönetemezsin; eşit, üst ve kendi rollerin korunur.' using errcode='42501'; end if;
      if not exists(select 1 from unnest(array['roles.appearance.manage','roles.permissions.manage','roles.order.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Rol düzenleme iznin yok.' using errcode='42501'; end if;
      if p ? 'version' and (p->>'version')::integer<>old_role.version then raise exception 'Bu rol başka bir işlemle değişti. Rolü yeniden açıp tekrar dene.'; end if;
      if (namev is distinct from old_role.name or colorv is distinct from old_role.color) and not community_v2.has_permission(s,u,'roles.appearance.manage') then raise exception 'Rol görünümünü değiştirme iznin yok.' using errcode='42501'; end if;
      if pos is distinct from old_role.position and not community_v2.has_permission(s,u,'roles.order.manage') then raise exception 'Rol sırasını değiştirme iznin yok.' using errcode='42501'; end if;
      if not (perms @> old_role.permissions and perms <@ old_role.permissions) and not community_v2.has_permission(s,u,'roles.permissions.manage') then raise exception 'Rol izinlerini değiştirme iznin yok.' using errcode='42501'; end if;
      if p ? 'mentionable' and (p->>'mentionable')::boolean is distinct from old_role.mentionable then
        if old_role.is_default or not community_v2.has_permission(s,u,'roles.permissions.manage') then raise exception 'Bu rolün etiketlenebilirliğini değiştiremezsin.' using errcode='42501'; end if;
      end if;
      update community_v2.roles set mentionable=coalesce((p->>'mentionable')::boolean,old_role.mentionable),name=namev,color=colorv,position=pos,permissions=perms,version=version+1 where id=r returning version into new_version;
      detailsv:=jsonb_build_object('label',namev,'before',jsonb_build_object('permissions',old_role.permissions,'position',old_role.position,'color',old_role.color,'name',old_role.name,'mentionable',old_role.mentionable),'after',jsonb_build_object('permissions',perms,'position',pos,'color',colorv,'name',namev,'mentionable',coalesce((p->>'mentionable')::boolean,old_role.mentionable)));
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
      slowv:=coalesce((p->>'slowmode_seconds')::integer,old_channel.slowmode_seconds,0);
      if slowv not between 0 and 21600 then raise exception 'Yavaş mod 0–21600 saniye olmalı.'; end if;
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
        insert into community_v2.channels(server_id,name,topic,category,is_private,position,manga_id,slowmode_seconds) values(s,namev,topicv,categoryv,privatev,pos,mangav,slowv) returning id,version into c,new_version;
      else
        if not exists(select 1 from unnest(array['channels.manage','channels.permissions.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Kanal düzenleme iznin yok.' using errcode='42501'; end if;
        if (namev is distinct from old_channel.name or topicv is distinct from old_channel.topic or categoryv is distinct from old_channel.category or pos is distinct from old_channel.position or slowv is distinct from old_channel.slowmode_seconds)
          and not community_v2.has_permission(s,u,'channels.manage') then raise exception 'Kanal bilgilerini düzenleme iznin yok.' using errcode='42501'; end if;
        if (privatev is distinct from old_channel.is_private or ids is distinct from old_ids)
          and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Kanal erişim ayarlarını değiştirme iznin yok.' using errcode='42501'; end if;
        update community_v2.channels set name=namev,topic=topicv,category=categoryv,is_private=privatev,position=pos,manga_id=mangav,slowmode_seconds=slowv,version=version+1 where id=c returning version into new_version;
      end if;
      delete from community_v2.channel_roles where channel_id=c;
      insert into community_v2.channel_roles select s,c,v from unnest(ids)v;
      if not community_v2.can_view(c,u) then raise exception 'Kendi erişimini kaldıran bir özel oda ayarı kaydedemezsin.' using errcode='42501'; end if;
      detailsv:=jsonb_build_object('label',namev,'before',case when old_channel.id is null then null else jsonb_build_object('name',old_channel.name,'topic',old_channel.topic,'category',old_channel.category,'position',old_channel.position,'private',old_channel.is_private,'roles',old_ids,'manga_id',old_channel.manga_id,'slowmode_seconds',old_channel.slowmode_seconds) end,'after',jsonb_build_object('name',namev,'topic',topicv,'category',categoryv,'position',pos,'private',privatev,'roles',ids,'manga_id',mangav,'slowmode_seconds',slowv));
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

create or replace function community_v2.read_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; result jsonb; offn integer := greatest(0,least(coalesce((p->>'offset')::integer,0),100000));
begin
  if p_action in ('messages','message_snapshot','message_context','pins','mention_candidates') then return community_v2.message_read(p_action,p); end if;
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
    return jsonb_build_object('server_now',clock_timestamp(),'is_owner',community_v2.is_owner(s,u),
      'permissions',coalesce((select jsonb_agg(key) from unnest(community_v2.permission_catalog())key where community_v2.has_permission(s,u,key)),'[]'::jsonb),
      'my_rank',community_v2.rank_of(s,u),
      'timeout_until',(select timeout_until from community_v2.members where server_id=s and user_id=u),
      'channels',coalesce((select jsonb_agg(to_jsonb(x) order by x.position,x.id) from (
        select ch.id,ch.name,ch.topic,ch.is_private,ch.position,ch.category,ch.archived_at,ch.version,ch.manga_id,ch.slowmode_seconds,
          case when ch.slowmode_seconds>0 and not community_v2.has_permission(s,u,'slowmode.bypass') then
            (select last_sent_at+make_interval(secs=>ch.slowmode_seconds) from community_v2.message_cooldowns where channel_id=ch.id and user_id=u) else null end as next_send_at,
          ch.last_seq=0 and ch.manga_id is null as can_link_series,
          case when ch.archived_at is not null then 'archived' else community_v2.series_status(s,ch.manga_id) end as read_only_reason,
          (select jsonb_build_object('id',m.id,'title',m.title,'slug',m.slug) from public.mangas m
            where m.id=ch.manga_id and m.is_active and m.is_approved and community_v2.series_audience(m.id,u)) as series,
          community_v2.can_read(ch.id,u) as can_read,
          case when ch.archived_at is null and community_v2.series_status(s,ch.manga_id) is null and community_v2.can_read(ch.id,u) then least(999,(select count(*) from (
            select 1 from community_v2.messages msg where msg.channel_id=ch.id
            and msg.seq>coalesce(rd.last_seq,0) and msg.author_id<>u and msg.deleted_at is null limit 999) n)) else 0 end as unread,
          case when ch.archived_at is null and community_v2.series_status(s,ch.manga_id) is null and community_v2.can_read(ch.id,u) then
            (select count(*) from (select msg.mentions from community_v2.messages msg where msg.channel_id=ch.id
              and msg.seq>coalesce(rd.last_seq,0) and msg.author_id<>u and msg.deleted_at is null order by msg.seq desc limit 999) recent
              where community_v2.mention_matches(recent.mentions,s,u)) else 0 end as mention_count,
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
  elsif p_action='audit' then
    if not community_v2.has_permission(s,u,'server.audit.read') then raise exception 'İşlem geçmişine erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select a.id,a.action,a.target_id,a.created_at,a.details,usr.username from community_v2.audit a left join public.users usr on usr.id=a.actor_id
      where a.server_id=s order by a.id desc limit 50 offset offn)x),'[]'::jsonb);
  end if;
  raise exception 'Bilinmeyen topluluk sorgusu.';
end $$;

create or replace function community_v2.message_write(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; ch community_v2.channels;
  member community_v2.members; msg community_v2.messages; parent uuid:=nullif(p->>'reply_to','')::uuid;
  bodyv text:=btrim(p->>'body'); tags jsonb; ident uuid; seqn bigint; activev boolean; changed boolean; files uuid[]:='{}'; next_send timestamptz;
begin
  select server_id into s from community_v2.channels where id=c;
  -- Fixed lock order: server -> member -> channel -> message. Management is excluded on the same server.
  perform 1 from community_v2.servers where id=s for share;
  if not found or not community_v2.can_read(c,u) then raise exception 'Bu kanala erişimin yok.' using errcode='42501'; end if;
  select * into member from community_v2.members where server_id=s and user_id=u for update;
  select * into ch from community_v2.channels where id=c for update;
  if p_action<>'delete_message' then
    if member.timeout_until>now() then raise exception 'Yazma kısıtlaman henüz bitmedi.' using errcode='42501'; end if;
    if ch.archived_at is not null then raise exception 'Arşivlenen kanalda etkileşim yapılamaz.' using errcode='42501'; end if;
    perform community_v2.lock_series(s,ch.manga_id);
  end if;
  if p_action='send' then
    if p ? 'attachment_ids' and (jsonb_typeof(p->'attachment_ids') is distinct from 'array' or jsonb_array_length(p->'attachment_ids')>4) then raise exception 'Mesaja en fazla 4 dosya eklenebilir.'; end if;
    select coalesce(array_agg(value::uuid order by value::uuid),'{}') into files from jsonb_array_elements_text(coalesce(p->'attachment_ids','[]'));
    if cardinality(files)<>(select count(distinct x) from unnest(files)x) then raise exception 'Aynı dosya iki kez eklenemez.'; end if;
    bodyv:=coalesce(bodyv,'');
    if not community_v2.has_permission(s,u,'messages.send') then raise exception 'Bu kanala yazma iznin yok.' using errcode='42501'; end if;
    if char_length(bodyv)>4000 or (bodyv='' and cardinality(files)=0) then raise exception 'Mesaj metni veya dosya gerekli; metin en fazla 4000 karakter olabilir.'; end if;
    if p->>'client_id' is null then raise exception 'Mesaj anahtarı gerekli.'; end if;
    select * into msg from community_v2.messages where author_id=u and client_id=(p->>'client_id')::uuid;
    if found then
      if msg.channel_id<>c or msg.body<>bodyv or msg.reply_to is distinct from parent or msg.attachment_ids is distinct from files or msg.deleted_at is not null then raise exception 'Mesaj anahtarı farklı içerik için kullanılamaz.'; end if;
      return jsonb_build_object('id',msg.id,'seq',msg.seq::text);
    end if;
    if cardinality(files)>0 then
      if not community_v2.has_permission(s,u,'attachments.send') then raise exception 'Dosya paylaşma iznin yok.' using errcode='42501'; end if;
      perform 1 from community_v2.attachments where id=any(files) order by id for update;
      if (select count(*) from community_v2.attachments where id=any(files) and user_id=u and channel_id=c and state='ready' and message_id is null and expires_at>now())<>cardinality(files) then
        raise exception 'Dosyalardan biri hazır değil, süresi dolmuş veya bu mesaja eklenemez.'; end if;
    end if;
    if parent is not null then
      if not community_v2.has_permission(s,u,'messages.reply') then raise exception 'Mesaja yanıt verme iznin yok.' using errcode='42501'; end if;
      if not exists(select 1 from community_v2.messages where id=parent and channel_id=c and deleted_at is null) then raise exception 'Yanıtlanan mesaj bu kanalda bulunamadı veya silindi.'; end if;
    end if;
    tags:=community_v2.parse_mentions(s,c,u,bodyv);
    if member.last_message_at>clock_timestamp()-interval '750 milliseconds' then raise exception 'Biraz yavaşla; mesajın yazı alanında korunuyor.'; end if;
    if ch.slowmode_seconds>0 and not community_v2.has_permission(s,u,'slowmode.bypass') then
      select last_sent_at+make_interval(secs=>ch.slowmode_seconds) into next_send from community_v2.message_cooldowns where channel_id=c and user_id=u;
      if next_send>clock_timestamp() then raise exception 'Yavaş mod: yeni mesaj için % saniye bekle.',ceil(extract(epoch from next_send-clock_timestamp()))::integer; end if;
    end if;
    insert into community_v2.message_cooldowns(channel_id,user_id,last_sent_at) values(c,u,clock_timestamp())
      on conflict(channel_id,user_id) do update set last_sent_at=excluded.last_sent_at;
    update community_v2.members set last_message_at=clock_timestamp() where server_id=s and user_id=u;
    update community_v2.channels set last_seq=last_seq+1 where id=c returning last_seq into seqn;
    insert into community_v2.messages(channel_id,seq,author_id,client_id,body,reply_to,mentions,attachment_ids)
      values(c,seqn,u,(p->>'client_id')::uuid,bodyv,parent,tags,files) returning id into ident;
    update community_v2.attachments set message_id=ident where id=any(files);
    perform community_v2.emit(s,c);
    return jsonb_build_object('id',ident,'seq',seqn::text);
  end if;
  select * into msg from community_v2.messages where id=(p->>'message_id')::uuid and channel_id=c for update;
  if not found or msg.deleted_at is not null then raise exception 'Mesaj bulunamadı veya silindi.'; end if;
  if p_action='edit_message' then
    if msg.author_id<>u or not community_v2.has_permission(s,u,'messages.self.edit') then raise exception 'Bu mesajı düzenleyemezsin.' using errcode='42501'; end if;
    if p ? 'version' and (p->>'version')::integer is distinct from msg.version then raise exception 'Mesaj değişti. Düzenleme penceresini yeniden aç.'; end if;
    if bodyv is null or char_length(bodyv)>4000 or (bodyv='' and cardinality(msg.attachment_ids)=0) then raise exception 'Mesaj metni veya dosya gerekli.'; end if;
    tags:=community_v2.parse_mentions(s,c,u,bodyv);
    if msg.body=bodyv then return jsonb_build_object('ok',true); end if;
    update community_v2.messages set body=bodyv,mentions=tags,edited_at=now(),version=version+1 where id=msg.id;
  elsif p_action='delete_message' then
    if not ((msg.author_id=u and community_v2.has_permission(s,u,'messages.self.delete')) or community_v2.has_permission(s,u,'messages.others.delete')) then raise exception 'Bu mesajı silemezsin.' using errcode='42501'; end if;
    update community_v2.messages set body='',mentions='[]',pinned_at=null,pinned_by=null,deleted_at=now(),version=version+1 where id=msg.id;
    delete from community_v2.reactions where message_id=msg.id;
    insert into community_v2.audit(server_id,actor_id,action,target_id) values(s,u,p_action,msg.id);
  elsif p_action='set_reaction' then
    activev:=(p->>'active')::boolean;
    if activev is null or (p->>'emoji') is null or (p->>'emoji') not in ('👍','❤️','😂','🎉','😮','😢','🔥','👀') then raise exception 'Geçersiz tepki.'; end if;
    if activev and not community_v2.has_permission(s,u,'reactions.add') then raise exception 'Tepki ekleme iznin yok.' using errcode='42501'; end if;
    if activev=exists(select 1 from community_v2.reactions where message_id=msg.id and user_id=u and emoji=p->>'emoji') then return jsonb_build_object('ok',true); end if;
    if member.last_interaction_at>clock_timestamp()-interval '350 milliseconds' then raise exception 'Biraz bekleyip tekrar dene.'; end if;
    if activev then insert into community_v2.reactions(message_id,user_id,emoji) values(msg.id,u,p->>'emoji') on conflict do nothing;
    else delete from community_v2.reactions where message_id=msg.id and user_id=u and emoji=p->>'emoji'; end if;
    update community_v2.members set last_interaction_at=clock_timestamp() where server_id=s and user_id=u;
  elsif p_action='set_pin' then
    activev:=(p->>'active')::boolean;
    if activev is null then raise exception 'Sabitleme durumu gerekli.'; end if;
    if not community_v2.has_permission(s,u,'messages.pin') then raise exception 'Mesaj sabitleme iznin yok.' using errcode='42501'; end if;
    changed:=activev is distinct from (msg.pinned_at is not null);
    if not changed then return jsonb_build_object('ok',true); end if;
    if activev and (select count(*) from community_v2.messages where channel_id=c and pinned_at is not null)>=50 then raise exception 'Kanalda en fazla 50 sabit mesaj olabilir.'; end if;
    if member.last_interaction_at>clock_timestamp()-interval '350 milliseconds' then raise exception 'Biraz bekleyip tekrar dene.'; end if;
    update community_v2.messages set pinned_at=case when activev then now() else null end,pinned_by=case when activev then u else null end where id=msg.id;
    update community_v2.members set last_interaction_at=clock_timestamp() where server_id=s and user_id=u;
    insert into community_v2.audit(server_id,actor_id,action,target_id,details) values(s,u,case when activev then 'message.pin' else 'message.unpin' end,msg.id,jsonb_build_object('channel_id',c));
  else raise exception 'Bilinmeyen mesaj işlemi.';
  end if;
  perform community_v2.emit(s,c);
  return jsonb_build_object('ok',true);
end $$;
revoke all on function community_v2.permission_catalog(),community_v2.manage_api(text,jsonb),community_v2.read_api(text,jsonb),community_v2.message_write(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.read_api(text,jsonb) to authenticated;
