-- File ids are part of the send key; publishing is in the same transaction as the message.
create or replace function community_v2.permission_catalog() returns text[]
language sql immutable set search_path='' as $$
  select array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban','roles.create','roles.appearance.manage',
    'roles.permissions.manage','roles.order.manage','roles.assign','roles.delete',
    'channels.create','channels.manage','channels.permissions.manage','channels.archive',
    'messages.reply','reactions.add','mentions.users','mentions.roles','messages.pin','attachments.send']::text[];
$$;

create or replace function community_v2.message_json(m community_v2.messages,u uuid) returns jsonb
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
    'attachments',case when m.deleted_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'content_type',a.content_type,'byte_size',a.byte_size) order by a.id) from community_v2.attachments a where a.message_id=m.id and a.state='ready'),'[]'::jsonb) end,
    'reactions',case when m.deleted_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x) order by x.emoji) from (
      select rx.emoji,count(*)::integer as count,bool_or(rx.user_id=u) as mine from community_v2.reactions rx where rx.message_id=m.id group by rx.emoji)x),'[]'::jsonb) end)
  from public.users usr join community_v2.channels ch on ch.id=m.channel_id
  left join community_v2.messages parent on parent.id=m.reply_to and parent.channel_id=m.channel_id
  left join public.users pu on pu.id=parent.author_id where usr.id=m.author_id;
$$;

create or replace function community_v2.message_write(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; ch community_v2.channels;
  member community_v2.members; msg community_v2.messages; parent uuid:=nullif(p->>'reply_to','')::uuid;
  bodyv text:=btrim(p->>'body'); tags jsonb; ident uuid; seqn bigint; activev boolean; changed boolean; files uuid[]:='{}';
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

revoke all on function community_v2.permission_catalog(),community_v2.message_json(community_v2.messages,uuid),community_v2.message_write(text,jsonb) from public,anon,authenticated;
