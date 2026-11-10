-- The report is read only from the admin narrow RPC; account states are as of query time.
create function announcement_internal.participants(aid uuid)
returns table(user_id uuid,username text,avatar text,active boolean,banned boolean,premium boolean,verified boolean,level integer,
 registered_at timestamptz,opened boolean,opens integer,clicks integer,links integer,response text,response_at timestamptz,
 claimed_at timestamptz,claimed_coins integer,last_activity timestamptz)
language sql stable security definer set search_path='' as $$
 with claims as (
  select r.user_id,r.redeemed_at,p.value from announcement_internal.reward_pools p
  join public.user_code_redemptions r on r.code_id=p.code_id where p.announcement_id=aid
 ), ids as (select r.user_id from announcement_internal.responses r where r.announcement_id=aid union select c.user_id from claims c)
 select u.id,u.username,u.avatar_url,coalesce(u.is_active,false),coalesce(u.is_banned,false),coalesce(u.premium_expires_at>now(),false),
  au.email_confirmed_at is not null,coalesce(s.level_number,1)::int,u.created_at,
  coalesce(r.open_count>0 or r.viewed_at<a.measurement_started_at,false),coalesce(r.open_count,0),coalesce(r.click_count,0),coalesce(r.link_count,0),
  r.response,r.responded_at,c.redeemed_at,coalesce(c.value,0),greatest(r.last_open_at,r.last_click_at,r.last_link_at,r.responded_at,r.viewed_at,c.redeemed_at)
 from ids join public.users u on u.id=ids.user_id
 join announcement_internal.entries a on a.id=aid
 left join announcement_internal.responses r on r.announcement_id=aid and r.user_id=u.id
 left join claims c on c.user_id=u.id left join auth.users au on au.id=u.auth_user_id left join public.user_level_snapshots s on s.user_id=u.id
$$;
revoke all on function announcement_internal.participants(uuid) from public,anon,authenticated;

create function announcement_internal.report(p_id uuid,p_days integer default 30,p_offset integer default 0,p_filter text default 'all',p_query text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a announcement_internal.entries; totals jsonb; segments jsonb; daily jsonb; options jsonb; accounts jsonb; n integer;
 first_day date; last_day date:=(now() at time zone 'Europe/Istanbul')::date; q text:=left(trim(coalesce(p_query,'')),80);
begin
 perform announcement_internal.require_admin();
 if p_days is null or p_days not in (7,30,90) or p_offset is null or p_offset<0 or p_offset>10000
  or p_filter is null or p_filter not in ('all','opened','clicked','responded','claimed','premium','banned') then raise exception 'Geçersiz rapor filtresi.'; end if;
 select * into a from announcement_internal.entries where id=p_id;
 if a.id is null then raise exception 'Duyuru bulunamadı.'; end if;
 select jsonb_build_object('accounts',count(*),'uniqueOpens',count(*) filter(where opened),'opens',coalesce(sum(opens),0),
  'clicks',coalesce(sum(clicks),0),'uniqueClicks',count(*) filter(where clicks>0),'links',coalesce(sum(links),0),'uniqueLinks',count(*) filter(where links>0),
  'responses',count(*) filter(where response is not null),'claims',count(*) filter(where claimed_at is not null),'coins',coalesce(sum(claimed_coins),0)),
  jsonb_build_object('active',count(*) filter(where active and not banned),'inactive',count(*) filter(where not active),
   'banned',count(*) filter(where banned),'premium',count(*) filter(where premium),'standard',count(*) filter(where not premium),
   'verified',count(*) filter(where verified),'unverified',count(*) filter(where not verified))
 into totals,segments from announcement_internal.participants(p_id);
 first_day:=last_day-(p_days-1);
 with events as (
  select day,sum(opens) opens,sum(clicks) clicks,sum(links) links from announcement_internal.engagement_daily
   where announcement_id=p_id and day between first_day and last_day group by day
 ), answers as (
  select (responded_at at time zone 'Europe/Istanbul')::date as day,count(*) amount from announcement_internal.responses
   where announcement_id=p_id and responded_at is not null group by 1
 ), claims as (
  select (r.redeemed_at at time zone 'Europe/Istanbul')::date as day,count(*) amount,sum(p.value) coins from announcement_internal.reward_pools p
   join public.user_code_redemptions r on r.code_id=p.code_id where p.announcement_id=p_id group by 1
 ), days as (select first_day+i as day from generate_series(0,p_days-1) i)
 select jsonb_agg(jsonb_build_object('day',d.day,'opens',coalesce(e.opens,0),'clicks',coalesce(e.clicks,0),'links',coalesce(e.links,0),
  'responses',coalesce(an.amount,0),'claims',coalesce(c.amount,0),'coins',coalesce(c.coins,0)) order by d.day)
 into daily from days d left join events e using(day) left join answers an using(day) left join claims c using(day);
 if a.action->>'type'='rsvp' then
  select jsonb_agg(jsonb_build_object('id',o->>'id','label',o->>'label','count',(select count(*) from announcement_internal.responses r where r.announcement_id=p_id and r.response=o->>'id')))
  into options from jsonb_array_elements(announcement_internal.invitation_options(a.action)) o;
 else options:='[]'; end if;
 with filtered as materialized (
  select * from announcement_internal.participants(p_id) p where (q='' or strpos(lower(p.username),lower(q))>0)
   and case p_filter when 'opened' then p.opened when 'clicked' then p.clicks>0 when 'responded' then p.response is not null
    when 'claimed' then p.claimed_at is not null when 'premium' then p.premium when 'banned' then p.banned else true end
 ), page as (select * from filtered order by last_activity desc nulls last,user_id offset p_offset limit 25)
 select (select count(*) from filtered),coalesce(jsonb_agg(to_jsonb(page) order by last_activity desc nulls last,user_id),'[]') into n,accounts from page;
 perform public.create_admin_audit_log('announcement.report','announcement',p_id::text,'Duyuru etkileşim raporu görüntülendi.',jsonb_build_object('days',p_days,'filter',p_filter,'offset',p_offset));
 return jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'measurementStartedAt',a.measurement_started_at,'generatedAt',now(),
  'totals',totals,'segments',segments,'daily',daily,'options',options,'accounts',accounts,'totalAccounts',n);
end $$;
create function public.announcement_admin_report(p_id uuid,p_days integer default 30,p_offset integer default 0,p_filter text default 'all',p_query text default '') returns jsonb
language sql security invoker set search_path='' as $$ select announcement_internal.report(p_id,p_days,p_offset,p_filter,p_query) $$;
revoke all on function announcement_internal.report(uuid,integer,integer,text,text),public.announcement_admin_report(uuid,integer,integer,text,text) from public,anon,authenticated;
grant execute on function announcement_internal.report(uuid,integer,integer,text,text),public.announcement_admin_report(uuid,integer,integer,text,text) to authenticated;
