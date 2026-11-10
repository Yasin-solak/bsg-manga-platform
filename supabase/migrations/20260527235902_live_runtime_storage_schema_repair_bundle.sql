-- Repairs with one SQL the broken chain formed on live when 200+ advisor and security
-- hardenings stopped midway:
-- 1) store profile effect columns + schema cache
-- 2) runtime feature flag trigger helper permissions
-- 3) store purchase users guard transaction flag
-- 4) avatar and community image storage policy repair

begin;

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.current_app_role() = 'admin';
$function$;

create or replace function app_private.can_manage_moderation_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select auth.role() = 'service_role' or app_private.is_admin();
$function$;

create or replace function app_private.current_public_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
    and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
    and (
      u.active_session_id is null
      or u.active_session_id = public.current_auth_session_id()
    )
  limit 1;
$function$;

create or replace function app_private.is_fansub_staff(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = app_private.current_public_user_id()
      and fm.role in ('admin', 'moderator')
      and f.is_active = true
  );
$function$;

create or replace function app_private.can_write_pending_community_post_child(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    app_private.can_manage_moderation_state()
    or exists (
      select 1
      from public.community_posts cp
      where cp.id = p_post_id
        and cp.author_id = app_private.current_public_user_id()
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
    );
$function$;

create or replace function app_private.is_feature_enabled(
  p_key text,
  p_default boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_key text := lower(trim(coalesce(p_key, '')));
  v_enabled boolean;
  v_rollout integer;
  v_hash_input text;
  v_bucket integer;
  v_strict_fail_closed boolean := false;
begin
  if v_key = '' then
    return false;
  end if;

  v_strict_fail_closed := v_key = any (array[
    'home.follow_feed',
    'reader.comments',
    'notifications.center',
    'economy.coin_codes',
    'economy.fansub_wallet_purchase',
    'economy.store_purchase',
    'community.posting',
    'moderation.reports',
    'rewards.user_tasks',
    'admin.operations_center'
  ]);

  select ff.is_enabled, ff.rollout_percent
  into v_enabled, v_rollout
  from public.feature_flags ff
  where ff.key = v_key
    and (ff.is_public = true or app_private.is_admin())
  limit 1;

  if not found then
    if v_strict_fail_closed then
      return false;
    end if;

    return coalesce(p_default, false);
  end if;

  if v_enabled is not true then
    return false;
  end if;

  if coalesce(v_rollout, 0) >= 100 then
    return true;
  end if;

  if coalesce(v_rollout, 0) <= 0 then
    return false;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  v_hash_input := auth.uid()::text || ':' || v_key;
  v_bucket := (abs(('x' || substr(md5(v_hash_input), 1, 8))::bit(32)::bigint) % 100)::integer;

  return v_bucket < v_rollout;
end;
$function$;

grant execute on function app_private.is_admin() to anon, authenticated, service_role;
grant execute on function app_private.can_manage_moderation_state() to anon, authenticated, service_role;
grant execute on function app_private.current_public_user_id() to anon, authenticated, service_role;
grant execute on function app_private.is_fansub_staff(uuid) to authenticated, service_role;
grant execute on function app_private.can_write_pending_community_post_child(uuid) to authenticated, service_role;
grant execute on function app_private.is_feature_enabled(text, boolean) to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets',
  'store-assets',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.store_profile_effect_assets
  add column if not exists modal_backdrop_asset_url text,
  add column if not exists effect_manifest jsonb not null default '{}'::jsonb;

alter table public.store_profile_effect_assets
  drop constraint if exists store_profile_effect_assets_effect_manifest_object_check;

alter table public.store_profile_effect_assets
  add constraint store_profile_effect_assets_effect_manifest_object_check
  check (jsonb_typeof(effect_manifest) = 'object');

drop policy if exists "Admin upload store assets" on storage.objects;
drop policy if exists "Admin update store assets" on storage.objects;
drop policy if exists "Admin delete store assets" on storage.objects;

create policy "Admin upload store assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  );

create policy "Admin update store assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  )
  with check (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  );

create policy "Admin delete store assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  );

create or replace function public.set_feature_flag_updated_by()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_actor_id uuid;
begin
  v_actor_id := app_private.current_public_user_id();
  if v_actor_id is not null then
    new.updated_by := v_actor_id;
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_reports_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if not app_private.is_feature_enabled('moderation.reports', true) then
    raise exception 'Raporlama sistemi su anda gecici olarak kapali.';
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_community_posting_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if not app_private.is_feature_enabled('community.posting', true) then
    raise exception 'Topluluk paylasim ve yorum olusturma su anda gecici olarak kapali.';
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_reader_comments_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if not app_private.is_feature_enabled('reader.comments', true) then
    raise exception 'Manga ve bolum yorum gonderimi su anda gecici olarak kapali.';
  end if;

  return new;
end;
$function$;

revoke execute on function public.is_feature_enabled(text, boolean) from anon, authenticated, public;
grant execute on function public.is_feature_enabled(text, boolean) to service_role;

create or replace function public.prevent_non_admin_sensitive_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_caller_id uuid := public.current_public_user_id();
  v_context text := '';
  v_request_path text := lower(coalesce(current_setting('request.path', true), ''));
  v_allow_sensitive boolean := false;
  v_session_claim_update boolean := current_setting('app.claim_active_session_update', true) = 'true';
  v_store_purchase_update boolean := current_setting('app.store_purchase_user_update', true) = 'true';
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

  if v_store_purchase_update then
    if new.id is distinct from old.id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.role is distinct from old.role
      or new.is_banned is distinct from old.is_banned
      or new.is_active is distinct from old.is_active
      or new.active_session_id is distinct from old.active_session_id
      or new.active_session_claimed_at is distinct from old.active_session_claimed_at
      or new.frame_type is distinct from old.frame_type
      or new.background_type is distinct from old.background_type
      or (to_jsonb(new) - 'stones' - 'owned_items' - 'premium_expires_at' - 'active_profile_effect_id' - 'updated_at')
         is distinct from
         (to_jsonb(old) - 'stones' - 'owned_items' - 'premium_expires_at' - 'active_profile_effect_id' - 'updated_at')
    then
      raise exception 'Magaza satin alma yalniz ekonomi ve aktif profil efekti alanlarini guncelleyebilir.';
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
    or v_request_path ~ '(^|/)rpc/(purchase_store_item|purchase_user_badge|purchase_fansub_badge|redeem_coin_code|claim_user_reward_task|purchase_fansub_store_item_with_user_wallet|set_user_ban_state|release_my_expired_ban|release_expired_bans|revoke_auth_session|donate_to_fansub|rewrite_legacy_user_avatar_url|update_my_profile_customization|purchase_fansub_boost)$'
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

create or replace function public.purchase_store_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_now timestamptz := now();
  v_user_id uuid;
  v_user public.users%rowtype;
  v_item public.store_items%rowtype;
  v_target_key text;
  v_target_value text;
  v_owned jsonb;
  v_target_array jsonb;
  v_already_owned boolean;
  v_new_stones integer;
  v_config public.premium_runtime_config%rowtype;
  v_premium_started_at timestamptz;
  v_premium_expires_at timestamptz;
  v_reward_item public.store_items%rowtype;
  v_reward_identifier text;
  v_reward_type text;
  v_compensation_coins integer := 0;
  v_premium_identifier text;
  v_next_active_profile_effect_id uuid;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Public profil bulunamadi.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Urun bulunamadi veya aktif degil.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile satin alinmiyor.';
  end if;

  if v_user.stones < v_item.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
  v_new_stones := v_user.stones - v_item.price;
  v_next_active_profile_effect_id := v_user.active_profile_effect_id;

  if v_item.type <> 'premium' then
    v_target_key := case v_item.type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      when 'pattern' then 'patterns'
      when 'badge' then 'badges'
      when 'profile_effect' then 'profile_effects'
      else 'premium'
    end;

    v_target_value := coalesce(v_item.identifier, v_item.id::text);
    v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb);

    select exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_target_value
    )
    into v_already_owned;

    if v_already_owned then
      raise exception 'Bu urun zaten envanterinizde bulunuyor.';
    end if;

    v_target_array := v_target_array || to_jsonb(v_target_value);
    v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);

    if v_item.type = 'profile_effect' and v_next_active_profile_effect_id is null then
      v_next_active_profile_effect_id := v_item.id;
    end if;

    perform set_config('app.store_purchase_user_update', 'true', true);

    update public.users
    set stones = v_new_stones,
        owned_items = v_owned,
        active_profile_effect_id = v_next_active_profile_effect_id
    where id = v_user_id;

    perform set_config('app.store_purchase_user_update', '', true);

    update public.store_items
    set purchase_count = purchase_count + 1
    where id = v_item.id;

    return jsonb_build_object(
      'user_id', v_user_id,
      'item_id', v_item.id,
      'item_type', v_item.type,
      'item_identifier', v_item.identifier,
      'stones', v_new_stones,
      'owned_items', v_owned,
      'premium_expires_at', v_user.premium_expires_at,
      'active_profile_effect_id', v_next_active_profile_effect_id
    );
  end if;

  select *
  into v_config
  from public.premium_runtime_config cfg
  where cfg.id = true
  for update;

  if not found then
    raise exception 'Premium runtime ayari bulunamadi.';
  end if;

  if v_config.premium_store_item_id <> v_item.id then
    raise exception 'Secilen premium urun aktif premium ayariyla uyusmuyor.';
  end if;

  v_premium_identifier := coalesce(v_item.identifier, v_item.id::text);
  v_target_array := coalesce(v_owned -> 'premium', '[]'::jsonb);
  if not exists (
    select 1
    from jsonb_array_elements_text(v_target_array) as t(value)
    where t.value = v_premium_identifier
  ) then
    v_target_array := v_target_array || to_jsonb(v_premium_identifier);
    v_owned := jsonb_set(v_owned, '{premium}', v_target_array, true);
  end if;

  select si.*
  into v_reward_item
  from public.store_items si
  where si.type in ('frame', 'background', 'pattern')
    and si.is_active = true
    and not exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(
          v_owned -> case si.type
            when 'frame' then 'frames'
            when 'background' then 'backgrounds'
            else 'patterns'
          end,
          '[]'::jsonb
        )
      ) as owned_value(value)
      where owned_value.value = coalesce(si.identifier, si.id::text)
    )
  order by random()
  limit 1;

  if found then
    v_reward_type := v_reward_item.type;
    v_reward_identifier := coalesce(v_reward_item.identifier, v_reward_item.id::text);
    v_target_key := case v_reward_type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      else 'patterns'
    end;
    v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb) || to_jsonb(v_reward_identifier);
    v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);
  else
    v_compensation_coins := coalesce(v_config.compensation_coins, 0);
    v_new_stones := v_new_stones + v_compensation_coins;
  end if;

  insert into public.user_badges (
    user_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    v_user_id,
    v_config.premium_badge_id,
    false,
    0
  )
  on conflict (user_id, badge_id) do nothing;

  v_premium_started_at := greatest(v_now, coalesce(v_user.premium_expires_at, v_now));
  v_premium_expires_at := v_premium_started_at + make_interval(days => v_config.premium_duration_days);

  insert into public.user_premium_subscriptions (
    user_id,
    package_id,
    runtime_config_id,
    premium_store_item_id,
    purchased_at,
    extension_started_at,
    extension_expires_at,
    extension_days,
    source
  )
  values (
    v_user_id,
    null,
    v_config.id,
    v_item.id,
    v_now,
    v_premium_started_at,
    v_premium_expires_at,
    v_config.premium_duration_days,
    'store_purchase'
  );

  insert into public.user_premium_reward_events (
    user_id,
    runtime_config_id,
    premium_store_item_id,
    rewarded_store_item_id,
    rewarded_store_item_type,
    rewarded_store_item_identifier,
    premium_badge_id,
    compensation_coins,
    premium_started_at,
    premium_expires_at,
    source
  )
  values (
    v_user_id,
    v_config.id,
    v_item.id,
    v_reward_item.id,
    v_reward_type,
    v_reward_identifier,
    v_config.premium_badge_id,
    v_compensation_coins,
    v_premium_started_at,
    v_premium_expires_at,
    'store_purchase'
  );

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set stones = v_new_stones,
      owned_items = v_owned,
      premium_expires_at = v_premium_expires_at,
      active_profile_effect_id = v_next_active_profile_effect_id
  where id = v_user_id;

  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_item.id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'item_id', v_item.id,
    'item_type', v_item.type,
    'item_identifier', v_item.identifier,
    'stones', v_new_stones,
    'owned_items', v_owned,
    'premium_expires_at', v_premium_expires_at,
    'premium_duration_days', v_config.premium_duration_days,
    'premium_badge_id', v_config.premium_badge_id,
    'premium_compensation_coins', v_compensation_coins,
    'active_profile_effect_id', v_next_active_profile_effect_id,
    'premium_reward',
      case
        when v_reward_item.id is null then null
        else jsonb_build_object(
          'id', v_reward_item.id,
          'identifier', coalesce(v_reward_item.identifier, v_reward_item.id::text),
          'name', v_reward_item.name,
          'type', v_reward_item.type,
          'custom_asset_url', v_reward_item.custom_asset_url
        )
      end
  );
