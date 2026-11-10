-- ============================================
-- MangaZone | Reserved Username Guard
-- Date: 2026-02-14
-- ============================================

begin;

create or replace function public.is_reserved_username(p_username text)
returns boolean
language sql
immutable
returns null on null input
as $$
  select lower(trim(p_username)) = any (
    array[
      'admin',
      'administrator',
      'moderator',
      'mod',
      'support',
      'staff',
      'system',
      'root',
      'owner'
    ]::text[]
  );
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

  -- Rezerve adlar dogrudan kullanilmasin.
  if public.is_reserved_username(v_base) then
    v_base := left(v_base || '_u', 24);
    if length(v_base) < 3 then
      v_base := rpad(v_base, 3, '0');
    end if;
  end if;

  v_candidate := v_base;

  while public.is_reserved_username(v_candidate) or exists (
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

-- If old records hold reserved usernames fix them automatically with a safe name.
do $$
declare
  r record;
  v_username text;
begin
  for r in
    select id, auth_user_id, username
    from public.users
    where public.is_reserved_username(username)
    order by created_at asc, id asc
  loop
    v_username := public.generate_unique_username(r.username || '_user', r.auth_user_id);

    update public.users
    set username = v_username,
        username_slug = replace(v_username, '_', '-')
    where id = r.id;
  end loop;
end;
$$;

alter table public.users
  drop constraint if exists users_username_not_reserved_chk;

alter table public.users
  add constraint users_username_not_reserved_chk
  check (not public.is_reserved_username(username));

grant execute on function public.is_reserved_username(text) to anon, authenticated;

commit;
