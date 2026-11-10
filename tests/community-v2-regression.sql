-- Can run on a live admin connection; all test changes roll back.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; reader public.users; stranger public.users;
  f uuid; s uuid; c uuid; private_c uuid; role_a uuid; role_b uuid; base_role uuid;
  response jsonb; message_id uuid; client_key uuid:=gen_random_uuid(); rejected boolean;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  select * into stranger from public.users where id not in(owner_user.id,reader.id)
    and auth_user_id is not null and is_active and not is_banned limit 1;
  select fansub_id into f from public.fansub_members where user_id=owner_user.id and role='admin' limit 1;
  if f is null or reader.id is null or stranger.id is null then raise exception 'Doğrulama hesapları eksik.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  s:=(public.community_v2_write('create_server',jsonb_build_object('fansub_id',f))->>'id')::uuid;
  if s is null then raise exception 'Sunucu oluşmadı.'; end if;
  if (public.community_v2_write('create_server',jsonb_build_object('fansub_id',f))->>'id')::uuid<>s then raise exception 'Çift sunucu oluştu.'; end if;
  select id into c from community_v2.channels where server_id=s order by position limit 1;
  select id into base_role from community_v2.roles where server_id=s and is_default;
  role_a:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Okuma Ekibi','color','#86d9ce','position',10,'permissions',jsonb_build_array('messages.send','messages.read')))->>'id')::uuid;
  role_b:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Arşiv Ekibi','color','#c9a7ef','position',20,'permissions','[]'::jsonb))->>'id')::uuid;
  private_c:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Ekip odası','topic','Özel kanal erişim doğrulaması','position',1,'is_private',true,'role_ids',jsonb_build_array(role_a)))->>'id')::uuid;
  perform public.community_v2_write('save_role',jsonb_build_object('server_id',s,'role_id',base_role,'name','Herkes','color','#86d9ce','position',1000,'permissions',jsonb_build_array('channel.view','messages.read','members.list')));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text,true);
  perform public.community_v2_write('join',jsonb_build_object('server_id',s));
  rejected:=false; begin perform public.community_v2_read('messages',jsonb_build_object('channel_id',private_c)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Özel kanal geçmişi sızdı.'; end if;
  if community_v2.broadcast_allowed('community-v2:channel:'||private_c) then raise exception 'Özel kanal yayını açık.'; end if;
  rejected:=false; begin perform public.community_v2_write('save_role',jsonb_build_object('server_id',s,'role_id',role_a,'name','Yetkisiz rol')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Üye rol düzenleyebildi.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',jsonb_build_array(role_a,role_b)));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text,true);
  response:=public.community_v2_write('send',jsonb_build_object('channel_id',private_c,'client_id',client_key,'body','Okuma buluşmasına hoş geldiniz.'));
  message_id:=(response->>'id')::uuid;
  if (public.community_v2_write('send',jsonb_build_object('channel_id',private_c,'client_id',client_key,'body','Okuma buluşmasına hoş geldiniz.'))->>'id')::uuid<>message_id then raise exception 'Tekrar gönderim çoğaldı.'; end if;
  if jsonb_array_length(public.community_v2_read('messages',jsonb_build_object('channel_id',private_c)))<>1 then raise exception 'Kalıcı geçmiş yanlış.'; end if;
  if not community_v2.broadcast_allowed('community-v2:channel:'||private_c) then raise exception 'Yetkili yayın açılmadı.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  response:=public.community_v2_read('server',jsonb_build_object('server_id',s));
  if not exists(select 1 from jsonb_array_elements(response->'channels')x where x->>'id'=private_c::text and (x->>'unread')::int=1) then raise exception 'Okunmamış sayacı yanlış.'; end if;
  perform public.community_v2_write('read',jsonb_build_object('channel_id',private_c,'seq','1'));
  perform public.community_v2_write('read',jsonb_build_object('channel_id',private_c,'seq','0'));
  if (select last_seq from community_v2.reads where channel_id=private_c and user_id=owner_user.id)<>1 then raise exception 'Okuma imleci geriye gitti.'; end if;
  perform public.community_v2_write('save_role',jsonb_build_object('server_id',s,'role_id',role_a,'name','Okuma Ekibi','color','#abcdef','position',900,'permissions',jsonb_build_array('messages.send','messages.read')));
  if not community_v2.has_permission(s,reader.id,'messages.send') then raise exception 'Sıralama izni bozdu.'; end if;
  perform public.community_v2_write('moderate',jsonb_build_object('server_id',s,'user_id',reader.id,'operation','timeout','minutes',10));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text,true);
  rejected:=false; begin perform public.community_v2_write('send',jsonb_build_object('channel_id',private_c,'client_id',gen_random_uuid(),'body','Süreli kısıtlama doğrulaması.')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Kısıtlama rollerle aşıldı.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',jsonb_build_array(role_b)));
  if community_v2.can_view(private_c,reader.id) or community_v2.has_permission(s,reader.id,'messages.send') then raise exception 'Son izin kaldırılmadı.'; end if;
  perform public.community_v2_write('moderate',jsonb_build_object('server_id',s,'user_id',reader.id,'operation','ban'));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text,true);
  rejected:=false; begin perform public.community_v2_write('join',jsonb_build_object('server_id',s)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected or community_v2.broadcast_allowed('community-v2:server:'||s) then raise exception 'Yasak aşıldı.'; end if;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  rejected:=false; begin perform public.community_v2_read('home','{}'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Anonim erişim açık.'; end if;
  if has_table_privilege('authenticated','community_v2.messages','SELECT')
    or has_function_privilege('authenticated','community_v2.create_server(uuid,uuid,boolean)','EXECUTE')
    or has_function_privilege('anon','public.community_v2_write(text,jsonb)','EXECUTE') then raise exception 'ACL sınırı açık.'; end if;
end $$;
rollback;
select 'PASS: sahiplik, tek sunucu, kalıcı mesaj, OR izinleri, rol sırası, özel kanal, yayın, tekrar gönderim, okunmamış, kısıtlama, yasak, anonim ve ACL. Tüm veriler geri alındı.' as result;
