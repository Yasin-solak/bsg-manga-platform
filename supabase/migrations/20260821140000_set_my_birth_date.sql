-- A user enters their own birth date once.
--
-- The 18+ gate (migration 20260821090000) relies on `users.birth_date` but
-- the field was COLLECTED nowhere: the column existed with no value, so
-- no user could see 18+ content.
--
-- Why an RPC: the `authenticated` role has NO UPDATE permission on `public.users`
-- (a direct update gives "permission denied for table users").
-- Profile updates already pass through definer RPCs.
--
-- Written ONCE. Leaving it free would make the 18+ gate meaningless: a user
-- hitting the gate would change the date and pass. A fix is an admin job.

create or replace function public.set_my_birth_date(p_birth_date date)
returns date
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := app_private.current_public_user_id();
  v_existing date;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  if p_birth_date is null then
    raise exception 'Dogum tarihi bos olamaz.';
  end if;

  -- Future dates and unreasonable age ranges are filtered; otherwise "1900"
  -- or tomorrow's date makes the gate meaningless.
  if p_birth_date > current_date then
    raise exception 'Dogum tarihi gelecekte olamaz.';
  end if;

  if p_birth_date < (current_date - interval '120 years') then
    raise exception 'Gecerli bir dogum tarihi gir.';
  end if;

  -- Age lower bound 13: the platform's own rule (the measurable form of the prototype "I am over
  -- 13" confirmation).
  if p_birth_date > (current_date - interval '13 years') then
    raise exception 'BSG Manga 13 yasindan kucukler icin uygun degil.';
  end if;

  select birth_date into v_existing from public.users where id = v_user_id;

  if v_existing is not null then
    -- Resending the same value is not an error: a form can submit twice.
    if v_existing = p_birth_date then
      return v_existing;
    end if;
    raise exception 'Dogum tarihi zaten kayitli; degisiklik icin destek ekibine yaz.';
  end if;

  update public.users
  set birth_date = p_birth_date,
      updated_at = now()
  where id = v_user_id;

  return p_birth_date;
end;
$function$;

revoke all on function public.set_my_birth_date(date) from public;
grant execute on function public.set_my_birth_date(date) to authenticated;

-- The profile RPC must also return `birth_date`: the age gate and the "do not ask birth
-- date" step must know this field ON THE CLIENT. The only new field returned is
-- the user's OWN date (the function already gives only their own profile or,
-- for admins, another's).
create or replace function app_private.get_auth_user_profile(p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'birth_date', v_row.birth_date
  );
end;
$function$;

-- SERIES COUNT and POPULAR mark on genre cards (prototype genre screen).
-- NOT SECURITY DEFINER: the 18+ gate and other RLS rules must also apply
-- to the count; counting series a user with an unverified age will not see
-- would make the number a liar.
create or replace function public.get_public_genre_stats()
returns table (genre text, series_count integer, is_hot boolean)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with tur_satirlari as (
    select unnest(m.genres) as genre, m.total_views
    from public.mangas m
    where m.is_active = true
      and m.is_approved = true
      and m.genres is not null
  ),
  ozet as (
    select
      btrim(t.genre) as genre,
      count(*)::integer as series_count,
      coalesce(sum(t.total_views), 0) as total_views
    from tur_satirlari t
    where btrim(t.genre) <> ''
    group by btrim(t.genre)
  )
  select
    o.genre,
    o.series_count,
    -- "Popular" = the three most READ genres. Marking by series count would
    -- only say "most crowded"; not the same as interest.
    (rank() over (order by o.total_views desc) <= 3) as is_hot
  from ozet o
  order by o.series_count desc, o.genre asc;
$function$;

revoke all on function public.get_public_genre_stats() from public;
grant execute on function public.get_public_genre_stats() to anon, authenticated;

-- LIVE username availability check in the signup form (prototype screen 3).
-- Availability used to be known only AFTER submitting. The function
-- returns ONLY a boolean; who owns it or their email does not leak. Usernames
-- are already public on profile pages, no new secret is exposed.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select not exists (
    select 1
    from public.users u
    where u.username_slug = lower(btrim(p_username))
       or lower(u.username) = lower(btrim(p_username))
  );
$function$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
