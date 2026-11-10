-- Invite options are stored with fixed ids; the old two options and answers are kept.
alter table announcement_internal.responses drop constraint responses_response_check;
alter table announcement_internal.responses add constraint responses_response_check check(response in ('accepted','declined','option3','option4'));
alter table announcement_internal.entries add column measurement_started_at timestamptz not null default now();
alter table announcement_internal.responses
 add column open_count integer not null default 0 check(open_count>=0),
 add column click_count integer not null default 0 check(click_count>=0),
 add column link_count integer not null default 0 check(link_count>=0),
 add column last_open_at timestamptz, add column last_click_at timestamptz, add column last_link_at timestamptz;
create table announcement_internal.engagement_daily (
 announcement_id uuid not null references announcement_internal.entries(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 day date not null, opens integer not null default 0, clicks integer not null default 0, links integer not null default 0,
 primary key(announcement_id,day,user_id)
);
create index engagement_daily_user_idx on announcement_internal.engagement_daily(user_id);
alter table announcement_internal.engagement_daily enable row level security;
revoke all on announcement_internal.engagement_daily from public,anon,authenticated;

create function announcement_internal.invitation_options(v jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(v->'options','[{"id":"accepted","label":"Katılacağım"},{"id":"declined","label":"Katılamayacağım"}]'::jsonb)
$$;
create function announcement_internal.valid_invitation(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare o jsonb; ids text[]:='{}'; labels text[]:='{}'; opts jsonb;
begin
 if v->>'type'<>'rsvp' or (v-array['type','options'])<>'{}'::jsonb then return false; end if;
 opts:=announcement_internal.invitation_options(v);
 if jsonb_typeof(opts)<>'array' or jsonb_array_length(opts) not between 1 and 4 then return false; end if;
 for o in select value from jsonb_array_elements(opts) loop
  if jsonb_typeof(o)<>'object' or (o-array['id','label'])<>'{}'::jsonb or coalesce(o->>'id','') not in ('accepted','declined','option3','option4')
   or jsonb_typeof(o->'label') is distinct from 'string' or length(trim(o->>'label')) not between 1 and 60
   or o->>'id'=any(ids) or lower(trim(o->>'label'))=any(labels) then return false; end if;
  ids:=array_append(ids,o->>'id'); labels:=array_append(labels,lower(trim(o->>'label')));
 end loop;
 return true;
exception when others then return false;
end $$;

-- Announcement/account/day totals instead of raw browsing history; fast repeats do not inflate the counter.
create function announcement_internal.track(a announcement_internal.entries,uid uuid,event text) returns void
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); r announcement_internal.responses; previous timestamptz;
begin
 insert into announcement_internal.responses(announcement_id,user_id) values(a.id,uid) on conflict do nothing;
 select * into r from announcement_internal.responses where announcement_id=a.id and user_id=uid for update;
 previous:=case event when 'view' then r.last_open_at when 'click' then r.last_click_at else r.last_link_at end;
 if previous is not null and stamp-previous<interval '5 seconds' then return; end if;
 update announcement_internal.responses set
  open_count=open_count+case when event='view' then 1 else 0 end,
  click_count=click_count+case when event='click' then 1 else 0 end,
  link_count=link_count+case when event='link' then 1 else 0 end,
  last_open_at=case when event='view' then stamp else last_open_at end,
  last_click_at=case when event='click' then stamp else last_click_at end,
  last_link_at=case when event='link' then stamp else last_link_at end
 where announcement_id=a.id and user_id=uid;
 insert into announcement_internal.engagement_daily as d(announcement_id,user_id,day,opens,clicks,links)
 values(a.id,uid,(stamp at time zone 'Europe/Istanbul')::date,(event='view')::int,(event='click')::int,(event='link')::int)
 on conflict(announcement_id,day,user_id) do update set opens=d.opens+excluded.opens,clicks=d.clicks+excluded.clicks,links=d.links+excluded.links;
end $$;
revoke all on function announcement_internal.invitation_options(jsonb),announcement_internal.valid_invitation(jsonb),announcement_internal.track(announcement_internal.entries,uuid,text) from public,anon,authenticated;

create or replace function announcement_internal.valid_conditions(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare c jsonb; seen text[]:='{}'; t text;
begin
 if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v)>13 then return false; end if;
 for c in select value from jsonb_array_elements(v) loop
  t:=c->>'type';
  if t is null or t=any(seen) then return false; end if;
  seen:=array_append(seen,t);
  if t in ('verified_email','premium','profile_completed') then
   if c<>jsonb_build_object('type',t) then return false; end if;
  elsif t='account_age' then
   if not c ? 'days' or (c-array['type','days'])<>'{}'::jsonb or jsonb_typeof(c->'days')<>'number'
    or c->>'days' !~ '^[0-9]+$' or (c->>'days')::int not between 1 and 3650 then return false; end if;
  elsif t in ('read_chapters','follow_manga_count','follow_fansub_count','level','claimed_quests') then
   if (c-array['type','count'])<>'{}'::jsonb or jsonb_typeof(c->'count') is distinct from 'number'
    or c->>'count' !~ '^[0-9]+$' or (c->>'count')::int not between 1 and (case when t='level' then 10 else 100000 end) then return false; end if;
  elsif t='read_manga' then
   if (c-array['type','id','count'])<>'{}'::jsonb or (c->>'id')::uuid is null or jsonb_typeof(c->'count') is distinct from 'number'
    or c->>'count' !~ '^[0-9]+$' or (c->>'count')::int not between 1 and 100000 then return false; end if;
  elsif t in ('follow_manga','follow_fansub','fansub_member') then
   if not c ? 'id' or (c-array['type','id'])<>'{}'::jsonb or (c->>'id')::uuid is null then return false; end if;
  else return false;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;

-- Only the acting account condition result returns; email or account dates do not leave.
create or replace function announcement_internal.condition_result(v jsonb, uid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; items jsonb:='[]'; met boolean; label text; ref jsonb; result jsonb; eligible boolean:=uid is not null;
begin
 for c in select value from jsonb_array_elements(v) loop
  met:=false; ref:=null;
  case c->>'type'
   when 'verified_email' then
    label:='E-posta adresini doğrula';
    select exists(select 1 from public.users u join auth.users au on au.id=u.auth_user_id where u.id=uid and au.email_confirmed_at is not null) into met;
   when 'account_age' then
    label:='Hesabın en az '||(c->>'days')||' günlük olsun';
    select exists(select 1 from public.users u join auth.users au on au.id=u.auth_user_id where u.id=uid and au.created_at<=now()-make_interval(days=>(c->>'days')::int)) into met;
   when 'premium' then
    label:='Aktif Premium üyeliğin olsun';
    select exists(select 1 from public.users u where u.id=uid and u.premium_expires_at>now()) into met;
   when 'follow_manga' then
    ref:=announcement_internal.reference('manga',(c->>'id')::uuid);
    label:=coalesce(ref->>'title','Erişilemeyen seri')||' serisini takip et';
    select ref is not null and exists(select 1 from public.manga_follows f where f.user_id=uid and f.manga_id=(c->>'id')::uuid) into met;
   when 'follow_fansub' then
    ref:=announcement_internal.reference('fansub',(c->>'id')::uuid);
    label:=coalesce(ref->>'title','Erişilemeyen fansub')||' fansubunu takip et';
    select ref is not null and exists(select 1 from public.fansub_follows f where f.user_id=uid and f.fansub_id=(c->>'id')::uuid) into met;
   else label:='Geçersiz kazanım şartı';
  end case;
  met:=coalesce(met,false); eligible:=eligible and met;
  result:=jsonb_build_object('type',c->>'type','label',label,'met',met);
  if ref is not null then result:=result||jsonb_build_object('href',ref->>'href'); end if;
  items:=items||jsonb_build_array(result);
 end loop;
 return jsonb_build_object('eligible',eligible,'conditions',items);
end $$;
revoke all on function announcement_internal.valid_conditions(jsonb),announcement_internal.condition_result(jsonb,uuid) from public,anon,authenticated;


create or replace function announcement_internal.visible(a announcement_internal.entries, uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select a.deleted_at is null and a.status='published' and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) and
 (a.audience='all' or (uid is not null and (a.audience='members'
 or (a.audience='premium' and exists(select 1 from public.users u where u.id=uid and u.premium_expires_at>now()))
 or (a.audience='selected' and exists(select 1 from announcement_internal.recipients r where r.announcement_id=a.id and r.user_id=uid)))))
$$;
create or replace function announcement_internal.condition_result(v jsonb, uid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; items jsonb:='[]'; met boolean; label text; ref jsonb; result jsonb; eligible boolean:=uid is not null; n integer; target integer;
begin
 for c in select value from jsonb_array_elements(v) loop
  met:=false; ref:=null; n:=null; target:=null;
  case c->>'type'
   when 'verified_email' then
    label:='E-posta adresini doğrula';
    select exists(select 1 from public.users u join auth.users au on au.id=u.auth_user_id where u.id=uid and au.email_confirmed_at is not null) into met;
   when 'account_age' then
    label:='Hesabın en az '||(c->>'days')||' günlük olsun';
    select exists(select 1 from public.users u join auth.users au on au.id=u.auth_user_id where u.id=uid and au.created_at<=now()-make_interval(days=>(c->>'days')::int)) into met;
   when 'premium' then
    label:='Aktif Premium üyeliğin olsun';
    select exists(select 1 from public.users u where u.id=uid and u.premium_expires_at>now()) into met;
   when 'follow_manga' then
    ref:=announcement_internal.reference('manga',(c->>'id')::uuid);
    label:=coalesce(ref->>'title','Erişilemeyen seri')||' serisini takip et';
    select ref is not null and exists(select 1 from public.manga_follows f where f.user_id=uid and f.manga_id=(c->>'id')::uuid) into met;
   when 'follow_fansub' then
    ref:=announcement_internal.reference('fansub',(c->>'id')::uuid);
    label:=coalesce(ref->>'title','Erişilemeyen fansub')||' fansubunu takip et';
    select ref is not null and exists(select 1 from public.fansub_follows f where f.user_id=uid and f.fansub_id=(c->>'id')::uuid) into met;
   when 'profile_completed' then
    label:='Profil kurulumunu tamamla';
    select exists(select 1 from public.users where id=uid and onboarding_completed_at is not null) into met;
   when 'level' then
    target:=(c->>'count')::int; label:='En az '||target||'. seviyeye ulaş';
    select coalesce((select level_number from public.user_level_snapshots where user_id=uid),1) into n; met:=uid is not null and n>=target;
   when 'read_chapters', 'read_manga' then
    target:=(c->>'count')::int;
    if c->>'type'='read_manga' then ref:=announcement_internal.reference('manga',(c->>'id')::uuid); end if;
    label:=case when c->>'type'='read_manga' then coalesce(ref->>'title','Erişilemeyen seri')||' serisinden ' else '' end||'en az '||target||' farklı bölüm oku';
    select count(*) into n from (select 1 from public.manga_read_trackers t
     where t.reader_key='user:'||uid::text and t.chapter_ref like 'chapter:%'
      and (c->>'type'='read_chapters' or t.manga_id=(c->>'id')::uuid) limit target) x;
    met:=n>=target and (c->>'type'='read_chapters' or ref is not null);
   when 'follow_manga_count' then
    target:=(c->>'count')::int; label:='En az '||target||' seri takip et';
    select count(*) into n from (select 1 from public.manga_follows f join public.mangas m on m.id=f.manga_id where f.user_id=uid and m.is_active and m.is_approved limit target) x; met:=n>=target;
   when 'follow_fansub_count' then
    target:=(c->>'count')::int; label:='En az '||target||' fansub takip et';
    select count(*) into n from (select 1 from public.fansub_follows f join public.fansubs s on s.id=f.fansub_id where f.user_id=uid and s.is_active limit target) x; met:=n>=target;
   when 'fansub_member' then
    ref:=announcement_internal.reference('fansub',(c->>'id')::uuid); label:=coalesce(ref->>'title','Erişilemeyen fansub')||' ekibine üye ol';
    select ref is not null and exists(select 1 from public.fansub_members f where f.user_id=uid and f.fansub_id=(c->>'id')::uuid) into met;
   when 'claimed_quests' then
    target:=(c->>'count')::int; label:='En az '||target||' görev ödülünü al';
    select count(*) into n from (select 1 from public.quest_progress p where p.subject_type='user' and p.subject_id=uid and p.claimed_at is not null limit target) x; met:=n>=target;
   else label:='Geçersiz kazanım şartı';
  end case;
  met:=coalesce(met,false); eligible:=eligible and met;
  result:=jsonb_build_object('type',c->>'type','label',label,'met',met);
  if ref is not null then result:=result||jsonb_build_object('href',ref->>'href'); end if;
  if n is not null then result:=result||jsonb_build_object('current',n,'target',target); end if;
  items:=items||jsonb_build_array(result);
 end loop;
 return jsonb_build_object('eligible',eligible,'conditions',items);
end $$;
revoke all on function announcement_internal.valid_conditions(jsonb),announcement_internal.condition_result(jsonb,uuid) from public,anon,authenticated;


create or replace function announcement_internal.visible(a announcement_internal.entries, uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select a.deleted_at is null and a.status='published' and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) and
 (a.audience='all' or (uid is not null and (a.audience='members'
 or (a.audience='premium' and exists(select 1 from public.users u where u.id=uid and u.premium_expires_at>now()))
 or (a.audience='selected' and exists(select 1 from announcement_internal.recipients r where r.announcement_id=a.id and r.user_id=uid)))))
$$;
create or replace function announcement_internal.render(a announcement_internal.entries, uid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare refs jsonb:='{}'; b jsonb; m text[]; ref jsonb; pool jsonb; reply text;
begin
 for b in select value from jsonb_array_elements(a.document) loop
  if b->>'type'='reference' then
   ref:=announcement_internal.reference(b->>'kind',(b->>'id')::uuid);
   refs:=refs||jsonb_build_object((b->>'kind')||':'||(b->>'id'),ref);
  elsif b->>'type'='text' then
   for m in select regexp_matches(b->>'text','@\[(user|fansub):([0-9a-fA-F-]{36})\]','g') loop
    begin
     ref:=announcement_internal.reference(m[1],m[2]::uuid);
     refs:=refs||jsonb_build_object(m[1]||':'||m[2],ref);
    exception when invalid_text_representation then null;
    end;
   end loop;
  end if;
 end loop;
 for b in select value from jsonb_array_elements(coalesce(a.action->'conditions','[]'::jsonb)) loop
  if b->>'type' in ('follow_manga','follow_fansub','read_manga','fansub_member') then
   ref:=announcement_internal.reference(case when b->>'type' in ('follow_manga','read_manga') then 'manga' else 'fansub' end,(b->>'id')::uuid);
   refs:=refs||jsonb_build_object((case when b->>'type' in ('follow_manga','read_manga') then 'manga' else 'fansub' end)||':'||(b->>'id'),ref);
  end if;
 end loop;
 select jsonb_build_object('value',p.value,'remaining',greatest(0,c.max_uses-c.used_count),
  'available',c.is_active and (c.expires_at is null or c.expires_at>now()) and public.is_feature_enabled('economy.coin_codes',false),
  'claimed',exists(select 1 from public.user_code_redemptions x where x.code_id=p.code_id and x.user_id=uid)) into pool
 from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=a.id;
 if pool is not null then pool:=pool||announcement_internal.condition_result(coalesce(a.action->'conditions','[]'::jsonb),uid); end if;
 select response into reply from announcement_internal.responses where announcement_id=a.id and user_id=uid;
 return jsonb_build_object('id',a.id,'title',a.title,'document',a.document,'kind',a.kind,'startsAt',a.starts_at,'endsAt',a.ends_at,
 'priority',a.priority,'action',a.action,'references',refs,'reward',pool,'response',reply,'revision',a.revision);
end $$;
create or replace function announcement_internal.admin_save(p_id uuid,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=announcement_internal.require_admin(); a announcement_internal.entries; old announcement_internal.entries;
 ids uuid[]; act jsonb; codes jsonb; value integer; max_claims integer;
begin
 if p_id is null or p_revision is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>50000 then raise exception 'Geçersiz duyuru.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,917));
 select * into old from announcement_internal.entries where id=p_id for update;
 if (old.id is null and p_revision<>0) or (old.id is not null and old.revision<>p_revision) then
  raise exception 'Duyuru başka bir işlemde değişti. Listeyi yenileyip tekrar aç.' using errcode='40001';
 end if;
 if old.deleted_at is not null then raise exception 'Önce duyuruyu çöp kutusundan geri al.'; end if;
 if not p_data ?& array['title','document','kind','status','audience','startsAt','priority','showHome','action','recipients']
 or (p_data-array['title','document','kind','status','audience','startsAt','endsAt','priority','showHome','action','recipients'])<>'{}'::jsonb then raise exception 'Duyuru alanları eksik veya geçersiz.'; end if;
 if not announcement_internal.valid_document(p_data->'document') then raise exception 'İçerik geçersiz; en fazla 24 blok ve blok başına 4000 karakter kullan.'; end if;
 if jsonb_typeof(p_data->'recipients')<>'array' or jsonb_array_length(p_data->'recipients')>100 then raise exception 'En fazla 100 özel alıcı seçebilirsin.'; end if;
 select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into ids from jsonb_array_elements_text(p_data->'recipients') x;
 if (p_data->>'audience'='selected')<>(cardinality(ids)>0) then raise exception 'Özel hedef kitle için en az bir alıcı seç; diğer kitlelerde özel alıcı kullanma.'; end if;
 if exists(select 1 from unnest(ids) i where not exists(select 1 from public.users u where u.id=i and u.is_active and not coalesce(u.is_banned,false))) then raise exception 'Bir alıcı artık aktif değil.'; end if;
 act:=p_data->'action';
 if act->>'type'='none' then
  if act<>'{"type":"none"}'::jsonb then raise exception 'Geçersiz işlem.'; end if;
 elsif act->>'type'='link' then
  if (act-array['type','url','label','direct'])<>'{}'::jsonb or (act ? 'direct' and jsonb_typeof(act->'direct')<>'boolean') or not announcement_internal.safe_url(act->>'url') or coalesce(length(trim(act->>'label')),0) not between 1 and 60 then raise exception 'Geçerli bağlantı ve düğme adı gerekli.'; end if;
 elsif act->>'type'='reward' then
  value:=(act->>'value')::integer; max_claims:=(act->>'maxClaims')::integer;
  if (act-array['type','value','maxClaims','conditions'])<>'{}'::jsonb or value is null or max_claims is null or value not between 1 and 10000 or max_claims not between 1 and 100000 or value::bigint*max_claims>100000000
    or p_data->>'kind'<>'reward' or p_data->>'endsAt' is null then raise exception 'Ödül için bitiş tarihi, 1–10000 coin ve toplam dağıtım sınırı gerekli (en fazla 100 milyon coin).'; end if;
 if not announcement_internal.valid_conditions(coalesce(act->'conditions','[]'::jsonb)) then raise exception 'Kazanım şartları geçersiz.'; end if;
 elsif act->>'type'='rsvp' then
  if not announcement_internal.valid_invitation(act) or p_data->>'kind'<>'invitation' or p_data->>'endsAt' is null then raise exception 'Davet için bitiş tarihi gerekli.'; end if;
 else raise exception 'Geçersiz işlem türü.';
 end if;
 if (p_data->>'kind'='reward')<>(act->>'type'='reward') or (p_data->>'kind'='invitation')<>(act->>'type'='rsvp') then raise exception 'Duyuru türü ile işlem uyuşmuyor.'; end if;
 if exists(select 1 from announcement_internal.reward_pools where announcement_id=p_id) and
  ((act-'conditions')<>(old.action-'conditions') or (p_data->>'endsAt')::timestamptz is distinct from old.ends_at
  or (coalesce(act->'conditions','[]'::jsonb)<>coalesce(old.action->'conditions','[]'::jsonb) and exists(
    select 1 from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=p_id and c.used_count>0))) then
  raise exception 'Yayımlanmış ödülün miktarı ve bitişi; ilk kazanımdan sonra da şartları değiştirilemez. Yeni bir ödül duyurusu oluştur.';
 end if;
 -- Changing the action type later cannot reset previously given answers or rewards.
 if old.id is not null and exists(select 1 from announcement_internal.responses where announcement_id=p_id and response is not null) and act<>old.action then raise exception 'Yanıt alınmış davetin işlemi değiştirilemez.'; end if;
 insert into announcement_internal.entries(id,title,document,kind,status,audience,starts_at,ends_at,priority,show_home,action,created_by,updated_by)
 values(p_id,trim(p_data->>'title'),p_data->'document',p_data->>'kind',p_data->>'status',p_data->>'audience',(p_data->>'startsAt')::timestamptz,
 nullif(p_data->>'endsAt','')::timestamptz,(p_data->>'priority')::integer,(p_data->>'showHome')::boolean,act,uid,uid)
 on conflict(id) do update set title=excluded.title,document=excluded.document,kind=excluded.kind,status=excluded.status,audience=excluded.audience,
 starts_at=excluded.starts_at,ends_at=excluded.ends_at,priority=excluded.priority,show_home=excluded.show_home,action=excluded.action,
 updated_by=uid,updated_at=now(),revision=announcement_internal.entries.revision+1 returning * into a;
 delete from announcement_internal.recipients where announcement_id=p_id and user_id<>all(ids);
 insert into announcement_internal.recipients select p_id,unnest(ids) on conflict do nothing;
 if a.status='published' and act->>'type'='reward' and not exists(select 1 from announcement_internal.reward_pools where announcement_id=p_id) then
  codes:=app_private.create_admin_coin_code_batch(value,1,max_claims,'user',a.ends_at,'DUYURU',left(a.title,80),'Duyuru ödülü','Duyuru: '||a.id::text);
  insert into announcement_internal.reward_pools values(p_id,(codes->0->>'id')::uuid,value,max_claims);
 end if;
 insert into announcement_internal.history(announcement_id,revision,snapshot,actor_id) values(a.id,a.revision,to_jsonb(a)||jsonb_build_object('recipients',to_jsonb(ids)),uid);
 perform public.create_admin_audit_log('announcement.save','announcement',a.id::text,'Duyuru kaydedildi.',jsonb_build_object('status',a.status,'revision',a.revision));
 return announcement_internal.admin_row(a);
end $$;
create or replace function announcement_internal.respond(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.current_public_user_id(); a announcement_internal.entries; code text; result jsonb; claimed boolean; amount integer; prior text;
begin
 if uid is null then raise exception 'Devam etmek için giriş yap.' using errcode='42501'; end if;
 if p_action in ('view','click','link') then
  select * into a from announcement_internal.entries where id=p_id;
 else
  select * into a from announcement_internal.entries where id=p_id for update;
 end if;
 if a.id is null or not announcement_internal.visible(a,uid) then raise exception 'Duyuru sona erdi veya bu hesaba açık değil.' using errcode='42501'; end if;
 if p_action in ('view','click','link') then
  if p_action='link' and a.action->>'type'<>'link' then raise exception 'Bu duyurunun bağlantı eylemi yok.'; end if;
  perform announcement_internal.track(a,uid,p_action);
  return jsonb_build_object('success',true);
 elsif p_action='claim' and a.action->>'type'='reward' then
  select c.code,p.value,exists(select 1 from public.user_code_redemptions x where x.code_id=c.id and x.user_id=uid) into code,amount,claimed
  from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=p_id;
  if code is null then raise exception 'Ödül henüz hazır değil.'; end if;
  if claimed then return jsonb_build_object('success',true,'alreadyClaimed',true); end if;
  if not (announcement_internal.condition_result(coalesce(a.action->'conditions','[]'::jsonb),uid)->>'eligible')::boolean then
   raise exception 'Ödülü almak için kazanım şartlarının tamamını yerine getir.';
  end if;
  insert into announcement_internal.wallet_permits values(txid_current(),uid,amount);
  result:=app_private.redeem_coin_code(code,'user',null);
  if exists(select 1 from announcement_internal.wallet_permits where transaction_id=txid_current() and user_id=uid) then raise exception 'Ödül bakiyeye işlenemedi.'; end if;
  return (result-array['code','code_id'])||jsonb_build_object('alreadyClaimed',false);
 elsif p_action in ('accepted','declined','option3','option4') and a.action->>'type'='rsvp' then
  if not exists(select 1 from jsonb_array_elements(announcement_internal.invitation_options(a.action)) o where o->>'id'=p_action) then raise exception 'Bu davette böyle bir seçenek yok.'; end if;
  select response into prior from announcement_internal.responses where announcement_id=p_id and user_id=uid;
  if prior is not null and prior<>p_action then raise exception 'İlk yanıtın kaydedildi; daha sonra değiştirilemez.' using errcode='40001'; end if;
  if prior is null then
   insert into announcement_internal.responses(announcement_id,user_id,response,responded_at) values(p_id,uid,p_action,clock_timestamp())
   on conflict(announcement_id,user_id) do update set response=excluded.response,responded_at=excluded.responded_at;
  end if;
  return jsonb_build_object('success',true,'response',p_action,'alreadyResponded',prior is not null);
 end if;
 raise exception 'Bu duyuru için geçersiz işlem.';
end $$;
create or replace function announcement_internal.admin_row(a announcement_internal.entries) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(a)-'legacy_id' || jsonb_build_object(
  'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.user_id,'title','@'||u.username,'kind','user','href','/profil/'||u.username))
   from announcement_internal.recipients r join public.users u on u.id=r.user_id where r.announcement_id=a.id),'[]'::jsonb),
  'views',(select count(*) from announcement_internal.responses where announcement_id=a.id and (open_count>0 or viewed_at<a.measurement_started_at)),
  'clicks',coalesce((select sum(click_count) from announcement_internal.responses where announcement_id=a.id),0),
  'linkClicks',coalesce((select sum(link_count) from announcement_internal.responses where announcement_id=a.id),0),
  'responseCount',(select count(*) from announcement_internal.responses where announcement_id=a.id and response is not null),
  'accepted',(select count(*) from announcement_internal.responses where announcement_id=a.id and response='accepted'),
  'declined',(select count(*) from announcement_internal.responses where announcement_id=a.id and response='declined'),
  'claims',coalesce((select c.used_count from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=a.id),0),
  'rewardLocked',exists(select 1 from announcement_internal.reward_pools p where p.announcement_id=a.id),
  'preview',announcement_internal.render(a,app_private.current_public_user_id()))
$$;
