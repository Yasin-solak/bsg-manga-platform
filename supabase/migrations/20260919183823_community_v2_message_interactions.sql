-- Content and interactions are protected by the same channel access; live events carry no body.
alter table community_v2.roles add column mentionable boolean not null default false;
alter table community_v2.members add column last_interaction_at timestamptz;
alter table community_v2.messages
  add column reply_to uuid,
  add column mentions jsonb not null default '[]'::jsonb check (jsonb_typeof(mentions)='array' and jsonb_array_length(mentions)<=10),
  add column version integer not null default 1,
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.users(id),
  add constraint messages_channel_id_id_unique unique(channel_id,id),
  add constraint messages_reply_same_channel foreign key(channel_id,reply_to) references community_v2.messages(channel_id,id),
  add constraint messages_reply_not_self check (reply_to is distinct from id),
  add constraint messages_pin_pair check ((pinned_at is null)=(pinned_by is null));
create index messages_reply_idx on community_v2.messages(channel_id,reply_to) where reply_to is not null;
create index messages_pins_idx on community_v2.messages(channel_id,pinned_at desc) where pinned_at is not null;
create index messages_pinner_idx on community_v2.messages(pinned_by) where pinned_by is not null;
create table community_v2.reactions (
  message_id uuid not null references community_v2.messages(id) on delete cascade,
  user_id uuid not null references public.users(id),
  emoji text not null check (emoji in ('👍','❤️','😂','🎉','😮','😢','🔥','👀')),
  created_at timestamptz not null default now(),
  primary key(message_id,emoji,user_id)
);
create index reactions_user_idx on community_v2.reactions(user_id);
alter table community_v2.reactions enable row level security;
revoke all on community_v2.reactions from public,anon,authenticated;

create or replace function community_v2.permission_catalog() returns text[]
language sql immutable set search_path='' as $$
  select array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban','roles.create','roles.appearance.manage',
    'roles.permissions.manage','roles.order.manage','roles.assign','roles.delete',
    'channels.create','channels.manage','channels.permissions.manage','channels.archive',
    'messages.reply','reactions.add','mentions.users','mentions.roles','messages.pin']::text[];
$$;

