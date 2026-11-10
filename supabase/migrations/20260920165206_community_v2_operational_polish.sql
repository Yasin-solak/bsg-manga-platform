-- Edge cases found in visual tests, delegation and capacity checks.
create index if not exists attachments_channel_message_idx on community_v2.attachments(channel_id,message_id);
create or replace function community_v2.membership_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare cfg community_v2.operations_config; v community_v2.servers;
begin
  if new.state<>'active' or (tg_op='UPDATE' and old.state='active') then return new; end if;
  if tg_op='INSERT' and exists(select 1 from community_v2.members where server_id=new.server_id and user_id=new.user_id and state='active') then return new; end if;
  select * into v from community_v2.servers where id=new.server_id for update;
  if v.archived_at is not null or not community_v2.server_active(v.id) then raise exception 'Sunucu şu anda katılıma kapalı.'; end if;
  select * into cfg from community_v2.operations_config where id;
  if (select count(*) from community_v2.members where server_id=v.id and state='active')>=cfg.members_per_server then raise exception 'Sunucunun üye kapasitesi doldu.' using errcode='P4201'; end if;
  if (select count(*) from community_v2.members where server_id=v.id and joined_at>clock_timestamp()-interval '1 minute')>=cfg.joins_per_minute then raise exception 'Katılımlar yoğun. Bir dakika sonra yeniden dene.' using errcode='P4201'; end if;
  new.joined_at:=clock_timestamp();
  return new;
end $$;
create or replace function community_v2.room_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); s uuid:=nullif(p->>'server_id','')::uuid; v community_v2.servers;
  target uuid:=nullif(p->>'user_id','')::uuid; cap integer; nm text; mode text; result jsonb;
