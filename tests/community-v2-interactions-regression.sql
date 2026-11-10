-- Existing accounts are used only within the transaction; all content and permission changes ROLLBACK.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; reader public.users; s uuid; c uuid; private_c uuid; base uuid; role_a uuid; role_b uuid;
  root_msg uuid; reply_msg uuid; private_msg uuid; keyv uuid:=gen_random_uuid(); response jsonb; item jsonb; payload jsonb;
  claims_owner text; claims_reader text; rejected boolean; perms text[]; versionv integer; probe text; target uuid;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  select id into s from community_v2.servers where owner_id=owner_user.id limit 1;
  if s is null or reader.auth_user_id is null then raise exception 'Test önkoşulları eksik.'; end if;
  claims_owner:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  claims_reader:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',claims_owner,true);
  select id into base from community_v2.roles where server_id=s and is_default;
  update community_v2.roles set permissions=array['channel.view','messages.read'] where id=base;
  perms:=array['messages.send','messages.reply','reactions.add','mentions.users','mentions.roles','messages.self.edit','messages.self.delete'];
  role_a:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Okuma buluşması','color','#86d9ce','position',200,'permissions',perms,'mentionable',true))->>'id')::uuid;
  role_b:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Ek okur rolü','color','#abcdef','position',300,'permissions','[]'::jsonb))->>'id')::uuid;
  insert into community_v2.members(server_id,user_id) values(s,reader.id) on conflict(server_id,user_id) do update set state='active',timeout_until=null,last_message_at=null,last_interaction_at=null;
  delete from community_v2.member_roles where server_id=s and user_id=reader.id;
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',array[role_a,role_b]));
  payload:=jsonb_build_object('server_id',s,'name','Mesaj etkileşimleri doğrulaması','topic','İşlem sonunda geri alınan sohbet.','position',999,'is_private',false,'role_ids','[]'::jsonb);
  c:=(public.community_v2_write('save_channel',payload)->>'id')::uuid;
  private_c:=(public.community_v2_write('save_channel',payload||jsonb_build_object('name','Özel etkileşim doğrulaması','is_private',true))->>'id')::uuid;
  update community_v2.members set last_message_at=null where server_id=s and user_id=owner_user.id;
  root_msg:=(public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Birlikte okuduğumuz bölüm üzerine konuşalım.'))->>'id')::uuid;
  update community_v2.members set last_message_at=null where server_id=s and user_id=owner_user.id;
  private_msg:=(public.community_v2_write('send',jsonb_build_object('channel_id',private_c,'client_id',gen_random_uuid(),'body','Yalnız ekip odasında kalan metin.'))->>'id')::uuid;
  response:=public.community_v2_read('mention_candidates',jsonb_build_object('channel_id',private_c,'search',reader.username));
  if exists(select 1 from jsonb_array_elements(response)x where x->>'id'=reader.id::text) then raise exception 'Özel odayı okuyamayan kullanıcı etiket aramasına çıktı.'; end if;
  update public.users set is_active=false where id=reader.id;
  response:=public.community_v2_read('mention_candidates',jsonb_build_object('channel_id',c,'search',reader.username));
  if exists(select 1 from jsonb_array_elements(response)x where x->>'id'=reader.id::text) then raise exception 'Kapatılmış hesap etiket aramasına çıktı.'; end if;
  rejected:=false; begin perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Merhaba <@'||reader.id||'>')); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Kapatılmış hesap etiketlendi.'; end if;
  update public.users set is_active=reader.is_active where id=reader.id;
  perform set_config('request.jwt.claims',claims_reader,true);
  response:=public.community_v2_read('mention_candidates',jsonb_build_object('channel_id',c,'search','Okuma'));
  if not exists(select 1 from jsonb_array_elements(response)x where x->>'id'=role_a::text and x->>'kind'='role') then raise exception 'Etiketlenebilir rol seçilemedi.'; end if;
  payload:=jsonb_build_object('channel_id',c,'client_id',keyv,'body','Katılıyorum <@'||owner_user.id||'> <@&'||role_a||'>','reply_to',root_msg);
  reply_msg:=(public.community_v2_write('send',payload)->>'id')::uuid;
  if (public.community_v2_write('send',payload)->>'id')::uuid<>reply_msg then raise exception 'Yanıt yeniden gönderildi.'; end if;
  rejected:=false; begin perform public.community_v2_write('send',payload||jsonb_build_object('reply_to',null)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aynı anahtar başka yanıt için kullanıldı.'; end if;
  response:=public.community_v2_read('messages',jsonb_build_object('channel_id',c));
  select value into item from jsonb_array_elements(response) where value->>'id'=reply_msg::text;
  if item->'reply'->>'id'<>root_msg::text or item->'reply'->>'body'<>'Birlikte okuduğumuz bölüm üzerine konuşalım.' or jsonb_array_length(item->'mentions')<>2 or not (item->>'mentioned_me')::boolean then raise exception 'Yanıt veya rol etiketi bilgisi yanlış.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  response:=public.community_v2_read('server',jsonb_build_object('server_id',s));
  if not exists(select 1 from jsonb_array_elements(response->'channels')x where x->>'id'=c::text and (x->>'mention_count')::int=1) then raise exception 'Okunmamış etiket sayacı yanlış.'; end if;
  perform set_config('request.jwt.claims',claims_reader,true);
  for payload in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('body','Kanallar arası yanıt','reply_to',private_msg),
    jsonb_build_object('body','<@&'||role_b||'>'),jsonb_build_object('body','<@&'||base||'>'),
    jsonb_build_object('body','<@'||gen_random_uuid()||'>'))) loop
    rejected:=false; begin perform public.community_v2_write('send',payload||jsonb_build_object('channel_id',c,'client_id',gen_random_uuid())); exception when raise_exception or insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Geçersiz yanıt veya etiket kabul edildi.'; end if;
  end loop;
  -- An extra empty role does not take back the reaction right given by another role. Repeats are idempotent.
  payload:=jsonb_build_object('channel_id',c,'message_id',root_msg,'emoji','👍','active',true);
  perform public.community_v2_write('set_reaction',payload);
  perform public.community_v2_write('set_reaction',payload);
  if (select count(*) from community_v2.reactions where message_id=root_msg)<>1 then raise exception 'Çift tepki oluştu.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  update community_v2.members set last_interaction_at=null where server_id=s and user_id=owner_user.id;
  perform public.community_v2_write('set_reaction',payload);
  response:=public.community_v2_read('message_snapshot',jsonb_build_object('channel_id',c,'ids',array[root_msg,private_msg]));
  if jsonb_array_length(response)<>1 or (response->0->'reactions'->0->>'count')::int<>2 or not (response->0->'reactions'->0->>'mine')::boolean then raise exception 'Tepki sayımı veya kanal filtresi yanlış.'; end if;
  update community_v2.roles set permissions=array_remove(perms,'reactions.add') where id=role_a;
  update community_v2.members set last_interaction_at=null where server_id=s and user_id=reader.id;
  perform set_config('request.jwt.claims',claims_reader,true);
  perform public.community_v2_write('set_reaction',payload||jsonb_build_object('active',false,'user_id',owner_user.id));
  if (select count(*) from community_v2.reactions where message_id=root_msg)<>1 or not exists(select 1 from community_v2.reactions where message_id=root_msg and user_id=owner_user.id) then raise exception 'Üye başkasının tepkisini kaldırdı.'; end if;
  rejected:=false; begin perform public.community_v2_write('set_reaction',payload); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'İzinsiz tepki eklendi.'; end if;
  rejected:=false; begin perform public.community_v2_write('set_pin',jsonb_build_object('channel_id',c,'message_id',root_msg,'active',true)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Normal üye sabitledi.'; end if;
  -- A version conflict cannot overwrite a change.
  perform public.community_v2_write('edit_message',jsonb_build_object('channel_id',c,'message_id',reply_msg,'body','Yanıt güncellendi.','version',1));
  rejected:=false; begin perform public.community_v2_write('edit_message',jsonb_build_object('channel_id',c,'message_id',reply_msg,'body','Eski sürüm.','version',1)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Eski mesaj sürümü kabul edildi.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  update community_v2.members set last_interaction_at=null where server_id=s and user_id=owner_user.id;
  perform public.community_v2_write('set_pin',jsonb_build_object('channel_id',c,'message_id',root_msg,'active',true));
  perform public.community_v2_write('set_pin',jsonb_build_object('channel_id',c,'message_id',root_msg,'active',true));
  if jsonb_array_length(public.community_v2_read('pins',jsonb_build_object('channel_id',c)))<>1 or (select count(*) from community_v2.audit where target_id=root_msg and action='message.pin')<>1 then raise exception 'Sabitleme veya idempotent denetim kaydı yanlış.'; end if;
  if not exists(select 1 from jsonb_array_elements(public.community_v2_read('message_context',jsonb_build_object('channel_id',c,'message_id',root_msg))) x where x->>'id'=root_msg::text) then raise exception 'Mesaj bağlamı açılmadı.'; end if;
  -- The pin upper limit is protected by the channel lock; a deleted message also leaves quotes/reactions/pins.
  insert into community_v2.messages(channel_id,seq,author_id,client_id,body,pinned_at,pinned_by)
    select c,100+n,owner_user.id,gen_random_uuid(),'Sabit üst sınır doğrulaması '||n,now(),owner_user.id from generate_series(1,49)n;
  update community_v2.members set last_interaction_at=null where server_id=s and user_id=owner_user.id;
  rejected:=false; begin perform public.community_v2_write('set_pin',jsonb_build_object('channel_id',c,'message_id',reply_msg,'active',true)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception '51. sabit mesaj kabul edildi.'; end if;
  perform public.community_v2_write('delete_message',jsonb_build_object('channel_id',c,'message_id',root_msg));
  response:=public.community_v2_read('message_snapshot',jsonb_build_object('channel_id',c,'ids',array[root_msg,reply_msg]));
  if exists(select 1 from jsonb_array_elements(response)x where (x->>'id'=root_msg::text and (x->>'body'<>'' or x->'reactions'<>'[]'::jsonb or x->'pinned_at'<>'null'::jsonb))
    or (x->>'id'=reply_msg::text and (x->'reply'->>'body'<>'' or not (x->'reply'->>'deleted')::boolean))) then raise exception 'Silinen mesaj kalıntısı sızdı.'; end if;
  -- Archive, timeout, membership loss and a private room close all the same API surfaces.
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'archived',true));
  for probe in select unnest(array['send','edit_message','set_reaction','set_pin']) loop
    rejected:=false; begin perform public.community_v2_write(probe,jsonb_build_object('channel_id',c,'message_id',reply_msg,'client_id',gen_random_uuid(),'body','Arşiv sınaması','emoji','❤️','active',true)); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Arşive yazıldı: %',probe; end if;
  end loop;
  perform public.community_v2_write('archive_channel',jsonb_build_object('server_id',s,'channel_id',c,'archived',false));
  update community_v2.members set timeout_until=now()+interval '5 minutes' where server_id=s and user_id=reader.id;
  perform set_config('request.jwt.claims',claims_reader,true);
  rejected:=false; begin perform public.community_v2_write('set_reaction',jsonb_build_object('channel_id',c,'message_id',reply_msg,'emoji','❤️','active',true)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Kısıtlı üye tepki ekledi.'; end if;
  for probe in select unnest(array['messages','pins','message_context','message_snapshot','mention_candidates']) loop
    rejected:=false; begin perform public.community_v2_read(probe,jsonb_build_object('channel_id',private_c,'message_id',private_msg,'ids',array[private_msg])); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'Özel oda sızıntısı: %',probe; end if;
  end loop;
  rejected:=false; begin perform public.community_v2_read('message_context',jsonb_build_object('channel_id',c,'message_id',private_msg)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Başka kanalın bağlamı açıldı.'; end if;
  rejected:=false; begin perform public.community_v2_read('message_snapshot',jsonb_build_object('channel_id',c,'ids',(select jsonb_agg(gen_random_uuid()) from generate_series(1,251)))); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Mesaj yenileme sınırı aşıldı.'; end if;
  update community_v2.members set state='left',timeout_until=null where server_id=s and user_id=reader.id;
  rejected:=false; begin perform public.community_v2_read('pins',jsonb_build_object('channel_id',c)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Ayrılan üye sabitleri okudu.'; end if;
  perform set_config('request.jwt.claims',claims_owner,true);
  rejected:=false; begin insert into community_v2.messages(channel_id,seq,author_id,client_id,body,reply_to) values(c,999,owner_user.id,gen_random_uuid(),'Kanal sınırı',private_msg); exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'Kanallar arası yanıt FK koruması eksik.'; end if;
  for probe in select unnest(array['community_v2.message_read(text,jsonb)','community_v2.message_write(text,jsonb)','community_v2.message_json(community_v2.messages,uuid)','community_v2.parse_mentions(uuid,uuid,uuid,text)','community_v2.mention_matches(jsonb,uuid,uuid)']) loop
    if has_function_privilege('authenticated',probe,'EXECUTE') or has_function_privilege('anon',probe,'EXECUTE') then raise exception 'Özel yardımcı erişimi açık: %',probe; end if;
  end loop;
  if has_table_privilege('authenticated','community_v2.reactions','SELECT') or has_table_privilege('anon','community_v2.reactions','INSERT') then raise exception 'Tepki tablosuna doğrudan erişim var.'; end if;
end $$;
rollback;
select 'PASS: yanıt/etiket, OR izinleri, özel oda, tepki idempotensi/sahipliği, pin sınırı, düzenleme çatışması, silme redaksiyonu, arşiv/timeout/üyelik ve ACL' as result;
