-- A room message also refreshes other channel badges; no content/room id goes into the broadcast.
create or replace function community_v2.emit(s uuid,c uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if c is not null then
    perform realtime.send('{}'::jsonb,'refresh','community-v2:channel:'||c,true);
  end if;
  perform realtime.send('{}'::jsonb,'refresh','community-v2:server:'||s,true);
end $$;

-- Sorting applies before paging; no top role falls to the next page.
create or replace function community_v2.read_api(p_action text,p jsonb) returns jsonb
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
      order by community_v2.is_owner(s,m.user_id) desc,
        coalesce((select rr.position from community_v2.member_roles mr join community_v2.roles rr on rr.id=mr.role_id
          where mr.server_id=s and mr.user_id=m.user_id and not rr.is_default order by rr.position,rr.id limit 1),1001),
        (select rr.id from community_v2.member_roles mr join community_v2.roles rr on rr.id=mr.role_id
          where mr.server_id=s and mr.user_id=m.user_id and not rr.is_default order by rr.position,rr.id limit 1),
        usr.username,m.user_id limit 51 offset offn)x),'[]'::jsonb);
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
