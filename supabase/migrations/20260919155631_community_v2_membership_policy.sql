create function community_v2.create_server(f uuid,actor_id uuid,automatic boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; total integer; existing uuid; enabled boolean;
begin
  if automatic then
    select is_enabled and rollout_percent=100 into enabled from public.feature_flags
      where key='community.servers_auto_create' for share;
    if not coalesce(enabled,false) then return null; end if;
  end if;
  perform 1 from public.fansubs where id=f and is_active for update;
  if not found then
    if automatic then return null; end if;
    raise exception 'Aktif fansub bulunamadı.';
  end if;
  select count(*) into total from public.fansub_members where fansub_id=f and role='admin';
  if total<>1 then
    if automatic then return null; end if;
    raise exception 'Sunucu açmak için fansubun tek bir admini olmalı.';
  end if;
  select user_id into owner_id from public.fansub_members where fansub_id=f and role='admin';
  if not automatic and actor_id is distinct from owner_id then raise exception 'Sunucuyu yalnız fansub admini açabilir.' using errcode='42501'; end if;
  if not exists(select 1 from public.users where id=owner_id and is_active and not is_banned) then return null; end if;
  select id into existing from community_v2.servers where fansub_id=f;
  if existing is not null then return existing; end if;
  insert into community_v2.servers(fansub_id,owner_id) values(f,owner_id) returning id into existing;
  insert into community_v2.members(server_id,user_id) values(existing,owner_id);
  insert into community_v2.roles(server_id,name,is_default,position,permissions)
    values(existing,'Herkes',true,1000,array['channel.view','messages.read','messages.send','messages.self.edit','messages.self.delete','members.list']);
  insert into community_v2.channels(server_id,name,topic) values(existing,'genel-sohbet','Tanış, sohbet et ve birlikte okuduklarını paylaş.');
  insert into community_v2.audit(server_id,actor_id,action,target_id)
    values(existing,owner_id,case when automatic then 'server.automatic' else 'server.manual' end,f);
  return existing;
end $$;

-- Unfollowing does not delete membership. A voluntary leave/ban is not overcome by auto join.
create function community_v2.follow_join() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce((select auto_join from community_v2.preferences where user_id=new.user_id),true) then
    insert into community_v2.members(server_id,user_id)
      select v.id,new.user_id from community_v2.servers v join public.fansubs f on f.id=v.fansub_id
      where v.fansub_id=new.fansub_id and f.is_active on conflict do nothing;
  end if;
  return new;
end $$;
create trigger community_v2_follow_join after insert on public.fansub_follows for each row execute function community_v2.follow_join();

create function community_v2.sync_my_follows() returns void language plpgsql security definer set search_path='' as $$
declare u uuid := community_v2.actor();
begin
  if coalesce((select auto_join from community_v2.preferences where user_id=u),true) then
    insert into community_v2.members(server_id,user_id)
      select v.id,u from public.fansub_follows ff join community_v2.servers v on v.fansub_id=ff.fansub_id
      join public.fansubs f on f.id=v.fansub_id where ff.user_id=u and f.is_active on conflict do nothing;
  end if;
end $$;
create function public.community_v2_sync() returns void language sql security invoker set search_path='' as $$
  select community_v2.sync_my_follows();
$$;
revoke all on function public.community_v2_sync() from public,anon;
grant execute on function public.community_v2_sync(),community_v2.sync_my_follows() to authenticated;

-- Small batches; each creation rechecks the live mode before writing.
create function community_v2.reconcile() returns integer language plpgsql security definer set search_path='' as $$
declare f uuid; n integer:=0;
begin
  if not exists(select 1 from public.feature_flags where key='community.servers_auto_create' and is_enabled and rollout_percent=100) then return 0; end if;
  for f in select fs.id from public.fansubs fs where fs.is_active
    and not exists(select 1 from community_v2.servers v where v.fansub_id=fs.id)
    and (select count(*) from public.fansub_members m where m.fansub_id=fs.id and m.role='admin')=1
    and exists(select 1 from public.fansub_members m join public.users u on u.id=m.user_id
      where m.fansub_id=fs.id and m.role='admin' and u.is_active and not u.is_banned)
    order by fs.id limit 25 loop
    if community_v2.create_server(f,null,true) is not null then n:=n+1; end if;
  end loop;
  return n;
end $$;

-- On a single admin transfer ownership follows fansub management; with two admins management stays locked.
create function community_v2.fansub_admin_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare f uuid:=coalesce(new.fansub_id,old.fansub_id); owner_id uuid; s uuid;
begin
  perform 1 from public.fansubs where id=f for update;
  if (select count(*) from public.fansub_members where fansub_id=f and role='admin')=1 then
    select user_id into owner_id from public.fansub_members where fansub_id=f and role='admin';
    update community_v2.servers set owner_id=fansub_admin_changed.owner_id where fansub_id=f returning id into s;
    if s is not null then
      insert into community_v2.members(server_id,user_id) values(s,owner_id)
        on conflict(server_id,user_id) do update set state='active';
      perform community_v2.emit(s);
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger community_v2_fansub_admin_changed after insert or update or delete on public.fansub_members
  for each row execute function community_v2.fansub_admin_changed();

update public.feature_flags set description='Fansub sunucularını otomatik oluşturur. Kapalıyken fansub admini manuel açar. Mod değişimi mevcut sunucuları korur; genel politika için rollout %100 olmalıdır.',
  metadata=metadata||'{"implementation_status":"server_core","reconcile_batch":25}'::jsonb
where key='community.servers_auto_create';

select cron.schedule('community-v2-server-policy','*/5 * * * *','select community_v2.reconcile();');