begin
  if p_action='create' then
    nm:=btrim(p->>'name'); mode:=p->>'join_mode';
    if nm is null or char_length(nm) not between 1 and 80 or mode is null or mode not in ('open','invite','request') then raise exception 'Oda adı ve katılım türünü seç.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('community-room-owner:'||u,0));
    if nullif(p->>'client_id','') is not null then
      select * into v from community_v2.servers where owner_id=u and create_key=(p->>'client_id')::uuid;
      if found then
        if v.name<>nm or v.join_mode<>mode then raise exception 'Oluşturma anahtarı farklı bilgilerle kullanılmış.'; end if;
        return jsonb_build_object('id',v.id);
      end if;
    end if;
    select rooms_per_owner into cap from community_v2.operations_config where id;
    if (select count(*) from community_v2.servers where owner_id=u and fansub_id is null)>=cap then raise exception 'En fazla % odanın sahibi olabilirsin. Arşivlediğin odalar da bu sınıra dahildir.',cap; end if;
    insert into community_v2.servers(owner_id,name,join_mode,create_key) values(u,nm,mode,nullif(p->>'client_id','')::uuid) returning * into v;
    insert into community_v2.members(server_id,user_id) values(v.id,u);
    insert into community_v2.roles(server_id,name,is_default,position,permissions)
      values(v.id,'Herkes',true,1000,array['channel.view','messages.read','messages.send','messages.self.edit','messages.self.delete','members.list']);
    insert into community_v2.channels(server_id,name,topic) values(v.id,'genel-sohbet','Tanış, sohbet et ve birlikte okuduklarını paylaş.');
    insert into community_v2.audit(server_id,actor_id,action,target_id) values(v.id,u,'room.created',v.id);
    return jsonb_build_object('id',v.id);
  elsif p_action='transfers' then
    return coalesce((select jsonb_agg(community_v2.server_card(id)) from community_v2.servers
      where transfer_to=u and transfer_until>now() and fansub_id is null and community_v2.is_member(id,u)),'[]'::jsonb);
  end if;
  -- Transfers lock the target account quota first; parallel transfers from two rooms cannot exceed it either.
  if p_action='accept_transfer' then perform pg_advisory_xact_lock(hashtextextended('community-room-owner:'||u,0)); end if;
  select * into v from community_v2.servers where id=s for update;
  if not found or not community_v2.server_active(s) then raise exception 'Sunucu bulunamadı.' using errcode='42501'; end if;
  if p_action='join' then
    if v.archived_at is not null then raise exception 'Sunucu arşivlenmiş.'; end if;
    if exists(select 1 from community_v2.members where server_id=s and user_id=u and state='banned') then raise exception 'Bu sunucuya katılamazsın.' using errcode='42501'; end if;
    if community_v2.is_member(s,u) then return jsonb_build_object('ok',true); end if;
    if v.join_mode='invite' then raise exception 'Bu sunucuya katılmak için geçerli bir davet gerekli.'; end if;
    if v.join_mode='request' then
      if (select count(*) from community_v2.join_requests where user_id=u)>=20 and not exists(select 1 from community_v2.join_requests where server_id=s and user_id=u) then raise exception 'Bekleyen başvuruların sınırına ulaştın.'; end if;
      insert into community_v2.join_requests(server_id,user_id) values(s,u) on conflict do nothing;
      perform community_v2.emit(s); return jsonb_build_object('pending',true);
    end if;
    insert into community_v2.members(server_id,user_id) values(s,u) on conflict(server_id,user_id) do update set state='active';
    delete from community_v2.join_requests where server_id=s and user_id=u;
    perform community_v2.emit(s); return jsonb_build_object('ok',true);
  end if;
  if not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  if p_action='info' then
    return community_v2.server_card(s)||jsonb_build_object('transfer_to',case when community_v2.is_owner(s,u) then v.transfer_to else null end,
      'transfer_until',case when community_v2.is_owner(s,u) then v.transfer_until else null end);
  elsif p_action='nickname' then
    if target is null then target:=u; end if;
    if target<>u and (not community_v2.has_permission(s,u,'members.nicknames.manage') or not community_v2.outranks_member(s,u,target)) then raise exception 'Bu üyenin adını düzenleyemezsin.' using errcode='42501'; end if;
    if not community_v2.is_owner(s,u) and exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then raise exception 'Yazma kısıtlaman bitince tekrar dene.'; end if;
    nm:=nullif(btrim(p->>'nickname'),''); if char_length(nm)>32 then raise exception 'Takma ad en fazla 32 karakter olabilir.'; end if;
    update community_v2.members set nickname=nm where server_id=s and user_id=target and state='active';
    perform community_v2.emit(s); return jsonb_build_object('ok',true);
  end if;
  if not community_v2.is_owner(s,u) and exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then raise exception 'Yönetim işlemleri geçici olarak kısıtlı.' using errcode='42501'; end if;
  if p_action in ('requests','decide_request') then
    if not community_v2.has_permission(s,u,'members.approve') then raise exception 'Katılım başvurusu yönetme iznin yok.' using errcode='42501'; end if;
    if p_action='requests' then
      return coalesce((select jsonb_agg(to_jsonb(x)) from (select j.user_id,j.created_at,usr.username,usr.display_name,usr.avatar_url
        from community_v2.join_requests j join public.users usr on usr.id=j.user_id where j.server_id=s
        and usr.is_active and not usr.is_banned order by j.created_at,j.user_id limit 51 offset greatest(0,least(coalesce((p->>'offset')::integer,0),100000)))x),'[]'::jsonb);
    end if;
    if not exists(select 1 from community_v2.join_requests where server_id=s and user_id=target) then raise exception 'Başvuru artık beklemiyor.'; end if;
    if coalesce((p->>'approve')::boolean,false) then
      if exists(select 1 from community_v2.members where server_id=s and user_id=target and state='banned') or not exists(select 1 from public.users where id=target and is_active and not is_banned) then raise exception 'Bu hesap katılamaz.'; end if;
      insert into community_v2.members(server_id,user_id) values(s,target) on conflict(server_id,user_id) do update set state='active';
    end if;
    delete from community_v2.join_requests where server_id=s and user_id=target;
  elsif p_action='save_join_mode' then
    if not community_v2.has_permission(s,u,'server.join.manage') then raise exception 'Katılım politikasını değiştirme iznin yok.' using errcode='42501'; end if;
    if v.version is distinct from (p->>'version')::integer then raise exception 'Ayarlar değişti. Yenileyip tekrar dene.'; end if;
    mode:=p->>'join_mode';
    if mode is null or mode not in ('open','invite','request') then raise exception 'Katılım türünü seç.'; end if;
    update community_v2.servers set join_mode=mode,version=version+1 where id=s;
  elsif p_action='save_profile' then
    if not community_v2.has_permission(s,u,'server.profile.manage') then raise exception 'Sunucu profili düzenleme iznin yok.' using errcode='42501'; end if;
    if v.version is distinct from (p->>'version')::integer then raise exception 'Ayarlar değişti. Yenileyip tekrar dene.'; end if;
    nm:=btrim(p->>'name'); mode:=p->>'join_mode';
    if nm is null or char_length(nm) not between 1 and 80 or mode is null or mode not in ('open','invite','request')
      or char_length(coalesce(p->>'description',''))>500 or char_length(coalesce(p->>'rules',''))>5000 then raise exception 'Sunucu bilgilerini kontrol et.'; end if;
    if mode<>v.join_mode and not community_v2.has_permission(s,u,'server.join.manage') then raise exception 'Katılım politikasını değiştirme iznin yok.' using errcode='42501'; end if;
    if exists(select 1 from unnest(array[nullif(p->>'avatar_url',''),nullif(p->>'banner_url','')]) url where url is not null and (url !~ '^https://' or char_length(url)>2048)) then raise exception 'Görseller için geçerli HTTPS adresi kullan.'; end if;
    update community_v2.servers set name=nm,description=coalesce(p->>'description',''),rules=coalesce(p->>'rules',''),
      avatar_url=nullif(p->>'avatar_url',''),banner_url=nullif(p->>'banner_url',''),join_mode=mode,version=version+1 where id=s;
  elsif p_action='accept_transfer' then
    if v.fansub_id is not null or v.transfer_to is distinct from u or v.transfer_until<=now() or v.transfer_until is null then raise exception 'Devir isteği geçerli değil.'; end if;
    select rooms_per_owner into cap from community_v2.operations_config where id;
    if (select count(*) from community_v2.servers where owner_id=u and fansub_id is null)>=cap then raise exception 'En fazla % odanın sahibi olabilirsin.',cap; end if;
    update community_v2.servers set owner_id=u,transfer_to=null,transfer_until=null,version=version+1 where id=s;
  elsif p_action in ('offer_transfer','cancel_transfer','archive') then
    if v.fansub_id is not null or not community_v2.is_owner(s,u) then raise exception 'Bu işlem yalnız bağımsız odanın sahibine açık.' using errcode='42501'; end if;
    if v.version is distinct from (p->>'version')::integer then raise exception 'Ayarlar değişti. Yenileyip tekrar dene.'; end if;
    if p_action='offer_transfer' then
      if target is null or target=u or not community_v2.is_member(s,target) or not exists(select 1 from public.users where id=target and is_active and not is_banned) then raise exception 'Aktif bir oda üyesi seç.'; end if;
      update community_v2.servers set transfer_to=target,transfer_until=now()+interval '7 days',version=version+1 where id=s;
    elsif p_action='cancel_transfer' then update community_v2.servers set transfer_to=null,transfer_until=null,version=version+1 where id=s;
    else update community_v2.servers set archived_at=case when (p->>'archived')::boolean then now() else null end,version=version+1 where id=s;
    end if;
  else raise exception 'Bilinmeyen sunucu işlemi.';
  end if;
  insert into community_v2.audit(server_id,actor_id,action,target_id,details) values(s,u,'room.'||p_action,coalesce(target,s),jsonb_build_object('after',p->>'approve'));
  perform community_v2.emit(s); return jsonb_build_object('ok',true);
