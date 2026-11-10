create table community_v2.delivery_queue (
  message_id uuid primary key references community_v2.messages(id) on delete cascade,
  mentions jsonb not null,
  reply_author uuid,
  after_user uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index delivery_queue_created_idx on community_v2.delivery_queue(created_at,message_id);
create table community_v2.notification_cooldowns (
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id uuid not null references community_v2.channels(id) on delete cascade,
  sent_at timestamptz not null,
  primary key(user_id,channel_id)
);
create index notification_cooldowns_channel_idx on community_v2.notification_cooldowns(channel_id);
create table community_v2.operation_runs (
  job text primary key,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  error_code text,
  processed bigint not null default 0,
  duration_ms integer
);
alter table community_v2.delivery_queue enable row level security;
alter table community_v2.notification_cooldowns enable row level security;
alter table community_v2.operation_runs enable row level security;
revoke all on community_v2.delivery_queue,community_v2.notification_cooldowns,community_v2.operation_runs from public,anon,authenticated;

create or replace function community_v2.notification_mode(u uuid,s uuid,c uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when sp.muted_until>now() or cp.muted_until>now() then 'off'
    else coalesce(nullif(cp.mode,'inherit'),nullif(sp.mode,'inherit'),p.notifications,'mentions') end
  from (select 1)x left join community_v2.preferences p on p.user_id=u
  left join community_v2.notification_scopes sp on sp.user_id=u and sp.scope_id=s
  left join community_v2.notification_scopes cp on cp.user_id=u and cp.scope_id=c;
$$;
create or replace function community_v2.enqueue_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into community_v2.delivery_queue(message_id,mentions,reply_author)
    values(new.id,new.mentions,(select author_id from community_v2.messages where id=new.reply_to)) on conflict do nothing;
  return new;
end $$;
create trigger community_message_notification after insert on community_v2.messages for each row execute function community_v2.enqueue_notification();

-- Each job does a bounded fan-out; queue content or private message bodies do not go to push.
create or replace function community_v2.deliver_notifications() returns integer
language plpgsql security definer set search_path='' as $$
declare q community_v2.delivery_queue; msg community_v2.messages; member record; s uuid; modev text;
  countv integer:=0; batch integer; flagged boolean; started timestamptz:=clock_timestamp();
begin
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
end $$;

create or replace function community_v2.maintenance() returns integer
language plpgsql security definer set search_path='' as $$
declare cfg community_v2.operations_config; countv integer:=0; n integer; started timestamptz:=clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(hashtextextended('community-maintenance',0)) then return 0; end if;
  select * into cfg from community_v2.operations_config where id;
  delete from community_v2.presence where (channel_id,user_id) in (select channel_id,user_id from community_v2.presence where seen_at<now()-interval '2 minutes' limit 5000);
  get diagnostics n=row_count; countv:=countv+n;
  delete from community_v2.invites where id in (select id from community_v2.invites where coalesce(revoked_at,expires_at)<now()-make_interval(days=>cfg.expired_invite_days) limit 1000);
  get diagnostics n=row_count; countv:=countv+n;
  delete from community_v2.message_reports where id in (select id from community_v2.message_reports where coalesce(reviewed_at,created_at)<now()-make_interval(days=>cfg.report_days) limit 1000);
  get diagnostics n=row_count; countv:=countv+n;
  delete from community_v2.audit where id in (select id from community_v2.audit where created_at<now()-make_interval(days=>cfg.audit_days) limit 1000);
  get diagnostics n=row_count; countv:=countv+n;
  delete from community_v2.notification_cooldowns where (user_id,channel_id) in (select user_id,channel_id from community_v2.notification_cooldowns where sent_at<now()-interval '1 day' limit 5000);
  delete from community_v2.join_requests where created_at<now()-interval '90 days';
  update community_v2.servers set transfer_to=null,transfer_until=null,version=version+1 where transfer_until<now();
  insert into community_v2.operation_runs(job,last_success_at,processed,duration_ms,error_code)
    values('maintenance',now(),countv,extract(milliseconds from clock_timestamp()-started)::integer,null)
    on conflict(job) do update set last_success_at=excluded.last_success_at,processed=operation_runs.processed+excluded.processed,duration_ms=excluded.duration_ms,error_code=null;
  return countv;
exception when others then
  insert into community_v2.operation_runs(job,last_failure_at,error_code) values('maintenance',now(),sqlstate)
    on conflict(job) do update set last_failure_at=excluded.last_failure_at,error_code=excluded.error_code;
  return -1;
end $$;

create or replace function community_v2.operations_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); cfg community_v2.operations_config;
begin
  if not public.is_admin() then raise exception 'Site yöneticisi izni gerekli.' using errcode='42501'; end if;
  if p_action='save' then
    select * into cfg from community_v2.operations_config where id for update;
    if cfg.version is distinct from (p->>'version')::integer then raise exception 'Ayarlar değişti. Yeniden aç.'; end if;
    update community_v2.operations_config set rooms_per_owner=(p->>'rooms_per_owner')::integer,
      members_per_server=(p->>'members_per_server')::integer,storage_bytes_per_server=(p->>'storage_bytes_per_server')::bigint,
      joins_per_minute=(p->>'joins_per_minute')::integer,version=version+1 where id;
  elsif p_action<>'status' then raise exception 'Bilinmeyen işletim işlemi.'; end if;
  return jsonb_build_object('config',(select to_jsonb(c)-'id' from community_v2.operations_config c where id),
    'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from community_v2.operation_runs j),'[]'::jsonb),
    'queued',(select count(*) from community_v2.delivery_queue),
    'oldest_queued_at',(select min(created_at) from community_v2.delivery_queue),
    'pending_reports',(select count(*) from community_v2.message_reports where status='open'),
    'servers',(select count(*) from community_v2.servers));
end $$;
create or replace function public.community_v2_operations(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select community_v2.operations_api(p_action,p_payload)$$;
revoke all on function community_v2.notification_mode(uuid,uuid,uuid),community_v2.enqueue_notification(),community_v2.deliver_notifications(),community_v2.maintenance(),community_v2.operations_api(text,jsonb),public.community_v2_operations(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.operations_api(text,jsonb),public.community_v2_operations(text,jsonb) to authenticated;
select cron.schedule('community-v2-notifications','10 seconds','select community_v2.deliver_notifications()');
select cron.schedule('community-v2-maintenance','* * * * *','select community_v2.maintenance()');
notify pgrst,'reload schema';
