-- The file body is in private R2; the client can only reserve its own upload, not mark it ready.
create table community_v2.attachments (
  id uuid primary key,
  channel_id uuid not null references community_v2.channels(id) on delete cascade,
  user_id uuid not null references public.users(id),
  message_id uuid,
  name text not null check(char_length(name) between 1 and 120 and name !~ '[[:cntrl:]/\\]'),
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain')),
  byte_size integer not null check(byte_size between 1 and 10485760),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending' check(state in ('pending','ready','deleted','purging','purged')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes',
  foreign key(channel_id,message_id) references community_v2.messages(channel_id,id) on delete cascade
);
create index attachments_message_idx on community_v2.attachments(message_id) where message_id is not null;
create index attachments_channel_idx on community_v2.attachments(channel_id);
create index attachments_quota_idx on community_v2.attachments(user_id,created_at);
create index attachments_gc_idx on community_v2.attachments(expires_at) where state in ('pending','ready','deleted','purging');
create table community_v2.media_gc(object_key text primary key,created_at timestamptz not null default now());
alter table community_v2.attachments enable row level security;
alter table community_v2.media_gc enable row level security;
revoke all on community_v2.attachments,community_v2.media_gc from public,anon,authenticated;
alter table community_v2.messages add column attachment_ids uuid[] not null default '{}' check(cardinality(attachment_ids)<=4);

create function community_v2.media_deleted() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='attachments' then
    insert into community_v2.media_gc(object_key) values('community/'||old.id) on conflict do nothing;
    return old;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    update community_v2.attachments set state='deleted',expires_at=now() where message_id=new.id and state<>'purged';
  end if;
  return new;
end $$;
create trigger attachments_gc before delete on community_v2.attachments for each row execute function community_v2.media_deleted();
create trigger messages_media_deleted after update of deleted_at on community_v2.messages for each row execute function community_v2.media_deleted();

create function community_v2.media_api(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); c uuid; s uuid; a community_v2.attachments; ch community_v2.channels; idv uuid:=(p->>'id')::uuid; total bigint; amount integer;
begin
  if p_action='prepare' then
    c:=(p->>'channel_id')::uuid;
    -- Concurrent uploads of one account on different servers also cannot exceed the daily quota.
    perform pg_advisory_xact_lock(hashtextextended('community-media:'||u,0));
    select server_id into s from community_v2.channels where id=c;
    perform 1 from community_v2.servers where id=s for share;
    perform 1 from community_v2.members where server_id=s and user_id=u for update;
    select * into ch from community_v2.channels where id=c for update;
    if not community_v2.can_read(c,u) or not community_v2.has_permission(s,u,'messages.send') or not community_v2.has_permission(s,u,'attachments.send') then
      raise exception 'Bu kanalda dosya paylaşma iznin yok.' using errcode='42501'; end if;
    if ch.archived_at is not null or exists(select 1 from community_v2.members where server_id=s and user_id=u and timeout_until>now()) then
      raise exception 'Bu kanala şu anda dosya yükleyemezsin.' using errcode='42501'; end if;
    perform community_v2.lock_series(s,ch.manga_id);
    select * into a from community_v2.attachments where id=idv for update;
    if found then
      if a.user_id<>u or a.channel_id<>c or a.sha256 is distinct from p->>'sha256' or a.name is distinct from p->>'name'
        or a.content_type is distinct from p->>'content_type' or a.byte_size is distinct from (p->>'byte_size')::integer
        or a.state not in ('pending','ready') or a.message_id is not null or a.expires_at<=now() then
        raise exception 'Dosya anahtarı kullanılmış veya süresi dolmuş.'; end if;
    else
      select coalesce(sum(byte_size),0),count(*) into total,amount from community_v2.attachments where user_id=u and created_at>now()-interval '24 hours';
      if total+coalesce((p->>'byte_size')::integer,104857601)>104857600 or amount>=100 then raise exception '24 saatlik dosya kotan doldu (100 MB / 100 dosya).'; end if;
      if (select count(*) from community_v2.attachments where user_id=u and message_id is null and state in ('pending','ready') and expires_at>now())>=8 then raise exception 'Önce bekleyen dosyalarını gönder veya kaldır.'; end if;
      insert into community_v2.attachments(id,channel_id,user_id,name,content_type,byte_size,sha256)
        values(idv,c,u,p->>'name',p->>'content_type',(p->>'byte_size')::integer,p->>'sha256') returning * into a;
    end if;
  elsif p_action='access' then
    select * into a from community_v2.attachments where id=idv;
    if not found or a.state<>'ready' or not community_v2.can_read(a.channel_id,u) or
      not ((a.message_id is null and a.user_id=u and a.expires_at>now()) or exists(select 1 from community_v2.messages where id=a.message_id and deleted_at is null)) then
      raise exception 'Dosya bulunamadı veya erişimin yok.' using errcode='42501'; end if;
  elsif p_action='discard' then
    select channel_id into c from community_v2.attachments where id=idv and user_id=u;
    select server_id into s from community_v2.channels where id=c;
    perform 1 from community_v2.servers where id=s for share;
    perform 1 from community_v2.members where server_id=s and user_id=u for update;
    perform 1 from community_v2.channels where id=c for update;
    select * into a from community_v2.attachments where id=idv and user_id=u for update;
    if not found or a.message_id is not null then raise exception 'Gönderilmiş veya sana ait olmayan dosya kaldırılamaz.' using errcode='42501'; end if;
    update community_v2.attachments set state='deleted',expires_at=now() where id=idv and state in ('pending','ready');
    return jsonb_build_object('ok',true);
  else raise exception 'Bilinmeyen dosya işlemi.'; end if;
  return jsonb_build_object('id',a.id,'object_key','community/'||a.id,'state',a.state,'name',a.name,'content_type',a.content_type,'byte_size',a.byte_size,'sha256',a.sha256);