end $$;
create or replace function community_v2.personal_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); c uuid:=nullif(p->>'channel_id','')::uuid; s uuid:=nullif(p->>'server_id','')::uuid;
  cfg community_v2.preferences; modev text; muted timestamptz; term text; chosen uuid[]; perms text[]; result jsonb;
begin
  if p_action in ('preferences','save_preferences') then
    if p_action='save_preferences' then
      modev:=p->>'notifications';
      if modev is null or modev not in ('all','mentions','off') or p->>'auto_join' is null or p->>'push_enabled' is null or p->>'show_presence' is null or p->>'show_typing' is null then raise exception 'Tercihlerini kontrol et.'; end if;
      insert into community_v2.preferences(user_id,auto_join,notifications,push_enabled,show_presence,show_typing)
        values(u,(p->>'auto_join')::boolean,modev,(p->>'push_enabled')::boolean,(p->>'show_presence')::boolean,(p->>'show_typing')::boolean)
        on conflict(user_id) do update set auto_join=excluded.auto_join,notifications=excluded.notifications,push_enabled=excluded.push_enabled,show_presence=excluded.show_presence,show_typing=excluded.show_typing;
      if not (p->>'show_presence')::boolean then delete from community_v2.presence where user_id=u;
      elsif not (p->>'show_typing')::boolean then update community_v2.presence set typing_until=null where user_id=u; end if;
    else insert into community_v2.preferences(user_id) values(u) on conflict do nothing;
    end if;
    return (select to_jsonb(pr)-'user_id' from community_v2.preferences pr where user_id=u);
  end if;
  if c is not null then
    select server_id into s from community_v2.channels where id=c;
    if not community_v2.can_read(c,u) then raise exception 'Bu kanala erişimin yok.' using errcode='42501'; end if;
  end if;
  if not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  if p_action in ('scope','save_scope') then
    if p_action='save_scope' then
      modev:=p->>'mode'; muted:=nullif(p->>'muted_until','')::timestamptz;
      if modev is null or modev not in ('inherit','all','mentions','off') or muted>now()+interval '366 days' then raise exception 'Bildirim tercihini kontrol et.'; end if;
      insert into community_v2.notification_scopes(user_id,scope_id,server_id,channel_id,mode,muted_until)
        values(u,coalesce(c,s),s,c,modev,muted) on conflict(user_id,scope_id) do update set mode=excluded.mode,muted_until=excluded.muted_until;
    end if;
    return coalesce((select jsonb_build_object('mode',mode,'muted_until',muted_until) from community_v2.notification_scopes where user_id=u and scope_id=coalesce(c,s)),jsonb_build_object('mode','inherit','muted_until',null));
  elsif p_action in ('presence','heartbeat','offline') then
    if c is null then raise exception 'Kanal gerekli.'; end if;
    if p_action='offline' then delete from community_v2.presence where channel_id=c and user_id=u; return '[]'::jsonb; end if;
    select * into cfg from community_v2.preferences where user_id=u;
    if p_action='heartbeat' and coalesce(cfg.show_presence,true) then
      insert into community_v2.presence(channel_id,user_id,typing_until) values(c,u,
        case when coalesce((p->>'typing')::boolean,false) and coalesce(cfg.show_typing,true) and community_v2.has_permission(s,u,'messages.send')
          and not exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now())
          and not exists(select 1 from community_v2.servers where id=s and archived_at is not null)
          and not exists(select 1 from community_v2.channels where id=c and archived_at is not null)
          then now()+interval '8 seconds' else null end)
        on conflict(channel_id,user_id) do update set seen_at=now(),typing_until=excluded.typing_until
        where community_v2.presence.seen_at<now()-interval '2 seconds';
      if found then perform realtime.send('{}'::jsonb,'presence','community-v2:channel:'||c,true); end if;
    end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (select pr.user_id,usr.username,coalesce(m.nickname,usr.display_name,usr.username) name,coalesce(pr.typing_until>now(),false) typing, greatest(0,coalesce(extract(epoch from pr.typing_until-now()),0)) typing_seconds, greatest(0,extract(epoch from pr.seen_at+interval '90 seconds'-now())) presence_seconds
      from community_v2.presence pr join public.users usr on usr.id=pr.user_id join community_v2.members m on m.server_id=s and m.user_id=pr.user_id
      left join community_v2.preferences pref on pref.user_id=pr.user_id
      where pr.channel_id=c and pr.seen_at>now()-interval '90 seconds' and coalesce(pref.show_presence,true)
      and usr.is_active and not usr.is_banned and community_v2.can_read(c,pr.user_id) and not community_v2.blocked(u,pr.user_id)
      order by (pr.typing_until>now()) desc nulls last,pr.seen_at desc limit 100)x),'[]'::jsonb);
  elsif p_action='search' then
    if c is null then raise exception 'Aramak için kanal seç.'; end if;
    term:=btrim(coalesce(p->>'search',''));
    if char_length(term)>100 or (term<>'' and char_length(term)<2) then raise exception 'Arama 2–100 karakter olmalı.'; end if;
    return coalesce((select jsonb_agg(community_v2.message_json(msg,u) order by msg.seq desc) from (
      select m.* from community_v2.messages m where m.channel_id=c and m.deleted_at is null and not community_v2.blocked(u,m.author_id)
      and (term='' or to_tsvector('simple',m.body) @@ plainto_tsquery('simple',term))
      and (nullif(p->>'author_id','') is null or m.author_id=(p->>'author_id')::uuid)
      and (nullif(p->>'from','') is null or m.created_at>=(p->>'from')::timestamptz)
      and (nullif(p->>'to','') is null or m.created_at<(p->>'to')::timestamptz)
      and (not coalesce((p->>'has_files')::boolean,false) or cardinality(m.attachment_ids)>0)
      and (nullif(p->>'before','') is null or m.seq<(p->>'before')::bigint)
      order by m.seq desc limit 26)msg),'[]'::jsonb);
  elsif p_action='role_preview' then
    if not exists(select 1 from unnest(array['roles.create','roles.appearance.manage','roles.permissions.manage','roles.order.manage','roles.assign','server.audit.read'])k where community_v2.has_permission(s,u,k)) then raise exception 'Rol önizleme iznin yok.' using errcode='42501'; end if;
    if jsonb_typeof(p->'role_ids') is distinct from 'array' or jsonb_array_length(p->'role_ids')>50 then raise exception 'Rol seçimini kontrol et.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into chosen from jsonb_array_elements_text(p->'role_ids');
    if exists(select 1 from unnest(chosen) selected(role_id) where not exists(select 1 from community_v2.roles r where r.server_id=s and r.id=selected.role_id)) then raise exception 'Roller bu sunucuya ait olmalı.'; end if;
    select coalesce(array_agg(distinct k),'{}') into perms from community_v2.roles r cross join lateral unnest(r.permissions)k where r.server_id=s and (r.is_default or r.id=any(chosen));
    return jsonb_build_object('permissions',perms,'channels',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'name',ch.name,'can_read','messages.read'=any(perms),
      'can_send','messages.send'=any(perms) and 'messages.read'=any(perms) and ch.archived_at is null and community_v2.series_status(s,ch.manga_id) is null and (select archived_at is null from community_v2.servers where id=s)))
      from community_v2.channels ch where ch.server_id=s and community_v2.can_view(ch.id,u)
      and (case when ch.is_private then exists(select 1 from community_v2.channel_roles cr join community_v2.roles rr on rr.id=cr.role_id where cr.channel_id=ch.id and (rr.is_default or rr.id=any(chosen))) else 'channel.view'=any(perms) end)),'[]'::jsonb));
  end if;
  raise exception 'Bilinmeyen kişisel topluluk işlemi.';