end;
$function$;

grant execute on function public.purchase_store_item(uuid) to authenticated;

drop policy if exists "Scoped upload avatars" on storage.objects;
drop policy if exists "Scoped update avatars" on storage.objects;
drop policy if exists "Scoped delete avatars" on storage.objects;

create policy "Scoped upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          coalesce(owner_id, owner::text) = auth.uid()::text
          or (storage.foldername(name))[2] = auth.uid()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansub-drafts'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'avatar'
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] = 'avatar'
        and (app_private.is_admin() or app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid))
      )
      or (
        (storage.foldername(name))[1] = 'fansub-avatars'
        and coalesce(owner_id, owner::text) = auth.uid()::text
      )
    )
  );

create policy "Scoped update avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = auth.uid()::text
      or app_private.is_admin()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = auth.uid()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = auth.uid()::text
      or app_private.is_admin()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = auth.uid()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Scoped delete avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = auth.uid()::text
      or app_private.is_admin()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = auth.uid()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

drop policy if exists "Community post image upload own posts" on storage.objects;
drop policy if exists "Community post image upload own pending posts" on storage.objects;

create policy "Community post image upload own pending posts"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'community'
    and (storage.foldername(name))[2] = 'posts'
    and coalesce((storage.foldername(name))[4], '') ~ '^slot-0[1-4]$'
    and case
      when coalesce((storage.foldername(name))[3], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then app_private.can_write_pending_community_post_child(((storage.foldername(name))[3])::uuid)
      else false
    end
  );

notify pgrst, 'reload schema';

commit;
