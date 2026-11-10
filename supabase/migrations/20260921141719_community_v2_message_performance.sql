-- The send response carries the authorized message; no extra read chain needed.
CREATE OR REPLACE FUNCTION community_v2.message_json(m community_v2.messages, u uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with privacy as materialized (select community_v2.blocked(u,m.author_id) hidden)
  select jsonb_build_object('client_id',case when m.author_id=u then m.client_id else null end,'id',m.id,'seq',m.seq::text,'author_id',m.author_id,
    'body',case when m.deleted_at is null and not privacy.hidden then m.body else '' end,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
    'blocked',privacy.hidden,'username',usr.username,'display_name',coalesce((select nickname from community_v2.members where server_id=ch.server_id and user_id=m.author_id),usr.display_name),'avatar_url',usr.avatar_url,'version',m.version,
    'pinned_at',m.pinned_at,'mentioned_me',m.deleted_at is null and not privacy.hidden and community_v2.mention_matches(m.mentions,ch.server_id,u),
    'mentions',case when (m.deleted_at is not null or privacy.hidden) then '[]'::jsonb else coalesce((select jsonb_agg(t||jsonb_build_object(
      'label',case when t->>'kind'='user' then coalesce(mu.username,'silinmiş-kullanıcı') else coalesce(r.name,'silinmiş-rol') end,
      'username',mu.username,'color',r.color))
      from jsonb_array_elements(m.mentions)t
      left join public.users mu on t->>'kind'='user' and mu.id=(t->>'id')::uuid
      left join community_v2.roles r on t->>'kind'='role' and r.id=(t->>'id')::uuid and r.server_id=ch.server_id),'[]'::jsonb) end,
    'reply',case when (m.deleted_at is not null or privacy.hidden) or parent.id is null then null else jsonb_build_object(
      'id',parent.id,'seq',parent.seq::text,'author_id',parent.author_id,'username',pu.username,
      'display_name',pu.display_name,'deleted',parent.deleted_at is not null,'blocked',community_v2.blocked(u,parent.author_id),
      'body',case when parent.deleted_at is null and not community_v2.blocked(u,parent.author_id) then left(regexp_replace(parent.body,'<@&?[0-9a-fA-F-]{36}>','@etiket','g'),200) else '' end) end,
    'attachments',case when (m.deleted_at is not null or privacy.hidden) then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'content_type',a.content_type,'byte_size',a.byte_size) order by a.id) from community_v2.attachments a where a.message_id=m.id and a.state='ready'),'[]'::jsonb) end,
    'reactions',case when (m.deleted_at is not null or privacy.hidden) then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x) order by x.emoji) from (
      select rx.emoji,count(*)::integer as count,bool_or(rx.user_id=u) as mine from community_v2.reactions rx where rx.message_id=m.id group by rx.emoji)x),'[]'::jsonb) end)
  from privacy cross join public.users usr join community_v2.channels ch on ch.id=m.channel_id
  left join community_v2.messages parent on parent.id=m.reply_to and parent.channel_id=m.channel_id
  left join public.users pu on pu.id=parent.author_id where usr.id=m.author_id;
$function$;

