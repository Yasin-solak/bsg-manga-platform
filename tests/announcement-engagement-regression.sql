-- A transaction that only rolls back, with real account ids: no notification goes, no balance remains.
begin;
do $$
declare admin_user public.users; reader public.users; outsider public.users; ac text; rc text; oc text;
 aid uuid:=gen_random_uuid(); link_id uuid:=gen_random_uuid(); reward_id uuid:=gen_random_uuid(); mid uuid; fid uuid;
 d jsonb; res jsonb; opts jsonb; r jsonb; c jsonb; expected boolean; rejected boolean; balance int;
begin
 select * into admin_user from public.users where role='admin' and auth_user_id is not null and is_active and not coalesce(is_banned,false) limit 1;
 select * into reader from public.users where username='denemeuser';
 select * into outsider from public.users where role='user' and auth_user_id is not null and id<>reader.id and is_active and not coalesce(is_banned,false) limit 1;
 select id into mid from public.mangas where is_active and is_approved and not is_mature limit 1;
 select id into fid from public.fansubs where is_active limit 1;
 if admin_user.id is null or reader.id is null or outsider.id is null or mid is null or fid is null then raise exception 'Doğrulama verileri eksik'; end if;
 ac:=jsonb_build_object('sub',admin_user.auth_user_id,'role','authenticated','session_id',admin_user.active_session_id)::text;
 rc:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',reader.active_session_id)::text;
 oc:=jsonb_build_object('sub',outsider.auth_user_id,'role','authenticated','session_id',outsider.active_session_id)::text;
 perform set_config('request.jwt.claims',ac,true);
 opts:='[{"id":"accepted","label":"Cuma"},{"id":"declined","label":"Cumartesi"},{"id":"option3","label":"Pazar"},{"id":"option4","label":"Bu kez uygun değilim"}]';
 if not announcement_internal.valid_invitation(jsonb_build_object('type','rsvp','options',opts))
  or announcement_internal.valid_invitation('{"type":"rsvp","options":[]}')
  or announcement_internal.valid_invitation('{"type":"rsvp","options":[{"id":"accepted","label":"A"},{"id":"declined","label":"A"}]}')
  or announcement_internal.valid_invitation(jsonb_build_object('type','rsvp','options',opts||jsonb_build_array(opts->0))) then raise exception 'Davet sınırları korunmuyor'; end if;
 d:=jsonb_build_object('title','Hafta sonu okuma buluşması — doğrulama','document','[{"type":"text","text":"Bir gün seç."}]'::jsonb,
  'kind','invitation','status','published','audience','selected','startsAt',now()-interval '1 minute','endsAt',now()+interval '1 day',
  'priority',0,'showHome',false,'action',jsonb_build_object('type','rsvp','options',opts),'recipients',jsonb_build_array(reader.id));
 perform public.announcement_admin_save(aid,0,d);
 perform set_config('request.jwt.claims',rc,true);
 perform public.announcement_respond(aid,'click'); perform public.announcement_respond(aid,'click');
 perform public.announcement_respond(aid,'view'); perform public.announcement_respond(aid,'view');
 perform public.announcement_respond(aid,'option3'); res:=public.announcement_respond(aid,'option3');
 if not (res->>'alreadyResponded')::boolean then raise exception 'Aynı yanıt tekrarında tekilleştirme yok'; end if;
 rejected:=false; begin perform public.announcement_respond(aid,'accepted'); exception when serialization_failure then rejected:=true; end;
 if not rejected then raise exception 'Yanıt değiştirilebildi'; end if;
 if (public.announcement_feed(aid,false,0,1,null)->0->>'response')<>'option3' then raise exception 'İlk seçenek korunmadı'; end if;
 rejected:=false; begin perform public.announcement_admin_report(aid); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Rapor normal kullanıcıya açık'; end if;
 perform set_config('request.jwt.claims',oc,true);
 rejected:=false; begin perform public.announcement_respond(aid,'click'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Özel duyuru etkileşimi başka hesaba açık'; end if;
 perform set_config('request.jwt.claims',ac,true);
 rejected:=false; begin perform public.announcement_admin_save(aid,1,jsonb_set(d,'{action,options,2,label}','"Başka anlam"')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Yanıtlı seçenek anlamı değiştirildi'; end if;
 r:=public.announcement_admin_report(aid,7,0,'all','');
 if (r#>>'{totals,clicks}')::int<>1 or (r#>>'{totals,opens}')::int<>1 or (r#>>'{totals,responses}')::int<>1
  or (r#>>'{options,2,count}')::int<>1 or jsonb_array_length(r->'daily')<>7 or (r->>'totalAccounts')::int<>1 then raise exception 'Rapor toplamı/gün/yanıt uyuşmuyor: %',r; end if;
 if (r#>>'{accounts,0,user_id}')<>reader.id::text or r#>>'{accounts,0,response}'<>'option3' then raise exception 'Rapor hesabı/yanıtı yanlış'; end if;
 if (public.announcement_admin_report(aid,7,0,'all','olmayan-hesap-917')->>'totalAccounts')::int<>0 then raise exception 'Kullanıcı filtresi çalışmıyor'; end if;
 d:=d||jsonb_build_object('kind','news','action',jsonb_build_object('type','link','label','Keşfet','url','/kesfet','direct',true));
 perform public.announcement_admin_save(link_id,0,d);
 perform set_config('request.jwt.claims',rc,true);
 perform public.announcement_respond(link_id,'click'); perform public.announcement_respond(link_id,'link');
 update announcement_internal.responses set last_click_at=now()-interval '10 seconds' where announcement_id=link_id and user_id=reader.id;
 perform public.announcement_respond(link_id,'click');
 perform set_config('request.jwt.claims',ac,true);
 r:=public.announcement_admin_report(link_id);
 if (r#>>'{totals,clicks}')::int<>2 or (r#>>'{totals,links}')::int<>1 or (r#>>'{totals,opens}')::int<>0 then raise exception 'Kart ve bağlantı sayaçları ayrışmadı'; end if;
 perform set_config('request.jwt.claims',rc,true);
 for c in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('type','read_chapters','count',1),jsonb_build_object('type','read_manga','id',mid,'count',1),
  jsonb_build_object('type','follow_manga_count','count',1),jsonb_build_object('type','follow_fansub_count','count',1),
  jsonb_build_object('type','level','count',1),jsonb_build_object('type','claimed_quests','count',1),
  jsonb_build_object('type','profile_completed'),jsonb_build_object('type','fansub_member','id',fid))) loop
  if not announcement_internal.valid_conditions(jsonb_build_array(c)) then raise exception 'Yeni şart doğrulanmadı: %',c; end if;
  r:=announcement_internal.condition_result(jsonb_build_array(c),reader.id);
  case c->>'type'
   when 'read_chapters' then select exists(select 1 from public.manga_read_trackers where reader_key='user:'||reader.id and chapter_ref like 'chapter:%') into expected;
   when 'read_manga' then select exists(select 1 from public.manga_read_trackers where reader_key='user:'||reader.id and chapter_ref like 'chapter:%' and manga_id=mid) into expected;
   when 'follow_manga_count' then select exists(select 1 from public.manga_follows f join public.mangas m on m.id=f.manga_id where user_id=reader.id and m.is_active and m.is_approved) into expected;
   when 'follow_fansub_count' then select exists(select 1 from public.fansub_follows f join public.fansubs s on s.id=f.fansub_id where user_id=reader.id and s.is_active) into expected;
   when 'level' then expected:=true;
   when 'claimed_quests' then select exists(select 1 from public.quest_progress where subject_type='user' and subject_id=reader.id and claimed_at is not null) into expected;
   when 'profile_completed' then expected:=reader.onboarding_completed_at is not null;
   when 'fansub_member' then select exists(select 1 from public.fansub_members where user_id=reader.id and fansub_id=fid) into expected;
  end case;
  if (r->>'eligible')::boolean is distinct from expected then raise exception 'Yeni şart gerçek veriyle uyuşmuyor: % %',c,r; end if;
 end loop;
 if announcement_internal.valid_conditions('[{"type":"level","count":11}]') or announcement_internal.valid_conditions('[{"type":"read_chapters","count":-1}]') then raise exception 'Şart sınırları geçersiz'; end if;
 perform set_config('request.jwt.claims',ac,true);
 d:=d||jsonb_build_object('kind','reward','action',jsonb_build_object('type','reward','value',3,'maxClaims',1,'conditions','[{"type":"read_chapters","count":100000}]'::jsonb));
 perform public.announcement_admin_save(reward_id,0,d);
 perform set_config('request.jwt.claims',rc,true);
 select stones into balance from public.users where id=reader.id;
 rejected:=false; begin perform public.announcement_respond(reward_id,'claim'); exception when others then rejected:=true; end;
 if not rejected or (select stones from public.users where id=reader.id)<>balance then raise exception 'Yeni şart ödülü durdurmadı'; end if;
 if has_function_privilege('authenticated','announcement_internal.participants(uuid)','EXECUTE')
  or has_function_privilege('authenticated','announcement_internal.track(announcement_internal.entries,uuid,text)','EXECUTE')
  or has_table_privilege('authenticated','announcement_internal.engagement_daily','SELECT')
  or has_function_privilege('anon','public.announcement_admin_report(uuid,integer,integer,text,text)','EXECUTE') then raise exception 'Özel rapor tabanı dışarı açık'; end if;
end $$;
rollback;
select 'PASS: dört seçenek, ilk yanıt kilidi, rapor/ACL, tekrar sayacı, sekiz yeni şart ve ödül engeli' as result;
