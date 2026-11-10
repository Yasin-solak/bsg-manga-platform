-- Real account mapping and RPC path; each change rolls back in the same transaction.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; reader public.users; s uuid; f uuid; m uuid; other_m uuid;
  c uuid; generic_c uuid; private_role uuid; msg uuid; base uuid;
  claims_owner text; claims_reader text; response jsonb; payload jsonb; probe jsonb; rejected boolean;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  select id,fansub_id into s,f from community_v2.servers where owner_id=owner_user.id limit 1;
  select id into m from public.mangas m where m.is_active and m.is_approved and not m.is_mature
    and community_v2.series_status(s,m.id) is null
    and not exists(select 1 from community_v2.channels where server_id=s and manga_id=m.id) order by m.id limit 1;
  select id into other_m from public.mangas where id<>m and is_active and is_approved and not is_mature
    and community_v2.series_status(s,id)='fansub_unlinked' order by id limit 1;
  if s is null or m is null or other_m is null or reader.auth_user_id is null then raise exception 'Test önkoşulları eksik.'; end if;
  claims_owner:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  claims_reader:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',claims_owner,true);
  payload:=jsonb_build_object('server_id',s,'name','Seri sohbeti doğrulaması','topic','Geçici, işlem sonunda geri alınan kanal.','category','Seriler','position',990,'is_private',false,'role_ids','[]'::jsonb,'manga_id',m);
  c:=(public.community_v2_write('save_channel',payload)->>'id')::uuid;
  if (select manga_id from community_v2.channels where id=c)<>m then raise exception 'Seri bağlantısı kaydedilmedi.'; end if;
  if not exists(select 1 from community_v2.audit where target_id=c and details->'after'->>'manga_id'=m::text) then raise exception 'Denetim kaydı eksik.'; end if;
  response:=public.community_v2_read('series_candidates',jsonb_build_object('server_id',s,'search',(select title from public.mangas where id=m)));
  if not exists(select 1 from jsonb_array_elements(response) x where x->>'id'=m::text and (x->>'already_linked')::boolean) then raise exception 'Seri araması veya mevcut kanal işareti yanlış.'; end if;
  for probe in select value from jsonb_array_elements(jsonb_build_array(payload,
    payload||jsonb_build_object('manga_id',other_m),payload||jsonb_build_object('server_id',gen_random_uuid()),
    payload||jsonb_build_object('channel_id',c,'manga_id',other_m),payload||jsonb_build_object('channel_id',c,'manga_id',null))) loop
    rejected:=false; begin perform public.community_v2_write('save_channel',probe); exception when raise_exception or insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Yasak seri bağlantısı kabul edildi: %',probe; end if;
  end loop;
  -- An archive also counts as a unique channel for the same series; the direct table rule rejects a second copy.
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'archived',true));
  rejected:=false; begin perform public.community_v2_write('save_channel',payload); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Arşivdeki seri kopyalandı.'; end if;
  rejected:=false; begin insert into community_v2.channels(server_id,name,manga_id) values(s,'İkinci seri sohbeti',m); exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'Veritabanı tekillik kuralı eksik.'; end if;
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'archived',false));
  select id into base from community_v2.roles where server_id=s and is_default;
  update community_v2.roles set permissions=array['channel.view','messages.read','messages.send','messages.self.edit','messages.self.delete'] where id=base;
  insert into community_v2.members(server_id,user_id,state) values(s,reader.id,'left') on conflict(server_id,user_id) do update set state='left',timeout_until=null,last_message_at=null;
  delete from community_v2.member_roles where server_id=s and user_id=reader.id;
  perform set_config('request.jwt.claims','{}',true);
  if not exists(select 1 from jsonb_array_elements(public.community_v2_series_channels(m)) x where x->>'channel_id'=c::text) then raise exception 'Genel seri bağlantısı misafire görünmedi.'; end if;
  perform set_config('request.jwt.claims',claims_reader,true);
  response:=public.community_v2_read('channel_entry',jsonb_build_object('channel_id',c));
  if (response->>'is_member')::boolean then raise exception 'Önizleme üyelik verdi.'; end if;
  rejected:=false; begin perform public.community_v2_read('messages',jsonb_build_object('channel_id',c)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Üye olmayan geçmişe erişti.'; end if;
  perform public.community_v2_write('join',jsonb_build_object('server_id',s));
  rejected:=false; begin perform public.community_v2_read('series_candidates',jsonb_build_object('server_id',s)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Normal üye yönetim serilerini sorguladı.'; end if;
  response:=public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Serinin ilk bölümü üzerine sohbet edelim.'));
  msg:=(response->>'id')::uuid;
  perform public.community_v2_write('read',jsonb_build_object('channel_id',c,'seq',response->>'seq'));
  perform set_config('request.jwt.claims',claims_owner,true);
  response:=public.community_v2_read('server',jsonb_build_object('server_id',s));
  if not exists(select 1 from jsonb_array_elements(response->'channels') x where x->>'id'=c::text and (x->>'unread')::int=1 and x->'series'->>'id'=m::text) then raise exception 'Seri veya okunmamış bilgisi yanlış.'; end if;
  -- A hidden room list, join preview, history and live subscription depend on the same permission.
  private_role:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Seri okurları','color','#86d9ce','position',200,'permissions',array['messages.read']))->>'id')::uuid;
  perform public.community_v2_write('save_channel',payload||jsonb_build_object('channel_id',c,'is_private',true,'role_ids',array[private_role]));
  perform set_config('request.jwt.claims','{}',true);
  if exists(select 1 from jsonb_array_elements(public.community_v2_series_channels(m)) x where x->>'channel_id'=c::text) then raise exception 'Özel oda misafire sızdı.'; end if;
  perform set_config('request.jwt.claims',claims_reader,true);
  if exists(select 1 from jsonb_array_elements(public.community_v2_series_channels(m)) x where x->>'channel_id'=c::text) then raise exception 'Özel oda yetkisiz üyeye sızdı.'; end if;
  for probe in select jsonb_build_object('action',v) from unnest(array['messages','channel_entry'])v loop
    rejected:=false; begin perform public.community_v2_read(probe->>'action',jsonb_build_object('channel_id',c)); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Özel kanal sorgusu kabul edildi.'; end if;
  end loop;
  if community_v2.broadcast_allowed('community-v2:channel:'||c::text) then raise exception 'Özel canlı kanal yetkisiz açıldı.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',array[private_role]));
  perform set_config('request.jwt.claims',claims_reader,true);
  if not community_v2.broadcast_allowed('community-v2:channel:'||c::text) or jsonb_array_length(public.community_v2_read('messages',jsonb_build_object('channel_id',c)))<>1 then raise exception 'Yetkili üye geçmiş/canlı erişimi yanlış.'; end if;
  -- When series visibility or translation relation changes writing stops at once; history and cursor stay.
  perform set_config('request.jwt.claims',claims_owner,true);
  update public.mangas set is_active=false where id=m;
  if community_v2.series_status(s,m)<>'series_unavailable' then raise exception 'Yayından kaldırma algılanmadı.'; end if;
  perform set_config('request.jwt.claims',claims_reader,true);
  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('action','send','client_id',gen_random_uuid(),'body','Salt okunur kanal sınaması'),
    jsonb_build_object('action','edit_message','message_id',msg,'body','Salt okunur düzenleme sınaması'))) loop
    rejected:=false; begin perform public.community_v2_write(probe->>'action',probe||jsonb_build_object('channel_id',c)); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Yayında olmayan seriye yazıldı.'; end if;
  end loop;
  if jsonb_array_length(public.community_v2_read('messages',jsonb_build_object('channel_id',c)))<>1 then raise exception 'Geçmiş kayboldu.'; end if;
  if exists(select 1 from jsonb_array_elements(public.community_v2_series_channels(m)) x where x->>'channel_id'=c::text) then raise exception 'Yayında olmayan seri listelendi.'; end if;
  if not exists(select 1 from jsonb_array_elements(public.community_v2_read('server',jsonb_build_object('server_id',s))->'channels') x where x->>'id'=c::text and x->>'read_only_reason'='series_unavailable' and x->'series'='null'::jsonb and (x->>'unread')::int=0) then raise exception 'Salt okunur kanal bilgisi yanlış.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  update public.mangas set is_active=true where id=m;
  update public.chapters set is_active=false where manga_id=m and fansub_id=f;
  if community_v2.series_status(s,m)<>'fansub_unlinked' then raise exception 'Bölüm ilişkisi kontrol edilmedi.'; end if;
  rejected:=false; begin perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','İlişki kaldırma sınaması')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'İlişki kalktıktan sonra mesaj kabul edildi.'; end if;
  update public.chapters set is_active=true,publish_at=now()+interval '7 days' where manga_id=m and fansub_id=f;
  if community_v2.series_status(s,m)<>'fansub_unlinked' then raise exception 'Gelecekteki bölüm ilişki sayıldı.'; end if;
  if exists(select 1 from jsonb_array_elements(public.community_v2_read('series_candidates',jsonb_build_object('server_id',s,'search',(select title from public.mangas where id=m)))) x where x->>'id'=m::text) then raise exception 'Gelecekte yayımlanacak seri seçeneklere sızdı.'; end if;
  update public.chapters set publish_at=now()-interval '1 day' where manga_id=m and fansub_id=f;
  if community_v2.series_status(s,m) is not null then raise exception 'İlişki geri dönmedi.'; end if;
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'archived',true));
  update public.mangas set is_active=false where id=m;
  update public.mangas set is_active=true where id=m;
  if (select archived_at from community_v2.channels where id=c) is null then raise exception 'Elle arşivlenen oda kendiliğinden açıldı.'; end if;
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'archived',false));
  perform set_config('request.jwt.claims',claims_reader,true);
  perform public.community_v2_write('edit_message',jsonb_build_object('channel_id',c,'message_id',msg,'body','İlişki döndüğünde sohbet sürüyor.'));
  if (select last_seq from community_v2.reads where channel_id=c and user_id=reader.id)<>1 then raise exception 'Okuma cursoru bozuldu.'; end if;
  rejected:=false; begin perform public.community_v2_write('save_channel',payload||jsonb_build_object('channel_id',c,'name','Yetkisiz düzenleme')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Normal üye seri kanalını yönetti.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  update public.mangas set is_mature=true where id=m;
  perform set_config('request.jwt.claims','{}',true);
  if jsonb_array_length(public.community_v2_series_channels(m))<>0 or community_v2.series_audience(m,null) then raise exception 'Yaş kısıtı misafire uygulanmadı.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  update public.mangas set is_mature=false where id=m;
  generic_c:=(public.community_v2_write('save_channel',payload||jsonb_build_object('manga_id',null))->>'id')::uuid;
  perform public.community_v2_write('send',jsonb_build_object('channel_id',generic_c,'client_id',gen_random_uuid(),'body','Genel sohbet geçmişi korunmalı.'));
  rejected:=false; begin perform public.community_v2_write('save_channel',payload||jsonb_build_object('channel_id',generic_c)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Geçmişi olan genel kanal seri kanalına çevrildi.'; end if;
  -- Except the narrow entry function, private tables and helpers stay closed to access.
  if has_table_privilege('anon','community_v2.channels','SELECT') or has_table_privilege('authenticated','community_v2.channels','INSERT') then raise exception 'Doğrudan tablo erişimi açıldı.'; end if;
  if has_function_privilege('anon','community_v2.series_candidates(uuid,text,integer)','EXECUTE')
    or has_function_privilege('authenticated','community_v2.lock_series(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','community_v2.read_api(text,jsonb)','EXECUTE') then raise exception 'Yardımcı fonksiyon erişimi açık.'; end if;
  if not has_function_privilege('anon','public.community_v2_series_channels(uuid,integer)','EXECUTE') then raise exception 'Genel seri RPC erişimi eksik.'; end if;
end $$;
rollback;
select 'PASS: seri ilişkisi, tekillik, yetki, misafir/üye/özel oda, geçmiş/cursor, yayın/ilişki yaşam döngüsü, yaş sınırı ve ACL' as result;
