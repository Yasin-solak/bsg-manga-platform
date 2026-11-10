-- Old post records are kept; new chat data is separate and closed to the API.
create schema community_v2;
revoke all on schema community_v2 from public, anon, authenticated;
alter default privileges in schema community_v2 revoke execute on functions from public;

create table community_v2.servers (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null unique references public.fansubs(id),
  owner_id uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create table community_v2.preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  auto_join boolean not null default true
);
create table community_v2.members (
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  state text not null default 'active' check (state in ('active','left','banned')),
  joined_at timestamptz not null default now(),
  timeout_until timestamptz,
  last_message_at timestamptz,
  primary key(server_id,user_id)
);
create index community_members_user on community_v2.members(user_id,server_id);
create table community_v2.roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#86d9ce' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0 check (position between 0 and 1000),
  is_default boolean not null default false,
  permissions text[] not null default '{}',
  unique(server_id,id),
  check (permissions <@ array['channel.view','messages.read','messages.send','messages.self.edit',
    'messages.self.delete','messages.others.delete','members.list','server.audit.read',
    'members.timeout','members.kick','members.ban']::text[])
);
create unique index community_default_role on community_v2.roles(server_id) where is_default;
create table community_v2.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  primary key(server_id,user_id,role_id),
  foreign key(server_id,user_id) references community_v2.members(server_id,user_id) on delete cascade,
  foreign key(server_id,role_id) references community_v2.roles(server_id,id) on delete cascade
);
create index community_member_roles_role on community_v2.member_roles(server_id,role_id);
create table community_v2.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  topic text not null default '' check (char_length(topic)<=300),
  is_private boolean not null default false,
  position integer not null default 0 check(position between 0 and 1000),
  last_seq bigint not null default 0,
  unique(server_id,id)
);
create table community_v2.channel_roles (
  server_id uuid not null,
  channel_id uuid not null,
  role_id uuid not null,
  primary key(server_id,channel_id,role_id),
  foreign key(server_id,channel_id) references community_v2.channels(server_id,id) on delete cascade,
  foreign key(server_id,role_id) references community_v2.roles(server_id,id) on delete cascade
);
create index community_channel_roles_role on community_v2.channel_roles(server_id,role_id);
create table community_v2.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references community_v2.channels(id) on delete cascade,
  seq bigint not null,
  author_id uuid not null references public.users(id),
  client_id uuid not null,
  body text not null check (char_length(body)<=4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  unique(channel_id,seq),
  unique(author_id,client_id)
);
create table community_v2.reads (
  channel_id uuid not null references community_v2.channels(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_seq bigint not null default 0,
  primary key(channel_id,user_id)
);
create index community_reads_user on community_v2.reads(user_id);
create table community_v2.audit (
  id bigint generated always as identity primary key,
  server_id uuid not null references community_v2.servers(id) on delete cascade,
  actor_id uuid references public.users(id),
  action text not null,
  target_id uuid,
  created_at timestamptz not null default now()
);
create index community_audit_server on community_v2.audit(server_id,id desc);
create index community_servers_owner on community_v2.servers(owner_id);
create index community_messages_author on community_v2.messages(author_id);
create index community_audit_actor on community_v2.audit(actor_id);

do $$ declare t text; begin
  foreach t in array array['servers','preferences','members','roles','member_roles','channels','channel_roles','messages','reads','audit'] loop
    execute format('alter table community_v2.%I enable row level security',t);
    execute format('revoke all on community_v2.%I from public,anon,authenticated',t);
  end loop;
end $$;

create function community_v2.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid := public.current_public_user_id();
begin
  if u is null then raise exception 'Geçerli bir hesapla giriş yapmalısın.' using errcode='42501'; end if;
  return u;
end $$;

-- Ownership does not come from a role name. If the fansub admin becomes unclear management closes.
create function community_v2.is_owner(s uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from community_v2.servers v join public.fansubs f on f.id=v.fansub_id
    where v.id=s and v.owner_id=u and f.is_active
    and (select count(*) from public.fansub_members m where m.fansub_id=v.fansub_id and m.role='admin')=1
    and exists(select 1 from public.fansub_members m where m.fansub_id=v.fansub_id and m.user_id=u and m.role='admin'));
$$;
create function community_v2.is_member(s uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from community_v2.members m join community_v2.servers v on v.id=m.server_id
    join public.fansubs f on f.id=v.fansub_id where m.server_id=s and m.user_id=u and m.state='active' and f.is_active);
$$;
create function community_v2.has_permission(s uuid,u uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
  select community_v2.is_member(s,u) and (community_v2.is_owner(s,u) or exists(
    select 1 from community_v2.roles r where r.server_id=s and p=any(r.permissions)
    and (r.is_default or exists(select 1 from community_v2.member_roles mr where mr.server_id=s and mr.user_id=u and mr.role_id=r.id))));
$$;
create function community_v2.can_view(c uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select community_v2.is_member(ch.server_id,u) and (community_v2.is_owner(ch.server_id,u) or
    case when ch.is_private then exists(select 1 from community_v2.channel_roles cr
      join community_v2.roles r on r.id=cr.role_id and r.server_id=cr.server_id
      where cr.channel_id=c and (r.is_default or exists(select 1 from community_v2.member_roles mr
        where mr.server_id=cr.server_id and mr.user_id=u and mr.role_id=cr.role_id)))
    else community_v2.has_permission(ch.server_id,u,'channel.view') end)
    from community_v2.channels ch where ch.id=c),false);
$$;
create function community_v2.can_read(c uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select community_v2.can_view(c,u) and exists(select 1 from community_v2.channels ch where ch.id=c
    and community_v2.has_permission(ch.server_id,u,'messages.read'));
$$;
create function community_v2.emit(s uuid,c uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
  -- No content goes to a user left on an old connection; the client rereads the authorized RPC.
  perform realtime.send('{}'::jsonb,'refresh',case when c is null then 'community-v2:server:'||s else 'community-v2:channel:'||c end,true);
end $$;
create function community_v2.broadcast_allowed(topic text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare u uuid := public.current_public_user_id(); v uuid;
begin
  if u is null or topic !~ '^community-v2:(server|channel):[0-9a-f-]{36}$' then return false; end if;
  begin v := split_part(topic,':',3)::uuid; exception when invalid_text_representation then return false; end;
  if split_part(topic,':',2)='server' then return community_v2.is_member(v,u); end if;
  return community_v2.can_read(v,u);
end $$;
grant usage on schema community_v2 to authenticated;
grant execute on function community_v2.broadcast_allowed(text) to authenticated;
create policy community_v2_receive on realtime.messages for select to authenticated
  using (extension='broadcast' and community_v2.broadcast_allowed((select realtime.topic())));
