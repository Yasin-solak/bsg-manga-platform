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
  if p_action in ('messages','message_snapshot','message_context','pins','mention_candidates') then return community_v2.message_read(p_action,p); end if;
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

CREATE OR REPLACE FUNCTION community_v2.write_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := community_v2.actor(); s uuid := nullif(p->>'server_id','')::uuid;
  c uuid := nullif(p->>'channel_id','')::uuid; ident uuid; seqn bigint; owner boolean;
begin
  if p_action='join' then return community_v2.room_api('join',p); end if;
  if p_action in ('send','edit_message','delete_message','set_reaction','set_pin') then return community_v2.message_write(p_action,p); end if;
  if p_action in ('save_role','delete_role','assign_roles','save_channel','archive_channel','moderate') then
    return community_v2.manage_api(p_action,p);
  end if;
  if p_action='preference' then
    insert into community_v2.preferences(user_id,auto_join) values(u,(p->>'auto_join')::boolean)
      on conflict(user_id) do update set auto_join=excluded.auto_join;
    return jsonb_build_object('ok',true);
  elsif p_action='create_server' then
    ident := community_v2.create_server((p->>'fansub_id')::uuid,u,false);
    return jsonb_build_object('id',ident);
  end if;
  if c is not null then select server_id into s from community_v2.channels where id=c; end if;
  -- A management change and message send cannot create a permission gap at the same time.
  if p_action='read' then
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
  else raise exception 'Bilinmeyen topluluk işlemi.';
  end if;
  perform community_v2.emit(s);
  return jsonb_build_object('ok',true,'id',ident);
end $function$;

CREATE OR REPLACE FUNCTION community_v2.follow_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce((select auto_join from community_v2.preferences where user_id=new.user_id),true) then
    insert into community_v2.members(server_id,user_id)
      select v.id,new.user_id from community_v2.servers v join public.fansubs f on f.id=v.fansub_id
      where v.fansub_id=new.fansub_id and f.is_active and v.join_mode='open' and v.archived_at is null on conflict do nothing;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.sync_my_follows()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := community_v2.actor();
begin
  if coalesce((select auto_join from community_v2.preferences where user_id=u),true) then
    insert into community_v2.members(server_id,user_id)
      select v.id,u from public.fansub_follows ff join community_v2.servers v on v.fansub_id=ff.fansub_id
      join public.fansubs f on f.id=v.fansub_id where ff.user_id=u and f.is_active and v.join_mode='open' and v.archived_at is null on conflict do nothing;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.invites_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid:=community_v2.actor(); s uuid; inv community_v2.invites; tokenv text:=p->>'token'; hashv bytea;
  labelv text:=btrim(coalesce(p->>'label','')); ttl integer; maxv integer; statev text; activev boolean;
  managev boolean; createv boolean; result jsonb; stamp timestamptz;
