-- Announcements are independent of community posts. Private recipients and reward codes do not open to the API.
create schema announcement_internal;
revoke all on schema announcement_internal from public, anon, authenticated;
grant usage on schema announcement_internal to anon, authenticated;

create function announcement_internal.safe_url(v text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(length(v) between 1 and 2048 and v !~ '[[:space:]\\]' and
   (v ~ '^/[a-zA-Z0-9]' or v ~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+([/:?#]|$)'), false)
$$;
create function announcement_internal.valid_document(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare b jsonb;
begin
 if v is null or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) not between 1 and 24 or pg_column_size(v)>40000 then return false; end if;
 for b in select value from jsonb_array_elements(v) loop
  if b->>'type'='text' then
   if not b ? 'text' or (b-array['type','text','highlight'])<>'{}'::jsonb or jsonb_typeof(b->'text')<>'string' or length(b->>'text') not between 1 and 4000
      or (b ? 'highlight' and jsonb_typeof(b->'highlight')<>'boolean') then return false; end if;
  elsif b->>'type'='reference' then
   if not b ?& array['kind','id'] or (b-array['type','kind','id'])<>'{}'::jsonb or b->>'kind' not in ('manga','post','list','user','fansub') or (b->>'id')::uuid is null then return false; end if;
  elsif b->>'type'='image' then
   if not b ?& array['url','alt'] or (b-array['type','url','alt'])<>'{}'::jsonb or not announcement_internal.safe_url(b->>'url') or b->>'url' not like 'https://%'
     or jsonb_typeof(b->'alt')<>'string' or length(b->>'alt') not between 1 and 200 then return false; end if;
  else return false;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create table announcement_internal.entries (
 id uuid primary key default gen_random_uuid(), legacy_id uuid unique,
 title text not null check(length(trim(title)) between 1 and 160),
 document jsonb not null check(announcement_internal.valid_document(document)),
 kind text not null default 'news' check(kind in ('news','system','reward','invitation')),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 audience text not null default 'all' check(audience in ('all','members','premium','selected')),
 starts_at timestamptz not null default now(), ends_at timestamptz,
 priority integer not null default 0 check(priority between 0 and 10),
 show_home boolean not null default true,
 action jsonb not null default '{"type":"none"}',
 revision integer not null default 1,
 created_by uuid references public.users(id) on delete set null,
 updated_by uuid references public.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create index entries_feed_idx on announcement_internal.entries(status,priority desc,starts_at desc,id);
create table announcement_internal.recipients (
 announcement_id uuid not null references announcement_internal.entries(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 primary key(announcement_id,user_id)
);
create index recipients_user_idx on announcement_internal.recipients(user_id,announcement_id);
create table announcement_internal.reward_pools (
 announcement_id uuid primary key references announcement_internal.entries(id),
 code_id uuid not null unique references public.redeem_codes(id),
 value integer not null, max_claims integer not null
);
create table announcement_internal.responses (
 announcement_id uuid not null references announcement_internal.entries(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 response text check(response in ('accepted','declined')),
 viewed_at timestamptz not null default now(), responded_at timestamptz,
 primary key(announcement_id,user_id)
);
create index responses_user_idx on announcement_internal.responses(user_id);
create table announcement_internal.history (
 announcement_id uuid not null references announcement_internal.entries(id) on delete cascade,
 revision integer not null, snapshot jsonb not null,
 actor_id uuid references public.users(id) on delete set null,
 created_at timestamptz not null default now(), primary key(announcement_id,revision)
);
create index history_actor_idx on announcement_internal.history(actor_id);
create index entries_created_by_idx on announcement_internal.entries(created_by);
create index entries_updated_by_idx on announcement_internal.entries(updated_by);

alter table announcement_internal.entries enable row level security;
alter table announcement_internal.recipients enable row level security;
alter table announcement_internal.reward_pools enable row level security;
alter table announcement_internal.responses enable row level security;
alter table announcement_internal.history enable row level security;
revoke all on all tables in schema announcement_internal from public,anon,authenticated;

create function announcement_internal.visible(a announcement_internal.entries, uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select a.status='published' and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) and
 (a.audience='all' or (uid is not null and (a.audience='members'
 or (a.audience='premium' and exists(select 1 from public.users u where u.id=uid and u.premium_expires_at>now()))
 or (a.audience='selected' and exists(select 1 from announcement_internal.recipients r where r.announcement_id=a.id and r.user_id=uid)))))
$$;

-- Reference titles resolve live; removed, private or age-inappropriate content does not leak from the preview.
create function announcement_internal.reference(k text, rid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; uid uuid:=app_private.current_public_user_id();
begin
 if k='manga' then
  select jsonb_build_object('kind',k,'id',m.id,'title',m.title,'href','/manga/'||coalesce(m.slug,m.id::text),'image',m.cover_image_url) into r
  from public.mangas m where m.id=rid and m.is_active and m.is_approved and (not m.is_mature or app_private.current_user_is_adult());
 elsif k='post' then
  select jsonb_build_object('kind',k,'id',p.id,'title',p.title,'href','/discussion/'||p.id::text) into r
  from public.community_posts p where p.id=rid and p.is_active and p.status='approved' and not app_private.is_user_blocked_between(p.author_id,uid);
 elsif k='list' then
  select jsonb_build_object('kind',k,'id',l.id,'title',l.title,'href','/listeler/'||l.id::text) into r
  from public.user_manga_lists l where l.id=rid and l.is_public and not app_private.is_user_blocked_between(l.owner_id,uid);
 elsif k='fansub' then
  select jsonb_build_object('kind',k,'id',f.id,'title',f.name,'href','/fansub/'||coalesce(f.slug,f.id::text),'image',f.avatar_url) into r
  from public.fansubs f where f.id=rid and f.is_active;
 elsif k='user' then
  select jsonb_build_object('kind',k,'id',u.id,'title','@'||u.username,'href','/profil/'||u.username) into r
  from public.public_user_directory u where u.id=rid and not app_private.is_user_blocked_between(u.id,uid);
 end if;
 return r;
end $$;

create function announcement_internal.render(a announcement_internal.entries, uid uuid) returns jsonb
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
 select jsonb_build_object('value',p.value,'remaining',greatest(0,c.max_uses-c.used_count),
  'available',c.is_active and (c.expires_at is null or c.expires_at>now()) and public.is_feature_enabled('economy.coin_codes',false),
  'claimed',exists(select 1 from public.user_code_redemptions x where x.code_id=p.code_id and x.user_id=uid)) into pool
 from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=a.id;
 select response into reply from announcement_internal.responses where announcement_id=a.id and user_id=uid;
 return jsonb_build_object('id',a.id,'title',a.title,'document',a.document,'kind',a.kind,'startsAt',a.starts_at,'endsAt',a.ends_at,
 'priority',a.priority,'action',a.action,'references',refs,'reward',pool,'response',reply,'revision',a.revision);
end $$;

create function announcement_internal.feed(p_id uuid default null,p_home boolean default false,p_offset integer default 0,p_limit integer default 20,p_kind text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=app_private.current_public_user_id(); result jsonb;
begin
 select coalesce(jsonb_agg(announcement_internal.render(a,uid) order by a.priority desc,a.starts_at desc,a.id),'[]'::jsonb) into result
 from (select e.* from announcement_internal.entries e where announcement_internal.visible(e,uid)
  and (p_id is null or e.id=p_id) and (not p_home or e.show_home) and (p_kind is null or e.kind=p_kind)
  order by e.priority desc,e.starts_at desc,e.id offset greatest(0,least(p_offset,10000)) limit greatest(1,least(p_limit,50))) a;
 return result;
end $$;
create function public.announcement_feed(p_id uuid default null,p_home boolean default false,p_offset integer default 0,p_limit integer default 20,p_kind text default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select announcement_internal.feed(p_id,p_home,p_offset,p_limit,p_kind) $$;

-- The old source does not change; while old clients run new management updates only these copies.
insert into announcement_internal.entries(id,legacy_id,title,document,kind,status,starts_at,created_by,updated_by,created_at,updated_at,action)
select id,id,left(coalesce(nullif(trim(title),''),'Duyuru'),160),jsonb_build_array(jsonb_build_object('type','text','text',left(coalesce(nullif(body,''),title,'Duyuru'),4000))),
 'news',case when is_active then 'published' else 'archived' end,coalesce(published_at,created_at),created_by,updated_by,created_at,updated_at,
 case when announcement_internal.safe_url(action_url) then jsonb_build_object('type','link','url',action_url,'label',left(coalesce(nullif(action_label,''),'İncele'),60)) else '{"type":"none"}'::jsonb end
from public.site_announcements;

revoke all on all functions in schema announcement_internal from public,anon,authenticated;
revoke all on function public.announcement_feed(uuid,boolean,integer,integer,text) from public;
grant execute on function announcement_internal.feed(uuid,boolean,integer,integer,text), public.announcement_feed(uuid,boolean,integer,integer,text) to anon,authenticated;
