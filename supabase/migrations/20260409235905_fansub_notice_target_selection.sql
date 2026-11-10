begin;

alter table public.fansub_pinned_notices
  add column if not exists slot_index smallint,
  add column if not exists action_target text,
  add column if not exists target_entity_id uuid,
  add column if not exists action_label text,
  add column if not exists action_url text;

update public.fansub_pinned_notices
set
  slot_index = coalesce(slot_index, 0),
  action_target = case
    when nullif(lower(btrim(action_target)), '') in ('mangalar', 'bolumler', 'postlar', 'listeler')
      then lower(btrim(action_target))
    when coalesce(action_url, '') like '/listeler%' then 'listeler'
    when coalesce(action_url, '') like '/discussion/%' then 'postlar'
    when coalesce(action_url, '') like '/manga/%/chapter/%' then 'bolumler'
    else 'mangalar'
  end,
  title = left(btrim(title), 80),
  body = left(btrim(body), 280),
  action_label = case
    when nullif(btrim(action_label), '') is not null then left(btrim(action_label), 160)
    when nullif(lower(btrim(action_target)), '') = 'mangalar' then 'Manga detayina git'
    when nullif(lower(btrim(action_target)), '') = 'bolumler' then 'Bolumu ac'
    when nullif(lower(btrim(action_target)), '') = 'postlar' then 'Postu ac'
    when nullif(lower(btrim(action_target)), '') = 'listeler' then 'Listeyi ac'
    else action_label
  end,
  action_url = case
    when nullif(btrim(action_url), '') is not null then btrim(action_url)
    else action_url
  end;

alter table public.fansub_pinned_notices
  alter column slot_index set default 0,
  alter column slot_index set not null,
  alter column action_target set default 'mangalar',
  alter column action_target set not null;

alter table public.fansub_pinned_notices
  drop constraint if exists fansub_pinned_notices_title_check,
  drop constraint if exists fansub_pinned_notices_body_check,
  drop constraint if exists fansub_pinned_notices_action_label_check,
  drop constraint if exists fansub_pinned_notices_action_url_check,
  drop constraint if exists fansub_pinned_notices_slot_index_check,
  drop constraint if exists fansub_pinned_notices_action_target_check,
  drop constraint if exists fansub_pinned_notices_fansub_id_key,
  drop constraint if exists fansub_pinned_notices_fansub_slot_key;

alter table public.fansub_pinned_notices
  add constraint fansub_pinned_notices_title_check
    check (char_length(btrim(title)) between 1 and 80),
  add constraint fansub_pinned_notices_body_check
    check (char_length(btrim(body)) between 1 and 280),
  add constraint fansub_pinned_notices_action_label_check
    check (action_label is null or char_length(btrim(action_label)) between 1 and 160),
  add constraint fansub_pinned_notices_action_url_check
    check (action_url is null or left(btrim(action_url), 1) = '/'),
  add constraint fansub_pinned_notices_slot_index_check
    check (slot_index between 0 and 2),
  add constraint fansub_pinned_notices_action_target_check
    check (action_target in ('mangalar', 'bolumler', 'postlar', 'listeler')),
  add constraint fansub_pinned_notices_fansub_slot_key
    unique (fansub_id, slot_index);

alter table public.fansub_special_notification_broadcasts
  add column if not exists route_target text,
  add column if not exists target_entity_id uuid,
  add column if not exists route_label text;

update public.fansub_special_notification_broadcasts
set
  route_target = case
    when nullif(lower(btrim(route_target)), '') in ('mangalar', 'bolumler', 'postlar', 'listeler')
      then lower(btrim(route_target))
    when coalesce(route_hint, '') like '/listeler%' then 'listeler'
    when coalesce(route_hint, '') like '/discussion/%' then 'postlar'
    when coalesce(route_hint, '') like '/manga/%/chapter/%' then 'bolumler'
    else 'mangalar'
  end,
  title = left(btrim(title), 80),
  message = left(btrim(message), 220),
  route_label = case
    when nullif(btrim(route_label), '') is not null then left(btrim(route_label), 160)
    when nullif(lower(btrim(route_target)), '') = 'mangalar' then 'Manga detayina git'
    when nullif(lower(btrim(route_target)), '') = 'bolumler' then 'Bolumu ac'
    when nullif(lower(btrim(route_target)), '') = 'postlar' then 'Postu ac'
    when nullif(lower(btrim(route_target)), '') = 'listeler' then 'Listeyi ac'
    else route_label
  end;

