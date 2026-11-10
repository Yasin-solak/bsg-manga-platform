-- Runs on a live admin connection; all reward, follow and announcement operations roll back.
begin;
do $$
declare
 admin_user public.users; reader public.users; aid uuid:=gen_random_uuid(); link_id uuid:=gen_random_uuid();
 admin_claims text; reader_claims text; draft jsonb; result jsonb; checks jsonb; revision integer;
 rejected boolean; balance integer; manga_id uuid; fansub_id uuid; expected boolean;
begin
 select * into admin_user from public.users where role='admin' and auth_user_id is not null and is_active and not coalesce(is_banned,false) limit 1;
 select * into reader from public.users where username='denemeuser' and auth_user_id is not null;
 if reader.id is null or admin_user.id is null then raise exception 'Doğrulama hesapları yok.'; end if;
 admin_claims:=jsonb_build_object('sub',admin_user.auth_user_id,'role','authenticated','session_id',coalesce(admin_user.active_session_id,gen_random_uuid()))::text;
 reader_claims:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
 perform set_config('request.jwt.claims',admin_claims,true);
 draft:=jsonb_build_object('title','Okur buluşması — şart doğrulaması','document',jsonb_build_array(jsonb_build_object('type','text','text','Okuma etkinliğine katıl.')),
  'kind','reward','status','published','audience','members','startsAt',now()-interval '1 minute','endsAt',now()+interval '1 day','priority',0,'showHome',true,'recipients','[]'::jsonb,
  'action',jsonb_build_object('type','reward','value',13,'maxClaims',3,'conditions',jsonb_build_array(jsonb_build_object('type','account_age','days',3650))));
 result:=public.announcement_admin_save(aid,0,draft);
 if (result->>'revision')::int<>1 then raise exception 'İlk kayıt başarısız.'; end if;
 if announcement_internal.valid_conditions('[{"type":"account_age","days":0}]')
  or announcement_internal.valid_conditions('[{"type":"premium"},{"type":"premium"}]')
  or announcement_internal.valid_conditions('[{"type":"follow_manga","id":"yanlış"}]')
  or announcement_internal.valid_conditions('[{"type":"verified_email","bypass":true}]') then raise exception 'Bozuk şart kabul edildi.'; end if;
 rejected:=false; begin perform public.announcement_admin_save(aid,1,jsonb_set(draft,'{action,conditions}','[{"type":"account_age","days":1.2}]')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Ondalıklı üyelik süresi kabul edildi.'; end if;
 perform set_config('request.jwt.claims',reader_claims,true);
 select stones into balance from public.users where id=reader.id;
 result:=public.announcement_feed(aid,false,0,1,null)->0;
 if (result->'reward'->>'eligible')::boolean then raise exception 'Yeni hesap 10 yıllık şartı geçti.'; end if;
 rejected:=false; begin perform public.announcement_respond(aid,'claim'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Sunucu şartı atlanabildi.'; end if;
 if (select stones from public.users where id=reader.id)<>balance then raise exception 'Reddedilen kazanım bakiyeyi değiştirdi.'; end if;
 if exists(select 1 from announcement_internal.wallet_permits where user_id=reader.id) then raise exception 'Reddedilen kazanım izin bıraktı.'; end if;
 rejected:=false; begin perform public.announcement_admin_transition(aid,1,'delete'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Normal hesap duyuru silebildi.'; end if;

 -- Email / Premium info does not leak as a value; only the right completion result returns.
 checks:=announcement_internal.condition_result('[{"type":"verified_email"},{"type":"premium"}]',reader.id);
 select email_confirmed_at is not null into expected from auth.users where id=reader.auth_user_id;
 if (checks->'conditions'->0->>'met')::boolean is distinct from expected then raise exception 'E-posta şartı yanlış kaynaktan okundu.'; end if;
 if (checks->'conditions'->1->>'met')::boolean is distinct from coalesce(reader.premium_expires_at>now(),false) then raise exception 'Premium şartı yanlış.'; end if;
 if checks::text like '%email_confirmed_at%' or checks::text like '%premium_expires_at%' then raise exception 'Özel tarih bilgileri sızdı.'; end if;
 select id into manga_id from public.mangas m where is_active and is_approved and not is_mature
  and not exists(select 1 from public.manga_follows f where f.user_id=reader.id and f.manga_id=m.id) limit 1;
 select id into fansub_id from public.fansubs f where is_active
  and not exists(select 1 from public.fansub_follows ff where ff.user_id=reader.id and ff.fansub_id=f.id) limit 1;
 if manga_id is null or fansub_id is null then raise exception 'Takip şartı için uygun katalog girdisi yok.'; end if;
 checks:=jsonb_build_array(jsonb_build_object('type','follow_manga','id',manga_id),jsonb_build_object('type','follow_fansub','id',fansub_id));
 if (announcement_internal.condition_result(checks,reader.id)->>'eligible')::boolean then raise exception 'Takip etmeden şart tamamlandı.'; end if;
 insert into public.manga_follows(user_id,manga_id) values(reader.id,manga_id);
 insert into public.fansub_follows(user_id,fansub_id) values(reader.id,fansub_id);
 if not (announcement_internal.condition_result(checks,reader.id)->>'eligible')::boolean then raise exception 'Gerçek takipler şartı tamamlamadı.'; end if;

 perform set_config('request.jwt.claims',admin_claims,true);
 draft:=jsonb_set(draft,'{action,conditions}',checks);
 result:=public.announcement_admin_save(aid,1,draft);
 perform set_config('request.jwt.claims',reader_claims,true);
 result:=public.announcement_respond(aid,'claim');
 if (result->>'new_balance')::int<>balance+13 then raise exception 'Şartlı ödül doğru ödenmedi.'; end if;
 perform set_config('request.jwt.claims',admin_claims,true);
 rejected:=false; begin perform public.announcement_admin_save(aid,2,jsonb_set(draft,'{action,conditions}','[]')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'İlk kazanımdan sonra şartlar değişti.'; end if;
 -- The audience can change on a published reward; distribution id and earlier earnings are kept.
 draft:=draft||jsonb_build_object('audience','selected','recipients',jsonb_build_array(reader.id));
 result:=public.announcement_admin_save(aid,2,draft);
 if result->>'audience'<>'selected' then raise exception 'Yayımlanmış ödülde hedef kitle değişmedi.'; end if;
 perform set_config('request.jwt.claims',reader_claims,true);
 result:=public.announcement_respond(aid,'claim');
 if not (result->>'alreadyClaimed')::boolean or (select stones from public.users where id=reader.id)<>balance+13 then raise exception 'Kitle değişikliği tekrar ödeme yaptı.'; end if;
 perform set_config('request.jwt.claims',admin_claims,true);
 result:=public.announcement_admin_transition(aid,3,'delete'); revision:=(result->>'revision')::int;
 if jsonb_array_length(public.announcement_feed(aid,false,0,1,null))<>0 then raise exception 'Silinen ödül akışta kaldı.'; end if;
 if not exists(select 1 from announcement_internal.reward_pools where announcement_id=aid) then raise exception 'Silme ödül defterini kaybetti.'; end if;
 if not exists(select 1 from jsonb_array_elements(public.announcement_admin_list('deleted')->'items') a where a->>'id'=aid::text) then raise exception 'Çöp kutusunda görünmedi.'; end if;
 rejected:=false; begin perform public.announcement_notify(aid); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Silinen duyuru bildirim gönderebildi.'; end if;
 rejected:=false; begin perform public.announcement_admin_transition(aid,3,'restore'); exception when serialization_failure then rejected:=true; end;
 if not rejected then raise exception 'Eski sürümle geri alma engellenmedi.'; end if;
 perform public.announcement_admin_transition(aid,revision,'restore');
 if (select status from announcement_internal.entries where id=aid)<>'draft' then raise exception 'Geri alma otomatik yayınladı.'; end if;
 perform public.announcement_admin_transition(aid,revision+1,'published');
 perform set_config('request.jwt.claims',reader_claims,true);
 result:=public.announcement_respond(aid,'claim');
 if not (result->>'alreadyClaimed')::boolean then raise exception 'Geri alma kazanımı sıfırladı.'; end if;
 perform set_config('request.jwt.claims',admin_claims,true);
 perform public.announcement_admin_transition(aid,revision+2,'archived');
 if jsonb_array_length(public.announcement_feed(aid,false,0,1,null))<>0 then raise exception 'Arşivleme gizlemedi.'; end if;
 perform public.announcement_admin_transition(aid,revision+3,'draft');
 draft:=draft||jsonb_build_object('kind','news','status','draft','audience','all','recipients','[]'::jsonb,'action',jsonb_build_object('type','link','url','/kesfet','label','Keşfet','direct',true));
 result:=public.announcement_admin_save(link_id,0,draft);
 if not (result->'action'->>'direct')::boolean then raise exception 'Doğrudan bağlantı kayboldu.'; end if;
 if jsonb_array_length(public.announcement_search('user',''))=0 or jsonb_array_length(public.announcement_search('fansub',''))=0 then raise exception '@ önerileri boş.'; end if;
 if has_function_privilege('anon','public.announcement_admin_transition(uuid,integer,text)','execute') then raise exception 'Anonime yönetim açık.'; end if;
 if has_function_privilege('authenticated','announcement_internal.condition_result(jsonb,uuid)','execute') then raise exception 'Başkasının şartlarını doğrudan sorgulama açık.'; end if;
 raise notice 'PASS: kazanım şartları, sunucu engeli, takip, kitle değişimi, tekrar ödeme, çöp kutusu/geri alma, sürüm, doğrudan bağlantı, @ ve ACL';
end $$;
rollback;
select 'PASS: Duyuru iyileştirme testi geri alındı; kalıcı bakiye veya içerik değişmedi.' result;
