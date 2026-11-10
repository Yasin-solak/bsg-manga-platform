-- A declared variable cannot be qualified with the function name (only parameters): on a single-admin
-- fansub each write to fansub_members gave 42P01 (e.g. fansub application approval).
create or replace function community_v2.fansub_admin_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare f uuid:=coalesce(new.fansub_id,old.fansub_id); v_owner uuid; s uuid;
begin
  perform 1 from public.fansubs where id=f for update;
  if (select count(*) from public.fansub_members where fansub_id=f and role='admin')=1 then
    select user_id into v_owner from public.fansub_members where fansub_id=f and role='admin';
    update community_v2.servers set owner_id=v_owner where fansub_id=f returning id into s;
    if s is not null then
      insert into community_v2.members(server_id,user_id) values(s,v_owner)
        on conflict(server_id,user_id) do update set state='active';
      perform community_v2.emit(s);
    end if;
  end if;
  return coalesce(new,old);
end $$;