end $$;

-- Only the Worker service identity can call it. A user JWT is not enough for this API.
create function community_v2.media_worker(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a community_v2.attachments; ids uuid[]; result jsonb; keyv text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Hizmet kimliği gerekli.' using errcode='42501'; end if;
  if p_action='complete' then
    select * into a from community_v2.attachments where id=(p->>'id')::uuid for update;
    if not found or a.sha256 is distinct from p->>'sha256' or a.state not in ('pending','ready') or a.message_id is not null or a.expires_at<=now() then raise exception 'Yükleme artık tamamlanamaz.'; end if;
    update community_v2.attachments set state='ready' where id=a.id;
    return jsonb_build_object('ok',true);
  elsif p_action='collect' then
    select array_agg(id) into ids from (select id from community_v2.attachments where
      (state in ('deleted','purging') or (message_id is null and state in ('pending','ready')))
      and expires_at<now()-interval '15 minutes' order by expires_at limit 100 for update skip locked)x;
    update community_v2.attachments set state='purging' where id=any(ids);
    select coalesce(jsonb_agg(key),'[]'::jsonb) into result from (
      select 'community/'||id as key from unnest(ids)id
      union select object_key from (select object_key from community_v2.media_gc order by created_at limit 100)q
    )x;
    return result;
  elsif p_action='purged' then
    if jsonb_typeof(p->'keys') is distinct from 'array' or jsonb_array_length(p->'keys')>200 then raise exception 'Temizleme grubu geçersiz.'; end if;
    for keyv in select jsonb_array_elements_text(p->'keys') loop
      if keyv !~ '^community/[0-9a-f-]{36}$' then raise exception 'Geçersiz dosya yolu.'; end if;
      update community_v2.attachments set state='purged',name='Silinmiş dosya' where id=substring(keyv from 11)::uuid and state='purging';
      delete from community_v2.media_gc where object_key=keyv;
    end loop;
    -- The quota count includes the last 24 hours; cleaned metadata is removed after a week.
    delete from community_v2.attachments where id in (select id from community_v2.attachments where state='purged' and created_at<now()-interval '7 days' limit 100);
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Bilinmeyen hizmet işlemi.';
end $$;
create function public.community_v2_media(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.media_api(p_action,p_payload); $$;
create function public.community_v2_media_worker(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.media_worker(p_action,p_payload); $$;
revoke all on function community_v2.media_deleted(),community_v2.media_api(text,jsonb),community_v2.media_worker(text,jsonb),
  public.community_v2_media(text,jsonb),public.community_v2_media_worker(text,jsonb) from public,anon,authenticated;
grant execute on function community_v2.media_api(text,jsonb),public.community_v2_media(text,jsonb) to authenticated;
grant usage on schema community_v2 to service_role;
grant execute on function community_v2.media_worker(text,jsonb),public.community_v2_media_worker(text,jsonb) to service_role;
