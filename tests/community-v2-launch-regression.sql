-- Launch key, direct API, cron and data protection; every change rolls back.
begin;
set local statement_timeout='25s';
create function pg_temp.assert_community_closed(command text) returns void language plpgsql as $$
begin
  execute command;
  raise exception 'Kapalı işlem kabul edildi: %',command;
exception when insufficient_privilege then
  if sqlerrm<>'Topluluk henüz kullanıma açılmadı.' then raise; end if;
end $$;
do $$
declare owner_user public.users; reader public.users; s uuid; c uuid; f uuid; before_members bigint; before_messages bigint;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  if owner_user.id is null or reader.id is null then raise exception 'Doğrulama hesapları yok.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
  if not public.community_v2_availability() then raise exception 'Açık kapı kullanılamıyor.'; end if;
  if (select count(*) from cron.job where jobname in ('community-v2-server-policy','community-v2-notifications') and active)<>2 then raise exception 'Açılan işler eşlenmedi.'; end if;
  update community_v2.operations_config set rooms_per_owner=100 where id;
  s:=(public.community_v2_rooms('create','{"name":"Açılış kontrolü okuma grubu","join_mode":"open"}')->>'id')::uuid;
  c:=(public.community_v2_read('server',jsonb_build_object('server_id',s))->'channels'->0->>'id')::uuid;
  perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Korunacak okuma grubu mesajı'));
  select count(*) into before_messages from community_v2.messages;
  select count(*) into before_members from community_v2.members;
  update public.feature_flags set is_enabled=false where key='community.enabled';
  if public.community_v2_availability() or community_v2.broadcast_allowed('community-v2:channel:'||c) then raise exception 'Kapalı topluluğa erişim var.'; end if;
  if public.community_v2_series_channels(gen_random_uuid(),0)<>'[]'::jsonb then raise exception 'Kapalı seri kanalı listelendi.'; end if;
  perform pg_temp.assert_community_closed($q$select public.community_v2_read('home','{}')$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_write('send','{}')$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_sync()$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_invites('preview','{}')$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_media('prepare','{}')$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_personal('heartbeat','{}')$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_moderation('report','{}')$q$);
  perform pg_temp.assert_community_closed($q$select public.community_v2_rooms('create','{}')$q$);
  if (public.community_v2_operations('status','{}')->>'enabled')::boolean then raise exception 'İşletim durumu yanlış.'; end if;
  if community_v2.reconcile()<>0 or community_v2.deliver_notifications()<>0 then raise exception 'Kapalı iş çalıştı.'; end if;
  if exists(select 1 from cron.job where jobname in ('community-v2-server-policy','community-v2-notifications') and active) then raise exception 'Kapalı cron hâlâ etkin.'; end if;
  if not exists(select 1 from cron.job where jobname='community-v2-maintenance' and active) then raise exception 'Veri temizliği durduruldu.'; end if;
  -- Fansub follow stays a site feature; it cannot create community membership.
  select fansub_id into f from community_v2.servers where fansub_id is not null limit 1;
  if f is null then raise exception 'Takip testi için fansub sunucusu yok.'; end if;
  delete from public.fansub_follows where fansub_id=f and user_id=reader.id;
  delete from community_v2.members where server_id in(select id from community_v2.servers where fansub_id=f) and user_id=reader.id;
  insert into public.fansub_follows(fansub_id,user_id) values(f,reader.id);
  if exists(select 1 from community_v2.members where server_id in(select id from community_v2.servers where fansub_id=f) and user_id=reader.id) then raise exception 'Kapalıyken takipten katılım oluştu.'; end if;
  if (select count(*) from community_v2.messages)<>before_messages then raise exception 'Kapatma mesajları değiştirdi.'; end if;
  if (select count(*) from community_v2.members)>before_members then raise exception 'Kapatma üyelik üretti.'; end if;
  update public.feature_flags set is_enabled=true,rollout_percent=99 where key='community.enabled';
  if public.community_v2_availability() then raise exception 'Kısmi rollout ana kapıyı açtı.'; end if;
  update public.feature_flags set rollout_percent=100 where key='community.enabled';
  if jsonb_array_length(public.community_v2_read('messages',jsonb_build_object('channel_id',c)))<>1 then raise exception 'Yeniden açılışta geçmiş korunmadı.'; end if;
  delete from public.feature_flags where key='community.enabled';
  if public.community_v2_availability() then raise exception 'Eksik bayrak erişim verdi.'; end if;
  if exists(select 1 from cron.job where jobname in ('community-v2-server-policy','community-v2-notifications') and active) then raise exception 'Bayrak silinince işler kapanmadı.'; end if;
  if has_function_privilege('authenticated','community_v2.enabled()','execute') or has_function_privilege('anon','community_v2.sync_launch_jobs()','execute') then raise exception 'İç yardımcının yetkisi açık.'; end if;
  perform set_config('request.jwt.claims','{}',true);
  if public.community_v2_availability() or public.community_v2_series_channels(gen_random_uuid(),0)<>'[]'::jsonb then raise exception 'Anon kapı hatası.'; end if;
end $$;
rollback;
select 'PASS: topluluk açılış kapısı ve veri koruma' as result;