end $$;

-- Follow is independent of community capacity; only a quota error defers auto join.
create or replace function community_v2.try_auto_join(s uuid,u uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from community_v2.servers where id=s and join_mode='open' and archived_at is null for update;
  if not found or not community_v2.server_active(s) or exists(select 1 from community_v2.members where server_id=s and user_id=u) then return false; end if;
  begin
    insert into community_v2.members(server_id,user_id) values(s,u);
  exception when sqlstate 'P4201' then return false;
  end;
  return true;
end $$;
create or replace function community_v2.follow_join() returns trigger
language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
  if coalesce((select auto_join from community_v2.preferences where user_id=new.user_id),true) then
    for s in select id from community_v2.servers where fansub_id=new.fansub_id order by id loop
      perform community_v2.try_auto_join(s,new.user_id);
    end loop;
  end if;
  return new;
end $$;
create or replace function community_v2.sync_my_follows() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); s uuid;
begin
  if coalesce((select auto_join from community_v2.preferences where user_id=u),true) then
    for s in select v.id from public.fansub_follows ff join community_v2.servers v on v.fansub_id=ff.fansub_id
      where ff.user_id=u and v.join_mode='open' and v.archived_at is null
      and not exists(select 1 from community_v2.members m where m.server_id=v.id and m.user_id=u) order by v.id loop
      perform community_v2.try_auto_join(s,u);
    end loop;
  end if;
end $$;
revoke all on function community_v2.try_auto_join(uuid,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
