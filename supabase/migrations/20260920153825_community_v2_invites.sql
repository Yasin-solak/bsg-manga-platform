-- The share key stays only on the client; the database keeps a SHA-256 digest.
create table community_v2.invites (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  creator_id uuid references public.users(id) on delete set null,
  token_hash bytea not null unique check(octet_length(token_hash)=32),
  label text not null check(char_length(label) between 1 and 80),
  ttl_seconds integer not null check(ttl_seconds in (0,3600,86400,604800,2592000)),
  max_uses integer check(max_uses between 1 and 10000),
  uses integer not null default 0 check(uses>=0 and (max_uses is null or uses<=max_uses)),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null
);
create index community_invites_server on community_v2.invites(server_id,seq desc);
create index community_invites_creator on community_v2.invites(creator_id,created_at desc);
create index community_invites_revoker on community_v2.invites(revoked_by) where revoked_by is not null;
alter table community_v2.invites enable row level security;
revoke all on community_v2.invites from public,anon,authenticated;
revoke all on sequence community_v2.invites_seq_seq from public,anon,authenticated;

create or replace function community_v2.permission_catalog() returns text[]
language sql immutable set search_path='' as $$
  select array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban','roles.create','roles.appearance.manage',
    'roles.permissions.manage','roles.order.manage','roles.assign','roles.delete',
    'channels.create','channels.manage','channels.permissions.manage','channels.archive',
    'messages.reply','reactions.add','mentions.users','mentions.roles','messages.pin','attachments.send',
    'slowmode.bypass','reports.review','invites.create','invites.manage']::text[];
$$;

-- If the creator membership/permission goes the old link cannot give new membership.
create function community_v2.invite_creator_active(s uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select community_v2.has_permission(s,u,'invites.create')
    and exists(select 1 from public.users where id=u and coalesce(is_active,true) and not coalesce(is_banned,false))
    and (community_v2.is_owner(s,u) or not exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()));
$$;

create function community_v2.invites_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
      update community_v2.invites set uses=uses+1 where id=inv.id;
      insert into community_v2.audit(server_id,actor_id,action,target_id,details)
        values(s,u,'invite.join',inv.id,jsonb_build_object('label',inv.label));
      perform community_v2.emit(s);
      statev:='joined';
    end if;
    select jsonb_build_object('status',statev,'server_id',s,'name',f.name,'avatar_url',f.avatar_url,
      'expires_at',inv.expires_at) into result
      from community_v2.servers v join public.fansubs f on f.id=v.fansub_id where v.id=s;
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
$$;
create function public.community_v2_invites(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.invites_api(p_action,p_payload); $$;
revoke all on function community_v2.permission_catalog(),community_v2.invite_creator_active(uuid,uuid),
  community_v2.invites_api(text,jsonb),public.community_v2_invites(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.invites_api(text,jsonb),public.community_v2_invites(text,jsonb) to authenticated;
