create function community_v2.read_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; result jsonb; offn integer := greatest(0,least(coalesce((p->>'offset')::integer,0),100000));
begin
  if p_action='home' then
    return jsonb_build_object(
      'auto_join',coalesce((select auto_join from community_v2.preferences where user_id=u),true),
      'servers',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select v.id,f.name,f.avatar_url,f.slug,v.owner_id from community_v2.servers v
        join public.fansubs f on f.id=v.fansub_id join community_v2.members m on m.server_id=v.id and m.user_id=u
        where f.is_active and m.state='active' order by f.name limit 100)x),'[]'::jsonb),
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
      'permissions',coalesce((select jsonb_agg(key) from unnest(array['channel.view','messages.read','messages.send',
        'messages.self.edit','messages.self.delete','messages.others.delete','members.list','server.audit.read',
        'members.timeout','members.kick','members.ban'])key where community_v2.has_permission(s,u,key)),'[]'::jsonb),
      'timeout_until',(select timeout_until from community_v2.members where server_id=s and user_id=u),
      'channels',coalesce((select jsonb_agg(to_jsonb(x) order by x.position,x.id) from (
        select ch.id,ch.name,ch.topic,ch.is_private,ch.position,
          community_v2.can_read(ch.id,u) as can_read,
          case when community_v2.can_read(ch.id,u) then least(999,(select count(*) from (
            select 1 from community_v2.messages msg where msg.channel_id=ch.id
            and msg.seq>coalesce(rd.last_seq,0) and msg.author_id<>u and msg.deleted_at is null limit 999) n)) else 0 end as unread,
          case when community_v2.is_owner(s,u) then coalesce((select jsonb_agg(role_id) from community_v2.channel_roles where channel_id=ch.id),'[]'::jsonb) else '[]'::jsonb end as role_ids
        from community_v2.channels ch left join community_v2.reads rd on rd.channel_id=ch.id and rd.user_id=u
        where ch.server_id=s and community_v2.can_view(ch.id,u))x),'[]'::jsonb),
      'roles',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from community_v2.roles r where r.server_id=s),'[]'::jsonb));
  elsif p_action='members' then
    if not community_v2.has_permission(s,u,'members.list') then return '[]'::jsonb; end if;
    if c is not null and not community_v2.can_view(c,u) then raise exception 'Bu kanala erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select m.user_id,usr.username,usr.display_name,usr.avatar_url,m.state,m.timeout_until,
        community_v2.is_owner(s,m.user_id) as is_owner,
        coalesce((select jsonb_agg(mr.role_id) from community_v2.member_roles mr where mr.server_id=s and mr.user_id=m.user_id),'[]'::jsonb) role_ids
      from community_v2.members m join public.users usr on usr.id=m.user_id where m.server_id=s
      and (m.state='active' or (community_v2.is_owner(s,u) and coalesce((p->>'include_inactive')::boolean,false)))
      and (c is null or community_v2.can_view(c,m.user_id))
      and usr.username ilike '%'||left(coalesce(p->>'search',''),60)||'%'
      order by community_v2.is_owner(s,m.user_id) desc,usr.username,m.user_id limit 51 offset offn)x),'[]'::jsonb);
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
      select a.id,a.action,a.target_id,a.created_at,usr.username from community_v2.audit a left join public.users usr on usr.id=a.actor_id
      where a.server_id=s order by a.id desc limit 50 offset offn)x),'[]'::jsonb);
  end if;
  raise exception 'Bilinmeyen topluluk sorgusu.';
end $$;

create function community_v2.write_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; r uuid := nullif(p->>'role_id','')::uuid;
  target uuid := nullif(p->>'user_id','')::uuid; ident uuid; seqn bigint; bodyv text;
  perms text[]; roleids uuid[]; owner boolean; msg community_v2.messages; member community_v2.members;
