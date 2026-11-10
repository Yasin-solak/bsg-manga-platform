-- Community is off at the first site launch; data and cleanup jobs are kept.
-- This gate is not a pilot rollout: only on + 100 percent together gives access.
insert into public.feature_flags(key,label,description,is_enabled,rollout_percent,is_public)
values('community.enabled','Topluluk genel erişimi','İlk yayında kapalı. Açılış için tasarım, kapasite ve maliyet kabulü gerekir.',false,100,true)
on conflict(key) do update set is_enabled=false,rollout_percent=100,is_public=true;

create or replace function community_v2.enabled()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.feature_flags where key='community.enabled' and is_enabled and rollout_percent=100);
$$;
revoke all on function community_v2.enabled() from public,anon,authenticated;

create or replace function public.community_v2_availability()
returns boolean language sql stable security definer set search_path='' as $$
  select community_v2.enabled();
$$;
revoke all on function public.community_v2_availability() from public,anon,authenticated;
grant execute on function public.community_v2_availability() to anon,authenticated;

CREATE OR REPLACE FUNCTION community_v2.actor()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := public.current_public_user_id();
begin
  if not community_v2.enabled() then raise exception 'Topluluk henüz kullanıma açılmadı.' using errcode='42501'; end if;
  if u is null then raise exception 'Geçerli bir hesapla giriş yapmalısın.' using errcode='42501'; end if;
  return u;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.broadcast_allowed(topic text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := public.current_public_user_id(); v uuid;
begin
  if not community_v2.enabled() then return false; end if;
  if u is null or topic !~ '^community-v2:(server|channel):[0-9a-f-]{36}$' then return false; end if;
  begin v := split_part(topic,':',3)::uuid; exception when invalid_text_representation then return false; end;
  if split_part(topic,':',2)='server' then return community_v2.is_member(v,u); end if;
  return community_v2.can_read(v,u);
end $function$;

CREATE OR REPLACE FUNCTION community_v2.deliver_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q community_v2.delivery_queue; msg community_v2.messages; member record; s uuid; modev text;
  countv integer:=0; batch integer; flagged boolean; started timestamptz:=clock_timestamp();
begin
  if not community_v2.enabled() then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('community-delivery',0)) then return 0; end if;
  for q in select * from community_v2.delivery_queue order by created_at,message_id limit 25 for update skip locked loop
    select * into msg from community_v2.messages where id=q.message_id;
    select server_id into s from community_v2.channels where id=msg.channel_id;
    if msg.deleted_at is not null or q.created_at<now()-interval '1 day' or not community_v2.server_active(s)
      or exists(select 1 from community_v2.servers where id=s and archived_at is not null) then
      delete from community_v2.delivery_queue where message_id=q.message_id; continue;
    end if;
    batch:=0;
    for member in select m.user_id from community_v2.members m where m.server_id=s and m.state='active'
      and m.joined_at<=q.created_at and (q.after_user is null or m.user_id>q.after_user) order by m.user_id limit 200 loop
      batch:=batch+1; q.after_user:=member.user_id;
      if member.user_id=msg.author_id or community_v2.blocked(member.user_id,msg.author_id)
        or not community_v2.can_read(msg.channel_id,member.user_id)
        or not exists(select 1 from public.users where id=member.user_id and is_active and not is_banned) then continue; end if;
      modev:=community_v2.notification_mode(member.user_id,s,msg.channel_id);
      flagged:=coalesce(q.reply_author=member.user_id,false) or community_v2.mention_matches(q.mentions,s,member.user_id);
      if modev='off' or (modev='mentions' and not flagged) then continue; end if;
      if exists(select 1 from community_v2.notification_cooldowns where user_id=member.user_id and channel_id=msg.channel_id and sent_at>now()-interval '1 minute') then continue; end if;
      insert into public.notifications(user_id,type,title,message,icon,data)
        values(member.user_id,case when flagged then 'mention' else 'comment' end,'Toplulukta yeni mesaj',
          case when flagged then 'Bir sohbette etiketlendin veya mesajına yanıt geldi.' else 'Takip ettiğin sohbette yeni mesaj var.' end,'MessageCircle',
          jsonb_build_object('event','community_v2_message','actor_user_id',msg.author_id,'message_id',msg.id,'channel_id',msg.channel_id,'server_id',s,
            'url','/topluluk?sunucu='||s||'&kanal='||msg.channel_id||'&mesaj='||msg.id));
      if found then
        insert into community_v2.notification_cooldowns(user_id,channel_id,sent_at) values(member.user_id,msg.channel_id,now())
          on conflict(user_id,channel_id) do update set sent_at=excluded.sent_at;
        countv:=countv+1;
      end if;
    end loop;
    if batch<200 then delete from community_v2.delivery_queue where message_id=q.message_id;
    else update community_v2.delivery_queue set after_user=q.after_user where message_id=q.message_id; end if;
    exit when clock_timestamp()-started>interval '3 seconds';
  end loop;
  insert into community_v2.operation_runs(job,last_success_at,processed,duration_ms,error_code)
    values('notifications',now(),countv,extract(milliseconds from clock_timestamp()-started)::integer,null)
    on conflict(job) do update set last_success_at=excluded.last_success_at,processed=operation_runs.processed+excluded.processed,duration_ms=excluded.duration_ms,error_code=null;
  return countv;
