-- Keeps the public.users direct INSERT/DELETE surface default-closed.
-- The auth bootstrap fallback runs only with needed columns and safe start invariants.

begin;

alter table public.users enable row level security;

revoke delete on table public.users from public, anon, authenticated;
grant delete on table public.users to service_role;

drop policy if exists users_delete_admin on public.users;

revoke insert on table public.users from public, anon, authenticated;

do $user_insert_grants$
declare
  v_all_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.format('%I', c.column_name),
    ', ' order by c.ordinal_position
  )
  into v_all_columns
  from information_schema.columns as c
  where c.table_schema = 'public'
    and c.table_name = 'users';

  if v_all_columns is null then
    raise exception using
      errcode = '55000',
      message = 'public.users kolonlari bulunamadi.';
  end if;

  execute pg_catalog.format(
    'revoke insert (%s) on table public.users from public, anon, authenticated',
    v_all_columns
  );
end;
$user_insert_grants$;

grant insert on table public.users to service_role;
grant insert (
  auth_user_id,
  username,
  username_slug,
  avatar_url,
  role
) on table public.users to authenticated;

drop policy if exists users_insert_self on public.users;
create policy users_insert_self
  on public.users
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = auth_user_id
  );

drop policy if exists users_insert_bootstrap_invariants on public.users;
create policy users_insert_bootstrap_invariants
  on public.users
  as restrictive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = auth_user_id
    and role = 'user'
    and is_active = true
    and is_banned = false
    and stones = 0
    and frame_type = 'default'
    and active_badge_id is null
    and ban_reason is null
    and ban_until is null
    and banned_by is null
    and banned_at is null
    and premium_expires_at is null
    and active_session_id is null
    and active_session_claimed_at is null
    and active_profile_effect_id is null
    and onboarding_completed_at is null
    and pg_catalog.jsonb_typeof(owned_items) = 'object'
    and coalesce(owned_items -> 'frames', '[]'::jsonb) = '["default"]'::jsonb
    and coalesce(owned_items -> 'backgrounds', '[]'::jsonb) = '[]'::jsonb
    and coalesce(owned_items -> 'patterns', '[]'::jsonb) = '[]'::jsonb
    and coalesce(owned_items -> 'badges', '[]'::jsonb) = '[]'::jsonb
    and coalesce(owned_items -> 'premium', '[]'::jsonb) = '[]'::jsonb
    and coalesce(owned_items -> 'profile_effects', '[]'::jsonb) = '[]'::jsonb
    and coalesce(owned_items -> 'uploaded_frame_slots', '[]'::jsonb) = '[]'::jsonb
    and coalesce(owned_items -> 'uploaded_background_slots', '[]'::jsonb) = '[]'::jsonb
  );

comment on policy users_insert_self on public.users is
  'Authenticated fallback profil olusturmayi yalniz kendi auth kimligine acar.';
comment on policy users_insert_bootstrap_invariants on public.users is
  'Yeni profilin yetki, ekonomi, entitlement, ban ve session alanlarini guvenli baslangica zorlar.';

notify pgrst, 'reload schema';
commit;