create function community_v2.parse_mentions(s uuid,c uuid,u uuid,bodyv text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text[]; target uuid; kindv text; result jsonb:='[]'; countv integer:=0;
begin
  for token in select regexp_matches(bodyv,'<@(&?)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>','g') loop
    countv:=countv+1; target:=token[2]::uuid; kindv:=case when token[1]='&' then 'role' else 'user' end;
    if countv>20 then raise exception 'Bir mesajda en fazla 20 etiket kullanabilirsin.'; end if;
    if kindv='user' then
      if not community_v2.has_permission(s,u,'mentions.users') or not community_v2.can_read(c,target) then
        raise exception 'Kullanıcı etiketi için izin ve aynı kanala okuma erişimi gerekli.' using errcode='42501';
      end if;
    else
      if not community_v2.has_permission(s,u,'mentions.roles') or not exists(
        select 1 from community_v2.roles r where r.id=target and r.server_id=s and r.mentionable and not r.is_default
      ) then raise exception 'Bu rol etiketlenemez veya rol etiketleme iznin yok.' using errcode='42501'; end if;
    end if;
    if not result @> jsonb_build_array(jsonb_build_object('kind',kindv,'id',target)) then
      result:=result||jsonb_build_array(jsonb_build_object('kind',kindv,'id',target));
    end if;
    if jsonb_array_length(result)>10 then raise exception 'Bir mesajda en fazla 10 farklı hedef etiketleyebilirsin.'; end if;
  end loop;
  return result;
end $$;

create function community_v2.mention_matches(tags jsonb,s uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from jsonb_array_elements(tags)t where
    (t->>'kind'='user' and t->>'id'=u::text) or
    (t->>'kind'='role' and exists(select 1 from community_v2.member_roles mr where mr.server_id=s and mr.user_id=u and mr.role_id=(t->>'id')::uuid)));
$$;

create function community_v2.message_json(m community_v2.messages,u uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',m.id,'seq',m.seq::text,'author_id',m.author_id,
    'body',case when m.deleted_at is null then m.body else '' end,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
    'username',usr.username,'display_name',usr.display_name,'avatar_url',usr.avatar_url,'version',m.version,
    'pinned_at',m.pinned_at,'mentioned_me',m.deleted_at is null and community_v2.mention_matches(m.mentions,ch.server_id,u),
    'mentions',case when m.deleted_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(t||jsonb_build_object(
      'label',case when t->>'kind'='user' then coalesce(mu.username,'silinmiş-kullanıcı') else coalesce(r.name,'silinmiş-rol') end,
      'username',mu.username,'color',r.color))
      from jsonb_array_elements(m.mentions)t
      left join public.users mu on t->>'kind'='user' and mu.id=(t->>'id')::uuid
      left join community_v2.roles r on t->>'kind'='role' and r.id=(t->>'id')::uuid and r.server_id=ch.server_id),'[]'::jsonb) end,
    'reply',case when m.deleted_at is not null or parent.id is null then null else jsonb_build_object(
      'id',parent.id,'seq',parent.seq::text,'author_id',parent.author_id,'username',pu.username,
      'display_name',pu.display_name,'deleted',parent.deleted_at is not null,
      'body',case when parent.deleted_at is null then left(regexp_replace(parent.body,'<@&?[0-9a-fA-F-]{36}>','@etiket','g'),200) else '' end) end,
    'reactions',case when m.deleted_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x) order by x.emoji) from (
      select rx.emoji,count(*)::integer as count,bool_or(rx.user_id=u) as mine from community_v2.reactions rx where rx.message_id=m.id group by rx.emoji)x),'[]'::jsonb) end)
  from public.users usr join community_v2.channels ch on ch.id=m.channel_id
  left join community_v2.messages parent on parent.id=m.reply_to and parent.channel_id=m.channel_id
  left join public.users pu on pu.id=parent.author_id where usr.id=m.author_id;
$$;

create function community_v2.message_read(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; seqn bigint; ids uuid[]; searchv text:=left(coalesce(p->>'search',''),60);
begin
  select server_id into s from community_v2.channels where id=c;
  if not community_v2.can_read(c,u) then raise exception 'Bu kanalın mesajlarını okuma iznin yok.' using errcode='42501'; end if;
  if p_action='mention_candidates' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      (select 'user'::text as kind,usr.id,usr.username as label,usr.username,null::text as color
       from community_v2.members mem join public.users usr on usr.id=mem.user_id
       where mem.server_id=s and mem.state='active' and community_v2.has_permission(s,u,'mentions.users')
       and strpos(lower(usr.username),lower(searchv))>0 and community_v2.can_read(c,usr.id)
       order by usr.username,usr.id limit 10)
      union all
      (select 'role',r.id,r.name,null::text,r.color from community_v2.roles r
       where r.server_id=s and r.mentionable and not r.is_default and community_v2.has_permission(s,u,'mentions.roles')
       and strpos(lower(r.name),lower(searchv))>0 order by r.position,r.id limit 10)
    )x),'[]'::jsonb);
  elsif p_action='message_snapshot' then
    if jsonb_typeof(p->'ids') is distinct from 'array' or jsonb_array_length(p->'ids')>250 then raise exception 'En fazla 250 mesaj yenilenebilir.'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p->'ids');
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.seq) from community_v2.messages m where m.channel_id=c and m.id=any(ids)),'[]'::jsonb);
  elsif p_action='message_context' then
    select seq into seqn from community_v2.messages where id=(p->>'message_id')::uuid and channel_id=c;
    if not found then raise exception 'Mesaj bu kanalda bulunamadı.'; end if;
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.seq) from (
      (select * from community_v2.messages where channel_id=c and seq<seqn order by seq desc limit 25)
      union all (select * from community_v2.messages where channel_id=c and seq>=seqn order by seq limit 25)
    )m),'[]'::jsonb);
  elsif p_action='pins' then
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.pinned_at desc) from (
      select * from community_v2.messages where channel_id=c and pinned_at is not null and deleted_at is null order by pinned_at desc limit 50)m),'[]'::jsonb);
  elsif p_action='messages' then
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.seq) from (
      select * from community_v2.messages where channel_id=c and (p->>'before' is null or seq<(p->>'before')::bigint) order by seq desc limit 50)m),'[]'::jsonb);
  end if;
  raise exception 'Bilinmeyen mesaj sorgusu.';
