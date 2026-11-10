-- Counters compute in one authorized read without running a block/role function per message.
create or replace function community_v2.server_permissions(s uuid,u uuid)
returns text[] language sql stable set search_path='' as $$
  select case when community_v2.is_owner(s,u) then community_v2.permission_catalog()
    else array(select distinct p from community_v2.roles r cross join lateral unnest(r.permissions)p
      where r.server_id=s and (r.is_default or exists(select 1 from community_v2.member_roles mr
        where mr.server_id=s and mr.user_id=u and mr.role_id=r.id))
      and p=any(community_v2.permission_catalog()) order by p) end;
$$;

create or replace function community_v2.server_channels(s uuid,u uuid,compact boolean default false)
returns jsonb language plpgsql stable set search_path='' as $$
declare perms text[]; own boolean; blocked_ids uuid[]; role_ids text[]; archived boolean; fansub boolean;
begin
  if not community_v2.is_member(s,u) then raise exception 'Bu sunucuya erişimin yok.' using errcode='42501'; end if;
  perms:=community_v2.server_permissions(s,u); own:=community_v2.is_owner(s,u);
  select coalesce(array_agg(case when blocker_id=u then blocked_id else blocker_id end),'{}')
    into blocked_ids from public.user_blocks where blocker_id=u or blocked_id=u;
  select coalesce(array_agg(role_id::text),'{}') into role_ids from community_v2.member_roles where server_id=s and user_id=u;
  select archived_at is not null,fansub_id is not null into archived,fansub from community_v2.servers where id=s;
  return coalesce((
    with visible as materialized (
      select ch.*,coalesce(rd.last_seq,0) read_seq,community_v2.series_status(s,ch.manga_id) series_state
      from community_v2.channels ch left join community_v2.reads rd on rd.channel_id=ch.id and rd.user_id=u
      where ch.server_id=s and community_v2.can_view(ch.id,u)
    ), counted as (
      select ch.*,stats.unread,stats.mention_count,
        case when ch.slowmode_seconds>0 and not ('slowmode.bypass'=any(perms)) then
          (select last_sent_at+make_interval(secs=>ch.slowmode_seconds) from community_v2.message_cooldowns where channel_id=ch.id and user_id=u) end next_send_at
      from visible ch cross join lateral (
        select count(*) unread,count(*) filter(where exists(select 1 from jsonb_array_elements(recent.mentions)t
          where (t->>'kind'='user' and t->>'id'=u::text) or (t->>'kind'='role' and t->>'id'=any(role_ids)))) mention_count
        from (select msg.mentions from community_v2.messages msg where ch.archived_at is null and ch.series_state is null
          and 'messages.read'=any(perms) and msg.channel_id=ch.id and msg.seq>ch.read_seq
          and msg.author_id<>u and not (msg.author_id=any(blocked_ids)) and msg.deleted_at is null
          order by msg.seq desc limit 999) recent
      )stats
    )
    select jsonb_agg(jsonb_build_object(
      'id',ch.id,'can_read','messages.read'=any(perms),'unread',ch.unread,'mention_count',ch.mention_count,
      'next_send_at',ch.next_send_at,'can_link_series',ch.last_seq=0 and ch.manga_id is null and fansub,
      'read_only_reason',case when ch.archived_at is not null or archived then 'archived' else ch.series_state end
    ) || case when compact then '{}'::jsonb else jsonb_build_object(
      'name',ch.name,'topic',ch.topic,'is_private',ch.is_private,'position',ch.position,'category',ch.category,
      'archived_at',ch.archived_at,'version',ch.version,'manga_id',ch.manga_id,'slowmode_seconds',ch.slowmode_seconds,
      'series',(select jsonb_build_object('id',m.id,'title',m.title,'slug',m.slug) from public.mangas m
        where m.id=ch.manga_id and m.is_active and m.is_approved and community_v2.series_audience(m.id,u)),
      'role_ids',case when own or perms && array['channels.manage','channels.permissions.manage','channels.archive']
        then coalesce((select jsonb_agg(role_id) from community_v2.channel_roles where channel_id=ch.id),'[]'::jsonb) else '[]'::jsonb end
    ) end order by ch.position,ch.id) from counted ch
  ),'[]'::jsonb);
end $$;

revoke all on function community_v2.server_permissions(uuid,uuid),community_v2.server_channels(uuid,uuid,boolean) from public,anon,authenticated;

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
  if p_action='activity' then
    return jsonb_build_object('server_id',s,'server_now',clock_timestamp(),
      'permissions',to_jsonb(community_v2.server_permissions(s,u)),'is_owner',community_v2.is_owner(s,u),
      'timeout_until',(select timeout_until from community_v2.members where server_id=s and user_id=u),
      'channels',community_v2.server_channels(s,u,true));
  end if;
  if p_action='server' then
    return jsonb_build_object('profile',community_v2.server_card(s),'server_now',clock_timestamp(),'is_owner',community_v2.is_owner(s,u),
      'permissions',to_jsonb(community_v2.server_permissions(s,u)),
      'my_rank',community_v2.rank_of(s,u),
      'my_nickname',(select nickname from community_v2.members where server_id=s and user_id=u),
      'timeout_until',(select timeout_until from community_v2.members where server_id=s and user_id=u),
      'channels',community_v2.server_channels(s,u),
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
end $function$
;
