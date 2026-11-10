CREATE OR REPLACE FUNCTION community_v2.message_json(m community_v2.messages, u uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id',m.id,'seq',m.seq::text,'author_id',m.author_id,
    'body',case when m.deleted_at is null and not community_v2.blocked(u,m.author_id) then m.body else '' end,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
    'blocked',community_v2.blocked(u,m.author_id),'username',usr.username,'display_name',coalesce((select nickname from community_v2.members where server_id=ch.server_id and user_id=m.author_id),usr.display_name),'avatar_url',usr.avatar_url,'version',m.version,
    'pinned_at',m.pinned_at,'mentioned_me',m.deleted_at is null and not community_v2.blocked(u,m.author_id) and community_v2.mention_matches(m.mentions,ch.server_id,u),
    'mentions',case when (m.deleted_at is not null or community_v2.blocked(u,m.author_id)) then '[]'::jsonb else coalesce((select jsonb_agg(t||jsonb_build_object(
      'label',case when t->>'kind'='user' then coalesce(mu.username,'silinmiş-kullanıcı') else coalesce(r.name,'silinmiş-rol') end,
      'username',mu.username,'color',r.color))
      from jsonb_array_elements(m.mentions)t
      left join public.users mu on t->>'kind'='user' and mu.id=(t->>'id')::uuid
      left join community_v2.roles r on t->>'kind'='role' and r.id=(t->>'id')::uuid and r.server_id=ch.server_id),'[]'::jsonb) end,
    'reply',case when (m.deleted_at is not null or community_v2.blocked(u,m.author_id)) or parent.id is null then null else jsonb_build_object(
      'id',parent.id,'seq',parent.seq::text,'author_id',parent.author_id,'username',pu.username,
      'display_name',pu.display_name,'deleted',parent.deleted_at is not null,'blocked',community_v2.blocked(u,parent.author_id),
      'body',case when parent.deleted_at is null and not community_v2.blocked(u,parent.author_id) then left(regexp_replace(parent.body,'<@&?[0-9a-fA-F-]{36}>','@etiket','g'),200) else '' end) end,
    'attachments',case when (m.deleted_at is not null or community_v2.blocked(u,m.author_id)) then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'content_type',a.content_type,'byte_size',a.byte_size) order by a.id) from community_v2.attachments a where a.message_id=m.id and a.state='ready'),'[]'::jsonb) end,
    'reactions',case when (m.deleted_at is not null or community_v2.blocked(u,m.author_id)) then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x) order by x.emoji) from (
      select rx.emoji,count(*)::integer as count,bool_or(rx.user_id=u) as mine from community_v2.reactions rx where rx.message_id=m.id group by rx.emoji)x),'[]'::jsonb) end)
  from public.users usr join community_v2.channels ch on ch.id=m.channel_id
  left join community_v2.messages parent on parent.id=m.reply_to and parent.channel_id=m.channel_id
  left join public.users pu on pu.id=parent.author_id where usr.id=m.author_id;
$function$;

