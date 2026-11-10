-- Delete is reversible; reward and audit records are never dropped.
alter table announcement_internal.entries add column deleted_at timestamptz;
create index entries_admin_active_idx on announcement_internal.entries(updated_at desc,id) where deleted_at is null;

create function announcement_internal.valid_conditions(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare c jsonb; seen text[]:='{}'; t text;
begin
 if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v)>5 then return false; end if;
 for c in select value from jsonb_array_elements(v) loop
  t:=c->>'type';
  if t is null or t=any(seen) then return false; end if;
  seen:=array_append(seen,t);
  if t in ('verified_email','premium') then
   if c<>jsonb_build_object('type',t) then return false; end if;
  elsif t='account_age' then
   if not c ? 'days' or (c-array['type','days'])<>'{}'::jsonb or jsonb_typeof(c->'days')<>'number'
    or c->>'days' !~ '^[0-9]+$' or (c->>'days')::int not between 1 and 3650 then return false; end if;
  elsif t in ('follow_manga','follow_fansub') then
   if not c ? 'id' or (c-array['type','id'])<>'{}'::jsonb or (c->>'id')::uuid is null then return false; end if;
  else return false;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;

-- Only the acting account condition result returns; email or account dates do not leave.
create function announcement_internal.condition_result(v jsonb, uid uuid) returns jsonb
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
  if b->>'type' in ('follow_manga','follow_fansub') then
   ref:=announcement_internal.reference(replace(b->>'type','follow_',''),(b->>'id')::uuid);
   refs:=refs||jsonb_build_object(replace(b->>'type','follow_','')||':'||(b->>'id'),ref);
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
  if act<>'{"type":"rsvp"}'::jsonb or p_data->>'kind'<>'invitation' or p_data->>'endsAt' is null then raise exception 'Davet için bitiş tarihi gerekli.'; end if;
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

