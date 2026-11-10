-- ============================================
-- MangaZone | Auth Profile Trigger + Username Rules
-- Date: 2026-02-07
-- ============================================

-- username normalization:
-- - lowercase
-- - only [a-z0-9_]
-- - 3..24 characters
create or replace function public.normalize_username(p_username text)
returns text
language plpgsql
immutable
as $$
declare
  v_username text;
begin
  v_username := lower(coalesce(p_username, ''));
  v_username := regexp_replace(v_username, '[^a-z0-9_]+', '_', 'g');
  v_username := regexp_replace(v_username, '_{2,}', '_', 'g');
  v_username := trim(both '_' from v_username);

  if v_username = '' then
    v_username := 'user';
  end if;

  if length(v_username) < 3 then
    v_username := rpad(v_username, 3, '0');
  end if;

  if length(v_username) > 24 then
    v_username := left(v_username, 24);
  end if;

  return v_username;
end;
$$;

create or replace function public.generate_unique_username(
  p_preferred text,
  p_auth_user_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_attempt integer := 0;
  v_suffix text;
begin
  v_base := public.normalize_username(p_preferred);
  v_candidate := v_base;

  while exists (
    select 1
    from public.users u
    where u.username = v_candidate
      and (p_auth_user_id is null or u.auth_user_id <> p_auth_user_id)
  ) loop
    v_attempt := v_attempt + 1;
    v_suffix := '_' || v_attempt::text;
    v_candidate := left(v_base, greatest(1, 24 - length(v_suffix))) || v_suffix;
  end loop;

  if length(v_candidate) < 3 then
    v_candidate := rpad(v_candidate, 3, '0');
  end if;

  return v_candidate;
end;
$$;

-- Conform old records to the new username rules (also resolves conflicts)
do $$
declare
  r record;
  v_username text;
  v_slug text;
begin
  for r in
    select id, auth_user_id, username
    from public.users
    order by created_at asc, id asc
  loop
    v_username := public.generate_unique_username(r.username, r.auth_user_id);
    v_slug := replace(v_username, '_', '-');

    update public.users
    set username = v_username,
        username_slug = v_slug
    where id = r.id
      and (
        username is distinct from v_username
        or username_slug is distinct from v_slug
      );
  end loop;
end;
$$;

-- Strict username rule on the DB side
alter table public.users
  drop constraint if exists users_username_format_chk;
alter table public.users
  add constraint users_username_format_chk
  check (username ~ '^[a-z0-9_]{3,24}$');

alter table public.users
  drop constraint if exists users_username_slug_format_chk;
alter table public.users
  add constraint users_username_slug_format_chk
  check (username_slug ~ '^[a-z0-9-]{3,24}$');

create unique index if not exists users_username_key on public.users (username);

-- auth.users -> public.users otomatik profil olusturma
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_username text;
  v_username text;
begin
  if exists (select 1 from public.users where auth_user_id = new.id) then
    return new;
  end if;

  v_input_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );

  v_username := public.generate_unique_username(v_input_username, new.id);

  insert into public.users (
    auth_user_id,
    username,
    username_slug,
    avatar_url,
    role
  )
  values (
    new.id,
    v_username,
    replace(v_username, '_', '-'),
    null,
    'user'
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

-- Even with the trigger old auth records may be empty; complementary backfill
do $$
declare
  r record;
  v_username text;
begin
  for r in
    select id, email, raw_user_meta_data
    from auth.users
    order by created_at asc, id asc
  loop
    if exists (select 1 from public.users where auth_user_id = r.id) then
      continue;
    end if;

    v_username := public.generate_unique_username(
      coalesce(
        nullif(r.raw_user_meta_data ->> 'username', ''),
        nullif(split_part(coalesce(r.email, ''), '@', 1), ''),
        'user'
      ),
      r.id
    );

    insert into public.users (
      auth_user_id,
      username,
      username_slug,
      avatar_url,
      role
    )
    values (
      r.id,
      v_username,
      replace(v_username, '_', '-'),
      null,
      'user'
    )
    on conflict (auth_user_id) do nothing;
  end loop;
end;
$$;

