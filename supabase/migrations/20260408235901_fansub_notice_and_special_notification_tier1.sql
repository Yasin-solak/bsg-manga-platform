begin;

create table if not exists public.fansub_pinned_notices (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  title text not null,
  body text not null,
  action_label text,
  action_url text,
  is_active boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fansub_id),
  constraint fansub_pinned_notices_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint fansub_pinned_notices_body_check check (char_length(btrim(body)) between 1 and 600),
  constraint fansub_pinned_notices_action_label_check check (
    action_label is null
    or char_length(btrim(action_label)) between 1 and 30
  ),
  constraint fansub_pinned_notices_action_url_check check (
    action_url is null
    or left(btrim(action_url), 1) = '/'
    or btrim(action_url) ~* '^https?://'
  )
);

create index if not exists fansub_pinned_notices_fansub_id_idx
  on public.fansub_pinned_notices (fansub_id);

create index if not exists fansub_pinned_notices_active_updated_idx
  on public.fansub_pinned_notices (is_active, updated_at desc);

create table if not exists public.fansub_special_notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  title text not null,
  message text not null,
  route_hint text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fansub_special_notification_broadcasts_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint fansub_special_notification_broadcasts_message_check check (char_length(btrim(message)) between 1 and 500),
  constraint fansub_special_notification_broadcasts_route_hint_check check (
    route_hint is null
    or left(btrim(route_hint), 1) = '/'
  )
);

create index if not exists fansub_special_notification_broadcasts_fansub_created_idx
  on public.fansub_special_notification_broadcasts (fansub_id, created_at desc);

create or replace function public.fansub_has_boost_capability(
  p_fansub_id uuid,
  p_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (s.capabilities ->> nullif(trim(coalesce(p_capability_key, '')), ''))::boolean
    from public.fansub_boost_snapshots s
    where s.fansub_id = p_fansub_id
  ), false);
$$;

alter table public.fansub_pinned_notices enable row level security;
alter table public.fansub_special_notification_broadcasts enable row level security;

drop policy if exists fansub_pinned_notices_select_public on public.fansub_pinned_notices;
create policy fansub_pinned_notices_select_public
  on public.fansub_pinned_notices
  for select
  using (
    (
      is_active = true
      and public.fansub_has_boost_capability(fansub_id, 'canManagePinnedNotice')
    )
    or public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_special_notification_broadcasts_select_staff on public.fansub_special_notification_broadcasts;
create policy fansub_special_notification_broadcasts_select_staff
  on public.fansub_special_notification_broadcasts
  for select
  using (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

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

  insert into public.fansub_pinned_notices (
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
  on conflict (fansub_id) do update
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
    fpn.id,
    fpn.fansub_id,
    fpn.title,
    fpn.body,
    fpn.action_label,
    fpn.action_url,
    fpn.is_active,
    fpn.created_at,
    fpn.updated_at
  from public.fansub_pinned_notices fpn
  where fpn.fansub_id = p_fansub_id;
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
  from public.fansubs f
  where f.id = p_fansub_id;

  insert into public.fansub_special_notification_broadcasts (
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
  returning id, created_at
  into v_broadcast_id, v_created_at;

  for v_follower_user_id in
    select ff.user_id
    from public.fansub_follows ff
    join public.users u
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

  update public.fansub_special_notification_broadcasts
  set recipient_count = v_recipient_count
  where id = v_broadcast_id;

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

grant execute on function public.fansub_has_boost_capability(uuid, text) to anon, authenticated;
grant execute on function public.upsert_fansub_pinned_notice(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.send_fansub_special_notification(uuid, text, text, text) to authenticated;

commit;
