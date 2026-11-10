begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare usr public.users; s uuid; c uuid; p jsonb; a uuid:=gen_random_uuid(); output jsonb; rejected boolean; claim text;
begin
  select * into usr from public.users where username='site_owner';
  select id into s from community_v2.servers where owner_id=usr.id limit 1;
  claim:=jsonb_build_object('sub',usr.auth_user_id,'role','authenticated','session_id',usr.active_session_id)::text;
  perform set_config('request.jwt.claims',claim,true);
  c:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Dosya kota doğrulaması','position',999,'is_private',true,'role_ids','[]'::jsonb))->>'id')::uuid;
  p:=jsonb_build_object('id',a,'channel_id',c,'name','Okuma notları.txt','content_type','text/plain','byte_size',64,'sha256',repeat('a',64));
  update community_v2.channels set archived_at=now() where id=c;
  rejected:=false;begin perform public.community_v2_media('prepare',p);exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Arşive yükleme yapıldı.';end if;
  update community_v2.channels set archived_at=null where id=c;
  update community_v2.members set timeout_until=now()+interval '5 minutes' where server_id=s and user_id=usr.id;
  rejected:=false;begin perform public.community_v2_media('prepare',p);exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Kısıtlı hesap yükleme yaptı.';end if;
  update community_v2.members set timeout_until=null where server_id=s and user_id=usr.id;
  for output in select value from jsonb_array_elements('[{"byte_size":10485761},{"byte_size":0},{"content_type":"text/html"},{"name":"../unsafe.txt"},{"sha256":"x"}]') loop
    rejected:=false;begin perform public.community_v2_media('prepare',p||output);exception when check_violation or raise_exception then rejected:=true;end;
    if not rejected then raise exception 'Geçersiz dosya metadata kabul edildi: %',output;end if;
  end loop;
  -- So the quota test does not depend on files in the account, old records are aged within the transaction.
  update community_v2.attachments set created_at=now()-interval '2 days',expires_at=now()-interval '2 days' where user_id=usr.id;
  insert into community_v2.attachments(id,channel_id,user_id,name,content_type,byte_size,sha256)
    select gen_random_uuid(),c,usr.id,'Okuma notları.txt','text/plain',64,repeat('a',64) from generate_series(1,8);
  rejected:=false;begin perform public.community_v2_media('prepare',p);exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception '8 bekleyen dosya sınırı aşıldı.';end if;
  update community_v2.attachments set state='purged',byte_size=10485760 where channel_id=c;
  insert into community_v2.attachments(id,channel_id,user_id,name,content_type,byte_size,sha256,state)
    select gen_random_uuid(),c,usr.id,'Okuma notları.txt','text/plain',10485760,repeat('a',64),'purged' from generate_series(1,2);
  rejected:=false;begin perform public.community_v2_media('prepare',p);exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Silerek günlük 100 MB kotası aşıldı.';end if;
  update community_v2.attachments set created_at=now()-interval '2 days' where channel_id=c;
  perform public.community_v2_media('prepare',p);
  update community_v2.attachments set expires_at=now()-interval '1 hour' where id=a;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  output:=public.community_v2_media_worker('collect','{}');
  rejected:=false;begin perform public.community_v2_media_worker('complete',p);exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Temizliğe alınan dosya tekrar canlandı.';end if;
  perform set_config('request.jwt.claims',claim,true);
  rejected:=false;begin perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Okuma dosyaları','attachment_ids',array[a,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]));exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception '4 ek sınırı aşıldı.';end if;
end $$;
rollback;
select 'PASS: arşiv, timeout, metadata, 8 bekleyen dosya, 100 MB kota, 4 ek, temizleme yarışı' as result;
