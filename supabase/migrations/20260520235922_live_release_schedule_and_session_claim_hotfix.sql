-- Live runtime hotfix:
-- 1) The release schedule must use the app_private unlock helper while the public helper execute grant is closed.
-- 2) Active session claim must not depend on a regex-based call-stack exception in the sensitive users trigger.

begin;

create or replace function public.list_public_release_schedule(
  p_fansub_id uuid default null,
  p_from timestamptz default null,
  p_days_ahead integer default 30,
  p_limit integer default 200
)
returns table (
  chapter_id uuid,
  manga_id uuid,
  manga_title text,
  manga_slug text,
  manga_cover_image_url text,
  fansub_id uuid,
  fansub_name text,
  fansub_slug text,
  chapter_number numeric,
  chapter_title text,
  publish_at timestamptz,
  is_upcoming boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_days_ahead integer := least(greatest(coalesce(p_days_ahead, 30), 1), 120);
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_to timestamptz := v_from + make_interval(days => v_days_ahead);
begin
  return query
  select
    c.id as chapter_id,
    m.id as manga_id,
    m.title as manga_title,
    m.slug as manga_slug,
    m.cover_image_url as manga_cover_image_url,
    coalesce(c.fansub_id, m.fansub_id) as fansub_id,
    f.name as fansub_name,
    f.slug as fansub_slug,
    c.chapter_number,
    c.title as chapter_title,
    app_private.chapter_public_unlock_at(c.publish_at) as publish_at,
    (app_private.chapter_public_unlock_at(c.publish_at) > now()) as is_upcoming
  from public.chapters c
  join public.mangas m on m.id = c.manga_id
  left join public.fansubs f on f.id = coalesce(c.fansub_id, m.fansub_id)
  where c.is_active = true
    and c.is_approved = true
    and m.is_active = true
    and m.is_approved = true
    and coalesce(f.is_active, true) = true
    and c.publish_at is not null
    and app_private.chapter_public_unlock_at(c.publish_at) >= v_from
    and app_private.chapter_public_unlock_at(c.publish_at) < v_to
    and (
      p_fansub_id is null
      or coalesce(c.fansub_id, m.fansub_id) = p_fansub_id
    )
  order by app_private.chapter_public_unlock_at(c.publish_at) asc, m.title asc, c.chapter_number asc
  limit v_limit;
end;
$function$;

grant execute on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) to anon, authenticated;

create or replace function public.prevent_non_admin_sensitive_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_caller_id uuid := public.current_public_user_id();
  v_context text := '';
  v_allow_sensitive boolean := false;
  v_session_claim_update boolean := current_setting('app.claim_active_session_update', true) = 'true';
begin
  get diagnostics v_context = PG_CONTEXT;

  if public.is_admin() then
    return new;
  end if;

  if v_session_claim_update then
    if old.auth_user_id is distinct from auth.uid()
      or new.auth_user_id is distinct from old.auth_user_id
      or new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.is_banned is distinct from old.is_banned
      or new.is_active is distinct from old.is_active
      or new.stones is distinct from old.stones
      or new.premium_expires_at is distinct from old.premium_expires_at
      or new.owned_items is distinct from old.owned_items
      or (to_jsonb(new) - 'active_session_id' - 'active_session_claimed_at' - 'updated_at')
         is distinct from
         (to_jsonb(old) - 'active_session_id' - 'active_session_claimed_at' - 'updated_at')
    then
      raise exception 'Aktif session claim yalniz oturum alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

  v_allow_sensitive := (
    v_context ~* 'function[[:space:]]+(public\.)?purchase_store_item[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_user_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?redeem_coin_code[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?claim_user_reward_task[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_store_item_with_user_wallet[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?set_user_ban_state[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?release_my_expired_ban[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?release_expired_bans[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?revoke_auth_session[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?donate_to_fansub[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?rewrite_legacy_user_avatar_url[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?update_my_profile_customization[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_boost[[:space:]]*\('
  );

  if v_allow_sensitive then
    return new;
  end if;

  if v_caller_id is null then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  if old.id <> v_caller_id then
    raise exception 'Sadece kendi profilinizi guncelleyebilirsiniz.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Rol alani degistirilemez.';
  end if;

  if new.is_banned is distinct from old.is_banned then
    raise exception 'Ban alani degistirilemez.';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception 'Aktiflik alani degistirilemez.';
  end if;

  if new.stones is distinct from old.stones then
    raise exception 'Bakiye alani degistirilemez.';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Hesap baglantisi degistirilemez.';
  end if;

  if new.premium_expires_at is distinct from old.premium_expires_at then
    raise exception 'Premium suresi alani degistirilemez.';
  end if;

  if new.active_session_id is distinct from old.active_session_id then
    raise exception 'Aktif session alani degistirilemez.';
  end if;

  if new.active_session_claimed_at is distinct from old.active_session_claimed_at then
    raise exception 'Session claim zamani degistirilemez.';
  end if;

  if new.owned_items is distinct from old.owned_items then
    raise exception 'Envanter alani dogrudan degistirilemez.';
  end if;

  if new.frame_type is distinct from old.frame_type then
    raise exception 'Cerceve alani dogrudan degistirilemez.';
  end if;

  if new.background_type is distinct from old.background_type then
    raise exception 'Arka plan alani dogrudan degistirilemez.';
  end if;

  if new.active_profile_effect_id is distinct from old.active_profile_effect_id then
    raise exception 'Profil efekti alani dogrudan degistirilemez.';
  end if;

  if new.active_badge_id is distinct from old.active_badge_id then
    raise exception 'Aktif rozet alani dogrudan degistirilemez.';
  end if;

  return new;
end;
$function$;

create or replace function public.claim_active_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_previous_session_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_session_id is null then
    raise exception 'Gecerli bir session id zorunludur.';
  end if;

  if public.is_auth_session_revoked(v_auth_user_id, p_session_id) then
    raise exception 'Bu oturum guvenlik nedeniyle kapatildi.';
  end if;

  select u.active_session_id
  into v_previous_session_id
  from public.users u
  where u.auth_user_id = v_auth_user_id
  for update;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  perform set_config('app.claim_active_session_update', 'true', true);

  update public.users
  set active_session_id = p_session_id,
      active_session_claimed_at = now()
  where auth_user_id = v_auth_user_id;

  perform set_config('app.claim_active_session_update', '', true);

  if v_previous_session_id is distinct from p_session_id then
    insert into public.auth_session_events (auth_user_id, session_id, claimed_at, last_seen_at)
    values (v_auth_user_id, p_session_id, now(), now())
    on conflict (auth_user_id, session_id)
    do update
      set claimed_at = excluded.claimed_at,
          last_seen_at = excluded.last_seen_at;

    delete from public.auth_session_events
    where auth_user_id = v_auth_user_id
      and id in (
        select stale.id
        from public.auth_session_events stale
        where stale.auth_user_id = v_auth_user_id
        order by stale.claimed_at desc, stale.id desc
        offset 5
      );
  end if;
end;
$function$;

revoke all on function public.claim_active_session(uuid) from public;
grant execute on function public.claim_active_session(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
