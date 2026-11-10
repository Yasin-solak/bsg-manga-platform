begin;

create or replace function public.upsert_fansub_pinned_notice(
  p_fansub_id uuid,
  p_title text,
  p_body text,
  p_action_label text default null,
  p_action_url text default null,
  p_is_active boolean default true
)
returns table (
  id uuid,
  fansub_id uuid,
  title text,
  body text,
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
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_action_label text := nullif(trim(coalesce(p_action_label, '')), '');
  v_action_url text := nullif(trim(coalesce(p_action_url, '')), '');
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

  if v_title is null then
    raise exception 'Duyuru basligi bos olamaz.';
  end if;

  if v_body is null then
    raise exception 'Duyuru metni bos olamaz.';
  end if;

  if v_action_url is not null and not (
    left(v_action_url, 1) = '/'
    or v_action_url ~* '^https?://'
  ) then
    raise exception 'Aksiyon adresi / ile baslamali veya https:// ile verilmelidir.';
  end if;

  insert into public.fansub_pinned_notices as notice (
    fansub_id,
    title,
    body,
    action_label,
    action_url,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_fansub_id,
    v_title,
    v_body,
    v_action_label,
    v_action_url,
    coalesce(p_is_active, true),
    v_actor_id,
    v_actor_id
  )
  on conflict on constraint fansub_pinned_notices_fansub_id_key do update
  set
    title = excluded.title,
    body = excluded.body,
    action_label = excluded.action_label,
    action_url = excluded.action_url,
    is_active = excluded.is_active,
    updated_by = excluded.updated_by,
    updated_at = now();

  return query
  select
    notice.id,
    notice.fansub_id,
    notice.title,
    notice.body,
    notice.action_label,
    notice.action_url,
    notice.is_active,
    notice.created_at,
    notice.updated_at
  from public.fansub_pinned_notices as notice
  where notice.fansub_id = p_fansub_id;
end;
$$;

create or replace function public.send_fansub_special_notification(
  p_fansub_id uuid,
  p_title text,
  p_message text,
  p_route_hint text default null
)
returns table (
  broadcast_id uuid,
  fansub_id uuid,
  title text,
  message text,
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
  v_route_hint text := nullif(trim(coalesce(p_route_hint, '')), '');
  v_fansub_name text := 'Fansub';
  v_broadcast_id uuid;
  v_created_at timestamptz;
  v_recipient_count integer := 0;
  v_follower_user_id uuid;
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

  if v_route_hint is not null and left(v_route_hint, 1) <> '/' then
    raise exception 'Bildirim hedef yolu / ile baslamalidir.';
  end if;

  v_route_hint := coalesce(v_route_hint, format('/fansub/%s', p_fansub_id::text));

  select coalesce(f.name, v_fansub_name)
  into v_fansub_name
  from public.fansubs as f
  where f.id = p_fansub_id;

  insert into public.fansub_special_notification_broadcasts as broadcast (
    fansub_id,
    title,
    message,
    route_hint,
    recipient_count,
    created_by
  )
  values (
    p_fansub_id,
    v_title,
    v_message,
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
    v_broadcast_id,
    p_fansub_id,
    v_title,
    v_message,
    v_route_hint,
    v_recipient_count,
    v_created_at;
end;
$$;

grant execute on function public.upsert_fansub_pinned_notice(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.send_fansub_special_notification(uuid, text, text, text) to authenticated;

commit;