create or replace function community_v2.send_result(message_id uuid,u uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select jsonb_build_object('id',m.id,'seq',m.seq::text,'message',community_v2.message_json(m,u),
    'server_now',clock_timestamp(),'next_send_at',
    case when ch.slowmode_seconds>0 and not community_v2.has_permission(ch.server_id,u,'slowmode.bypass')
      then cd.last_sent_at+make_interval(secs=>ch.slowmode_seconds) else null end)
    from community_v2.messages m join community_v2.channels ch on ch.id=m.channel_id
    left join community_v2.message_cooldowns cd on cd.channel_id=ch.id and cd.user_id=u where m.id=message_id;
$$;
revoke all on function community_v2.send_result(uuid,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION community_v2.message_write(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if ch.archived_at is not null or exists(select 1 from community_v2.servers where id=s and archived_at is not null) then raise exception 'Arşivlenen kanalda etkileşim yapılamaz.' using errcode='42501'; end if;
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
      return community_v2.send_result(msg.id,u);
    end if;
    if cardinality(files)>0 then
      if not community_v2.has_permission(s,u,'attachments.send') then raise exception 'Dosya paylaşma iznin yok.' using errcode='42501'; end if;
      perform 1 from community_v2.attachments where id=any(files) order by id for update;
      if (select count(*) from community_v2.attachments where id=any(files) and user_id=u and channel_id=c and state='ready' and message_id is null and expires_at>now())<>cardinality(files) then
        raise exception 'Dosyalardan biri hazır değil, süresi dolmuş veya bu mesaja eklenemez.'; end if;
    end if;
    if parent is not null then
      if not community_v2.has_permission(s,u,'messages.reply') then raise exception 'Mesaja yanıt verme iznin yok.' using errcode='42501'; end if;
      if not exists(select 1 from community_v2.messages where id=parent and channel_id=c and deleted_at is null and not community_v2.blocked(u,author_id)) then raise exception 'Yanıtlanan mesaj bu kanalda bulunamadı veya silindi.'; end if;
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
    return community_v2.send_result(ident,u);
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
    if activev and community_v2.blocked(u,msg.author_id) then raise exception 'Bu mesajla etkileşim kuramazsın.' using errcode='42501'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION community_v2.message_read(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; seqn bigint; ids uuid[]; result jsonb; searchv text:=left(coalesce(p->>'search',''),60);
begin
  select server_id into s from community_v2.channels where id=c;
  if not community_v2.can_read(c,u) then raise exception 'Bu kanalın mesajlarını okuma iznin yok.' using errcode='42501'; end if;
  if p_action='message_refresh' then
    if jsonb_typeof(p->'ids') is distinct from 'array' or jsonb_array_length(p->'ids')>250 then raise exception 'En fazla 250 mesaj yenilenebilir.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p->'ids');
    -- The same message on the last page and open history converts once.
    with latest as materialized (
      select m.* from community_v2.messages m where channel_id=c order by seq desc limit 50
    ), selected as (
      select * from latest union select m.* from community_v2.messages m where channel_id=c and id=any(ids)
    ), hydrated as materialized (
      select m.id,m.seq,community_v2.message_json(m,u) value from selected m
    )
    select jsonb_build_object(
      'latest',coalesce((select jsonb_agg(value order by seq) from hydrated where id in (select id from latest)),'[]'::jsonb),
      'snapshot',coalesce((select jsonb_agg(value order by seq) from hydrated where id=any(ids) and id not in (select id from latest)),'[]'::jsonb)
    ) into result from (select 1) dummy;
    return result;
  elsif p_action='mention_candidates' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      (select 'user'::text as kind,usr.id,usr.username as label,usr.username,null::text as color
       from community_v2.members mem join public.users usr on usr.id=mem.user_id
       where mem.server_id=s and mem.state='active' and usr.is_active and not usr.is_banned and not community_v2.blocked(u,usr.id) and community_v2.has_permission(s,u,'mentions.users')
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
end $function$;
CREATE OR REPLACE FUNCTION community_v2.read_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; result jsonb; offn integer := greatest(0,least(coalesce((p->>'offset')::integer,0),100000));
begin
  if p_action in ('messages','message_refresh','message_snapshot','message_context','pins','mention_candidates') then return community_v2.message_read(p_action,p); end if;
  if p_action='series_candidates' then return community_v2.series_candidates(s,p->>'search',offn);
  elsif p_action='channel_entry' then return community_v2.channel_entry(c); end if;
  if p_action='home' then
    return jsonb_build_object(
      'auto_join',coalesce((select auto_join from community_v2.preferences where user_id=u),true),
      'servers',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select v.id,coalesce(v.name,f.name) name,coalesce(v.avatar_url,f.avatar_url) avatar_url,coalesce(f.slug,'') slug,v.owner_id,case when v.fansub_id is null then 'room' else 'fansub' end kind,v.archived_at from community_v2.servers v
        left join public.fansubs f on f.id=v.fansub_id join community_v2.members m on m.server_id=v.id and m.user_id=u
        where community_v2.server_active(v.id) and m.state='active' order by (v.id=s) desc nulls last,coalesce(v.name,f.name),v.id limit 100)x),'[]'::jsonb),
      'owned_fansubs',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select f.id,f.name from public.fansubs f join public.fansub_members m on m.fansub_id=f.id
        where m.user_id=u and m.role='admin' and f.is_active
        and not exists(select 1 from community_v2.servers v where v.fansub_id=f.id)
        and (select count(*) from public.fansub_members mm where mm.fansub_id=f.id and mm.role='admin')=1
        order by f.name limit 100)x),'[]'::jsonb));
  elsif p_action='discover' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select v.id,coalesce(v.name,f.name) name,coalesce(v.avatar_url,f.avatar_url) avatar_url,coalesce(nullif(v.description,''),f.description) description,m.state,v.join_mode,exists(select 1 from community_v2.join_requests j where j.server_id=v.id and j.user_id=u) pending from community_v2.servers v
      left join public.fansubs f on f.id=v.fansub_id left join community_v2.members m on m.server_id=v.id and m.user_id=u
      where community_v2.server_active(v.id) and v.archived_at is null and v.join_mode<>'invite' and (m.state is null or m.state='left')
      and coalesce(v.name,f.name) ilike '%'||left(coalesce(p->>'search',''),60)||'%'
      order by coalesce(v.name,f.name),v.id limit 21 offset offn)x),'[]'::jsonb);
  end if;
  if c is not null then select server_id into s from community_v2.channels where id=c; end if;
  if not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  if p_action='server' then
    return jsonb_build_object('profile',community_v2.server_card(s),'server_now',clock_timestamp(),'is_owner',community_v2.is_owner(s,u),
      'permissions',coalesce((select jsonb_agg(key) from unnest(community_v2.permission_catalog())key where community_v2.has_permission(s,u,key)),'[]'::jsonb),
      'my_rank',community_v2.rank_of(s,u),
      'my_nickname',(select nickname from community_v2.members where server_id=s and user_id=u),
      'timeout_until',(select timeout_until from community_v2.members where server_id=s and user_id=u),
      'channels',coalesce((select jsonb_agg(to_jsonb(x) order by x.position,x.id) from (
        select ch.id,ch.name,ch.topic,ch.is_private,ch.position,ch.category,ch.archived_at,ch.version,ch.manga_id,ch.slowmode_seconds,
          case when ch.slowmode_seconds>0 and not community_v2.has_permission(s,u,'slowmode.bypass') then
            (select last_sent_at+make_interval(secs=>ch.slowmode_seconds) from community_v2.message_cooldowns where channel_id=ch.id and user_id=u) else null end as next_send_at,
          ch.last_seq=0 and ch.manga_id is null and (select fansub_id is not null from community_v2.servers where id=s) as can_link_series,
          case when ch.archived_at is not null or (select archived_at is not null from community_v2.servers where id=s) then 'archived' else community_v2.series_status(s,ch.manga_id) end as read_only_reason,
          (select jsonb_build_object('id',m.id,'title',m.title,'slug',m.slug) from public.mangas m
            where m.id=ch.manga_id and m.is_active and m.is_approved and community_v2.series_audience(m.id,u)) as series,
          community_v2.can_read(ch.id,u) as can_read,
          case when ch.archived_at is null and community_v2.series_status(s,ch.manga_id) is null and community_v2.can_read(ch.id,u) then least(999,(select count(*) from (
            select 1 from community_v2.messages msg where msg.channel_id=ch.id
            and msg.seq>coalesce(rd.last_seq,0) and msg.author_id<>u and not community_v2.blocked(u,msg.author_id) and msg.deleted_at is null limit 999) n)) else 0 end as unread,
          case when ch.archived_at is null and community_v2.series_status(s,ch.manga_id) is null and community_v2.can_read(ch.id,u) then
            (select count(*) from (select msg.mentions from community_v2.messages msg where msg.channel_id=ch.id
              and msg.seq>coalesce(rd.last_seq,0) and msg.author_id<>u and not community_v2.blocked(u,msg.author_id) and msg.deleted_at is null order by msg.seq desc limit 999) recent
              where community_v2.mention_matches(recent.mentions,s,u)) else 0 end as mention_count,
          case when community_v2.is_owner(s,u) or exists(select 1 from unnest(array['channels.manage','channels.permissions.manage','channels.archive'])k where community_v2.has_permission(s,u,k)) then coalesce((select jsonb_agg(role_id) from community_v2.channel_roles where channel_id=ch.id),'[]'::jsonb) else '[]'::jsonb end as role_ids
        from community_v2.channels ch left join community_v2.reads rd on rd.channel_id=ch.id and rd.user_id=u
        where ch.server_id=s and community_v2.can_view(ch.id,u))x),'[]'::jsonb),
      'roles',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('manageable',community_v2.can_delegate_role(s,u,r.id)) order by r.position,r.id) from community_v2.roles r where r.server_id=s),'[]'::jsonb));
  elsif p_action='members' then
    if not exists(select 1 from unnest(array['members.list','roles.assign','members.timeout','members.kick','members.ban','members.nicknames.manage'])k where community_v2.has_permission(s,u,k)) then return '[]'::jsonb; end if;
    if c is not null and not community_v2.can_view(c,u) then raise exception 'Bu kanala erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select m.user_id,usr.username,coalesce(m.nickname,usr.display_name) display_name,usr.avatar_url,m.state,m.timeout_until,m.nickname,
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
  elsif p_action='audit_actors' then
    if not community_v2.has_permission(s,u,'server.audit.read') then raise exception 'İşlem geçmişine erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (select distinct usr.id,usr.username from community_v2.audit a join public.users usr on usr.id=a.actor_id where a.server_id=s and usr.username ilike '%'||left(coalesce(p->>'search',''),60)||'%' order by usr.username,usr.id limit 50)x),'[]'::jsonb);
  elsif p_action='audit' then
    if not community_v2.has_permission(s,u,'server.audit.read') then raise exception 'İşlem geçmişine erişimin yok.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select a.id,a.action,a.target_id,a.created_at,a.details,usr.username from community_v2.audit a left join public.users usr on usr.id=a.actor_id
      where a.server_id=s
      and (nullif(p->>'action','') is null or a.action=left(p->>'action',80))
      and (nullif(p->>'actor_id','') is null or a.actor_id=(p->>'actor_id')::uuid)
      and (nullif(p->>'from','') is null or a.created_at>=(p->>'from')::timestamptz)
      and (nullif(p->>'to','') is null or a.created_at<(p->>'to')::timestamptz)
      order by a.id desc limit 50 offset offn)x),'[]'::jsonb);
  end if;
  raise exception 'Bilinmeyen topluluk sorgusu.';