begin
  if p_action not in ('create','list','revoke','preview','redeem') or p_action is null then raise exception 'Bilinmeyen davet işlemi.'; end if;
  if p_action in ('create','preview','redeem') then
    if tokenv is null or tokenv !~ '^[a-f0-9]{64}$' then raise exception 'Davet bağlantısı geçersiz.'; end if;
    hashv:=extensions.digest(tokenv,'sha256');
  end if;
  if p_action in ('preview','redeem') then
    select server_id into s from community_v2.invites where token_hash=hashv;
    if s is null then return jsonb_build_object('status','unavailable'); end if;
  else s:=(p->>'server_id')::uuid;
  end if;
  -- Same order as management and general join; the last use cannot go to two concurrent accounts.
  if p_action in ('list','preview') then
    perform 1 from community_v2.servers where id=s for share;
  else
    perform 1 from community_v2.servers where id=s for update;
  end if;
  if not found then raise exception 'Sunucu bulunamadı.'; end if;
  stamp:=clock_timestamp();
  if p_action in ('preview','redeem') then
    select * into inv from community_v2.invites where server_id=s and token_hash=hashv;
    if not found then return jsonb_build_object('status','unavailable'); end if;
    statev:=case
      when not community_v2.server_active(s) or exists(select 1 from community_v2.servers where id=s and archived_at is not null) then 'unavailable'
      when inv.revoked_at is not null then 'revoked'
      when inv.expires_at<=stamp then 'expired'
      when not community_v2.invite_creator_active(s,inv.creator_id) then 'unavailable'
      when exists(select 1 from community_v2.members where server_id=s and user_id=u and state='banned') then 'banned'
      when community_v2.is_member(s,u) then 'already_member'
      when inv.max_uses is not null and inv.uses>=inv.max_uses then 'exhausted'
      else 'ready' end;
    if statev not in ('ready','already_member') then return jsonb_build_object('status',statev); end if;
    if p_action='redeem' and statev='ready' then
      -- Sanctions and read progress are kept; no custom role or fansub team membership is given.
      insert into community_v2.members(server_id,user_id) values(s,u)
        on conflict(server_id,user_id) do update set state='active';
      delete from community_v2.join_requests where server_id=s and user_id=u;
      update community_v2.invites set uses=uses+1 where id=inv.id;
      insert into community_v2.audit(server_id,actor_id,action,target_id,details)
        values(s,u,'invite.join',inv.id,jsonb_build_object('label',inv.label));
      perform community_v2.emit(s);
      statev:='joined';
    end if;
    select jsonb_build_object('status',statev,'server_id',s,'name',coalesce(v.name,f.name),'avatar_url',coalesce(v.avatar_url,f.avatar_url),
      'expires_at',inv.expires_at) into result
      from community_v2.servers v left join public.fansubs f on f.id=v.fansub_id where v.id=s;
    return result;
  end if;
  if not community_v2.is_member(s,u) or (not community_v2.is_owner(s,u) and exists(
    select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>stamp)) then
    raise exception 'Davet yönetimine erişimin yok.' using errcode='42501';
  end if;
  createv:=community_v2.has_permission(s,u,'invites.create');
  managev:=community_v2.has_permission(s,u,'invites.manage');
  if not createv and not managev then raise exception 'Davet yönetimi iznin yok.' using errcode='42501'; end if;
  if p_action='create' then
    if exists(select 1 from community_v2.servers where id=s and archived_at is not null) then raise exception 'Arşivlenen sunucuda davet oluşturulamaz.'; end if;
    if not createv then raise exception 'Davet oluşturma iznin yok.' using errcode='42501'; end if;
    ttl:=(p->>'ttl_seconds')::integer; maxv:=(p->>'max_uses')::integer;
    if char_length(labelv) not between 1 and 80 or ttl is null or ttl not in (0,3600,86400,604800,2592000)
      or (maxv is not null and maxv not between 1 and 10000) then raise exception 'Davet adı, süre veya kullanım sınırı geçersiz.'; end if;
    select * into inv from community_v2.invites where token_hash=hashv;
    if found then
      if inv.server_id<>s or inv.creator_id is distinct from u or inv.label<>labelv or inv.ttl_seconds<>ttl or inv.max_uses is distinct from maxv then
        raise exception 'Bu oluşturma isteği başka bilgilerle kullanılmış. Yeni davet oluştur.';
      end if;
      return jsonb_build_object('id',inv.id,'expires_at',inv.expires_at,'revoked',inv.revoked_at is not null);
    end if;
    -- Parallel creation from different servers also counts toward the account limit.
    perform pg_advisory_xact_lock(hashtextextended('community-invite:'||u::text,0));
    if (select count(*) from community_v2.invites where creator_id=u and created_at>stamp-interval '1 hour')>=20 then
      raise exception 'Bir saatte en fazla 20 davet oluşturabilirsin.';
    end if;
    if (select count(*) from community_v2.invites where server_id=s and revoked_at is null
      and (expires_at is null or expires_at>stamp) and (max_uses is null or uses<max_uses))>=50 then
      raise exception 'Sunucuda en fazla 50 açık davet olabilir. Önce kullanmadıklarını iptal et.';
    end if;
    insert into community_v2.invites(server_id,creator_id,token_hash,label,ttl_seconds,max_uses,expires_at)
      values(s,u,hashv,labelv,ttl,maxv,case when ttl=0 then null else stamp+make_interval(secs=>ttl) end) returning * into inv;
    insert into community_v2.audit(server_id,actor_id,action,target_id,details)
      values(s,u,'invite.create',inv.id,jsonb_build_object('label',labelv));
    return jsonb_build_object('id',inv.id,'expires_at',inv.expires_at,'revoked',false);
  elsif p_action='revoke' then
    select * into inv from community_v2.invites where server_id=s and id=(p->>'invite_id')::uuid;
    if not found or (not managev and inv.creator_id is distinct from u) then raise exception 'Bu daveti yönetemezsin.' using errcode='42501'; end if;
    if inv.revoked_at is null then
      update community_v2.invites set revoked_at=stamp,revoked_by=u where id=inv.id;
      insert into community_v2.audit(server_id,actor_id,action,target_id,details)
        values(s,u,'invite.revoke',inv.id,jsonb_build_object('label',inv.label));
    end if;
    return jsonb_build_object('ok',true);
  end if;
  select coalesce(jsonb_agg(q order by q.seq desc),'[]'::jsonb) into result from (
    select i.id,i.seq::text as cursor,i.seq,i.label,i.uses,i.max_uses,i.created_at,i.expires_at,
      usr.username as creator_username,
      case when i.revoked_at is not null then 'revoked' when i.expires_at<=stamp then 'expired'
        when i.max_uses is not null and i.uses>=i.max_uses then 'exhausted'
        when not community_v2.invite_creator_active(s,i.creator_id) then 'suspended' else 'active' end as status
    from community_v2.invites i left join public.users usr on usr.id=i.creator_id
    where i.server_id=s and (managev or i.creator_id=u) and ((p->>'before') is null or i.seq<(p->>'before')::bigint)
    order by i.seq desc limit 26
  )q;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION community_v2.can_discover_channel(c uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select community_v2.server_active(s.id) and s.archived_at is null and (s.join_mode<>'invite' or community_v2.is_member(s.id,u)) and ch.archived_at is null
    and community_v2.series_status(ch.server_id,ch.manga_id) is null and community_v2.series_audience(ch.manga_id,u)
    and (case when community_v2.is_member(ch.server_id,u) then community_v2.can_read(c,u)
      else not ch.is_private
        and not exists(select 1 from community_v2.members where server_id=ch.server_id and user_id=u and state='banned')
        and exists(select 1 from community_v2.roles where server_id=ch.server_id and is_default
          and permissions @> array['channel.view','messages.read']) end)
    from community_v2.channels ch join community_v2.servers s on s.id=ch.server_id
    left join public.fansubs f on f.id=s.fansub_id where ch.id=c),false);