end $$;

create function community_v2.message_write(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; ch community_v2.channels;
  member community_v2.members; msg community_v2.messages; parent uuid:=nullif(p->>'reply_to','')::uuid;
  bodyv text:=btrim(p->>'body'); tags jsonb; ident uuid; seqn bigint; activev boolean; changed boolean;
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
    if not community_v2.has_permission(s,u,'messages.send') then raise exception 'Bu kanala yazma iznin yok.' using errcode='42501'; end if;
    if bodyv is null or char_length(bodyv) not between 1 and 4000 then raise exception 'Mesaj 1–4000 karakter olmalı.'; end if;
    if p->>'client_id' is null then raise exception 'Mesaj anahtarı gerekli.'; end if;
    select * into msg from community_v2.messages where author_id=u and client_id=(p->>'client_id')::uuid;
    if found then
      if msg.channel_id<>c or msg.body<>bodyv or msg.reply_to is distinct from parent or msg.deleted_at is not null then raise exception 'Mesaj anahtarı farklı içerik için kullanılamaz.'; end if;
      return jsonb_build_object('id',msg.id,'seq',msg.seq::text);
    end if;
    if parent is not null then
      if not community_v2.has_permission(s,u,'messages.reply') then raise exception 'Mesaja yanıt verme iznin yok.' using errcode='42501'; end if;
      if not exists(select 1 from community_v2.messages where id=parent and channel_id=c and deleted_at is null) then raise exception 'Yanıtlanan mesaj bu kanalda bulunamadı veya silindi.'; end if;
    end if;
    tags:=community_v2.parse_mentions(s,c,u,bodyv);
    if member.last_message_at>clock_timestamp()-interval '750 milliseconds' then raise exception 'Biraz yavaşla; mesajın yazı alanında korunuyor.'; end if;
    update community_v2.members set last_message_at=clock_timestamp() where server_id=s and user_id=u;
    update community_v2.channels set last_seq=last_seq+1 where id=c returning last_seq into seqn;
    insert into community_v2.messages(channel_id,seq,author_id,client_id,body,reply_to,mentions)
      values(c,seqn,u,(p->>'client_id')::uuid,bodyv,parent,tags) returning id into ident;
    perform community_v2.emit(s,c);
    return jsonb_build_object('id',ident,'seq',seqn::text);
  end if;
  select * into msg from community_v2.messages where id=(p->>'message_id')::uuid and channel_id=c for update;
  if not found or msg.deleted_at is not null then raise exception 'Mesaj bulunamadı veya silindi.'; end if;
  if p_action='edit_message' then
    if msg.author_id<>u or not community_v2.has_permission(s,u,'messages.self.edit') then raise exception 'Bu mesajı düzenleyemezsin.' using errcode='42501'; end if;
    if p ? 'version' and (p->>'version')::integer is distinct from msg.version then raise exception 'Mesaj değişti. Düzenleme penceresini yeniden aç.'; end if;
    if bodyv is null or char_length(bodyv) not between 1 and 4000 then raise exception 'Mesaj 1–4000 karakter olmalı.'; end if;
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

-- Default authenticated EXECUTE is separate so a PUBLIC revoke alone is not enough.
revoke all on function community_v2.permission_catalog(),community_v2.parse_mentions(uuid,uuid,uuid,text),
  community_v2.mention_matches(jsonb,uuid,uuid),community_v2.message_json(community_v2.messages,uuid),
  community_v2.message_read(text,jsonb),community_v2.message_write(text,jsonb) from public,anon,authenticated;