alter table public.fansub_special_notification_broadcasts
  alter column route_target set default 'mangalar',
  alter column route_target set not null;

alter table public.fansub_special_notification_broadcasts
  drop constraint if exists fansub_special_notification_broadcasts_title_check,
  drop constraint if exists fansub_special_notification_broadcasts_message_check,
  drop constraint if exists fansub_special_notification_broadcasts_route_target_check,
  drop constraint if exists fansub_special_notification_broadcasts_route_hint_check,
  drop constraint if exists fansub_special_notification_broadcasts_route_label_check;

alter table public.fansub_special_notification_broadcasts
  add constraint fansub_special_notification_broadcasts_title_check
    check (char_length(btrim(title)) between 1 and 80),
  add constraint fansub_special_notification_broadcasts_message_check
    check (char_length(btrim(message)) between 1 and 220),
  add constraint fansub_special_notification_broadcasts_route_target_check
    check (route_target in ('mangalar', 'bolumler', 'postlar', 'listeler')),
  add constraint fansub_special_notification_broadcasts_route_hint_check
    check (route_hint is null or left(btrim(route_hint), 1) = '/'),
  add constraint fansub_special_notification_broadcasts_route_label_check
    check (route_label is null or char_length(btrim(route_label)) between 1 and 160);

create or replace function public.resolve_fansub_notice_target(
  p_fansub_id uuid,
  p_target text,
  p_target_entity_id uuid
)
returns table (
  target_label text,
  route_hint text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text := lower(trim(coalesce(p_target, 'mangalar')));
  v_target_entity_id uuid := p_target_entity_id;
  v_target_label text;
  v_route_hint text;
begin
  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if v_target not in ('mangalar', 'bolumler', 'postlar', 'listeler') then
    raise exception 'Hedef tipi gecersiz.';
  end if;

  if v_target_entity_id is null then
    raise exception 'Somut hedef secilmelidir.';
  end if;

  if v_target = 'mangalar' then
    select
      left(m.title, 160),
      format('/manga/%s', m.id::text)
    into
      v_target_label,
      v_route_hint
    from public.mangas m
    where m.id = v_target_entity_id
      and m.fansub_id = p_fansub_id
      and m.is_approved = true
      and m.is_active = true;
  elsif v_target = 'bolumler' then
    select
      left(
        format(
          '%s / Bolum %s%s',
          m.title,
          c.chapter_number::text,
          case
            when nullif(btrim(c.title), '') is not null then ' - ' || btrim(c.title)
            else ''
          end
        ),
        160
      ),
      format('/manga/%s/chapter/%s', c.manga_id::text, c.chapter_number::text)
    into
      v_target_label,
      v_route_hint
    from public.chapters c
    join public.mangas m
      on m.id = c.manga_id
    where c.id = v_target_entity_id
      and c.fansub_id = p_fansub_id
      and c.is_approved = true
      and c.is_active = true
      and m.is_approved = true
      and m.is_active = true;
  elsif v_target = 'postlar' then
    select
      left(coalesce(nullif(btrim(cp.title), ''), 'Fansub postu'), 160),
      format('/discussion/%s', cp.id::text)
    into
      v_target_label,
      v_route_hint
    from public.community_posts cp
    where cp.id = v_target_entity_id
      and cp.related_fansub_id = p_fansub_id
      and cp.status = 'approved'
      and cp.is_active = true;
  else
    select
      left(
        case
          when nullif(btrim(u.username), '') is not null then uml.title || ' / ' || u.username
          else uml.title
        end,
        160
      ),
      format('/listeler/%s', uml.id::text)
    into
      v_target_label,
      v_route_hint
    from public.user_manga_lists uml
    left join public.users u
      on u.id = uml.owner_id
    where uml.id = v_target_entity_id
      and uml.is_public = true;
  end if;

  if v_route_hint is null or v_target_label is null then
    raise exception 'Secilen hedef public olarak kullanilamaz veya bu fansuba ait degil.';
  end if;

  return query
  select v_target_label, v_route_hint;
end;
$$;

drop function if exists public.upsert_fansub_pinned_notice(uuid, text, text, text, text, boolean);
drop function if exists public.upsert_fansub_pinned_notice(uuid, smallint, text, text, text, boolean);
drop function if exists public.upsert_fansub_pinned_notice(uuid, smallint, text, text, text, uuid, boolean);

create function public.upsert_fansub_pinned_notice(
  p_fansub_id uuid,
  p_slot_index smallint,
  p_title text,
  p_body text,
  p_action_target text,
  p_target_entity_id uuid,
  p_is_active boolean default true
)
returns table (
  id uuid,
  fansub_id uuid,
  slot_index smallint,
  title text,
  body text,
  action_target text,
  target_entity_id uuid,
  action_label text,
  action_url text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_slot_index smallint := coalesce(p_slot_index, 0);
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_action_target text := lower(trim(coalesce(p_action_target, 'mangalar')));
  v_target_entity_id uuid := p_target_entity_id;
  v_action_label text;
  v_action_url text;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun duyurularini yonetme yetkiniz yok.';
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'canManagePinnedNotice') then
    raise exception 'Sabitlenmis duyuru icin Seviye 1 takviye gerekir.';
  end if;

  if v_slot_index < 0 or v_slot_index > 2 then
    raise exception 'Slot indeksi 0 ile 2 arasinda olmalidir.';
  end if;

  if v_title is null then
    raise exception 'Duyuru basligi bos olamaz.';
  end if;

  if v_body is null then
    raise exception 'Duyuru metni bos olamaz.';
  end if;

  select resolved.target_label, resolved.route_hint
  into v_action_label, v_action_url
  from public.resolve_fansub_notice_target(p_fansub_id, v_action_target, v_target_entity_id) as resolved;

  insert into public.fansub_pinned_notices as notice (
    fansub_id,
    slot_index,
    title,
    body,
    action_target,
    target_entity_id,
    action_label,
    action_url,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_fansub_id,
    v_slot_index,
    v_title,
    v_body,
    v_action_target,
    v_target_entity_id,
    v_action_label,
    v_action_url,
    coalesce(p_is_active, true),
    v_actor_id,
    v_actor_id
  )
  on conflict on constraint fansub_pinned_notices_fansub_slot_key do update
  set
    title = excluded.title,
    body = excluded.body,
    action_target = excluded.action_target,
    target_entity_id = excluded.target_entity_id,
    action_label = excluded.action_label,
    action_url = excluded.action_url,
    is_active = excluded.is_active,
    updated_by = excluded.updated_by,
    updated_at = now();

  return query
  select
    notice.id,
    notice.fansub_id,
    notice.slot_index,
    notice.title,
    notice.body,
    notice.action_target,
    notice.target_entity_id,
    notice.action_label,
    notice.action_url,
    notice.is_active,
    notice.created_at,
    notice.updated_at
  from public.fansub_pinned_notices as notice
  where notice.fansub_id = p_fansub_id
    and notice.slot_index = v_slot_index;
end;
$$;

drop function if exists public.send_fansub_special_notification(uuid, text, text, text);
drop function if exists public.send_fansub_special_notification(uuid, text, text, text, uuid);

create function public.send_fansub_special_notification(
  p_fansub_id uuid,
  p_title text,
  p_message text,
  p_route_target text,
  p_target_entity_id uuid
)
returns table (
  success boolean,
  broadcast_id uuid,
  fansub_id uuid,
  title text,
  message text,
  route_target text,
  target_entity_id uuid,
  route_label text,
  route_hint text,
  recipient_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_route_target text := lower(trim(coalesce(p_route_target, 'mangalar')));
  v_target_entity_id uuid := p_target_entity_id;
  v_route_label text;
  v_route_hint text;
  v_fansub_name text := 'Fansub';
  v_broadcast_id uuid;
  v_created_at timestamptz;
  v_recipient_count integer := 0;
  v_follower_user_id uuid;
  v_last_broadcast_at timestamptz;
  v_recent_broadcast_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun takipcilerine bildirim gonderme yetkiniz yok.';
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'canUseSpecialNotifications') then
    raise exception 'Ozel bildirim gonderimi icin Seviye 1 takviye gerekir.';
  end if;

  if v_title is null then
    raise exception 'Bildirim basligi bos olamaz.';
  end if;

  if v_message is null then
    raise exception 'Bildirim metni bos olamaz.';
  end if;

  select resolved.target_label, resolved.route_hint
  into v_route_label, v_route_hint
  from public.resolve_fansub_notice_target(p_fansub_id, v_route_target, v_target_entity_id) as resolved;

  select coalesce(f.name, v_fansub_name)
  into v_fansub_name
  from public.fansubs f
  where f.id = p_fansub_id;

  select max(broadcast.created_at)
  into v_last_broadcast_at
  from public.fansub_special_notification_broadcasts as broadcast
  where broadcast.fansub_id = p_fansub_id;

  if v_last_broadcast_at is not null and v_last_broadcast_at > now() - interval '15 minutes' then
    raise exception 'Yeni bildirim icin 15 dakika beklemelisiniz.';
  end if;

  select count(*)
  into v_recent_broadcast_count
  from public.fansub_special_notification_broadcasts as broadcast
  where broadcast.fansub_id = p_fansub_id
    and broadcast.created_at > now() - interval '24 hours';

  if v_recent_broadcast_count >= 6 then
    raise exception 'Son 24 saatte maksimum 6 ozel bildirim gonderebilirsiniz.';
  end if;

  if exists (
    select 1
    from public.fansub_special_notification_broadcasts as broadcast
    where broadcast.fansub_id = p_fansub_id
      and lower(trim(broadcast.title)) = lower(v_title)
      and lower(trim(broadcast.message)) = lower(v_message)
      and broadcast.route_target = v_route_target
      and coalesce(broadcast.target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and broadcast.created_at > now() - interval '12 hours'
  ) then
    raise exception 'Ayni baslik, metin ve hedef kombinasyonu 12 saat icinde tekrar gonderilemez.';
  end if;

  insert into public.fansub_special_notification_broadcasts as broadcast (
    fansub_id,
    title,
    message,
    route_target,
    target_entity_id,
    route_label,
    route_hint,
    recipient_count,
    created_by
  )
  values (
    p_fansub_id,
    v_title,
    v_message,
    v_route_target,
    v_target_entity_id,
    v_route_label,
    v_route_hint,
    0,
    v_actor_id
  )
  returning broadcast.id, broadcast.created_at
  into v_broadcast_id, v_created_at;

  for v_follower_user_id in
    select ff.user_id
    from public.fansub_follows as ff
    join public.users as u
      on u.id = ff.user_id
    where ff.fansub_id = p_fansub_id
      and u.is_active = true
  loop
    if public.is_notification_type_enabled(v_follower_user_id, 'system') then
      perform public.push_notification(
        v_follower_user_id,
        'system',
        v_title,
        v_message,
        jsonb_build_object(
          'event', 'fansub_special_notification',
          'fansub_id', p_fansub_id,
          'fansub_name', v_fansub_name,
          'broadcast_id', v_broadcast_id,
          'route_target', v_route_target,
          'target_entity_id', v_target_entity_id,
          'route_label', v_route_label,
          'route_hint', v_route_hint,
          'event_key', format('fansub-special-notification:%s:%s', v_broadcast_id::text, v_follower_user_id::text)
        )
      );
      v_recipient_count := v_recipient_count + 1;
    end if;
  end loop;

  update public.fansub_special_notification_broadcasts as broadcast
  set recipient_count = v_recipient_count
  where broadcast.id = v_broadcast_id;

  return query
  select
    true,
    v_broadcast_id,
    p_fansub_id,
    v_title,
    v_message,
    v_route_target,
    v_target_entity_id,
    v_route_label,
    v_route_hint,
    v_recipient_count,
    v_created_at;
end;
$$;

grant execute on function public.resolve_fansub_notice_target(uuid, text, uuid) to authenticated;
grant execute on function public.upsert_fansub_pinned_notice(uuid, smallint, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.send_fansub_special_notification(uuid, text, text, text, uuid) to authenticated;

commit;
