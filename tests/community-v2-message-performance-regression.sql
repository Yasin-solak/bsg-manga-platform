-- A performance change must keep permission, privacy, retry and slow mode.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare owner_user public.users; reader public.users; owner_claims text; reader_claims text;
  s uuid; c uuid; private_c uuid; m uuid; old_m uuid; private_m uuid; client_key uuid:=gen_random_uuid();
  result jsonb; again jsonb; rejected boolean; signal_time timestamptz;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  if owner_user.id is null or reader.id is null then raise exception 'Doğrulama hesapları yok.'; end if;
  owner_claims:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  reader_claims:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',owner_claims,true);
  update community_v2.operations_config set rooms_per_owner=100 where id;
  s:=(public.community_v2_rooms('create','{"name":"Mesaj teslimat doğrulaması","join_mode":"open"}')->>'id')::uuid;
  c:=(public.community_v2_read('server',jsonb_build_object('server_id',s))->'channels'->0->>'id')::uuid;
  private_c:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Özel arşiv','position',10,'is_private',true,'role_ids','[]'::jsonb))->>'id')::uuid;
  insert into community_v2.messages(channel_id,seq,author_id,client_id,body)
    select c,i,owner_user.id,gen_random_uuid(),'Okuma notu '||i from generate_series(1,80)i;
  update community_v2.channels set last_seq=80,slowmode_seconds=30 where id=c;
  select id into old_m from community_v2.messages where channel_id=c and seq=1;
  insert into community_v2.messages(channel_id,seq,author_id,client_id,body) values(private_c,1,owner_user.id,gen_random_uuid(),'Özel arşiv notu') returning id into private_m;
  update community_v2.channels set last_seq=1 where id=private_c;
  perform set_config('request.jwt.claims',reader_claims,true);
  perform public.community_v2_write('join',jsonb_build_object('server_id',s));
  result:=public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',client_key,'body','Okuma grubuna merhaba.'));
  m:=(result->>'id')::uuid;
  if result->'message'->>'id'<>m::text or result->'message'->>'client_id'<>client_key::text or result->'message'->>'body'<>'Okuma grubuna merhaba.' then raise exception 'Onay cevabında mesaj yok.'; end if;
  if (result->>'next_send_at')::timestamptz <= (result->>'server_now')::timestamptz+interval '28 seconds' then raise exception 'Yavaş mod gönderim cevabında eksik.'; end if;
  again:=public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',client_key,'body','Okuma grubuna merhaba.'));
  if again->>'id'<>result->>'id' or (select count(*) from community_v2.messages where author_id=reader.id and client_id=client_key)<>1 then raise exception 'Yeniden denemede çift mesaj.'; end if;
  rejected:=false; begin
    perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',client_key,'body','Farklı gövde'));
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Anahtar farklı içerikte yeniden kullanıldı.'; end if;
  update community_v2.members set last_message_at=now()-interval '2 seconds' where server_id=s and user_id=reader.id;
  rejected:=false; begin
    perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Erken gönderim'));
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Yavaş mod atlandı.'; end if;
  result:=public.community_v2_read('message_refresh',jsonb_build_object('channel_id',c,'ids',array[old_m,m,private_m]));
  if jsonb_array_length(result->'latest')<>50 or jsonb_array_length(result->'snapshot')<>1 or result->'snapshot'->0->>'id'<>old_m::text then raise exception 'Son sayfa/eski geçmiş sınırı veya kanal izolasyonu bozuk.'; end if;
  if exists(select 1 from jsonb_array_elements(result->'latest')x where x->>'author_id'=owner_user.id::text and x->>'client_id' is not null) then raise exception 'Başkasının istemci anahtarı sızdı.'; end if;
  update community_v2.messages set body='',deleted_at=now(),version=version+1 where id=old_m;
  result:=public.community_v2_read('message_refresh',jsonb_build_object('channel_id',c,'ids',array[old_m]));
  if result->'snapshot'->0->>'deleted_at' is null or result->'snapshot'->0->>'body'<>'' then raise exception 'Eski silinmiş mesaj güncellenmedi.'; end if;
  insert into public.user_blocks(blocker_id,blocked_id) values(reader.id,owner_user.id) on conflict do nothing;
  result:=public.community_v2_read('message_refresh',jsonb_build_object('channel_id',c,'ids','[]'::jsonb));
  if exists(select 1 from jsonb_array_elements(result->'latest')x where x->>'author_id'=owner_user.id::text and (x->>'body'<>'' or x->>'blocked'<>'true')) then raise exception 'Engellenen gövde sızdı.'; end if;
  perform public.community_v2_personal('save_preferences','{"auto_join":false,"notifications":"off","push_enabled":false,"show_presence":true,"show_typing":true}');
  perform public.community_v2_personal('heartbeat',jsonb_build_object('channel_id',c));
  select sent_at into signal_time from community_v2.presence_signals where channel_id=c;
  update community_v2.presence set seen_at=now()-interval '30 seconds' where channel_id=c and user_id=reader.id;
  update community_v2.presence_signals set sent_at=now()-interval '10 seconds' where channel_id=c returning sent_at into signal_time;
  perform public.community_v2_personal('heartbeat',jsonb_build_object('channel_id',c));
  if (select sent_at from community_v2.presence_signals where channel_id=c)<>signal_time then raise exception 'Değişmeyen heartbeat yeniden yayınlandı.'; end if;
  update community_v2.presence set seen_at=now()-interval '3 seconds' where channel_id=c and user_id=reader.id;
  perform public.community_v2_personal('heartbeat',jsonb_build_object('channel_id',c,'typing',true));
  if (select sent_at from community_v2.presence_signals where channel_id=c)<=signal_time then raise exception 'Yazıyor sinyali kayboldu.'; end if;
  update community_v2.members set state='banned' where server_id=s and user_id=reader.id;
  rejected:=false; begin perform public.community_v2_read('message_refresh',jsonb_build_object('channel_id',c,'ids',array[m])); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Üyelik kaybından sonra içerik okundu.'; end if;
  rejected:=false; begin perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',client_key,'body','Okuma grubuna merhaba.')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Tekrar deneme yetki kapısını aştı.'; end if;
  if has_function_privilege('authenticated','community_v2.send_result(uuid,uuid)','EXECUTE') or has_function_privilege('anon','community_v2.send_result(uuid,uuid)','EXECUTE') then raise exception 'Özel gönderim yardımcısı dışarı açık.'; end if;
  if has_function_privilege('authenticated','community_v2.emit_activity(uuid,uuid)','EXECUTE') or has_function_privilege('anon','community_v2.emit_activity(uuid,uuid)','EXECUTE') then raise exception 'Özel sinyal yardımcısı dışarı açık.'; end if;
end $$;
rollback;
select 'PASS: onay mesajı, yavaş mod, idempotence, içerik çakışması, birleşik sayfa, özel kanal, silme, engel, heartbeat, yetki iptali ve yardımcı ACL.' as result;