create or replace function announcement_internal.admin_list(p_status text default null,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform announcement_internal.require_admin();
 if p_status is not null and p_status not in ('draft','published','archived','deleted') then raise exception 'Geçersiz durum.'; end if;
 select jsonb_build_object('total',(select count(*) from announcement_internal.entries e
  where (case when p_status='deleted' then e.deleted_at is not null else e.deleted_at is null end)
  and (p_status is null or p_status='deleted' or e.status=p_status)),
 'items',coalesce(jsonb_agg(announcement_internal.admin_row(a) order by a.updated_at desc,a.id),'[]'::jsonb)) into result
 from (select * from announcement_internal.entries e
  where (case when p_status='deleted' then e.deleted_at is not null else e.deleted_at is null end)
  and (p_status is null or p_status='deleted' or e.status=p_status)
  order by updated_at desc,id offset greatest(0,least(p_offset,10000)) limit 25) a;
 return result;
end $$;

create function announcement_internal.admin_transition(p_id uuid,p_revision integer,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=announcement_internal.require_admin(); a announcement_internal.entries; data jsonb; result jsonb;
begin
 if p_action is null or p_action not in ('draft','published','archived','delete','restore') then raise exception 'Geçersiz işlem.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,917));
 select * into a from announcement_internal.entries where id=p_id for update;
 if a.id is null then raise exception 'Duyuru bulunamadı.'; end if;
 if p_revision is null or a.revision<>p_revision then raise exception 'Duyuru başka bir işlemde değişti. Listeyi yenile.' using errcode='40001'; end if;
 if p_action='restore' then
  if a.deleted_at is null then raise exception 'Duyuru çöp kutusunda değil.'; end if;
 elsif a.deleted_at is not null then raise exception 'Önce duyuruyu çöp kutusundan geri al.';
 end if;
 if p_action in ('delete','restore') then
  update announcement_internal.entries set deleted_at=case when p_action='delete' then now() else null end,
   status=case when p_action='delete' then 'archived' else 'draft' end,
   revision=revision+1,updated_at=now(),updated_by=uid where id=p_id returning * into a;
  insert into announcement_internal.history(announcement_id,revision,snapshot,actor_id) values(a.id,a.revision,to_jsonb(a),uid);
  perform public.create_admin_audit_log('announcement.'||p_action,'announcement',p_id::text,'Duyuru durumu değişti.',jsonb_build_object('revision',a.revision));
  return jsonb_build_object('success',true,'revision',a.revision);
 end if;
 if p_action='published' and a.ends_at<=now() then raise exception 'Yayımlamadan önce bitiş tarihini düzenle. Süresi bitmiş ödül için yeni duyuru oluştur.'; end if;
 data:=jsonb_build_object('title',a.title,'document',a.document,'kind',a.kind,'status',p_action,'audience',a.audience,
  'startsAt',a.starts_at,'endsAt',a.ends_at,'priority',a.priority,'showHome',a.show_home,'action',a.action,
  'recipients',coalesce((select jsonb_agg(user_id) from announcement_internal.recipients where announcement_id=p_id),'[]'::jsonb));
 result:=announcement_internal.admin_save(p_id,p_revision,data);
 return jsonb_build_object('success',true,'revision',result->'revision');
end $$;
create function public.announcement_admin_transition(p_id uuid,p_revision integer,p_action text) returns jsonb
language sql security invoker set search_path='' as $$ select announcement_internal.admin_transition(p_id,p_revision,p_action) $$;
revoke all on function announcement_internal.admin_transition(uuid,integer,text),public.announcement_admin_transition(uuid,integer,text) from public,anon,authenticated;
grant execute on function announcement_internal.admin_transition(uuid,integer,text),public.announcement_admin_transition(uuid,integer,text) to authenticated;


create or replace function announcement_internal.notify(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a announcement_internal.entries; uid uuid; sent integer:=0; skipped integer:=0; failed integer:=0;
begin
 perform announcement_internal.require_admin();
 select * into a from announcement_internal.entries where id=p_id for update;
 if a.id is null or a.deleted_at is not null or a.status<>'published' or a.starts_at>now() or (a.ends_at is not null and a.ends_at<=now()) or a.audience<>'selected' then
  raise exception 'Bildirim yalnız şu anda yayındaki özel alıcılı duyurularda gönderilebilir.';
 end if;
 for uid in select user_id from announcement_internal.recipients where announcement_id=p_id loop
  if exists(select 1 from announcement_internal.deliveries where announcement_id=p_id and user_id=uid)
   or not public.is_notification_type_enabled(uid,'system') then skipped:=skipped+1; continue; end if;
  -- No private content goes to the lock screen; title and text are read in the app with permission.
  perform public.push_notification(uid,'system','Yeni bir duyurun var','Duyuruyu görmek için aç.',
   jsonb_build_object('event_key','announcement:'||p_id::text,'url','/duyurular/'||p_id::text),null);
  if exists(select 1 from public.notifications where user_id=uid and data->>'event_key'='announcement:'||p_id::text) then
   insert into announcement_internal.deliveries values(p_id,uid,now()) on conflict do nothing; sent:=sent+1;
  else failed:=failed+1;
  end if;
 end loop;
 return jsonb_build_object('sent',sent,'skipped',skipped,'failed',failed);
end $$;

create or replace function announcement_internal.respond(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.current_public_user_id(); a announcement_internal.entries; code text; result jsonb; claimed boolean; amount integer;
begin
 if uid is null then raise exception 'Devam etmek için giriş yap.' using errcode='42501'; end if;
 if p_action='view' then
  select * into a from announcement_internal.entries where id=p_id;
 else
  select * into a from announcement_internal.entries where id=p_id for update;
 end if;
 if a.id is null or not announcement_internal.visible(a,uid) then raise exception 'Duyuru sona erdi veya bu hesaba açık değil.' using errcode='42501'; end if;
 if p_action='view' then
  insert into announcement_internal.responses(announcement_id,user_id) values(p_id,uid) on conflict do nothing;
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
 elsif p_action in ('accepted','declined') and a.action->>'type'='rsvp' then
  insert into announcement_internal.responses(announcement_id,user_id,response,responded_at) values(p_id,uid,p_action,now())
  on conflict(announcement_id,user_id) do update set response=excluded.response,responded_at=excluded.responded_at;
  return jsonb_build_object('success',true,'response',p_action);
 end if;
 raise exception 'Bu duyuru için geçersiz işlem.';
end $$;

create or replace function announcement_internal.search(p_kind text,p_query text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; rid uuid; r jsonb; result jsonb:='[]'; q text:=left(trim(p_query),80);
begin
 perform announcement_internal.require_admin();
 if length(q)<2 and p_kind not in ('user','fansub') then return result; end if;
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