begin
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
    if not community_v2.can_view(c,u) or not community_v2.has_permission(s,u,'messages.send') then raise exception 'Bu kanala yazma iznin yok.' using errcode='42501'; end if;
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
      if msg.author_id<>u or not community_v2.has_permission(s,u,'messages.self.edit') then raise exception 'Bu mesajı düzenleyemezsin.' using errcode='42501'; end if;
      if exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then raise exception 'Yazma kısıtlaman henüz bitmedi.' using errcode='42501'; end if;
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
  elsif p_action='moderate' then
    if not exists(select 1 from community_v2.members where server_id=s and user_id=target) then raise exception 'Üye bulunamadı.'; end if;
    if target=u or exists(select 1 from community_v2.servers where id=s and owner_id=target) then raise exception 'Kendine veya sunucu sahibine bu işlemi uygulayamazsın.'; end if;
    if not community_v2.has_permission(s,u,case p->>'operation' when 'timeout' then 'members.timeout' when 'kick' then 'members.kick' when 'ban' then 'members.ban' when 'unban' then 'members.ban' else '' end) then raise exception 'Bu işlem için yetkin yok.' using errcode='42501'; end if;
    -- Only the owner can intervene on members with management permission.
    if not owner and exists(select 1 from unnest(array['members.timeout','members.kick','members.ban','messages.others.delete'])k where community_v2.has_permission(s,target,k)) then raise exception 'Bu üyeye yalnız sunucu sahibi müdahale edebilir.' using errcode='42501'; end if;
    if p->>'operation'='timeout' then
      update community_v2.members set timeout_until=case when (p->>'minutes')::integer=0 then null else now()+make_interval(mins=>greatest(1,least(10080,(p->>'minutes')::integer))) end where server_id=s and user_id=target;
    else
      update community_v2.members set state=case when p->>'operation'='ban' then 'banned' else 'left' end where server_id=s and user_id=target;
      delete from community_v2.member_roles where server_id=s and user_id=target;
    end if;
    insert into community_v2.audit(server_id,actor_id,action,target_id) values(s,u,'member.'||(p->>'operation'),target);
  else
    if not owner then raise exception 'Bu ayarı yalnız sunucu sahibi değiştirebilir.' using errcode='42501'; end if;
    if p_action='save_role' then
      select coalesce(array_agg(value),'{}') into perms from jsonb_array_elements_text(p->'permissions');
      if r is null then
        if (select count(*) from community_v2.roles where server_id=s)>=50 then raise exception 'En fazla 50 rol oluşturabilirsin.'; end if;
        insert into community_v2.roles(server_id,name,color,position,permissions)
          values(s,btrim(p->>'name'),p->>'color',(p->>'position')::integer,perms) returning id into r;
      else
        update community_v2.roles set name=btrim(p->>'name'),color=p->>'color',position=(p->>'position')::integer,permissions=perms where id=r and server_id=s;
        if not found then raise exception 'Rol bulunamadı.'; end if;
      end if;
      ident:=r;
    elsif p_action='assign_roles' then
      if not exists(select 1 from community_v2.members where server_id=s and user_id=target and state='active') then raise exception 'Aktif üye bulunamadı.'; end if;
      select coalesce(array_agg(value::uuid),'{}') into roleids from jsonb_array_elements_text(p->'role_ids');
      if exists(select 1 from unnest(roleids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s and not is_default)) then raise exception 'Bu sunucuya ait özel rolleri seçmelisin.'; end if;
      delete from community_v2.member_roles where server_id=s and user_id=target;
      insert into community_v2.member_roles select s,target,v from (select distinct unnest(roleids)v)x;
      ident:=target;
    elsif p_action='save_channel' then
      select coalesce(array_agg(value::uuid),'{}') into roleids from jsonb_array_elements_text(p->'role_ids');
      if exists(select 1 from unnest(roleids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s)) then raise exception 'Kanal rolleri bu sunucuya ait olmalı.'; end if;
      if c is null then
        if (select count(*) from community_v2.channels where server_id=s)>=100 then raise exception 'En fazla 100 kanal oluşturabilirsin.'; end if;
        insert into community_v2.channels(server_id,name,topic,is_private,position)
          values(s,btrim(p->>'name'),coalesce(p->>'topic',''),(p->>'is_private')::boolean,(p->>'position')::integer) returning id into c;
      else
        update community_v2.channels set name=btrim(p->>'name'),topic=coalesce(p->>'topic',''),is_private=(p->>'is_private')::boolean,position=(p->>'position')::integer where id=c and server_id=s;
        if not found then raise exception 'Kanal bulunamadı.'; end if;
      end if;
      delete from community_v2.channel_roles where channel_id=c;
      insert into community_v2.channel_roles select s,c,v from (select distinct unnest(roleids)v)x;
      ident:=c;
    else raise exception 'Bilinmeyen topluluk işlemi.';
    end if;
    insert into community_v2.audit(server_id,actor_id,action,target_id) values(s,u,p_action,ident);
  end if;
  perform community_v2.emit(s);
  return jsonb_build_object('ok',true,'id',ident);
end $$;

create function public.community_v2_read(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.read_api(p_action,p_payload); $$;
create function public.community_v2_write(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.write_api(p_action,p_payload); $$;
revoke all on function public.community_v2_read(text,jsonb),public.community_v2_write(text,jsonb) from public,anon;
grant execute on function community_v2.read_api(text,jsonb),community_v2.write_api(text,jsonb),
  public.community_v2_read(text,jsonb),public.community_v2_write(text,jsonb) to authenticated;
