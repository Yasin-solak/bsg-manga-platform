-- Real delivery function; all account, preference, notification and queue changes roll back.
begin;
update public.feature_flags set is_enabled=true,rollout_percent=100 where key='community.enabled';
do $$
declare owner_user public.users; reader public.users; s uuid; c uuid; pc uuid; r uuid;
  msg uuid; private_msg uuid; target_msg uuid; target_channel uuid; original_permissions text[];
  scenario record; tags jsonb; actual integer; cases integer:=0; indexv integer;
begin
  select * into strict owner_user from public.users where username='site_owner';
  select * into strict reader from public.users where username='denemeuser';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user.auth_user_id,'role','authenticated','session_id',coalesce(owner_user.active_session_id,gen_random_uuid()))::text,true);
  update community_v2.operations_config set rooms_per_owner=100,joins_per_minute=1000 where id;
  s:=(public.community_v2_rooms('create','{"name":"Bildirim erişim doğrulaması","join_mode":"open"}')->>'id')::uuid;
  select id into c from community_v2.channels where server_id=s order by position limit 1;
  insert into community_v2.members(server_id,user_id,state) values(s,reader.id,'active');
  r:=(public.community_v2_write('save_role',jsonb_build_object('server_id',s,'name','Okuma ekibi','color','#82d4c9','position',20,'permissions',array['messages.read']))->>'id')::uuid;
  pc:=(public.community_v2_write('save_channel',jsonb_build_object('server_id',s,'name','Ekip sohbeti','position',20,'is_private',true,'role_ids',array[r]))->>'id')::uuid;
  msg:=(public.community_v2_write('send',jsonb_build_object('channel_id',c,'client_id',gen_random_uuid(),'body','Herkese açık okuma buluşması.'))->>'id')::uuid;
  update community_v2.members set last_message_at=null where server_id=s and user_id=owner_user.id;
  private_msg:=(public.community_v2_write('send',jsonb_build_object('channel_id',pc,'client_id',gen_random_uuid(),'body','Özel ekip buluşması.'))->>'id')::uuid;
  select permissions into original_permissions from community_v2.roles where server_id=s and is_default;
  for scenario in select * from (values
    ('varsayılan',null,'inherit','inherit','none',0),
    ('varsayılan etiket',null,'inherit','inherit','user',1),
    ('tüm mesajlar','all','inherit','inherit','none',1),
    ('kapalı','off','inherit','inherit','user',0),
    ('yalnız etiket','mentions','inherit','inherit','none',0),
    ('yanıt','mentions','inherit','inherit','reply',1),
    ('rol etiketi','mentions','inherit','inherit','role',1),
    ('üyesi olmadığı rol','mentions','inherit','inherit','other_role',0),
    ('sunucu tercihi','off','all','inherit','none',1),
    ('kanal tercihi','all','off','all','none',1),
    ('kanal kapalı','all','all','off','user',0),
    ('sunucu sessiz','all','all','all','server_mute',0),
    ('kanal sessiz','all','all','all','channel_mute',0),
    ('bitmiş sessizlik','all','all','all','expired_mute',1),
    ('özel kanal yetkisiz','all','inherit','inherit','private',0),
    ('özel kanal yetkili','all','inherit','inherit','private_role',1),
    ('okuma yetkisi yok','all','inherit','inherit','no_read',0),
    ('alıcı engeli','all','inherit','inherit','blocked',0),
    ('yazar engeli','all','inherit','inherit','reverse_block',0),
    ('üyelikten ayrılmış','all','inherit','inherit','left',0),
    ('üyelik yasağı','all','inherit','inherit','banned_member',0),
    ('pasif hesap','all','inherit','inherit','inactive',0),
    ('yasaklı hesap','all','inherit','inherit','banned_user',0),
    ('sonradan katılmış','all','inherit','inherit','late_join',0),
    ('bekleme süresi','all','inherit','inherit','cooldown',0),
    ('silinmiş mesaj','all','inherit','inherit','deleted',0),
    ('arşiv sunucu','all','inherit','inherit','archived',0),
    ('eskimiş iş','all','inherit','inherit','expired',0)
  ) as scenarios(label,global_mode,server_mode,channel_mode,special,expected) loop
    target_channel:=case when scenario.special in ('private','private_role') then pc else c end;
    target_msg:=case when target_channel=pc then private_msg else msg end;
    update community_v2.servers set archived_at=null where id=s;
    update community_v2.members set state='active' where server_id=s and user_id=reader.id;
    update community_v2.members set joined_at=now()-interval '1 hour' where server_id=s and user_id=reader.id;
    update public.users set is_active=true,is_banned=false where id=reader.id;
    update community_v2.roles set permissions=original_permissions where server_id=s and is_default;
    update community_v2.messages set deleted_at=null where id in (msg,private_msg);
    delete from community_v2.member_roles where server_id=s and user_id=reader.id;
    delete from community_v2.notification_scopes where user_id=reader.id;
    delete from community_v2.preferences where user_id=reader.id;
    delete from public.user_blocks where blocker_id in (reader.id,owner_user.id) and blocked_id in (reader.id,owner_user.id);
    delete from community_v2.notification_cooldowns where channel_id in (c,pc);
    delete from public.notifications where data->>'message_id' in (msg::text,private_msg::text);
    delete from community_v2.delivery_queue;
    if scenario.global_mode is not null then insert into community_v2.preferences(user_id,notifications) values(reader.id,scenario.global_mode); end if;
    insert into community_v2.notification_scopes(user_id,scope_id,server_id,mode) values(reader.id,s,s,scenario.server_mode);
    insert into community_v2.notification_scopes(user_id,scope_id,server_id,channel_id,mode) values(reader.id,target_channel,s,target_channel,scenario.channel_mode);
    tags:=case when scenario.special in ('user') then jsonb_build_array(jsonb_build_object('kind','user','id',reader.id))
      when scenario.special in ('role','other_role') then jsonb_build_array(jsonb_build_object('kind','role','id',r)) else '[]'::jsonb end;
    if scenario.special in ('role','private_role') then insert into community_v2.member_roles(server_id,user_id,role_id) values(s,reader.id,r); end if;
    case scenario.special
      when 'server_mute' then update community_v2.notification_scopes set muted_until=now()+interval '1 hour' where user_id=reader.id and scope_id=s;
      when 'channel_mute' then update community_v2.notification_scopes set muted_until=now()+interval '1 hour' where user_id=reader.id and scope_id=target_channel;
      when 'expired_mute' then update community_v2.notification_scopes set muted_until=now()-interval '1 hour' where user_id=reader.id;
      when 'no_read' then update community_v2.roles set permissions=array_remove(permissions,'messages.read') where server_id=s;
      when 'blocked' then insert into public.user_blocks(blocker_id,blocked_id) values(reader.id,owner_user.id);
      when 'reverse_block' then insert into public.user_blocks(blocker_id,blocked_id) values(owner_user.id,reader.id);
      when 'left' then update community_v2.members set state='left' where server_id=s and user_id=reader.id;
      when 'banned_member' then update community_v2.members set state='banned' where server_id=s and user_id=reader.id;
      when 'inactive' then update public.users set is_active=false where id=reader.id;
      when 'banned_user' then update public.users set is_banned=true where id=reader.id;
      when 'late_join' then update community_v2.members set joined_at=now()+interval '1 hour' where server_id=s and user_id=reader.id;
      when 'cooldown' then insert into community_v2.notification_cooldowns(user_id,channel_id,sent_at) values(reader.id,target_channel,now());
      when 'deleted' then update community_v2.messages set deleted_at=now() where id=target_msg;
      when 'archived' then update community_v2.servers set archived_at=now() where id=s;
      else null;
    end case;
    insert into community_v2.delivery_queue(message_id,mentions,reply_author,created_at) values(target_msg,tags,
      case when scenario.special='reply' then reader.id else null end,
      case when scenario.special='expired' then now()-interval '2 days' else clock_timestamp() end);
    actual:=community_v2.deliver_notifications();
    if actual<>scenario.expected then raise exception 'Bildirim senaryosu %: beklenen %, alınan %',scenario.label,scenario.expected,actual; end if;
    if (select count(*) from public.notifications where user_id=reader.id and data->>'message_id'=target_msg::text)<>scenario.expected
      or exists(select 1 from community_v2.delivery_queue) then raise exception 'Kayıt/imleç tutarsız: %',scenario.label; end if;
    if exists(select 1 from public.notifications where data->>'message_id'=target_msg::text and (message like '%buluşması%' or user_id<>reader.id)) then raise exception 'Bildirimde özel içerik/kendine teslim açığı.'; end if;
    if community_v2.deliver_notifications()<>0 then raise exception 'Tekrar teslim oluştu.'; end if;
    cases:=cases+1;
  end loop;
  -- Queue fairness with many jobs: an old job just served waits for the next round.
  update community_v2.servers set archived_at=null where id=s;
  update community_v2.members set joined_at=now()-interval '1 hour' where server_id=s;
  update community_v2.preferences set notifications='off' where user_id=reader.id;
  delete from community_v2.notification_scopes where user_id=reader.id;
  delete from community_v2.delivery_queue;
  for indexv in 1..25 loop
    insert into community_v2.messages(channel_id,seq,author_id,client_id,body)
      values(c,1000+indexv,owner_user.id,gen_random_uuid(),'Sıralı teslim kontrolü.');
  end loop;
  insert into community_v2.delivery_queue(message_id,mentions,created_at,last_served_at)
    values(msg,'[]',now()-interval '1 hour',clock_timestamp()+interval '1 second');
  actual:=community_v2.deliver_notifications();
  if actual<>0 or (select count(*) from community_v2.delivery_queue)<>1
    or not exists(select 1 from community_v2.delivery_queue where message_id=msg) then raise exception 'Kuyruk sırası / 25 iş sınırı bozuk.'; end if;
  actual:=community_v2.deliver_notifications();
  if actual<>0 or exists(select 1 from community_v2.delivery_queue) then raise exception 'Bekleyen işe sıra gelmedi.'; end if;
  -- The stored recipient cursor prevents redelivery; a tag cannot pass it either.
  update community_v2.preferences set notifications='all' where user_id=reader.id;
  insert into community_v2.delivery_queue(message_id,mentions,after_user)
    values(msg,jsonb_build_array(jsonb_build_object('kind','user','id',reader.id)),reader.id);
  actual:=community_v2.deliver_notifications();
  if actual<>0 or exists(select 1 from community_v2.delivery_queue) then raise exception 'Alıcı imleci yeniden teslim üretti.'; end if;
  if has_function_privilege('authenticated','community_v2.deliver_notifications()','execute') or has_function_privilege('anon','community_v2.deliver_notifications()','execute') then raise exception 'Teslim fonksiyonu dışarı açık.'; end if;
  perform set_config('bsg_test.delivery_cases',cases::text,true);
end $$;
select 'Topluluk bildirim regresyonu PASS' as result,current_setting('bsg_test.delivery_cases')::integer as scenarios;
rollback;
