begin;

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

alter table public.premium_runtime_config
  alter column premium_badge_id drop not null;

update public.premium_runtime_config
set public_unlock_delay_hours = 36,
    compensation_coins = 0,
    updated_at = now()
where id = true;

update public.store_items
set description = 'Premium uyelik; erken bolum erisimi, profil isim stili, ozel profil arka plani ve fansub ifade kullanimini sure boyunca acar. Satin alma kalici urun, rozet, kozmetik veya Coin telafisi vermez.',
    updated_at = now()
where type = 'premium'
  and (
    id = (select cfg.premium_store_item_id from public.premium_runtime_config cfg where cfg.id = true)
    or identifier = 'namefx-pass'
  );

create table if not exists public.store_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  request_key uuid not null,
  item_id uuid not null references public.store_items(id) on delete restrict,
  status text not null default 'running'
    check (status in ('running', 'completed')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_key)
);

create index if not exists idx_store_purchase_requests_user_created
  on public.store_purchase_requests (user_id, created_at desc);

alter table public.store_purchase_requests enable row level security;

drop policy if exists store_purchase_requests_owner_read on public.store_purchase_requests;
create policy store_purchase_requests_owner_read
  on public.store_purchase_requests
  for select
  to authenticated
  using (user_id = public.current_public_user_id());

grant select on public.store_purchase_requests to authenticated;

comment on table public.store_purchase_requests
  is 'Magaza satin alma RPC isteklerini request_key ile tekilleştirir; ayni istek tekrar geldiginde ayni sonuc dondurulur.';

create or replace function app_private.is_uploaded_profile_background_ref(p_ref text)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select position('user-backgrounds/' in lower(coalesce(p_ref, ''))) > 0
$function$;

create or replace function app_private.visible_profile_background_type(
  p_background_type text,
  p_premium_expires_at timestamptz
)
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select case
    when app_private.is_uploaded_profile_background_ref(p_background_type)
      and (p_premium_expires_at is null or p_premium_expires_at <= now())
      then null
    else nullif(btrim(coalesce(p_background_type, '')), '')
  end
$function$;

revoke execute on function app_private.is_uploaded_profile_background_ref(text) from public;
revoke execute on function app_private.visible_profile_background_type(text, timestamptz) from public;
grant execute on function app_private.is_uploaded_profile_background_ref(text) to anon, authenticated, service_role;
grant execute on function app_private.visible_profile_background_type(text, timestamptz) to anon, authenticated, service_role;

