-- A small rolled-back comparison; not a capacity/load test. Produces no external work.
begin;
set local track_functions = 'all';
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare owner_user public.users; s uuid; c uuid; recipient_count integer; before_calls bigint; elapsed numeric; started timestamptz; result integer;
begin
  select * into strict owner_user from public.users where username='site_owner';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  update community_v2.operations_config set rooms_per_owner=100,joins_per_minute=1000 where id;
  s:=(public.community_v2_rooms('create','{"name":"Bildirim maliyet doğrulaması","join_mode":"open"}')->>'id')::uuid;
  select id into c from community_v2.channels where server_id=s order by position limit 1;
  insert into community_v2.members(server_id,user_id,state,joined_at)
    select s,id,'active',now()-interval '1 hour' from public.users where is_active and not is_banned and id<>owner_user.id order by id limit 100;
  select count(*) into recipient_count from community_v2.members where server_id=s and user_id<>owner_user.id;
  insert into community_v2.preferences(user_id,notifications)
    select user_id,'off' from community_v2.members where server_id=s on conflict(user_id) do update set notifications='off';
  delete from community_v2.delivery_queue;
  perform public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Bildirim tercihi kapalı hesapların maliyet kontrolü.'));
  select coalesce(sum(calls),0) into before_calls from pg_stat_xact_user_functions where funcid='community_v2.can_read(uuid,uuid)'::regprocedure;
  started:=clock_timestamp(); result:=community_v2.deliver_notifications(); elapsed:=extract(epoch from clock_timestamp()-started)*1000;
  if result<>0 or exists(select 1 from community_v2.delivery_queue) then raise exception 'Kapalı bildirim senaryosu başarısız: %',result; end if;
  perform set_config('bsg_test.delivery_benchmark',jsonb_build_object('recipients',recipient_count,'notifications',result,'elapsed_ms',round(elapsed,3),'can_read_calls',(select coalesce(sum(calls),0)-before_calls from pg_stat_xact_user_functions where funcid='community_v2.can_read(uuid,uuid)'::regprocedure))::text,true);
end $$;
select current_setting('bsg_test.delivery_benchmark')::jsonb as result;
rollback;
