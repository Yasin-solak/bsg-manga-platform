-- Improves notification cost and queue fairness without changing the closed first launch policy.
alter table community_v2.delivery_queue add column last_served_at timestamptz not null default now();
create index community_delivery_fair_idx on community_v2.delivery_queue(last_served_at,created_at,message_id);

CREATE OR REPLACE FUNCTION community_v2.deliver_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q community_v2.delivery_queue; msg community_v2.messages; member record; s uuid;
  countv integer:=0; batch integer; flagged boolean; paused boolean; started timestamptz:=clock_timestamp();
begin
  if not community_v2.enabled() then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('community-delivery',0)) then return 0; end if;
  for q in select * from community_v2.delivery_queue order by last_served_at,created_at,message_id limit 25 for update skip locked loop
    exit when clock_timestamp()-started>=interval '3 seconds';
    select * into msg from community_v2.messages where id=q.message_id;
    select server_id into s from community_v2.channels where id=msg.channel_id;
    if msg.id is null or msg.deleted_at is not null or q.created_at<now()-interval '1 day' or not community_v2.server_active(s)
      or exists(select 1 from community_v2.servers where id=s and archived_at is not null) then
      delete from community_v2.delivery_queue where message_id=q.message_id; continue;
    end if;
    batch:=0; paused:=false;
    -- Limit the page before filtering: muted/blocked members must advance in the cursor too.
    for member in
      with candidates as materialized (
        select m.user_id from community_v2.members m where m.server_id=s and m.state='active'
          and m.joined_at<=q.created_at and (q.after_user is null or m.user_id>q.after_user)
          order by m.user_id limit 200
      )
      select m.user_id, (u.is_active and not u.is_banned) as eligible,
        case when sp.muted_until>now() or cp.muted_until>now() then 'off'
          else coalesce(nullif(cp.mode,'inherit'),nullif(sp.mode,'inherit'),p.notifications,'mentions') end as modev,
        cd.sent_at
      from candidates m
      left join public.users u on u.id=m.user_id
      left join community_v2.preferences p on p.user_id=m.user_id
      left join community_v2.notification_scopes sp on sp.user_id=m.user_id and sp.scope_id=s
      left join community_v2.notification_scopes cp on cp.user_id=m.user_id and cp.scope_id=msg.channel_id
      left join community_v2.notification_cooldowns cd on cd.user_id=m.user_id and cd.channel_id=msg.channel_id
      order by m.user_id
    loop
      -- If time runs out do not skip a recipient not yet handled; the next round continues from here.
      if clock_timestamp()-started>=interval '3 seconds' then paused:=true; exit; end if;
      batch:=batch+1; q.after_user:=member.user_id;
      if member.user_id=msg.author_id or member.eligible is distinct from true or member.modev='off'
        or member.sent_at>now()-interval '1 minute' then continue; end if;
      flagged:=coalesce(q.reply_author=member.user_id,false) or community_v2.mention_matches(q.mentions,s,member.user_id);
      if member.modev='mentions' and not flagged then continue; end if;
      -- Preferences only filter early; they do not replace the current access check.
      if community_v2.blocked(member.user_id,msg.author_id)
        or not community_v2.can_read(msg.channel_id,member.user_id) then continue; end if;
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
    if not paused and batch<200 then delete from community_v2.delivery_queue where message_id=q.message_id;
    else update community_v2.delivery_queue set after_user=q.after_user,last_served_at=clock_timestamp() where message_id=q.message_id; end if;
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

revoke all on function community_v2.deliver_notifications() from public,anon,authenticated;
