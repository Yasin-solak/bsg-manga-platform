-- Real RPC entries and session mapping are used. All changes clean with ROLLBACK.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; manager public.users; target_user public.users;
  s uuid; base uuid; top_role uuid; peer_role uuid; manager_role uuid; lower_role uuid; own_role uuid; power_role uuid; created_role uuid;
  c uuid; hidden_c uuid; private_c uuid; mid uuid; response jsonb; payload jsonb; probe jsonb;
  rejected boolean; perms text[]; actor_claims text; owner_claims text;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into manager from public.users where username='denemeuser';
  select * into target_user from public.users where id not in(owner_user.id,manager.id) and auth_user_id is not null and is_active and not is_banned order by id limit 1;
  if target_user.id is null then raise exception 'Doğrulama hesapları eksik.'; end if;
  owner_claims:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  actor_claims:=jsonb_build_object('sub',manager.auth_user_id,'role','authenticated','session_id',coalesce(manager.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',owner_claims,true);
  select id into s from community_v2.servers where owner_id=owner_user.id limit 1;
  if s is null then raise exception 'Pilot sunucu bulunamadı.'; end if;
  select id into base from community_v2.roles where server_id=s and is_default;
  update community_v2.roles set permissions=array['channel.view','messages.read','members.list'] where id=base;
  insert into community_v2.members(server_id,user_id) values(s,manager.id),(s,target_user.id) on conflict(server_id,user_id) do update set state='active',timeout_until=null,last_message_at=null;
  delete from community_v2.member_roles where server_id=s and user_id in(manager.id,target_user.id);
  perms:=array_remove(community_v2.permission_catalog(),'messages.others.delete');
  manager_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Topluluk sorumlusu','color','#86d9ce','position',100,'permissions',perms))->>'id')::uuid;
  top_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Kıdemli ekip','color','#abcdef','position',50,'permissions','[]'::jsonb))->>'id')::uuid;
  peer_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Eşit ekip','color','#abcdef','position',100,'permissions','[]'::jsonb))->>'id')::uuid;
  own_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Ek görev','color','#abcdef','position',300,'permissions','[]'::jsonb))->>'id')::uuid;
  lower_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Okuma ekibi','color','#abcdef','position',200,'permissions',array['messages.read','messages.send']))->>'id')::uuid;
  power_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','İçerik sorumlusu','color','#abcdef','position',250,'permissions',array['messages.others.delete']))->>'id')::uuid;
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',manager.id,'role_ids',array[manager_role,own_role]));
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',target_user.id,'role_ids',array[lower_role]));
  hidden_c:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Sahip odası','topic','','position',999,'is_private',true,'role_ids','[]'::jsonb))->>'id')::uuid;
  perform set_config('request.jwt.claims',actor_claims,true);
  response:=public.community_v2_read('server',jsonb_build_object('server_id',s));
  if (response->>'my_rank')::int<>100 or jsonb_array_length(response->'permissions')<>cardinality(perms) then raise exception 'Birleşik yetki veya sıra yanlış.'; end if;
  if not community_v2.outranks_member(s,manager.id,target_user.id) or community_v2.outranks_member(s,manager.id,owner_user.id) or community_v2.outranks_member(s,manager.id,manager.id) then raise exception 'Hedef hiyerarşisi yanlış.'; end if;
  payload:=jsonb_build_object('server_id',s,'name','Okuma ekibi','color','#abcdef','position',200,'permissions',array['messages.read','messages.send']);
  for probe in select value from jsonb_array_elements(jsonb_build_array(
    payload||jsonb_build_object('role_id',top_role), payload||jsonb_build_object('role_id',peer_role),
    payload||jsonb_build_object('role_id',own_role), payload||jsonb_build_object('role_id',base),
    payload||jsonb_build_object('role_id',lower_role,'position',100),
    payload||jsonb_build_object('permissions',array['messages.others.delete']),
    payload||jsonb_build_object('role_id',power_role,'permissions','[]'::jsonb)
  )) loop
    rejected:=false; begin perform public.community_v2_write('save_role',probe); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Yasak rol düzenlemesi kabul edildi: %',probe; end if;
  end loop;
  rejected:=false; begin perform public.community_v2_write('save_role',payload||jsonb_build_object('permissions',array['unknown.permission'])); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Bilinmeyen izin kabul edildi.'; end if;
  created_role:=(public.community_v2_write('save_role',payload||jsonb_build_object('name','Etkinlik ekibi','position',400))->>'id')::uuid;
  perform public.community_v2_write('save_role',payload||jsonb_build_object('role_id',lower_role,'version',1,'name','Okuma moderatörü'));
  rejected:=false; begin perform public.community_v2_write('save_role',payload||jsonb_build_object('role_id',lower_role,'version',1)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Eski rol sürümü kabul edildi.'; end if;
  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('user_id',manager.id,'role_ids',array[manager_role,own_role,lower_role]),
    jsonb_build_object('user_id',owner_user.id,'role_ids',array[lower_role]),
    jsonb_build_object('user_id',target_user.id,'role_ids',array[power_role]),
    jsonb_build_object('user_id',target_user.id,'role_ids',array[peer_role]),
    jsonb_build_object('user_id',target_user.id,'role_ids',array[top_role])
  )) loop
    rejected:=false; begin perform public.community_v2_write('assign_roles',probe||jsonb_build_object('server_id',s)); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Yasak rol ataması kabul edildi.'; end if;
  end loop;
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',target_user.id,'role_ids',array[lower_role,created_role],'expected_role_ids',array[lower_role]));
  rejected:=false; begin perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',target_user.id,'role_ids',array[lower_role],'expected_role_ids',array[lower_role])); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Eski üye ataması kabul edildi.'; end if;
  perform public.community_v2_write('delete_role',jsonb_build_object('server_id',s,'role_id',created_role,'version',1));
  if exists(select 1 from community_v2.member_roles where role_id=created_role) then raise exception 'Rol ataması temizlenmedi.'; end if;
  rejected:=false; begin perform public.community_v2_write('delete_role',jsonb_build_object('server_id',s,'role_id',power_role)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Sahip olunmayan izinli rol silindi.'; end if;
  payload:=jsonb_build_object('server_id',s,'name','Okuma salonu','topic','Okuma buluşmaları','category','Topluluk','position',900,'is_private',false,'role_ids','[]'::jsonb);
  c:=(public.community_v2_write('save_channel',payload)->>'id')::uuid;
  private_c:=(public.community_v2_write('save_channel',payload||jsonb_build_object('name','Ekip salonu','is_private',true,'role_ids',array[manager_role]))->>'id')::uuid;
  for probe in select value from jsonb_array_elements(jsonb_build_array(
    payload||jsonb_build_object('channel_id',hidden_c),
    payload||jsonb_build_object('channel_id',private_c,'is_private',true,'role_ids','[]'::jsonb),
    payload||jsonb_build_object('channel_id',c,'server_id',gen_random_uuid())
  )) loop
    rejected:=false; begin perform public.community_v2_write('save_channel',probe); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Gizli kanal/erişim sınırı aşıldı.'; end if;
  end loop;
  update community_v2.roles set permissions=array_remove(perms,'channels.permissions.manage') where id=manager_role;
  rejected:=false; begin perform public.community_v2_write('save_channel',payload||jsonb_build_object('channel_id',private_c)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Bilgi düzenleme izni özel oda erişimini değiştirdi.'; end if;
  perform public.community_v2_write('save_channel',payload||jsonb_build_object('channel_id',private_c,'is_private',true,'role_ids',array[manager_role],'category','Ekip odaları'));
  update community_v2.roles set permissions=perms where id=manager_role;
  mid:=(public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Okuma buluşmasının notları.'))->>'id')::uuid;
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'version',1,'archived',true));
  if jsonb_array_length(public.community_v2_read('messages',jsonb_build_object('channel_id',c)))<>1 then raise exception 'Arşiv geçmişi kayboldu.'; end if;
  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('action','send','channel_id',c,'client_id',gen_random_uuid(),'body','Arşiv yeni mesajı reddetmeli.'),
    jsonb_build_object('action','edit_message','channel_id',c,'message_id',mid,'body','Arşiv düzenlemeyi reddetmeli.')
  )) loop
    rejected:=false; begin perform public.community_v2_write(probe->>'action',probe); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Arşiv yazılabilir kaldı.'; end if;
  end loop;
  rejected:=false; begin perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'version',1,'archived',false)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Eski kanal sürümü kabul edildi.'; end if;
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'version',2,'archived',false));
  perform public.community_v2_write('edit_message',jsonb_build_object('channel_id',c,'message_id',mid,'body','Okuma buluşmasının güncel notları.'));
  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('user_id',owner_user.id),jsonb_build_object('user_id',manager.id)
  )) loop
    rejected:=false; begin perform public.community_v2_write('moderate',probe||jsonb_build_object('server_id',s,'operation','ban')); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Sahip veya kendisi yasaklandı.'; end if;
  end loop;
  -- Equal and higher roles also limit member operations.
  delete from community_v2.member_roles where server_id=s and user_id=target_user.id;
  insert into community_v2.member_roles values(s,target_user.id,peer_role);
  rejected:=false; begin perform public.community_v2_write('moderate',jsonb_build_object('server_id',s,'user_id',target_user.id,'operation','timeout','minutes',15)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Eşit üye kısıtlandı.'; end if;
  update community_v2.member_roles set role_id=top_role where server_id=s and user_id=target_user.id;
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.community_v2_write('moderate',jsonb_build_object('server_id',s,'user_id',target_user.id,'operation','ban'));
  perform set_config('request.jwt.claims',actor_claims,true);
  rejected:=false; begin perform public.community_v2_write('moderate',jsonb_build_object('server_id',s,'user_id',target_user.id,'operation','unban')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Üst seviyedeki yasağı alt yönetici kaldırdı.'; end if;
  if not exists(select 1 from community_v2.audit where server_id=s and action='save_role' and details->>'label'='Okuma moderatörü' and details ? 'before') then raise exception 'İşlem ayrıntısı kaydedilmedi.'; end if;
  update community_v2.roles set permissions=array['messages.read','messages.send'] where id=manager_role;
  rejected:=false; begin perform public.community_v2_write('save_channel',payload||jsonb_build_object('channel_id',c)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Yetkisiz no-op kanal güncellemesi yapıldı.'; end if;
  if has_function_privilege('authenticated','community_v2.manage_api(text,jsonb)','EXECUTE') or has_function_privilege('anon','community_v2.permission_catalog()','EXECUTE') or has_function_privilege('authenticated','community_v2.rank_of(uuid,uuid)','EXECUTE') then raise exception 'Özel yardımcı dışarıya açıldı.'; end if;
end $$;
rollback;
select 'PASS: rol hiyerarşisi, OR birleşimi, yetki devri, kendini yükseltme, eşit/üst/sahip koruması, özel kanal, kategori, arşiv, sürüm çatışmaları, yasak sırası ve denetim. Test verileri geri alındı.' as result;