CREATE OR REPLACE FUNCTION community_v2.message_read(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; seqn bigint; ids uuid[]; searchv text:=left(coalesce(p->>'search',''),60);
begin
  select server_id into s from community_v2.channels where id=c;
  if not community_v2.can_read(c,u) then raise exception 'Bu kanalın mesajlarını okuma iznin yok.' using errcode='42501'; end if;
  if p_action='mention_candidates' then
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

CREATE OR REPLACE FUNCTION community_v2.parse_mentions(s uuid, c uuid, u uuid, bodyv text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare token text[]; target uuid; kindv text; result jsonb:='[]'; countv integer:=0;
begin
  for token in select regexp_matches(bodyv,'<@(&?)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>','g') loop
    countv:=countv+1; target:=token[2]::uuid; kindv:=case when token[1]='&' then 'role' else 'user' end;
    if countv>20 then raise exception 'Bir mesajda en fazla 20 etiket kullanabilirsin.'; end if;
    if kindv='user' then
      if community_v2.blocked(u,target) or not community_v2.has_permission(s,u,'mentions.users') or not exists(select 1 from public.users usr where usr.id=target and usr.is_active and not usr.is_banned and community_v2.can_read(c,target)) then
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
end $function$;

CREATE OR REPLACE FUNCTION community_v2.media_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=community_v2.actor(); c uuid; s uuid; a community_v2.attachments; ch community_v2.channels; idv uuid:=(p->>'id')::uuid; total bigint; amount integer;
begin
  if p_action='prepare' then
    c:=(p->>'channel_id')::uuid;
    -- Concurrent uploads of one account on different servers also cannot exceed the daily quota.
    perform pg_advisory_xact_lock(hashtextextended('community-media:'||u,0));
    select server_id into s from community_v2.channels where id=c;
    perform 1 from community_v2.servers where id=s for share;
    perform 1 from community_v2.members where server_id=s and user_id=u for update;
    select * into ch from community_v2.channels where id=c for update;
    if not community_v2.can_read(c,u) or not community_v2.has_permission(s,u,'messages.send') or not community_v2.has_permission(s,u,'attachments.send') then
      raise exception 'Bu kanalda dosya paylaşma iznin yok.' using errcode='42501'; end if;
    if ch.archived_at is not null or exists(select 1 from community_v2.servers where id=s and archived_at is not null) or exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then
      raise exception 'Bu kanala şu anda dosya yükleyemezsin.' using errcode='42501'; end if;
    perform community_v2.lock_series(s,ch.manga_id);
    select * into a from community_v2.attachments where id=idv for update;
    if found then
      if a.user_id<>u or a.channel_id<>c or a.sha256 is distinct from p->>'sha256' or a.name is distinct from p->>'name'
        or a.content_type is distinct from p->>'content_type' or a.byte_size is distinct from (p->>'byte_size')::integer
        or a.state not in ('pending','ready') or a.message_id is not null or a.expires_at<=now() then
        raise exception 'Dosya anahtarı kullanılmış veya süresi dolmuş.'; end if;
    else
      perform pg_advisory_xact_lock(hashtextextended('community-storage:'||s,0));
      if (select coalesce(sum(a2.byte_size),0) from community_v2.attachments a2 join community_v2.channels ch2 on ch2.id=a2.channel_id where ch2.server_id=s and a2.state in ('pending','ready'))+coalesce((p->>'byte_size')::integer,104857601)>(select storage_bytes_per_server from community_v2.operations_config where id) then raise exception 'Sunucunun dosya kapasitesi doldu.'; end if;
      select coalesce(sum(byte_size),0),count(*) into total,amount from community_v2.attachments where user_id=u and created_at>now()-interval '24 hours';
      if total+coalesce((p->>'byte_size')::integer,104857601)>104857600 or amount>=100 then raise exception '24 saatlik dosya kotan doldu (100 MB / 100 dosya).'; end if;
      if (select count(*) from community_v2.attachments where user_id=u and message_id is null and state in ('pending','ready') and expires_at>now())>=8 then raise exception 'Önce bekleyen dosyalarını gönder veya kaldır.'; end if;
      insert into community_v2.attachments(id,channel_id,user_id,name,content_type,byte_size,sha256)
        values(idv,c,u,p->>'name',p->>'content_type',(p->>'byte_size')::integer,p->>'sha256') returning * into a;
    end if;
  elsif p_action='access' then
    select * into a from community_v2.attachments where id=idv;
    if not found or community_v2.blocked(u,a.user_id) or a.state<>'ready' or not community_v2.can_read(a.channel_id,u) or
      not ((a.message_id is null and a.user_id=u and a.expires_at>now()) or exists(select 1 from community_v2.messages where id=a.message_id and deleted_at is null)) then
      raise exception 'Dosya bulunamadı veya erişimin yok.' using errcode='42501'; end if;
  elsif p_action='discard' then
    select channel_id into c from community_v2.attachments where id=idv and user_id=u;
    select server_id into s from community_v2.channels where id=c;
    perform 1 from community_v2.servers where id=s for share;
    perform 1 from community_v2.members where server_id=s and user_id=u for update;
    perform 1 from community_v2.channels where id=c for update;
    select * into a from community_v2.attachments where id=idv and user_id=u for update;
    if not found or a.message_id is not null then raise exception 'Gönderilmiş veya sana ait olmayan dosya kaldırılamaz.' using errcode='42501'; end if;
    update community_v2.attachments set state='deleted',expires_at=now() where id=idv and state in ('pending','ready');
    return jsonb_build_object('ok',true);
  else raise exception 'Bilinmeyen dosya işlemi.'; end if;
  return jsonb_build_object('id',a.id,'object_key','community/'||a.id,'state',a.state,'name',a.name,'content_type',a.content_type,'byte_size',a.byte_size,'sha256',a.sha256);
end $function$;

CREATE OR REPLACE FUNCTION private.dispatch_web_push_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg record;
  subs jsonb;
  event_key text;
  routing_data jsonb;
begin
  select * into cfg
  from private.web_push_config
  where id is true and is_enabled
    and dispatch_url = 'https://example.com/api/push/dispatch'
    and dispatch_secret is not null;
  if cfg is null then
    return new;
  end if;

  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return new;
  end if;

  event_key := coalesce(new.data ->> 'event', new.type);
  if event_key='community_v2_message' and (
    not coalesce((select push_enabled from community_v2.preferences where user_id=new.user_id),false)
    or not community_v2.can_read((new.data->>'channel_id')::uuid,new.user_id)
    or community_v2.blocked(new.user_id,(new.data->>'actor_user_id')::uuid)
    or community_v2.notification_mode(new.user_id,(new.data->>'server_id')::uuid,(new.data->>'channel_id')::uuid)='off'
  ) then return new; end if;
  if not (event_key = any (cfg.event_allowlist)) then
    return new;
  end if;

  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth
  ))
  into subs
  from public.push_subscriptions s
  where s.user_id = new.user_id;
  if subs is null then
    return new;
  end if;

  -- Only routing fields travel; chapter number is not forced to text or rounded.
  -- Values are not trusted: Cloudflare applies the existing safeNotificationPath limit.
  routing_data := jsonb_strip_nulls(jsonb_build_object(
    'event', new.data -> 'event',
    'route_hint', new.data -> 'route_hint',
    'url', new.data -> 'url',
    'manga_id', new.data -> 'manga_id',
    'manga_slug', new.data -> 'manga_slug',
    'chapter_number', new.data -> 'chapter_number',
    'chapter_id', new.data -> 'chapter_id',
    'fansub_id', new.data -> 'fansub_id',
    'fansub_slug', new.data -> 'fansub_slug'
  ));

  -- The URL is fixed; a changed config row cannot move delivery keys to another target.
  perform net.http_post(
    url := 'https://example.com/api/push/dispatch',
    body := jsonb_build_object(
      'title', new.title,
      'body', coalesce(new.message, ''),
      'url', coalesce(new.data ->> 'url', '/'),
      'tag', event_key,
      'data', routing_data,
      'subscriptions', subs
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Dispatch-Secret', cfg.dispatch_secret
    )
  );

  return new;
exception when others then
  -- Even if the push queue fails an in-app notification is created.
  return new;
end $function$;
update private.web_push_config set event_allowlist=array_append(event_allowlist,'community_v2_message')
  where id and not ('community_v2_message'=any(event_allowlist));
notify pgrst,'reload schema';