exception when others then
  insert into community_v2.operation_runs(job,last_failure_at,error_code) values('notifications',now(),sqlstate)
    on conflict(job) do update set last_failure_at=excluded.last_failure_at,error_code=excluded.error_code;
  return -1;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.emit(s uuid, c uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not community_v2.enabled() then return; end if;
  if c is not null then
    perform realtime.send('{}'::jsonb,'refresh','community-v2:channel:'||c,true);
  end if;
  perform realtime.send('{}'::jsonb,'refresh','community-v2:server:'||s,true);
end $function$;

CREATE OR REPLACE FUNCTION community_v2.emit_activity(s uuid, c uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not community_v2.enabled() then return; end if;
  perform realtime.send('{}'::jsonb,'refresh','community-v2:channel:'||c,true);
  perform realtime.send('{"scope":"activity"}'::jsonb,'refresh','community-v2:server:'||s,true);
end $function$;

CREATE OR REPLACE FUNCTION community_v2.enqueue_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not community_v2.enabled() then return new; end if;
  insert into community_v2.delivery_queue(message_id,mentions,reply_author)
    values(new.id,new.mentions,(select author_id from community_v2.messages where id=new.reply_to)) on conflict do nothing;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.follow_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s uuid;
begin
  if not community_v2.enabled() then return new; end if;
  if coalesce((select auto_join from community_v2.preferences where user_id=new.user_id),true) then
    for s in select id from community_v2.servers where fansub_id=new.fansub_id order by id loop
      perform community_v2.try_auto_join(s,new.user_id);
    end loop;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.operations_api(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=public.current_public_user_id(); cfg community_v2.operations_config;
begin
  if u is null or not public.is_admin() then raise exception 'Site yöneticisi izni gerekli.' using errcode='42501'; end if;
  if p_action='save' then
    select * into cfg from community_v2.operations_config where id for update;
    if cfg.version is distinct from (p->>'version')::integer then raise exception 'Ayarlar değişti. Yeniden aç.'; end if;
    update community_v2.operations_config set rooms_per_owner=(p->>'rooms_per_owner')::integer,
      members_per_server=(p->>'members_per_server')::integer,storage_bytes_per_server=(p->>'storage_bytes_per_server')::bigint,
      joins_per_minute=(p->>'joins_per_minute')::integer,version=version+1 where id;
  elsif p_action<>'status' then raise exception 'Bilinmeyen işletim işlemi.'; end if;
  return jsonb_build_object('enabled',community_v2.enabled(),'config',(select to_jsonb(c)-'id' from community_v2.operations_config c where id),
    'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from community_v2.operation_runs j),'[]'::jsonb),
    'queued',(select count(*) from community_v2.delivery_queue),
    'oldest_queued_at',(select min(created_at) from community_v2.delivery_queue),
    'pending_reports',(select count(*) from community_v2.message_reports where status='open'),
    'servers',(select count(*) from community_v2.servers));
end $function$;

CREATE OR REPLACE FUNCTION community_v2.reconcile()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f uuid; n integer:=0;
begin
  if not community_v2.enabled() then return 0; end if;
  if not exists(select 1 from public.feature_flags where key='community.servers_auto_create' and is_enabled and rollout_percent=100) then return 0; end if;
  for f in select fs.id from public.fansubs fs where fs.is_active
    and not exists(select 1 from community_v2.servers v where v.fansub_id=fs.id)
    and (select count(*) from public.fansub_members m where m.fansub_id=fs.id and m.role='admin')=1
    and exists(select 1 from public.fansub_members m join public.users u on u.id=m.user_id
      where m.fansub_id=fs.id and m.role='admin' and u.is_active and not u.is_banned)
    order by fs.id limit 25 loop
    if community_v2.create_server(f,null,true) is not null then n:=n+1; end if;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION community_v2.series_channels(m uuid, offn integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid;
begin
  if not community_v2.enabled() then return '[]'::jsonb; end if;
  if auth.uid() is not null then u:=community_v2.actor(); end if;
  if not exists(select 1 from public.mangas where id=m and is_active and is_approved)
    or not community_v2.series_audience(m,u) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select c.id as channel_id,c.server_id,c.name as channel_name,c.is_private,
      f.name as fansub_name,f.avatar_url,community_v2.is_member(c.server_id,u) as is_member
    from community_v2.channels c join community_v2.servers s on s.id=c.server_id
    join public.fansubs f on f.id=s.fansub_id
    where c.manga_id=m and community_v2.can_discover_channel(c.id,u)
    order by f.name,c.server_id limit 21 offset greatest(0,least(coalesce(offn,0),100000)))x),'[]'::jsonb);
end $function$;

-- Flag and job schedule change in the same transaction; a closed cron does not wake needlessly.
create or replace function community_v2.sync_launch_jobs()
returns trigger language plpgsql security definer set search_path='' as $$
declare j record; activev boolean:=community_v2.enabled();
begin
  if (tg_op='INSERT' and new.key<>'community.enabled')
    or (tg_op='DELETE' and old.key<>'community.enabled')
    or (tg_op='UPDATE' and new.key<>'community.enabled' and old.key<>'community.enabled') then return null; end if;
  for j in select jobid from cron.job where jobname in ('community-v2-server-policy','community-v2-notifications') loop
    perform cron.alter_job(j.jobid,active=>activev);
  end loop;
  return null;
end $$;
revoke all on function community_v2.sync_launch_jobs() from public,anon,authenticated;
create trigger community_launch_jobs
after insert or update or delete on public.feature_flags
for each row execute function community_v2.sync_launch_jobs();

-- Closes on first apply; maintenance and private media cleanup keep running.
do $$ declare j record; begin
  for j in select jobid from cron.job where jobname in ('community-v2-server-policy','community-v2-notifications') loop
    perform cron.alter_job(j.jobid,active=>false);
  end loop;
end $$;
notify pgrst,'reload schema';
