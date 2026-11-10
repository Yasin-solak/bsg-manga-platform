-- Real public RPC and a new room rolled back at the end are used.
-- Existing account passwords/sessions do not change; all data and signals ROLLBACK.
begin;
set local statement_timeout='25s';
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; manager public.users; target_user public.users;
  s uuid; manager_role uuid; target_role uuid; payload jsonb; result jsonb;
  owner_claims text; manager_claims text; target_claims text;
  rejected boolean; audit_before bigint; signals_before bigint; target_before jsonb;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into manager from public.users where username='denemeuser';
  select * into target_user from public.users where id not in(owner_user.id,manager.id)
    and auth_user_id is not null and is_active and not is_banned order by id limit 1;
  if owner_user.auth_user_id is null or manager.auth_user_id is null or target_user.id is null then
    raise exception 'Doğrulama hesapları eksik.';
  end if;
  owner_claims:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  manager_claims:=jsonb_build_object('sub',manager.auth_user_id,'role','authenticated','session_id',coalesce(manager.active_session_id,gen_random_uuid()))::text;
  target_claims:=jsonb_build_object('sub',target_user.auth_user_id,'role','authenticated','session_id',coalesce(target_user.active_session_id,gen_random_uuid()))::text;
  update community_v2.operations_config set rooms_per_owner=rooms_per_owner+1 where id;
  perform set_config('request.jwt.claims',owner_claims,true);
  s:=(public.community_v2_rooms('create','{"name":"Güvenli moderasyon doğrulaması","join_mode":"open"}')->>'id')::uuid;
  insert into community_v2.members(server_id,user_id) values(s,manager.id),(s,target_user.id);
  manager_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Üye sorumlusu','color','#86d9ce','position',100,'permissions',array['members.kick']))->>'id')::uuid;
  target_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Okur','color','#86d9ce','position',200,'permissions','[]'::jsonb))->>'id')::uuid;
  insert into community_v2.member_roles values(s,manager.id,manager_role),(s,target_user.id,target_role);
  payload:=jsonb_build_object('server_id',s,'user_id',target_user.id);
  perform public.community_v2_write('moderate',payload||'{"operation":"ban"}'::jsonb);
  if not exists(select 1 from community_v2.members where server_id=s and user_id=target_user.id and state='banned' and protected_rank=200) then raise exception 'Ban kontrolü kurulamadı.'; end if;
  perform set_config('request.jwt.claims',manager_claims,true);
  if not community_v2.outranks_member(s,manager.id,target_user.id) or community_v2.has_permission(s,manager.id,'members.ban') then raise exception 'Yalnız atma yetkisi önkoşulu yanlış.'; end if;
  select to_jsonb(m) into target_before from community_v2.members m where server_id=s and user_id=target_user.id;
  select count(*) into audit_before from community_v2.audit where server_id=s;
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||s and event='refresh';
  rejected:=false;
  begin perform public.community_v2_write('moderate',payload||'{"operation":"kick"}'::jsonb);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Güvenlik: atma izni yasaklı üyeyi değiştirdi.'; end if;
  if (select to_jsonb(m) from community_v2.members m where server_id=s and user_id=target_user.id) is distinct from target_before
    or exists(select 1 from community_v2.member_roles where server_id=s and user_id=target_user.id)
    or (select count(*) from community_v2.audit where server_id=s)<>audit_before
    or (select count(*) from realtime.messages where topic='community-v2:server:'||s and event='refresh')<>signals_before then
    raise exception 'Reddedilen atma işlemi durum/rol/denetim/sinyal değiştirdi.';
  end if;
  rejected:=false;
  begin perform public.community_v2_write('moderate',payload||'{"operation":"unban"}'::jsonb);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Atma izni doğrudan yasağı kaldırdı.'; end if;
  perform set_config('request.jwt.claims',target_claims,true);
  rejected:=false;
  begin perform public.community_v2_rooms('join',jsonb_build_object('server_id',s));
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Yasaklı üye katılabildi.'; end if;
  rejected:=false;
  begin perform public.community_v2_write('join',jsonb_build_object('server_id',s));
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Yasaklı üye alternatif girişten katılabildi.'; end if;
  -- When real ban permission is added explicit unban works; gives no automatic membership.
  update community_v2.roles set permissions=array['members.kick','members.ban'] where id=manager_role;
  perform set_config('request.jwt.claims',manager_claims,true);
  perform public.community_v2_write('moderate',payload||'{"operation":"unban"}'::jsonb);
  if not exists(select 1 from community_v2.members where server_id=s and user_id=target_user.id and state='left' and protected_rank is null) then raise exception 'Yetkili unban bozuldu.'; end if;
  rejected:=false;
  begin perform public.community_v2_write('moderate',payload||'{"operation":"kick"}'::jsonb);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Ayrılmış üyeye atma uygulandı.'; end if;
  perform set_config('request.jwt.claims',target_claims,true);
  result:=public.community_v2_write('join',jsonb_build_object('server_id',s));
  if result->>'ok' is distinct from 'true' or not community_v2.is_member(s,target_user.id) then raise exception 'Yasak kalktıktan sonra normal katılım bozuldu.'; end if;
  insert into community_v2.member_roles values(s,target_user.id,target_role);
  update community_v2.roles set permissions=array['members.kick'] where id=manager_role;
  perform set_config('request.jwt.claims',manager_claims,true);
  perform public.community_v2_write('moderate',payload||'{"operation":"kick"}'::jsonb);
  if not exists(select 1 from community_v2.members where server_id=s and user_id=target_user.id and state='left' and protected_rank is null)
    or exists(select 1 from community_v2.member_roles where server_id=s and user_id=target_user.id)
    or not exists(select 1 from community_v2.audit where server_id=s and target_id=target_user.id and action='member.kick') then raise exception 'Normal atma/rol temizliği/denetim bozuldu.'; end if;
  perform set_config('request.jwt.claims',target_claims,true);
  perform public.community_v2_rooms('join',jsonb_build_object('server_id',s));
  if not community_v2.is_member(s,target_user.id) then raise exception 'Atılan üyenin normal dönüşü bozuldu.'; end if;
  -- The active member condition does not replace the existing self/owner/equal/higher rank guard.
  perform set_config('request.jwt.claims',manager_claims,true);
  for payload in select jsonb_build_object('server_id',s,'user_id',id,'operation','kick') from unnest(array[owner_user.id,manager.id]) id loop
    rejected:=false; begin perform public.community_v2_write('moderate',payload); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Sahip/kendisi koruması bozuldu.'; end if;
  end loop;
  insert into community_v2.member_roles values(s,target_user.id,target_role);
  for result in select to_jsonb(pos) from unnest(array[100,50]) pos loop
    update community_v2.roles set position=(result#>>'{}')::integer where id=target_role;
    rejected:=false;
    begin perform public.community_v2_write('moderate',jsonb_build_object('server_id',s,'user_id',target_user.id,'operation','kick'));
    exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Eşit/üst sıra koruması bozuldu.'; end if;
  end loop;
  if has_function_privilege('authenticated','community_v2.manage_api(text,jsonb)','execute')
    or has_function_privilege('anon','public.community_v2_write(text,jsonb)','execute') then raise exception 'API yetki sınırı açık.'; end if;
end $$;
rollback;
select 'PASS: yasaklı/ayrılmış üyede atma reddi; iki katılım yolu, yetkili unban, normal atma/dönüş, hiyerarşi ve ACL' as result;
