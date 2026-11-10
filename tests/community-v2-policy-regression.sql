-- Preference and auto creation tests do not durably change live settings.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; reader public.users; f uuid; s uuid; other_s uuid; other_r uuid;
  rejected boolean; initial_count integer; retained_count integer; before_admin_count integer;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  select fansub_id into f from public.fansub_members where user_id=owner_user.id and role='admin' limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  s:=(public.community_v2_write('create_server',jsonb_build_object('fansub_id',f))->>'id')::uuid;
  select count(*) into initial_count from community_v2.servers;
  update public.feature_flags set is_enabled=false where key='community.servers_auto_create';
  if community_v2.reconcile()<>0 or (select count(*) from community_v2.servers)<>initial_count then raise exception 'Manuel mod otomatik sunucu açtı.'; end if;
  update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.servers_auto_create';
  perform community_v2.reconcile();
  select count(*) into retained_count from community_v2.servers;
  perform community_v2.reconcile();
  if (select count(*) from community_v2.servers)<>retained_count then raise exception 'Tamamlama işi çift sunucu açtı.'; end if;
  update public.feature_flags set is_enabled=false where key='community.servers_auto_create';
  perform community_v2.reconcile();
  if (select count(*) from community_v2.servers)<>retained_count then raise exception 'Mod değişimi mevcut sunucuları etkiledi.'; end if;
  select id into other_s from community_v2.servers where id<>s limit 1;
  select id into other_r from community_v2.roles where server_id=other_s limit 1;
  insert into community_v2.members(server_id,user_id) values(s,reader.id) on conflict do nothing;
  rejected:=false;
  begin perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',jsonb_build_array(other_r)));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Başka sunucunun rolü atanabildi.'; end if;
  select count(*) into before_admin_count from public.fansub_members where fansub_id=f and user_id=reader.id;
  delete from community_v2.members where server_id=s and user_id=reader.id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text,true);
  perform public.community_v2_write('preference','{"auto_join":false}');
  delete from public.fansub_follows where fansub_id=f and user_id=reader.id;
  insert into public.fansub_follows(fansub_id,user_id) values(f,reader.id);
  perform public.community_v2_sync();
  if exists(select 1 from community_v2.members where server_id=s and user_id=reader.id) then raise exception 'Kapalı tercih göz ardı edildi.'; end if;
  perform public.community_v2_write('preference','{"auto_join":true}');
  perform public.community_v2_sync();
  if not community_v2.is_member(s,reader.id) then raise exception 'Açık tercih mevcut takipten katılmadı.'; end if;
  if (select count(*) from public.fansub_members where fansub_id=f and user_id=reader.id)<>before_admin_count then raise exception 'Sohbet üyeliği fansub ekip yetkisi verdi.'; end if;
  perform public.community_v2_write('leave',jsonb_build_object('server_id',s));
  perform public.community_v2_sync();
  delete from public.fansub_follows where fansub_id=f and user_id=reader.id;
  insert into public.fansub_follows(fansub_id,user_id) values(f,reader.id);
  if community_v2.is_member(s,reader.id) then raise exception 'İstemli ayrılık otomatik aşıldı.'; end if;
  perform public.community_v2_write('join',jsonb_build_object('server_id',s));
  delete from public.fansub_follows where fansub_id=f and user_id=reader.id;
  if not community_v2.is_member(s,reader.id) then raise exception 'Takipten çıkmak üyeliği sildi.'; end if;
  perform public.community_v2_write('preference','{"auto_join":false}');
  if not community_v2.is_member(s,reader.id) then raise exception 'Tercih kapatma üyeliği sildi.'; end if;
end $$;
rollback;
select 'PASS: manuel/otomatik mod, tekrar çalıştırma, sunucuları koruma, farklı sunucunun rolü, opt-out, eski takipten katılım, ayrılık, yeniden takip, ekip yetkisi ayrımı. Kalıcı değişiklik yok.' as result;
