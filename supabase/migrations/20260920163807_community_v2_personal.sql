alter table community_v2.preferences
  add column notifications text not null default 'mentions' check(notifications in ('all','mentions','off')),
  add column push_enabled boolean not null default false,
  add column show_presence boolean not null default true,
  add column show_typing boolean not null default true;
create table community_v2.notification_scopes (
  user_id uuid not null references public.users(id) on delete cascade,
  scope_id uuid not null,
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  channel_id uuid references community_v2.channels(id) on delete cascade,
  mode text not null default 'inherit' check(mode in ('inherit','all','mentions','off')),
  muted_until timestamptz,
  primary key(user_id,scope_id),
  check(scope_id=coalesce(channel_id,server_id))
);
create index notification_scopes_server_idx on community_v2.notification_scopes(server_id);
create index notification_scopes_channel_idx on community_v2.notification_scopes(channel_id) where channel_id is not null;
create table community_v2.presence (
  channel_id uuid not null references community_v2.channels(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  typing_until timestamptz,
  primary key(channel_id,user_id)
);
create index presence_user_idx on community_v2.presence(user_id);
create index presence_expiry_idx on community_v2.presence(seen_at);
create index messages_search_idx on community_v2.messages using gin(to_tsvector('simple',body)) where deleted_at is null;
create index messages_author_channel_idx on community_v2.messages(channel_id,author_id,seq desc) where deleted_at is null;
create index audit_action_page_idx on community_v2.audit(server_id,action,id desc);
create index audit_actor_page_idx on community_v2.audit(server_id,actor_id,id desc);
alter table community_v2.notification_scopes enable row level security;
alter table community_v2.presence enable row level security;
revoke all on community_v2.notification_scopes,community_v2.presence from public,anon,authenticated;

create or replace function community_v2.blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select a<>b and exists(select 1 from public.user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
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
    return coalesce((select jsonb_agg(to_jsonb(x)) from (select pr.user_id,usr.username,coalesce(m.nickname,usr.display_name,usr.username) name,coalesce(pr.typing_until>now(),false) typing
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
create or replace function public.community_v2_personal(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select community_v2.personal_api(p_action,p_payload)$$;
revoke all on function community_v2.blocked(uuid,uuid),community_v2.personal_api(text,jsonb),public.community_v2_personal(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.personal_api(text,jsonb),public.community_v2_personal(text,jsonb) to authenticated;
notify pgrst,'reload schema';
