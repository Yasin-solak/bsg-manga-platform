create function announcement_internal.require_admin() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=app_private.current_public_user_id();
begin
 if uid is null or not coalesce(app_private.is_admin(),false) then raise exception 'Bu işlem için yönetici oturumu gerekli.' using errcode='42501'; end if;
 return uid;
end $$;

create function announcement_internal.admin_row(a announcement_internal.entries) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(a)-'legacy_id' || jsonb_build_object(
  'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.user_id,'title','@'||u.username,'kind','user','href','/profil/'||u.username))
   from announcement_internal.recipients r join public.users u on u.id=r.user_id where r.announcement_id=a.id),'[]'::jsonb),
  'views',(select count(*) from announcement_internal.responses where announcement_id=a.id),
  'accepted',(select count(*) from announcement_internal.responses where announcement_id=a.id and response='accepted'),
  'declined',(select count(*) from announcement_internal.responses where announcement_id=a.id and response='declined'),
  'claims',coalesce((select c.used_count from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=a.id),0),
  'rewardLocked',exists(select 1 from announcement_internal.reward_pools p where p.announcement_id=a.id),
  'preview',announcement_internal.render(a,app_private.current_public_user_id()))
$$;

create function announcement_internal.admin_list(p_status text default null,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform announcement_internal.require_admin();
 select jsonb_build_object('total',(select count(*) from announcement_internal.entries where p_status is null or status=p_status),
 'items',coalesce(jsonb_agg(announcement_internal.admin_row(a) order by a.updated_at desc,a.id),'[]'::jsonb)) into result
 from (select * from announcement_internal.entries where p_status is null or status=p_status order by updated_at desc,id offset greatest(0,least(p_offset,10000)) limit 25) a;
 return result;
end $$;

create function announcement_internal.admin_save(p_id uuid,p_revision integer,p_data jsonb) returns jsonb
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
  if (act-array['type','url','label'])<>'{}'::jsonb or not announcement_internal.safe_url(act->>'url') or coalesce(length(trim(act->>'label')),0) not between 1 and 60 then raise exception 'Geçerli bağlantı ve düğme adı gerekli.'; end if;
 elsif act->>'type'='reward' then
  value:=(act->>'value')::integer; max_claims:=(act->>'maxClaims')::integer;
  if (act-array['type','value','maxClaims'])<>'{}'::jsonb or value is null or max_claims is null or value not between 1 and 10000 or max_claims not between 1 and 100000 or value::bigint*max_claims>100000000
    or p_data->>'kind'<>'reward' or p_data->>'endsAt' is null then raise exception 'Ödül için bitiş tarihi, 1–10000 coin ve toplam dağıtım sınırı gerekli (en fazla 100 milyon coin).'; end if;
 elsif act->>'type'='rsvp' then
  if act<>'{"type":"rsvp"}'::jsonb or p_data->>'kind'<>'invitation' or p_data->>'endsAt' is null then raise exception 'Davet için bitiş tarihi gerekli.'; end if;
 else raise exception 'Geçersiz işlem türü.';
 end if;
 if (p_data->>'kind'='reward')<>(act->>'type'='reward') or (p_data->>'kind'='invitation')<>(act->>'type'='rsvp') then raise exception 'Duyuru türü ile işlem uyuşmuyor.'; end if;
 if exists(select 1 from announcement_internal.reward_pools where announcement_id=p_id) and
  (act<>old.action or p_data->>'audience'<>old.audience or (p_data->>'endsAt')::timestamptz is distinct from old.ends_at
  or ids is distinct from (select coalesce(array_agg(user_id order by user_id),'{}') from announcement_internal.recipients where announcement_id=p_id)) then
  raise exception 'Yayımlanmış ödülün miktarı, alıcıları ve bitişi değiştirilemez. Gerekirse arşivle.';
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
 perform public.create_admin_audit_log('announcement.save','announcement',a.id,'Duyuru kaydedildi.',jsonb_build_object('status',a.status,'revision',a.revision));
 return announcement_internal.admin_row(a);
end $$;

create function announcement_internal.admin_history(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform announcement_internal.require_admin();
 return coalesce((select jsonb_agg(x order by x.revision desc) from
 (select h.revision,h.created_at,u.username actor,h.snapshot->>'status' status,h.snapshot->>'title' title
 from announcement_internal.history h left join public.users u on u.id=h.actor_id where h.announcement_id=p_id order by h.revision desc limit 50) x),'[]'::jsonb);
end $$;

create function announcement_internal.search(p_kind text,p_query text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; rid uuid; r jsonb; result jsonb:='[]'; q text:=left(trim(p_query),80);
begin
 perform announcement_internal.require_admin();
 if length(q)<2 then return result; end if;
 -- Literal substring search: user input does not become a wildcard.
 if p_kind='manga' then select array_agg(id) into ids from (select id from public.mangas where is_active and is_approved and strpos(lower(title),lower(q))>0 order by title limit 15) x;
 elsif p_kind='post' then select array_agg(id) into ids from (select id from public.community_posts where is_active and status='approved' and strpos(lower(title),lower(q))>0 order by created_at desc limit 15) x;
 elsif p_kind='list' then select array_agg(id) into ids from (select id from public.user_manga_lists where is_public and strpos(lower(title),lower(q))>0 order by title limit 15) x;
 elsif p_kind='fansub' then select array_agg(id) into ids from (select id from public.fansubs where is_active and strpos(lower(name),lower(q))>0 order by name limit 15) x;
 elsif p_kind='user' then select array_agg(id) into ids from (select id from public.public_user_directory where strpos(lower(username),lower(q))>0 order by username limit 15) x;
 else raise exception 'Geçersiz içerik türü.';
 end if;
 foreach rid in array coalesce(ids,'{}') loop
  r:=announcement_internal.reference(p_kind,rid); if r is not null then result:=result||jsonb_build_array(r); end if;
 end loop;
 return result;
end $$;

create function public.announcement_admin_list(p_status text default null,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select announcement_internal.admin_list(p_status,p_offset) $$;
create function public.announcement_admin_save(p_id uuid,p_revision integer,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select announcement_internal.admin_save(p_id,p_revision,p_data) $$;
create function public.announcement_admin_history(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select announcement_internal.admin_history(p_id) $$;
create function public.announcement_search(p_kind text,p_query text) returns jsonb language sql stable security invoker set search_path='' as $$ select announcement_internal.search(p_kind,p_query) $$;

revoke all on all functions in schema announcement_internal from public,anon,authenticated;
grant execute on function announcement_internal.feed(uuid,boolean,integer,integer,text) to anon,authenticated;
grant execute on function announcement_internal.admin_list(text,integer),announcement_internal.admin_save(uuid,integer,jsonb),announcement_internal.admin_history(uuid),announcement_internal.search(text,text) to authenticated;
revoke all on function public.announcement_admin_list(text,integer),public.announcement_admin_save(uuid,integer,jsonb),public.announcement_admin_history(uuid),public.announcement_search(text,text) from public,anon;
grant execute on function public.announcement_admin_list(text,integer),public.announcement_admin_save(uuid,integer,jsonb),public.announcement_admin_history(uuid),public.announcement_search(text,text) to authenticated;
