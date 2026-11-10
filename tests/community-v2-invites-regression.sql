-- All data/permission changes roll back; real account sessions do not change.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; reader public.users; s uuid; r uuid; other_r uuid; private_c uuid;
  owner_claims text; reader_claims text; tokenv text:=encode(extensions.gen_random_bytes(32),'hex');
  delegated_token text:=encode(extensions.gen_random_bytes(32),'hex');
  result jsonb; draft jsonb; delegated jsonb; invite_id uuid; delegated_id uuid; rejected boolean; timeoutv timestamptz;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  select id into s from community_v2.servers where owner_id=owner_user.id limit 1;
  if s is null or reader.auth_user_id is null then raise exception 'Test önkoşulları eksik.'; end if;
  owner_claims:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  reader_claims:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',owner_claims,true);
  draft:=jsonb_build_object('server_id',s,'token',tokenv,'label','Okuma buluşması doğrulaması','ttl_seconds',604800,'max_uses',2);
  result:=public.community_v2_invites('create',draft); invite_id:=(result->>'id')::uuid;
  if (public.community_v2_invites('create',draft)->>'id')::uuid<>invite_id then raise exception 'Oluşturma idempotence bozuk.'; end if;
  if (select count(*) from community_v2.invites where token_hash=extensions.digest(tokenv,'sha256'))<>1 then raise exception 'Tekil anahtar bozuk.'; end if;
  rejected:=false; begin perform public.community_v2_invites('create',draft||jsonb_build_object('max_uses',3)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aynı istek farklı sınıra izin verdi.'; end if;
  result:=public.community_v2_invites('list',jsonb_build_object('server_id',s));
  if result::text like '%'||tokenv||'%' or result::text like '%token_hash%' then raise exception 'Liste davet anahtarını sızdırdı.'; end if;
  if (public.community_v2_invites('preview',jsonb_build_object('token',tokenv))->>'status')<>'already_member' then raise exception 'Sahip üyeliği bulunamadı.'; end if;
  perform public.community_v2_invites('redeem',jsonb_build_object('token',tokenv));
  if (select uses from community_v2.invites where id=invite_id)<>0 then raise exception 'Mevcut üye kullanımı tüketti.'; end if;
  insert into community_v2.members(server_id,user_id,state) values(s,reader.id,'left') on conflict(server_id,user_id) do update set state='left';
  delete from community_v2.member_roles where server_id=s and user_id=reader.id;
  timeoutv:=now()+interval '1 hour'; update community_v2.members set timeout_until=timeoutv where server_id=s and user_id=reader.id;
  private_c:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Davet özel oda doğrulaması','position',999,'is_private',true,'role_ids','[]'::jsonb))->>'id')::uuid;
  perform set_config('request.jwt.claims',reader_claims,true);
  result:=public.community_v2_invites('preview',jsonb_build_object('token',tokenv));
  if result->>'status'<>'ready' or result ? 'channels' or result ? 'members' then raise exception 'Önizleme erişimi yanlış.'; end if;
  result:=public.community_v2_invites('redeem',jsonb_build_object('token',tokenv));
  if result->>'status'<>'joined' or not community_v2.is_member(s,reader.id) then raise exception 'Davet katılımı başarısız.'; end if;
  if (select timeout_until from community_v2.members where server_id=s and user_id=reader.id) is distinct from timeoutv then raise exception 'Davet yaptırımı sıfırladı.'; end if;
  if community_v2.can_read(private_c,reader.id) or exists(select 1 from community_v2.member_roles where server_id=s and user_id=reader.id) then raise exception 'Davet özel yetki verdi.'; end if;
  perform public.community_v2_invites('redeem',jsonb_build_object('token',tokenv));
  if (select uses from community_v2.invites where id=invite_id)<>1 then raise exception 'Tekrar katılım kullanımı tüketti.'; end if;
  update community_v2.members set state='banned' where server_id=s and user_id=reader.id;
  if (public.community_v2_invites('redeem',jsonb_build_object('token',tokenv))->>'status')<>'banned' then raise exception 'Yasak atlandı.'; end if;
  update community_v2.members set state='left' where server_id=s and user_id=reader.id;
  perform public.community_v2_invites('redeem',jsonb_build_object('token',tokenv));
  if (select uses from community_v2.invites where id=invite_id)<>2 then raise exception 'Yeniden üyelik yeni kullanım sayılmadı.'; end if;
  update community_v2.members set state='left' where server_id=s and user_id=reader.id;
  if (public.community_v2_invites('redeem',jsonb_build_object('token',tokenv))->>'status')<>'exhausted' then raise exception 'Kullanım sınırı atlandı.'; end if;
  update community_v2.invites set expires_at=now()-interval '1 second' where id=invite_id;
  result:=public.community_v2_invites('preview',jsonb_build_object('token',tokenv));
  if result->>'status'<>'expired' or result ? 'server_id' then raise exception 'Süresi dolmuş davet veri açtı.'; end if;
  update community_v2.invites set expires_at=now()+interval '7 days' where id=invite_id;
  update community_v2.members set state='active',timeout_until=null where server_id=s and user_id=reader.id;
  rejected:=false; begin perform public.community_v2_invites('list',jsonb_build_object('server_id',s)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Normal üye davetleri listeledi.'; end if;
  perform set_config('request.jwt.claims',owner_claims,true);
  r:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Davet görevlisi doğrulaması','color','#86d9ce','position',500,'permissions',array['invites.create']))->>'id')::uuid;
  other_r:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Ek okur doğrulaması','color','#abcdef','position',600,'permissions','[]'::jsonb))->>'id')::uuid;
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',array[r,other_r]));
  perform set_config('request.jwt.claims',reader_claims,true);
  delegated:=draft||jsonb_build_object('token',delegated_token,'label','Devredilen davet doğrulaması','ttl_seconds',0,'max_uses',null);
  delegated_id:=(public.community_v2_invites('create',delegated)->>'id')::uuid;
  result:=public.community_v2_invites('list',jsonb_build_object('server_id',s));
  if jsonb_array_length(result)<>1 or result->0->>'id'<>delegated_id::text then raise exception 'Oluşturan başkasının davetini gördü.'; end if;
  rejected:=false; begin perform public.community_v2_invites('revoke',jsonb_build_object('server_id',s,'invite_id',invite_id)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Oluşturan başkasının davetini iptal etti.'; end if;
  update community_v2.roles set permissions='{}' where id=r;
  perform set_config('request.jwt.claims',owner_claims,true);
  if (public.community_v2_invites('preview',jsonb_build_object('token',delegated_token))->>'status')<>'unavailable' then raise exception 'İzin kaybı eski daveti kapatmadı.'; end if;
  update community_v2.roles set permissions=array['invites.manage'] where id=r;
  perform set_config('request.jwt.claims',reader_claims,true);
  rejected:=false; begin perform public.community_v2_invites('create',delegated); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Yönetme izni oluşturma verdi.'; end if;
  perform public.community_v2_invites('revoke',jsonb_build_object('server_id',s,'invite_id',invite_id));
  perform public.community_v2_invites('revoke',jsonb_build_object('server_id',s,'invite_id',invite_id));
  if (select count(*) from community_v2.audit where target_id=invite_id and action='invite.revoke')<>1 then raise exception 'İptal idempotence bozuk.'; end if;
  if (public.community_v2_invites('preview',jsonb_build_object('token',tokenv))->>'status')<>'revoked' then raise exception 'İptal edilmiş davet açık.'; end if;
  if (public.community_v2_invites('preview',jsonb_build_object('token',repeat('0',64)))->>'status')<>'unavailable' then raise exception 'Bilinmeyen anahtar kabul edildi.'; end if;
  update community_v2.members set timeout_until=now()+interval '1 hour' where server_id=s and user_id=reader.id;
  rejected:=false; begin perform public.community_v2_invites('list',jsonb_build_object('server_id',s)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Timeout yönetim izni verdi.'; end if;
  if has_function_privilege('anon','public.community_v2_invites(text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','community_v2.invite_creator_active(uuid,uuid)','EXECUTE')
    or has_table_privilege('authenticated','community_v2.invites','SELECT') then raise exception 'Davet ACL açık.'; end if;
end;
$$;
-- Paging and quotas: old records must not get lost in a crowded list.
do $$
declare
  owner_user public.users; s uuid; result jsonb; next_page jsonb; p jsonb; rejected boolean;
begin
  select * into owner_user from public.users where username='site_owner';
  select id into s from community_v2.servers where owner_id=owner_user.id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  -- Only records in the transaction are pruned; rollback restores everything.
  delete from community_v2.invites where server_id=s;
  insert into community_v2.invites(server_id,creator_id,token_hash,label,ttl_seconds,max_uses,created_at)
    select s,owner_user.id,extensions.digest(gen_random_uuid()::text,'sha256'),'Sayfalama doğrulaması '||g,0,null,now()-interval '2 hours' from generate_series(1,50)g;
  result:=public.community_v2_invites('list',jsonb_build_object('server_id',s));
  if jsonb_array_length(result)<>26 then raise exception 'İlk sayfa 25+1 sınırını korumadı.'; end if;
  next_page:=public.community_v2_invites('list',jsonb_build_object('server_id',s,'before',result->24->>'cursor'));
  if jsonb_array_length(next_page)<>25 or next_page->0->>'id'<>result->25->>'id' then raise exception 'Cursor sonraki kaydı atladı.'; end if;
  p:=jsonb_build_object('server_id',s,'token',encode(extensions.gen_random_bytes(32),'hex'),'label','Sınır doğrulaması','ttl_seconds',3600,'max_uses',1);
  rejected:=false; begin perform public.community_v2_invites('create',p); exception when raise_exception then rejected:=position('50 açık davet' in sqlerrm)>0; end;
  if not rejected then raise exception 'Sunucu açık davet kotası uygulanmadı.'; end if;
  update community_v2.invites set revoked_at=now() where server_id=s;
  perform public.community_v2_invites('create',p);
  update community_v2.invites set created_at=now() where id in (select id from community_v2.invites where server_id=s and revoked_at is not null limit 19);
  rejected:=false; begin perform public.community_v2_invites('create',p||jsonb_build_object('token',encode(extensions.gen_random_bytes(32),'hex'))); exception when raise_exception then rejected:=position('20 davet' in sqlerrm)>0; end;
  if not rejected then raise exception 'Hesap oluşturma kotası uygulanmadı.'; end if;
  -- Even with a full quota an already successful same request creates no new record.
  perform public.community_v2_invites('create',p);
end;
$$;
rollback;
select 'PASS: davet sınırı, tekrarlar, yaptırımlar, OR izinleri, özel oda, devredilen yönetim, süre/iptal ve ACL; tüm değişiklikler geri alındı.' as result;