create or replace function app_private.chapter_public_unlock_at(p_publish_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_delay_hours integer := 36;
begin
  if p_publish_at is null then
    return null;
  end if;

  select coalesce(cfg.public_unlock_delay_hours, 36)
  into v_delay_hours
  from public.premium_runtime_config cfg
  where cfg.id = true
  limit 1;

  return p_publish_at + make_interval(hours => greatest(coalesce(v_delay_hours, 36), 0));
end;
$function$;

create or replace function public.chapter_public_unlock_at(p_publish_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_delay_hours integer := 36;
begin
  if p_publish_at is null then
    return null;
  end if;

  select coalesce(cfg.public_unlock_delay_hours, 36)
  into v_delay_hours
  from public.premium_runtime_config cfg
  where cfg.id = true
  limit 1;

  return p_publish_at + make_interval(hours => greatest(coalesce(v_delay_hours, 36), 0));
end;
$function$;

create or replace function app_private.is_chapter_publicly_unlocked(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when p_publish_at is null then true
      else app_private.chapter_public_unlock_at(p_publish_at) <= now()
    end
$function$;

create or replace function public.is_chapter_publicly_unlocked(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when p_publish_at is null then true
      else public.chapter_public_unlock_at(p_publish_at) <= now()
    end
$function$;

create or replace function app_private.can_current_user_access_chapter(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when p_publish_at is null then true
      when p_publish_at > now() then false
      when public.current_user_has_active_premium() then true
      else app_private.is_chapter_publicly_unlocked(p_publish_at)
    end
$function$;

create or replace function public.can_current_user_access_chapter(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when p_publish_at is null then true
      when p_publish_at > now() then false
      when public.current_user_has_active_premium() then true
      else public.is_chapter_publicly_unlocked(p_publish_at)
    end
$function$;

revoke execute on function public.can_current_user_access_chapter(timestamptz) from anon, authenticated, public;
grant execute on function public.can_current_user_access_chapter(timestamptz) to service_role;

create or replace function public.get_active_premium_offer()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  select jsonb_build_object(
    'premium_item', jsonb_build_object(
      'id', item.id,
      'identifier', item.identifier,
      'name', item.name,
      'description', item.description,
      'price', item.price
    ),
    'duration_days', greatest(coalesce(cfg.premium_duration_days, 30), 1),
    'public_unlock_delay_hours', greatest(coalesce(cfg.public_unlock_delay_hours, 36), 0)
  )
  from public.premium_runtime_config cfg
  join public.store_items item
    on item.id = cfg.premium_store_item_id
  where cfg.id = true
    and item.type = 'premium'
    and item.is_active = true
  limit 1
$function$;

grant execute on function public.get_active_premium_offer() to anon, authenticated;

create or replace function public.purchase_store_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  raise exception 'Magaza satin alma request_key gerektirir. Guncel istemci purchase_store_item(p_item_id, p_request_key) kullanmalidir.';
end;
$function$;

revoke execute on function public.purchase_store_item(uuid) from anon, authenticated, public;

create or replace function public.purchase_store_item(p_item_id uuid, p_request_key uuid)
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
  v_request public.store_purchase_requests%rowtype;
  v_response jsonb;
  v_next_active_profile_effect_id uuid;
begin
  if p_request_key is null then
    raise exception 'Satin alma istek anahtari zorunludur.';
  end if;

  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  insert into public.store_purchase_requests (user_id, request_key, item_id, status)
  values (v_user_id, p_request_key, p_item_id, 'running')
  on conflict (user_id, request_key) do nothing
  returning *
  into v_request;

  if not found then
    select *
    into v_request
    from public.store_purchase_requests
    where user_id = v_user_id
      and request_key = p_request_key
    limit 1;

    if not found then
      raise exception 'Satin alma istegi dogrulanamadi.';
    end if;

    if v_request.item_id <> p_item_id then
      raise exception 'Ayni istek anahtari farkli bir urun icin tekrar kullanilamaz.';
    end if;

    if v_request.response is not null then
      return v_request.response || jsonb_build_object('idempotent_replay', true);
    end if;

    raise exception 'Satin alma istegi halen isleniyor. Lutfen tekrar deneyin.';
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

  v_owned := coalesce(
    v_user.owned_items,
    '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[],"uploaded_background_slots":[],"profile_background_upload_slot_limit":1}'::jsonb
  );
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

    v_response := jsonb_build_object(
      'user_id', v_user_id,
      'item_id', v_item.id,
      'item_type', v_item.type,
      'item_identifier', v_item.identifier,
      'stones', v_new_stones,
      'owned_items', v_owned,
      'premium_expires_at', v_user.premium_expires_at,
      'active_profile_effect_id', v_next_active_profile_effect_id,
      'idempotency_key', p_request_key,
      'idempotent_replay', false
    );

    update public.store_purchase_requests
    set status = 'completed',
        response = v_response,
        completed_at = now()
    where id = v_request.id;

    return v_response;
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

  v_premium_started_at := greatest(v_now, coalesce(v_user.premium_expires_at, v_now));
  v_premium_expires_at := v_premium_started_at + make_interval(days => greatest(coalesce(v_config.premium_duration_days, 30), 1));

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
    greatest(coalesce(v_config.premium_duration_days, 30), 1),
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

  v_response := jsonb_build_object(
    'user_id', v_user_id,
    'item_id', v_item.id,
    'item_type', v_item.type,
    'item_identifier', v_item.identifier,
    'stones', v_new_stones,
    'owned_items', v_owned,
    'premium_expires_at', v_premium_expires_at,
    'premium_duration_days', greatest(coalesce(v_config.premium_duration_days, 30), 1),
    'active_profile_effect_id', v_next_active_profile_effect_id,
    'idempotency_key', p_request_key,
    'idempotent_replay', false
  );

  update public.store_purchase_requests
  set status = 'completed',
      response = v_response,
      completed_at = now()
  where id = v_request.id;

  return v_response;
end;
$function$;

grant execute on function public.purchase_store_item(uuid, uuid) to authenticated;

create or replace function public.cleanup_my_expired_premium_profile_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user public.users%rowtype;
  v_should_clear_background boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_user
  from public.users
  where auth_user_id = auth.uid()
  for update;

  if not found then
    return null;
  end if;

  v_should_clear_background :=
    app_private.is_uploaded_profile_background_ref(v_user.background_type)
    and (v_user.premium_expires_at is null or v_user.premium_expires_at <= now());

  if v_should_clear_background then
    perform public.update_my_profile_customization(false, null, true, null, false, null, null);

    select *
    into v_user
    from public.users
    where auth_user_id = auth.uid()
    limit 1;
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'background_type', v_user.background_type,
    'cleared_background_type', v_should_clear_background
  );
end;
$function$;

grant execute on function public.cleanup_my_expired_premium_profile_state() to authenticated;

create or replace function public.get_my_account_economy_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  perform public.cleanup_my_expired_premium_profile_state();

  select *
  into v_row
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'stones', v_row.stones,
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'premium_expires_at', v_row.premium_expires_at
  );
end;
$function$;

grant execute on function public.get_my_account_economy_snapshot() to authenticated;

create or replace view public.public_user_directory
with (security_invoker = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  app_private.visible_profile_background_type(u.background_type, u.premium_expires_at) as background_type,
  app_private.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag
from public.users u
cross join lateral app_private.get_profile_view_access(u.id) as access(
  is_owner,
  viewer_is_follower,
  profile_visible,
  stats_visible,
  social_links_visible,
  activity_visible,
  profile_visibility,
  stats_visibility,
  social_links_visibility,
  activity_visibility
)
where coalesce(u.is_active, true) = true
  and coalesce(u.is_banned, false) = false
  and (
    app_private.can_manage_moderation_state()
    or coalesce(access.profile_visible, false) = true
  );

grant select on public.public_user_directory to anon, authenticated;

create or replace function public.get_public_user_profile_by_id(
  p_user_id uuid,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
  v_is_premium_active boolean := false;
  v_visible_background_type text := null;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where id = p_user_id
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
  end if;

  v_is_premium_active := v_row.premium_expires_at is not null and v_row.premium_expires_at > now();
  v_visible_background_type := app_private.visible_profile_background_type(v_row.background_type, v_row.premium_expires_at);

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_visible_background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', app_private.resolve_user_active_fansub_identity_tag(v_row.id),
    'is_premium_active', v_is_premium_active,
    'active_name_style', case
      when v_is_premium_active then v_row.owned_items -> 'active_name_style'
      else null
    end,
    'active_name_effect', case
      when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'
      else null
    end,
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$function$;

create or replace function public.get_public_user_profile_by_username(
  p_username text,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_normalized_username text := nullif(btrim(coalesce(p_username, '')), '');
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
  v_is_premium_active boolean := false;
  v_visible_background_type text := null;
begin
  if v_normalized_username is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where username = v_normalized_username
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
  end if;

  v_is_premium_active := v_row.premium_expires_at is not null and v_row.premium_expires_at > now();
  v_visible_background_type := app_private.visible_profile_background_type(v_row.background_type, v_row.premium_expires_at);

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_visible_background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', app_private.resolve_user_active_fansub_identity_tag(v_row.id),
    'is_premium_active', v_is_premium_active,
    'active_name_style', case
      when v_is_premium_active then v_row.owned_items -> 'active_name_style'
      else null
    end,
    'active_name_effect', case
      when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'
      else null
    end,
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$function$;

grant execute on function public.get_public_user_profile_by_id(uuid, boolean) to anon, authenticated;
grant execute on function public.get_public_user_profile_by_username(text, boolean) to anon, authenticated;

create or replace function app_private.text_has_fansub_supporter_asset_token(p_text text)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select coalesce(p_text, '') ~* $re$(:fse_[a-z0-9][a-z0-9_-]{1,15}(@[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?:|\[\[fss_[a-z0-9][a-z0-9_-]{1,15}(@[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?\]\])$re$
$function$;

create or replace function app_private.user_has_active_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce((
    select u.premium_expires_at is not null and u.premium_expires_at > now()
    from public.users u
    where u.id = p_user_id
  ), false)
$function$;

create or replace function app_private.enforce_premium_supporter_expression_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_text_column text := tg_argv[0];
  v_author_column text := tg_argv[1];
  v_new_payload jsonb := to_jsonb(new);
  v_old_payload jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_body text := coalesce(v_new_payload ->> v_text_column, '');
  v_author_id uuid := nullif(v_new_payload ->> v_author_column, '')::uuid;
begin
  if tg_op = 'UPDATE'
    and coalesce(v_old_payload ->> v_text_column, '') is not distinct from v_body
    and coalesce(v_old_payload ->> v_author_column, '') is not distinct from coalesce(v_new_payload ->> v_author_column, '')
  then
    return new;
  end if;

  if app_private.text_has_fansub_supporter_asset_token(v_body)
    and not app_private.user_has_active_premium(v_author_id)
  then
    raise exception 'Fansub emoji ve cikartma tokenlarini kullanmak icin aktif premium gerekir.';
  end if;

  return new;
end;
$function$;

revoke execute on function app_private.text_has_fansub_supporter_asset_token(text) from public;
revoke execute on function app_private.user_has_active_premium(uuid) from public;
revoke execute on function app_private.enforce_premium_supporter_expression_usage() from public;
grant execute on function app_private.text_has_fansub_supporter_asset_token(text) to service_role;
grant execute on function app_private.user_has_active_premium(uuid) to service_role;
grant execute on function app_private.enforce_premium_supporter_expression_usage() to service_role;

drop trigger if exists trg_community_posts_premium_supporter_expression on public.community_posts;
create trigger trg_community_posts_premium_supporter_expression
  before insert or update of body, author_id on public.community_posts
  for each row
  execute function app_private.enforce_premium_supporter_expression_usage('body', 'author_id');

drop trigger if exists trg_community_comments_premium_supporter_expression on public.community_comments;
create trigger trg_community_comments_premium_supporter_expression
  before insert or update of body, author_id on public.community_comments
  for each row
  execute function app_private.enforce_premium_supporter_expression_usage('body', 'author_id');

drop trigger if exists trg_manga_comments_premium_supporter_expression on public.manga_comments;
create trigger trg_manga_comments_premium_supporter_expression
  before insert or update of content, user_id on public.manga_comments
  for each row
  execute function app_private.enforce_premium_supporter_expression_usage('content', 'user_id');

drop trigger if exists trg_user_manga_list_comments_premium_supporter_expression on public.user_manga_list_comments;
create trigger trg_user_manga_list_comments_premium_supporter_expression
  before insert or update of body, author_id on public.user_manga_list_comments
  for each row
  execute function app_private.enforce_premium_supporter_expression_usage('body', 'author_id');

notify pgrst, 'reload schema';

commit;