$function$;

CREATE OR REPLACE FUNCTION community_v2.channel_entry(c uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=community_v2.actor();
begin
  if not community_v2.can_discover_channel(c,u) and not community_v2.can_read(c,u) then
    raise exception 'Bu kanal kullanılamıyor veya erişimin yok.' using errcode='42501';
  end if;
  return (select jsonb_build_object('server_id',s.id,'channel_id',c,'channel_name',ch.name,
    'fansub_name',coalesce(s.name,f.name),'avatar_url',coalesce(s.avatar_url,f.avatar_url),'join_mode',s.join_mode,'is_member',community_v2.is_member(s.id,u),'is_private',ch.is_private)
    from community_v2.channels ch join community_v2.servers s on s.id=ch.server_id
    left join public.fansubs f on f.id=s.fansub_id where ch.id=c);
end $function$;

CREATE OR REPLACE FUNCTION community_v2.manage_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid:=community_v2.actor(); s uuid:=(p->>'server_id')::uuid;
  r uuid:=nullif(p->>'role_id','')::uuid; c uuid:=nullif(p->>'channel_id','')::uuid;
  target uuid:=nullif(p->>'user_id','')::uuid; owner boolean; actor_rank integer;
  old_role community_v2.roles; old_channel community_v2.channels;
  perms text[]; ids uuid[]; old_ids uuid[]; changed_ids uuid[];
  namev text; colorv text; pos integer; topicv text; categoryv text; privatev boolean; mangav uuid; slowv integer;
  action_permission text; new_version integer; ident uuid; detailsv jsonb:='{}';
begin
  -- All management operations take the same server lock; no operation races through an old role.
  perform 1 from community_v2.servers where id=s for update;
  if not found or not community_v2.is_member(s,u) then
    raise exception 'Bu sunucuya erişimin yok.' using errcode='42501';
  end if;
  owner:=community_v2.is_owner(s,u); actor_rank:=community_v2.rank_of(s,u);
  if not owner and exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then
    raise exception 'Yazma kısıtlaman sırasında yönetim işlemi yapamazsın.' using errcode='42501';
  end if;

  if p_action='save_role' then
    namev:=btrim(p->>'name'); colorv:=p->>'color'; pos:=(p->>'position')::integer;
    select coalesce(array_agg(distinct value order by value),'{}') into perms from jsonb_array_elements_text(p->'permissions');
    if perms is null or not perms <@ community_v2.permission_catalog() then raise exception 'Geçersiz rol izni.'; end if;
    if not owner and (pos<=actor_rank or exists(select 1 from unnest(perms)k where not community_v2.has_permission(s,u,k))) then
      raise exception 'Kendi rolünün altında kalmalı ve yalnız sahip olduğun izinleri vermelisin.' using errcode='42501';
    end if;
    if r is null then
      if not community_v2.has_permission(s,u,'roles.create') then raise exception 'Rol oluşturma iznin yok.' using errcode='42501'; end if;
      if (select count(*) from community_v2.roles where server_id=s)>=50 then raise exception 'En fazla 50 rol oluşturabilirsin.'; end if;
      insert into community_v2.roles(server_id,name,color,position,permissions,mentionable,icon,hoist) values(s,namev,colorv,pos,perms,coalesce((p->>'mentionable')::boolean,false),coalesce(p->>'icon',''),coalesce((p->>'hoist')::boolean,false)) returning id,version into r,new_version;
      detailsv:=jsonb_build_object('label',namev,'after',jsonb_build_object('permissions',perms,'position',pos,'color',colorv,'mentionable',coalesce((p->>'mentionable')::boolean,false)));
    else
      select * into old_role from community_v2.roles where id=r and server_id=s;
      if not found or not community_v2.can_delegate_role(s,u,r) then raise exception 'Bu rolü yönetemezsin; eşit, üst ve kendi rollerin korunur.' using errcode='42501'; end if;
      if not exists(select 1 from unnest(array['roles.appearance.manage','roles.permissions.manage','roles.order.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Rol düzenleme iznin yok.' using errcode='42501'; end if;
      if p ? 'version' and (p->>'version')::integer<>old_role.version then raise exception 'Bu rol başka bir işlemle değişti. Rolü yeniden açıp tekrar dene.'; end if;
      if (namev is distinct from old_role.name or colorv is distinct from old_role.color or (p ? 'icon' and p->>'icon' is distinct from old_role.icon) or (p ? 'hoist' and (p->>'hoist')::boolean is distinct from old_role.hoist)) and not community_v2.has_permission(s,u,'roles.appearance.manage') then raise exception 'Rol görünümünü değiştirme iznin yok.' using errcode='42501'; end if;
      if pos is distinct from old_role.position and not community_v2.has_permission(s,u,'roles.order.manage') then raise exception 'Rol sırasını değiştirme iznin yok.' using errcode='42501'; end if;
      if not (perms @> old_role.permissions and perms <@ old_role.permissions) and not community_v2.has_permission(s,u,'roles.permissions.manage') then raise exception 'Rol izinlerini değiştirme iznin yok.' using errcode='42501'; end if;
      if p ? 'mentionable' and (p->>'mentionable')::boolean is distinct from old_role.mentionable then
        if old_role.is_default or not community_v2.has_permission(s,u,'roles.permissions.manage') then raise exception 'Bu rolün etiketlenebilirliğini değiştiremezsin.' using errcode='42501'; end if;
      end if;
      update community_v2.roles set icon=coalesce(p->>'icon',old_role.icon),hoist=coalesce((p->>'hoist')::boolean,old_role.hoist),mentionable=coalesce((p->>'mentionable')::boolean,old_role.mentionable),name=namev,color=colorv,position=pos,permissions=perms,version=version+1 where id=r returning version into new_version;
      detailsv:=jsonb_build_object('label',namev,'before',jsonb_build_object('permissions',old_role.permissions,'position',old_role.position,'color',old_role.color,'name',old_role.name,'mentionable',old_role.mentionable),'after',jsonb_build_object('permissions',perms,'position',pos,'color',colorv,'name',namev,'mentionable',coalesce((p->>'mentionable')::boolean,old_role.mentionable)));
    end if;
    ident:=r;
  elsif p_action='delete_role' then
    select * into old_role from community_v2.roles where id=r and server_id=s;
    if not found or old_role.is_default or not community_v2.can_delegate_role(s,u,r) or not community_v2.has_permission(s,u,'roles.delete') then
      raise exception 'Bu rolü silme iznin yok.' using errcode='42501';
    end if;
    if p ? 'version' and (p->>'version')::integer<>old_role.version then raise exception 'Rol değişti. Yeniden açıp tekrar dene.'; end if;
    detailsv:=jsonb_build_object('label',old_role.name,'before',to_jsonb(old_role));
    delete from community_v2.roles where id=r; ident:=r;
  elsif p_action='assign_roles' then
    if not community_v2.has_permission(s,u,'roles.assign') or (not owner and not community_v2.outranks_member(s,u,target)) then
      raise exception 'Yalnız kendi seviyenin altındaki üyelerin rollerini değiştirebilirsin.' using errcode='42501';
    end if;
    if not exists(select 1 from community_v2.members where server_id=s and user_id=target and state='active') then raise exception 'Aktif üye bulunamadı.'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(p->'role_ids');
    select coalesce(array_agg(role_id),'{}') into old_ids from community_v2.member_roles where server_id=s and user_id=target;
    if p ? 'expected_role_ids' and exists(
      select 1 from ((select value::uuid from jsonb_array_elements_text(p->'expected_role_ids') except select unnest(old_ids))
      union (select unnest(old_ids) except select value::uuid from jsonb_array_elements_text(p->'expected_role_ids'))) difference) then
      raise exception 'Üyenin rolleri değişti. Güncel rolleri açıp tekrar dene.';
    end if;
    if exists(select 1 from unnest(ids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s and not is_default)) then raise exception 'Roller bu sunucuya ait olmalı.'; end if;
    select coalesce(array_agg(v),'{}') into changed_ids from (
      (select unnest(ids) except select unnest(old_ids)) union (select unnest(old_ids) except select unnest(ids))) changed(v);
    if not owner and exists(select 1 from unnest(changed_ids)v where not community_v2.can_delegate_role(s,u,v)) then
      raise exception 'Kendi seviyenin altında ve izinlerinin kapsamında kalan rolleri verebilir veya kaldırabilirsin.' using errcode='42501';
    end if;
    delete from community_v2.member_roles where server_id=s and user_id=target;
    insert into community_v2.member_roles select s,target,v from unnest(ids)v;
    ident:=target; detailsv:=jsonb_build_object('label',(select username from public.users where id=target),'before',to_jsonb(old_ids),'after',to_jsonb(ids));
  elsif p_action in ('save_channel','archive_channel') then
    if c is not null then
      select * into old_channel from community_v2.channels where id=c and server_id=s;
      if not found or not community_v2.can_view(c,u) then raise exception 'Bu kanalı yönetemezsin.' using errcode='42501'; end if;
      if p ? 'version' and (p->>'version')::integer<>old_channel.version then raise exception 'Kanal başka bir işlemle değişti. Yeniden açıp tekrar dene.'; end if;
      select coalesce(array_agg(role_id order by role_id),'{}') into old_ids from community_v2.channel_roles where channel_id=c;
    end if;
    if p_action='archive_channel' then
      if c is null or not community_v2.has_permission(s,u,'channels.archive') then raise exception 'Kanal arşivleme iznin yok.' using errcode='42501'; end if;
      if p->>'archived' is null then raise exception 'Arşiv durumu gerekli.'; end if;
      update community_v2.channels set archived_at=case when (p->>'archived')::boolean then coalesce(archived_at,now()) else null end,version=version+1 where id=c returning version into new_version;
      detailsv:=jsonb_build_object('label',old_channel.name,'archived',(p->>'archived')::boolean);
    else
      namev:=btrim(p->>'name'); topicv:=coalesce(p->>'topic',''); categoryv:=btrim(coalesce(p->>'category','')); pos:=(p->>'position')::integer; privatev:=(p->>'is_private')::boolean;
      slowv:=coalesce((p->>'slowmode_seconds')::integer,old_channel.slowmode_seconds,0);
      if slowv not between 0 and 21600 then raise exception 'Yavaş mod 0–21600 saniye olmalı.'; end if;
      mangav:=case when p ? 'manga_id' then nullif(p->>'manga_id','')::uuid else old_channel.manga_id end;
      if mangav is not null and exists(select 1 from community_v2.servers where id=s and fansub_id is null) then raise exception 'Seri bağlama yalnız fansub sunucularında kullanılabilir.'; end if;
      if mangav is distinct from old_channel.manga_id then
        if old_channel.manga_id is not null then raise exception 'Seri bağlantısı değiştirilemez. Mevcut kanalı arşivleyebilirsin.'; end if;
        if coalesce(old_channel.last_seq,0)>0 then raise exception 'Mesaj geçmişi olan genel kanal bir seriye bağlanamaz. Yeni kanal oluştur.'; end if;
        if c is not null and not community_v2.has_permission(s,u,'channels.manage') then raise exception 'Seri bağlama iznin yok.' using errcode='42501'; end if;
        if not community_v2.series_audience(mangav,u) then raise exception 'Bu seriye erişimin yok.' using errcode='42501'; end if;
        perform community_v2.lock_series(s,mangav);
        if exists(select 1 from community_v2.channels where server_id=s and manga_id=mangav and id is distinct from c) then
          raise exception 'Bu seri için zaten bir kanal var; arşivlenen kanallar da bu kapsama dahildir.';
        end if;
      end if;
      select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into ids from jsonb_array_elements_text(p->'role_ids');
      if exists(select 1 from unnest(ids)v where not exists(select 1 from community_v2.roles where id=v and server_id=s)) then raise exception 'Kanal rolleri bu sunucuya ait olmalı.'; end if;
      if c is null then
        if not community_v2.has_permission(s,u,'channels.create') then raise exception 'Kanal oluşturma iznin yok.' using errcode='42501'; end if;
        if privatev and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Özel oda açmak için kanal erişimini yönetme izni gerekli.' using errcode='42501'; end if;
        if (select count(*) from community_v2.channels where server_id=s)>=100 then raise exception 'En fazla 100 kanal oluşturabilirsin.'; end if;
        insert into community_v2.channels(server_id,name,topic,category,is_private,position,manga_id,slowmode_seconds) values(s,namev,topicv,categoryv,privatev,pos,mangav,slowv) returning id,version into c,new_version;
      else
        if not exists(select 1 from unnest(array['channels.manage','channels.permissions.manage'])k where community_v2.has_permission(s,u,k)) then raise exception 'Kanal düzenleme iznin yok.' using errcode='42501'; end if;
        if (namev is distinct from old_channel.name or topicv is distinct from old_channel.topic or categoryv is distinct from old_channel.category or pos is distinct from old_channel.position or slowv is distinct from old_channel.slowmode_seconds)
          and not community_v2.has_permission(s,u,'channels.manage') then raise exception 'Kanal bilgilerini düzenleme iznin yok.' using errcode='42501'; end if;
        if (privatev is distinct from old_channel.is_private or ids is distinct from old_ids)
          and not community_v2.has_permission(s,u,'channels.permissions.manage') then raise exception 'Kanal erişim ayarlarını değiştirme iznin yok.' using errcode='42501'; end if;
        update community_v2.channels set name=namev,topic=topicv,category=categoryv,is_private=privatev,position=pos,manga_id=mangav,slowmode_seconds=slowv,version=version+1 where id=c returning version into new_version;
      end if;
      delete from community_v2.channel_roles where channel_id=c;
      insert into community_v2.channel_roles select s,c,v from unnest(ids)v;
      if not community_v2.can_view(c,u) then raise exception 'Kendi erişimini kaldıran bir özel oda ayarı kaydedemezsin.' using errcode='42501'; end if;
      detailsv:=jsonb_build_object('label',namev,'before',case when old_channel.id is null then null else jsonb_build_object('name',old_channel.name,'topic',old_channel.topic,'category',old_channel.category,'position',old_channel.position,'private',old_channel.is_private,'roles',old_ids,'manga_id',old_channel.manga_id,'slowmode_seconds',old_channel.slowmode_seconds) end,'after',jsonb_build_object('name',namev,'topic',topicv,'category',categoryv,'position',pos,'private',privatev,'roles',ids,'manga_id',mangav,'slowmode_seconds',slowv));
    end if;
    ident:=c;
  elsif p_action='moderate' then
    action_permission:=case p->>'operation' when 'timeout' then 'members.timeout' when 'kick' then 'members.kick' when 'ban' then 'members.ban' when 'unban' then 'members.ban' end;
    if action_permission is null or not community_v2.has_permission(s,u,action_permission) or not community_v2.outranks_member(s,u,target) then
      raise exception 'Yalnız kendi seviyenin altındaki üyeye bu işlemi uygulayabilirsin.' using errcode='42501';
    end if;
    if p->>'operation'='timeout' then
      if p->>'minutes' is null or (p->>'minutes')::integer not between 0 and 10080 then raise exception 'Kısıtlama süresi 0–10080 dakika olmalı.'; end if;
      update community_v2.members set timeout_until=case when (p->>'minutes')::integer=0 then null else now()+make_interval(mins=>(p->>'minutes')::integer) end where server_id=s and user_id=target;
    else
      if p->>'operation'='unban' and not exists(select 1 from community_v2.members where server_id=s and user_id=target and state='banned') then raise exception 'Üye yasaklı değil.'; end if;
      update community_v2.members set protected_rank=case when p->>'operation'='ban' then community_v2.rank_of(s,target) else null end,
        state=case when p->>'operation'='ban' then 'banned' else 'left' end where server_id=s and user_id=target;
      delete from community_v2.member_roles where server_id=s and user_id=target;
    end if;
    ident:=target; p_action:='member.'||(p->>'operation');
    detailsv:=jsonb_build_object('label',(select username from public.users where id=target),'minutes',p->'minutes');
  else raise exception 'Bilinmeyen yönetim işlemi.';
  end if;
  insert into community_v2.audit(server_id,actor_id,action,target_id,details) values(s,u,p_action,ident,detailsv);
  perform community_v2.emit(s);
  return jsonb_build_object('ok',true,'id',ident,'version',new_version);
end $function$;

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

CREATE OR REPLACE FUNCTION community_v2.permission_catalog()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban','roles.create','roles.appearance.manage',
    'roles.permissions.manage','roles.order.manage','roles.assign','roles.delete',
    'channels.create','channels.manage','channels.permissions.manage','channels.archive',
    'messages.reply','reactions.add','mentions.users','mentions.roles','messages.pin','attachments.send',
    'slowmode.bypass','reports.review','invites.create','invites.manage','server.profile.manage','server.join.manage','members.approve','members.nicknames.manage']::text[];
$function$;
notify pgrst,'reload schema';
