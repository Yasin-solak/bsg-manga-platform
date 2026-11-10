-- Fansub ownership is kept; independent rooms use the same access engine.
alter table community_v2.servers alter column fansub_id drop not null;
alter table community_v2.servers
  add column name text check (char_length(name) between 1 and 80),
  add column description text not null default '' check (char_length(description)<=500),
  add column rules text not null default '' check (char_length(rules)<=5000),
  add column avatar_url text check (avatar_url ~ '^https://' and char_length(avatar_url)<=2048),
  add column banner_url text check (banner_url ~ '^https://' and char_length(banner_url)<=2048),
  add column join_mode text not null default 'open' check (join_mode in ('open','invite','request')),
  add column archived_at timestamptz,
  add column version integer not null default 1,
  add column transfer_to uuid references public.users(id) on delete set null,
  add column transfer_until timestamptz,
  add column create_key uuid,
  add constraint independent_room_name check (fansub_id is not null or name is not null);
create index servers_owner_rooms_idx on community_v2.servers(owner_id) where fansub_id is null;
create index servers_transfer_idx on community_v2.servers(transfer_to) where transfer_to is not null;
create unique index servers_create_key_idx on community_v2.servers(owner_id,create_key) where create_key is not null;
alter table community_v2.roles add column icon text not null default '' check (char_length(icon)<=8),
  add column hoist boolean not null default false;
alter table community_v2.members add column nickname text check (char_length(nickname) between 1 and 32);

create table community_v2.join_requests (
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(server_id,user_id)
);
create index join_requests_user_idx on community_v2.join_requests(user_id);
create table community_v2.operations_config (
  id boolean primary key default true check(id),
  rooms_per_owner integer not null default 3 check(rooms_per_owner between 1 and 100),
  members_per_server integer not null default 5000 check(members_per_server between 10 and 100000),
  storage_bytes_per_server bigint not null default 1073741824 check(storage_bytes_per_server between 10485760 and 1099511627776),
  joins_per_minute integer not null default 30 check(joins_per_minute between 1 and 1000),
  audit_days integer not null default 180 check(audit_days between 30 and 3650),
  report_days integer not null default 180 check(report_days between 30 and 3650),
  expired_invite_days integer not null default 90 check(expired_invite_days between 1 and 3650),
  version integer not null default 1
);
insert into community_v2.operations_config(id) values(true);
alter table community_v2.join_requests enable row level security;
alter table community_v2.operations_config enable row level security;
revoke all on community_v2.join_requests,community_v2.operations_config from public,anon,authenticated;

create or replace function community_v2.server_active(s uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select v.fansub_id is null or f.is_active from community_v2.servers v
    left join public.fansubs f on f.id=v.fansub_id where v.id=s),false);
$$;
create or replace function community_v2.is_owner(s uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select v.owner_id=u and (v.fansub_id is null or
    (f.is_active and (select count(*) from public.fansub_members m where m.fansub_id=v.fansub_id and m.role='admin')=1
      and exists(select 1 from public.fansub_members m where m.fansub_id=v.fansub_id and m.user_id=u and m.role='admin')))
    from community_v2.servers v left join public.fansubs f on f.id=v.fansub_id where v.id=s),false);
$$;
create or replace function community_v2.is_member(s uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select community_v2.server_active(s) and exists(select 1 from community_v2.members where server_id=s and user_id=u and state='active');
$$;
create or replace function community_v2.server_card(s uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',v.id,'name',coalesce(v.name,f.name),'description',case when v.description<>'' then v.description else coalesce(f.description,'') end,
    'avatar_url',coalesce(v.avatar_url,f.avatar_url),'banner_url',v.banner_url,'slug',coalesce(f.slug,''),
    'owner_id',v.owner_id,'kind',case when v.fansub_id is null then 'room' else 'fansub' end,
    'join_mode',v.join_mode,'rules',v.rules,'archived_at',v.archived_at,'version',v.version)
    from community_v2.servers v left join public.fansubs f on f.id=v.fansub_id where v.id=s;
$$;

-- Concurrent joins cannot exceed the quota/raid limit; auto follow also goes through this door.
create or replace function community_v2.membership_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare cfg community_v2.operations_config; v community_v2.servers;
begin
  if new.state<>'active' or (tg_op='UPDATE' and old.state='active') then return new; end if;
  select * into v from community_v2.servers where id=new.server_id for update;
  if v.archived_at is not null or not community_v2.server_active(v.id) then raise exception 'Sunucu şu anda katılıma kapalı.'; end if;
  select * into cfg from community_v2.operations_config where id;
  if (select count(*) from community_v2.members where server_id=v.id and state='active')>=cfg.members_per_server then raise exception 'Sunucunun üye kapasitesi doldu.'; end if;
  if (select count(*) from community_v2.members where server_id=v.id and joined_at>clock_timestamp()-interval '1 minute')>=cfg.joins_per_minute then raise exception 'Katılımlar yoğun. Bir dakika sonra yeniden dene.'; end if;
  new.joined_at:=clock_timestamp();
  return new;
end $$;
create trigger community_membership_guard before insert or update of state on community_v2.members
  for each row execute function community_v2.membership_guard();

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

create or replace function public.community_v2_rooms(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select community_v2.room_api(p_action,p_payload)$$;
revoke all on function community_v2.server_active(uuid),community_v2.server_card(uuid),community_v2.membership_guard(),community_v2.room_api(text,jsonb),public.community_v2_rooms(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.room_api(text,jsonb),public.community_v2_rooms(text,jsonb) to authenticated;
notify pgrst,'reload schema';
