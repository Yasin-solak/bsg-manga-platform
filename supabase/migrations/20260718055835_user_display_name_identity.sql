-- Splits user identity into two purposes:
-- - username: unique, unchanging handle for route/mention/invite
-- - display_name: the name shown to people, may repeat
--
-- The migration is additive; even if old clients send no display_name the BEFORE
-- trigger writes username as a safe fallback.

begin;

alter table public.users
  add column if not exists display_name text;

create or replace function app_private.normalize_user_display_name()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.display_name := coalesce(
    nullif(pg_catalog.btrim(new.display_name), ''),
    pg_catalog.left(pg_catalog.btrim(new.username), 40)
  );
  return new;
end;
$function$;

revoke all on function app_private.normalize_user_display_name()
  from public, anon, authenticated;

drop trigger if exists users_normalize_display_name on public.users;
create trigger users_normalize_display_name
before insert or update of display_name, username on public.users
for each row execute function app_private.normalize_user_display_name();

-- In a Migration/SQL Editor session auth.uid() is absent, so the existing sensitive
-- column guard rejects the backfill. It closes only during the controlled
-- backfill in this transaction; an error rolls back all ALTER/UPDATE steps.
alter table public.users
  disable trigger trg_users_prevent_non_admin_sensitive_updates;

update public.users as u
set display_name = pg_catalog.left(pg_catalog.btrim(u.username), 40)
where u.display_name is null
   or nullif(pg_catalog.btrim(u.display_name), '') is null;

alter table public.users
  enable trigger trg_users_prevent_non_admin_sensitive_updates;

alter table public.users
  drop constraint if exists users_display_name_format_check;
alter table public.users
  add constraint users_display_name_format_check check (
    display_name = pg_catalog.btrim(display_name)
    and pg_catalog.char_length(display_name) between 1 and 40
    and display_name !~ '[[:cntrl:]]'
  );
alter table public.users
  alter column display_name set not null;

comment on column public.users.display_name is
  'Benzersiz olmayan gorunen ad. Yetkilendirme, mention, profil rotasi ve davet hedefi olarak kullanilmaz; bu islemler username ile yapilir.';

-- public_user_directory is security_invoker, so permission on columns the view relies on
-- opens separately; row visibility stays in users RLS + the view predicate.
grant select (display_name) on public.users to anon, authenticated;

create extension if not exists pg_trgm;
create index if not exists users_display_name_trgm_idx
  on public.users using gin (display_name gin_trgm_ops);

create or replace function app_private.update_my_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := app_private.current_public_user_id();
  v_display_name text := nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '');
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Bu islem icin giris yapmalisiniz.';
  end if;
  if v_display_name is null
     or pg_catalog.char_length(v_display_name) > 40
     or v_display_name ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Gorunen ad 1-40 karakter olmali ve kontrol karakteri icermemelidir.';
  end if;

  update public.users as u
  set
    display_name = v_display_name,
    updated_at = pg_catalog.statement_timestamp()
  where u.id = v_user_id
  returning pg_catalog.jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name
  ) into v_result;

  if v_result is null then
    raise exception using
      errcode = 'P0002',
      message = 'Kullanici profili bulunamadi.';
  end if;
  return v_result;
end;
$function$;

revoke all on function app_private.update_my_display_name(text)
  from public, anon, authenticated;
grant execute on function app_private.update_my_display_name(text)
  to authenticated;

create or replace function public.update_my_display_name(p_display_name text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.update_my_display_name(p_display_name);
$function$;

revoke all on function public.update_my_display_name(text)
  from public, anon, authenticated;
grant execute on function public.update_my_display_name(text)
  to authenticated;

create or replace view public.public_user_directory
with (security_invoker = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  app_private.visible_profile_background_for_user(u.id, u.background_type) as background_type,
  app_private.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag,
  coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username) as display_name
from public.users as u
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

create or replace function app_private.get_public_user_profile_by_id(
  p_user_id uuid,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  from public.users as u
  where u.id = p_user_id
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
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

  v_is_premium_active := v_row.premium_expires_at is not null
    and v_row.premium_expires_at > pg_catalog.now();
  v_visible_background_type := app_private.visible_profile_background_type(
    v_row.background_type,
    v_row.premium_expires_at
  );

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(v_row.display_name), ''), v_row.username),
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
    'active_hover_theme', case
      when v_is_premium_active
        and app_private.is_valid_hover_theme(v_row.owned_items -> 'active_hover_theme')
        then v_row.owned_items -> 'active_hover_theme'
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

create or replace function app_private.get_public_user_profile_by_username(
  p_username text,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized_username text := nullif(pg_catalog.btrim(coalesce(p_username, '')), '');
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
  from public.users as u
  where u.username = v_normalized_username
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
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

  v_is_premium_active := v_row.premium_expires_at is not null
    and v_row.premium_expires_at > pg_catalog.now();
  v_visible_background_type := app_private.visible_profile_background_type(
    v_row.background_type,
    v_row.premium_expires_at
  );

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(v_row.display_name), ''), v_row.username),
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
    'active_hover_theme', case
      when v_is_premium_active
        and app_private.is_valid_hover_theme(v_row.owned_items -> 'active_hover_theme')
        then v_row.owned_items -> 'active_hover_theme'
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

