-- Counter refresh permission gates and consistency with the full server response.
begin;
-- The launch flag turns on only in the rolled-back test transaction.
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare owner_user public.users; reader public.users; claims text; s uuid; c uuid; private_c uuid; r uuid; v jsonb; fullv jsonb; item jsonb; expected_unread integer; expected_mentions integer; rejected boolean;
begin
  select * into owner_user from public.users where username='site_owner';
  select * into reader from public.users where username='denemeuser';
  if owner_user.id is null or reader.id is null then raise exception 'Doğrulama hesapları yok.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  update community_v2.operations_config set rooms_per_owner=100 where id;
  s:=(public.community_v2_rooms('create','{"name":"Sayaç doğrulama okuma grubu","join_mode":"open"}')->>'id')::uuid;
  c:=(public.community_v2_read('server',jsonb_build_object('server_id',s))->'channels'->0->>'id')::uuid;
  private_c:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Editör arşivi','position',2,'is_private',true,'role_ids','[]'::jsonb))->>'id')::uuid;
  r:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Okuma ekibi','color','#339999','position',10,'permissions',jsonb_build_array('messages.read')))->>'id')::uuid;
  claims:=jsonb_build_object('sub',reader.auth_user_id,'role','authenticated','session_id',coalesce(reader.active_session_id,gen_random_uuid()))::text;
  perform set_config('request.jwt.claims',claims,true);
  perform public.community_v2_write('join',jsonb_build_object('server_id',s));
  insert into community_v2.member_roles(server_id,user_id,role_id) values(s,reader.id,r);
  insert into community_v2.messages(channel_id,seq,author_id,client_id,body,mentions,deleted_at)
    select c,n,case when n%11=0 then reader.id else owner_user.id end,gen_random_uuid(),'Okuma arşivi notu '||n,
      case when n%3=0 then jsonb_build_array(jsonb_build_object('kind','user','id',reader.id))
        when n%5=0 then jsonb_build_array(jsonb_build_object('kind','role','id',r)) else '[]'::jsonb end,
      case when n%13=0 then now() end from generate_series(1,1400)n;
  update community_v2.channels set last_seq=1400,slowmode_seconds=45 where id=c;
  insert into community_v2.message_cooldowns(channel_id,user_id,last_sent_at) values(c,reader.id,now());
  insert into community_v2.reads(channel_id,user_id,last_seq) values(c,reader.id,50);
  -- Old standalone definition: last 999 eligible messages, excluding own/deleted/blocked messages.
  select count(*),count(*) filter(where community_v2.mention_matches(mentions,s,reader.id)) into expected_unread,expected_mentions
    from (select msg.mentions from community_v2.messages msg where msg.channel_id=c and msg.seq>50
      and msg.author_id<>reader.id and not community_v2.blocked(reader.id,msg.author_id) and msg.deleted_at is null order by msg.seq desc limit 999)recent;
  v:=public.community_v2_read('activity',jsonb_build_object('server_id',s));
  fullv:=public.community_v2_read('server',jsonb_build_object('server_id',s));
  if jsonb_array_length(v->'channels')<>1 then raise exception 'Özel kanal sayaçları açığa çıktı.'; end if;
  item:=v->'channels'->0;
  if (item->>'unread')::integer<>expected_unread or (item->>'mention_count')::integer<>expected_mentions or expected_unread<>999 then raise exception 'Okunmamış/etiket sayısı eski tanımdan ayrıldı.'; end if;
  if item->>'next_send_at' is null or item->>'can_link_series'<>'false' then raise exception 'Dinamik kanal bilgisi eksik.'; end if;
  if not (fullv->'channels'->0 @> item) then raise exception 'Tam ve hafif cevap tutarsız.'; end if;
  if item ? 'role_ids' or item ? 'topic' or item ? 'name' or v ? 'roles' then raise exception 'Sayaç yanıtı gereksiz metadata içeriyor.'; end if;
  if exists(select 1 from unnest(community_v2.permission_catalog())p where community_v2.has_permission(s,reader.id,p) is distinct from (v->'permissions' ? p)) then raise exception 'Rol birleşiminde izin kaybı.'; end if;
  -- A block in either direction must give the same result.
  delete from public.user_blocks where (blocker_id=owner_user.id and blocked_id=reader.id) or (blocker_id=reader.id and blocked_id=owner_user.id);
  insert into public.user_blocks(blocker_id,blocked_id) values(owner_user.id,reader.id);
  v:=public.community_v2_read('activity',jsonb_build_object('server_id',s));
  if (v->'channels'->0->>'unread')::integer<>0 or (v->'channels'->0->>'mention_count')::integer<>0 then raise exception 'Engellenen yazar sayıldı.'; end if;
  delete from public.user_blocks where blocker_id=owner_user.id and blocked_id=reader.id;
  insert into public.user_blocks(blocker_id,blocked_id) values(reader.id,owner_user.id);
  if (public.community_v2_read('activity',jsonb_build_object('server_id',s))->'channels'->0->>'unread')::integer<>0 then raise exception 'Ters yönde engel sayıldı.'; end if;
  delete from public.user_blocks where blocker_id=reader.id and blocked_id=owner_user.id;
  update community_v2.roles set permissions=array_remove(permissions,'messages.read') where server_id=s;
  v:=public.community_v2_read('activity',jsonb_build_object('server_id',s));
  if v->'permissions' ? 'messages.read' or v->'channels'->0->>'can_read'<>'false' or (v->'channels'->0->>'unread')::integer<>0 then raise exception 'Okuma iptali uygulanmadı.'; end if;
  update community_v2.channels set is_private=true where id=c;
  if jsonb_array_length(public.community_v2_read('activity',jsonb_build_object('server_id',s))->'channels')<>0 then raise exception 'Kanal erişimi kaldırılmadı.'; end if;
  update community_v2.members set state='banned' where server_id=s and user_id=reader.id;
  rejected:=false; begin perform public.community_v2_read('activity',jsonb_build_object('server_id',s)); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Üyelik iptalinden sonra sayaç okundu.'; end if;
  if has_function_privilege('authenticated','community_v2.server_channels(uuid,uuid,boolean)','EXECUTE') or has_function_privilege('anon','community_v2.server_permissions(uuid,uuid)','EXECUTE') then raise exception 'Özel yardımcı açık.'; end if;
end $$;
rollback;
select 'PASS: sayaç, rol etiketi, 999 sınırı, kendi/silinmiş/engelli mesaj, özel kanal, izin birleşimi, yavaş mod ve erişim iptali.' as result;