end $function$;

-- A per-channel upper rate limit only for the empty presence signal.
create table community_v2.presence_signals (
  channel_id uuid primary key references community_v2.channels(id) on delete cascade,
  sent_at timestamptz not null
);
alter table community_v2.presence_signals enable row level security;
revoke all on community_v2.presence_signals from public,anon,authenticated;
CREATE OR REPLACE FUNCTION community_v2.personal_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=community_v2.actor(); c uuid:=nullif(p->>'channel_id','')::uuid; s uuid:=nullif(p->>'server_id','')::uuid;
  previous_presence community_v2.presence; presence_changed boolean; cfg community_v2.preferences; modev text; muted timestamptz; term text; chosen uuid[]; perms text[]; result jsonb;
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
      select * into previous_presence from community_v2.presence where channel_id=c and user_id=u;
      insert into community_v2.presence(channel_id,user_id,typing_until) values(c,u,
        case when coalesce((p->>'typing')::boolean,false) and coalesce(cfg.show_typing,true) and community_v2.has_permission(s,u,'messages.send')
          and not exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now())
          and not exists(select 1 from community_v2.servers where id=s and archived_at is not null)
          and not exists(select 1 from community_v2.channels where id=c and archived_at is not null)
          then now()+interval '8 seconds' else null end)
        on conflict(channel_id,user_id) do update set seen_at=now(),typing_until=excluded.typing_until
        where community_v2.presence.seen_at<now()-interval '2 seconds';
      presence_changed:=found;
      -- A steady online heartbeat does not make all listeners requery.
      if presence_changed and (previous_presence.user_id is null or previous_presence.seen_at<now()-interval '60 seconds'
        or coalesce((p->>'typing')::boolean,false) or previous_presence.typing_until>now()) then
        insert into community_v2.presence_signals(channel_id,sent_at) values(c,clock_timestamp())
          on conflict(channel_id) do update set sent_at=excluded.sent_at
          where community_v2.presence_signals.sent_at<clock_timestamp()-interval '3 seconds';
        if found then perform realtime.send('{}'::jsonb,'presence','community-v2:channel:'||c,true); end if;
      end if;
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
end $function$;

notify pgrst,'reload schema';