create or replace function app_private.get_auth_user_profile(p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Bu islem icin giris yapmalisiniz.';
  end if;
  if auth.uid() <> p_auth_user_id and not app_private.is_admin() then
    raise exception using errcode = '42501', message = 'Bu profil verisine erisim yetkiniz yok.';
  end if;

  select * into v_row
  from public.users as u
  where u.auth_user_id = p_auth_user_id
  limit 1;

  if not found then
    return null;
  end if;
  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(v_row.display_name), ''), v_row.username),
    'username_slug', v_row.username_slug,
    'avatar_url', v_row.avatar_url,
    'role', v_row.role,
    'is_banned', v_row.is_banned,
    'ban_until', v_row.ban_until,
    'is_active', v_row.is_active,
    'onboarding_completed_at', v_row.onboarding_completed_at
  );
end;
$function$;

create or replace function app_private.get_my_user_identity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := app_private.current_public_user_id();
  v_row public.users%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Aktif kullanici bulunamadi.';
  end if;
  select * into v_row from public.users as u where u.id = v_user_id limit 1;
  if not found then return null; end if;

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(v_row.display_name), ''), v_row.username),
    'avatar_url', v_row.avatar_url,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_fansub_identity_tag', app_private.resolve_user_active_fansub_identity_tag(v_row.id),
    'role', v_row.role,
    'profile_visibility', v_row.profile_visibility,
    'stats_visibility', v_row.stats_visibility,
    'social_links_visibility', v_row.social_links_visibility,
    'activity_visibility', v_row.activity_visibility
  );
end;
$function$;

create or replace function app_private.get_my_private_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := app_private.current_public_user_id();
  v_row public.users%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Aktif kullanici bulunamadi.';
  end if;
  select * into v_row from public.users as u where u.id = v_user_id limit 1;
  if not found then return null; end if;

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(v_row.display_name), ''), v_row.username),
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', app_private.resolve_user_active_fansub_identity_tag(v_row.id),
    'social_links', coalesce(v_row.social_links, '[]'::jsonb),
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'stones', v_row.stones,
    'premium_expires_at', v_row.premium_expires_at,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'profile_visibility', v_row.profile_visibility,
    'stats_visibility', v_row.stats_visibility,
    'social_links_visibility', v_row.social_links_visibility,
    'activity_visibility', v_row.activity_visibility,
    'created_at', v_row.created_at
  );
end;
$function$;

create or replace function public.get_public_user_profile_by_id(
  p_user_id uuid,
  p_include_social_links boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_public_user_profile_by_id(p_user_id, p_include_social_links);
$function$;

create or replace function public.get_public_user_profile_by_username(
  p_username text,
  p_include_social_links boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_public_user_profile_by_username(p_username, p_include_social_links);
$function$;

create or replace function public.get_auth_user_profile(p_auth_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_auth_user_profile(p_auth_user_id);
$function$;

create or replace function public.get_my_user_identity()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_my_user_identity();
$function$;

create or replace function public.get_my_private_user_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_my_private_user_profile();
$function$;

revoke all on function app_private.get_public_user_profile_by_id(uuid, boolean)
  from public, anon, authenticated;
grant execute on function app_private.get_public_user_profile_by_id(uuid, boolean)
  to anon, authenticated;
revoke all on function app_private.get_public_user_profile_by_username(text, boolean)
  from public, anon, authenticated;
grant execute on function app_private.get_public_user_profile_by_username(text, boolean)
  to anon, authenticated;
revoke all on function app_private.get_auth_user_profile(uuid)
  from public, anon, authenticated;
grant execute on function app_private.get_auth_user_profile(uuid)
  to authenticated;
revoke all on function app_private.get_my_user_identity()
  from public, anon, authenticated;
grant execute on function app_private.get_my_user_identity()
  to authenticated;
revoke all on function app_private.get_my_private_user_profile()
  from public, anon, authenticated;
grant execute on function app_private.get_my_private_user_profile()
  to authenticated;

revoke all on function public.get_public_user_profile_by_id(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.get_public_user_profile_by_id(uuid, boolean)
  to anon, authenticated;
revoke all on function public.get_public_user_profile_by_username(text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_public_user_profile_by_username(text, boolean)
  to anon, authenticated;
revoke all on function public.get_auth_user_profile(uuid)
  from public, anon, authenticated;
grant execute on function public.get_auth_user_profile(uuid)
  to authenticated;
revoke all on function public.get_my_user_identity()
  from public, anon, authenticated;
grant execute on function public.get_my_user_identity()
  to authenticated;
revoke all on function public.get_my_private_user_profile()
  from public, anon, authenticated;
grant execute on function public.get_my_private_user_profile()
  to authenticated;

comment on function public.update_my_display_name(text) is
  'Aktif kullanicinin benzersiz olmayan gorunen adini gunceller; canonical username alanina dokunmaz.';

notify pgrst, 'reload schema';
commit;
