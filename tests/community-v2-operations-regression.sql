-- A controlled 5000-message history; produces no durable content, notification or account.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
set local statement_timeout='25s';
create temporary table community_metrics(name text, milliseconds numeric, records integer) on commit drop;
do $$
declare owner_user public.users; reader public.users; owner_claims text; reader_claims text;
  s uuid; c uuid; r uuid; result jsonb; stamp timestamptz; rejected boolean; cap integer;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  owner_claims:=jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text;
  reader_claims:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',owner_claims,true);
  select count(*)+1 into cap from community_v2.servers where owner_id=owner_user.id and fansub_id is null;
  update community_v2.operations_config set rooms_per_owner=cap,joins_per_minute=1 where id;
  s:=(public.community_v2_rooms('create','{"name":"Geçmiş ve işletim doğrulaması","join_mode":"open"}')->>'id')::uuid;
  c:=(public.community_v2_read('server',jsonb_build_object('server_id',s))->'channels'->0->>'id')::uuid;
  if community_v2.try_auto_join(s,reader.id) then raise exception 'Katılım hız sınırı atlandı.'; end if;
  if community_v2.is_member(s,reader.id) then raise exception 'Ertelenen üyelik yazıldı.'; end if;
  update community_v2.operations_config set joins_per_minute=30 where id;
  if not community_v2.try_auto_join(s,reader.id) then raise exception 'Boşalan kapasiteye otomatik katılım yapılamadı.'; end if;
  update community_v2.members set state='left' where server_id=s and user_id=reader.id;
  if community_v2.try_auto_join(s,reader.id) then raise exception 'Ayrılan kullanıcı kendiliğinden geri katıldı.'; end if;
  update community_v2.members set state='active' where server_id=s and user_id=reader.id;
  r:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Katılım sorumlusu','color','#82d4c9','position',20,'permissions',array['server.join.manage']))->>'id')::uuid;
  perform public.community_v2_write('assign_roles',jsonb_build_object('server_id',s,'user_id',reader.id,'role_ids',array[r]));
  perform set_config('request.jwt.claims',reader_claims,true);
  perform public.community_v2_rooms('save_join_mode',jsonb_build_object('server_id',s,'version',1,'join_mode','request'));
  rejected:=false; begin
    perform public.community_v2_rooms('save_profile',jsonb_build_object('server_id',s,'version',2,'name','İzinsiz profil','join_mode','open'));
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Katılım yöneticisi profili değiştirdi.'; end if;
  result:=public.community_v2_personal('heartbeat',jsonb_build_object('channel_id',c,'typing',true));
  if not exists(select 1 from jsonb_array_elements(result)x where x->>'user_id'=reader.id::text and (x->>'typing_seconds')::numeric between 0 and 8 and (x->>'presence_seconds')::numeric between 0 and 90) then raise exception 'Çevrimiçi süre sözleşmesi bozuk.'; end if;
  perform set_config('request.jwt.claims',owner_claims,true);
  insert into community_v2.messages(channel_id,seq,author_id,client_id,body)
    select c,i,owner_user.id,gen_random_uuid(),case when i=2500 then 'Kütüphane buluşması seçilmiş bölüm' else 'Okuma kulübü geçmişi '||i end from generate_series(1,5000)i;
  update community_v2.channels set last_seq=5000 where id=c;
  stamp:=clock_timestamp(); result:=public.community_v2_read('messages',jsonb_build_object('channel_id',c));
  insert into community_metrics values('son_sayfa',extract(epoch from clock_timestamp()-stamp)*1000,jsonb_array_length(result));
  if jsonb_array_length(result)<>50 or result->0->>'seq'<>'4951' then raise exception 'Son sayfa sınırı hatalı.'; end if;
  stamp:=clock_timestamp(); result:=public.community_v2_read('messages',jsonb_build_object('channel_id',c,'before','2500'));
  insert into community_metrics values('eski_sayfa',extract(epoch from clock_timestamp()-stamp)*1000,jsonb_array_length(result));
  if jsonb_array_length(result)<>50 or result->49->>'seq'<>'2499' then raise exception 'Eski sayfa cursoru hatalı.'; end if;
  stamp:=clock_timestamp(); result:=public.community_v2_personal('search',jsonb_build_object('channel_id',c,'search','Kütüphane'));
  insert into community_metrics values('metin_arama',extract(epoch from clock_timestamp()-stamp)*1000,jsonb_array_length(result));
  if jsonb_array_length(result)<>1 or result->0->>'seq'<>'2500' then raise exception 'Uzun geçmiş araması hatalı.'; end if;
  stamp:=clock_timestamp(); result:=public.community_v2_read('message_context',jsonb_build_object('channel_id',c,'message_id',result->0->>'id'));
  insert into community_metrics values('mesaj_baglami',extract(epoch from clock_timestamp()-stamp)*1000,jsonb_array_length(result));
  if jsonb_array_length(result)>50 or not result @> '[{"seq":"2500"}]'::jsonb then raise exception 'Bağlam sınırı hatalı.'; end if;
end $$;
select * from community_metrics order by name;
rollback;
