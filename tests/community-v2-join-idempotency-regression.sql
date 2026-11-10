-- Real Realtime SQL records are counted; due to ROLLBACK they are not sent to clients.
begin;
set local statement_timeout='25s';
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare
  owner_user public.users; reader public.users; another public.users;
  owner_claims text; reader_claims text; s uuid; other_s uuid; result jsonb;
  request_at timestamptz; signals_before bigint; audit_before bigint; rejected boolean; i integer;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  select * into another from public.users where id not in(owner_user.id,reader.id)
    and auth_user_id is not null and is_active and not is_banned order by id limit 1;
  if owner_user.auth_user_id is null or reader.auth_user_id is null or another.id is null then raise exception 'Doğrulama hesapları eksik.'; end if;
  owner_claims:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  reader_claims:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  update community_v2.operations_config set rooms_per_owner=rooms_per_owner+2 where id;
  perform set_config('request.jwt.claims',owner_claims,true);
  s:=(public.community_v2_rooms('create','{"name":"Başvuru sinyali doğrulaması","join_mode":"request"}')->>'id')::uuid;
  other_s:=(public.community_v2_rooms('create','{"name":"Alternatif başvuru doğrulaması","join_mode":"request"}')->>'id')::uuid;
  perform set_config('request.jwt.claims',reader_claims,true);
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||s and event='refresh';
  result:=public.community_v2_rooms('join',jsonb_build_object('server_id',s));
  if result is distinct from '{"pending":true}'::jsonb or community_v2.is_member(s,reader.id) then raise exception 'İlk başvuru yanıtı/üyelik sınırı bozuk.'; end if;
  if (select count(*) from community_v2.join_requests where server_id=s and user_id=reader.id)<>1
    or (select count(*) from realtime.messages where topic='community-v2:server:'||s and event='refresh')<>signals_before+1 then raise exception 'İlk başvuru tek kayıt/sinyal oluşturmadı.'; end if;
  select created_at into request_at from community_v2.join_requests where server_id=s and user_id=reader.id;
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||s and event='refresh';
  select count(*) into audit_before from community_v2.audit where server_id=s;
  -- Mixed repeats of two public entries must pass the same shared limit.
  for i in 1..12 loop
    if i%2=0 then result:=public.community_v2_rooms('join',jsonb_build_object('server_id',s));
    else result:=public.community_v2_write('join',jsonb_build_object('server_id',s)); end if;
    if result is distinct from '{"pending":true}'::jsonb then raise exception 'Tekrar başvurunun yanıtı değişti.'; end if;
  end loop;
  if (select count(*) from realtime.messages where topic='community-v2:server:'||s and event='refresh')<>signals_before then raise exception 'Güvenlik: yinelenen başvuru sunucu sinyali üretti.'; end if;
  if (select count(*) from community_v2.join_requests where server_id=s and user_id=reader.id)<>1
    or (select created_at from community_v2.join_requests where server_id=s and user_id=reader.id) is distinct from request_at
    or (select count(*) from community_v2.audit where server_id=s)<>audit_before then raise exception 'Tekrar başvuru kayıt/zaman/denetim değiştirdi.'; end if;
  -- The other public path also creates the first application normally.
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||other_s and event='refresh';
  result:=public.community_v2_write('join',jsonb_build_object('server_id',other_s));
  if result is distinct from '{"pending":true}'::jsonb
    or (select count(*) from realtime.messages where topic='community-v2:server:'||other_s and event='refresh')<>signals_before+1 then raise exception 'Alternatif ilk başvuru bozuldu.'; end if;
  -- Someone else's real new application keeps producing a notification.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',another.auth_user_id,'role','authenticated','session_id',coalesce(another.active_session_id,gen_random_uuid()))::text,true);
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||s and event='refresh';
  result:=public.community_v2_rooms('join',jsonb_build_object('server_id',s));
  if result is distinct from '{"pending":true}'::jsonb
    or (select count(*) from realtime.messages where topic='community-v2:server:'||s and event='refresh')<>signals_before+1 then raise exception 'Diğer hesabın yeni başvurusu bozuldu.'; end if;
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.community_v2_rooms('decide_request',jsonb_build_object('server_id',s,'user_id',reader.id,'approve',false));
  perform set_config('request.jwt.claims',reader_claims,true);
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||s and event='refresh';
  result:=public.community_v2_write('join',jsonb_build_object('server_id',s));
  if result is distinct from '{"pending":true}'::jsonb
    or (select count(*) from realtime.messages where topic='community-v2:server:'||s and event='refresh')<>signals_before+1 then raise exception 'Karardan sonraki yeni başvuru bozuldu.'; end if;
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.community_v2_rooms('decide_request',jsonb_build_object('server_id',s,'user_id',reader.id,'approve',true));
  if not community_v2.is_member(s,reader.id) or exists(select 1 from community_v2.join_requests where server_id=s and user_id=reader.id) then raise exception 'Başvuru onayı bozuldu.'; end if;
  perform set_config('request.jwt.claims',reader_claims,true);
  select count(*) into signals_before from realtime.messages where topic='community-v2:server:'||s and event='refresh';
  result:=public.community_v2_rooms('join',jsonb_build_object('server_id',s));
  if result is distinct from '{"ok":true}'::jsonb
    or (select count(*) from realtime.messages where topic='community-v2:server:'||s and event='refresh')<>signals_before then raise exception 'Aktif üyenin tekrar katılımı bozuldu.'; end if;
  -- Ban/archive/invite checks cannot be skipped because a pending record exists.
  insert into community_v2.members(server_id,user_id,state,protected_rank) values(other_s,reader.id,'banned',1001);
  rejected:=false;
  begin perform public.community_v2_rooms('join',jsonb_build_object('server_id',other_s)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Başvurusu olan yasaklı kullanıcı kabul edildi.'; end if;
  delete from community_v2.members where server_id=other_s and user_id=reader.id;
  update community_v2.servers set archived_at=now() where id=other_s;
  rejected:=false;
  begin perform public.community_v2_write('join',jsonb_build_object('server_id',other_s)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Arşivlenmiş sunucu başvuru kabul etti.'; end if;
  update community_v2.servers set archived_at=null,join_mode='invite' where id=other_s;
  rejected:=false;
  begin perform public.community_v2_rooms('join',jsonb_build_object('server_id',other_s)); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Davetli sunucu davetsiz başvuru kabul etti.'; end if;
  if has_function_privilege('anon','public.community_v2_rooms(text,jsonb)','execute')
    or has_function_privilege('anon','community_v2.room_api(text,jsonb)','execute')
    or not has_function_privilege('authenticated','community_v2.room_api(text,jsonb)','execute') then raise exception 'Katılım ACL sözleşmesi değişti.'; end if;
end $$;
rollback;
select 'PASS: iki public girişte tek başvuru/tek sinyal, 12 tekrar/0 ek sinyal, diğer hesap, yeni başvuru, onay ve erişim sınırları' as result;
