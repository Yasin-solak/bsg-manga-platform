-- ============================================
-- MangaZone | Security + Read Tracking Hardening
-- Date: 2026-02-14
-- ============================================

begin;

-- ============================================
-- Auth helper hardening
-- ============================================
create or replace function public.current_public_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
  limit 1;
$$;

create or replace function public.current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_active boolean;
  v_is_banned boolean;
begin
  if auth.uid() is null then
    return 'anon';
  end if;

  select u.role, coalesce(u.is_active, true), coalesce(u.is_banned, false)
  into v_role, v_is_active, v_is_banned
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if v_is_active is distinct from true then
    return 'anon';
  end if;

  if v_is_banned = true then
    return 'anon';
  end if;

  return coalesce(v_role, 'user');
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin';
$$;

-- ============================================
-- Users table sensitive column protection
-- ============================================
create or replace function public.prevent_non_admin_sensitive_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := public.current_public_user_id();
begin
  if public.is_admin() then
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

  return new;
end;
$$;

drop trigger if exists trg_users_prevent_non_admin_sensitive_updates on public.users;
create trigger trg_users_prevent_non_admin_sensitive_updates
  before update on public.users
  for each row
  execute function public.prevent_non_admin_sensitive_user_updates();

-- ============================================
-- Read tracking dedup table
-- ============================================
create table if not exists public.manga_read_trackers (
  reader_key text not null,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  chapter_ref text not null,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reader_key, manga_id, chapter_ref)
);

create index if not exists manga_read_trackers_manga_last_read_idx
  on public.manga_read_trackers (manga_id, last_read_at desc);

create index if not exists manga_read_trackers_last_read_idx
  on public.manga_read_trackers (last_read_at desc);

drop trigger if exists trg_manga_read_trackers_updated_at on public.manga_read_trackers;
create trigger trg_manga_read_trackers_updated_at
  before update on public.manga_read_trackers
  for each row
  execute function public.set_updated_at();

alter table public.manga_read_trackers enable row level security;

drop policy if exists manga_read_trackers_select_admin on public.manga_read_trackers;
create policy manga_read_trackers_select_admin
  on public.manga_read_trackers
  for select
  using (public.is_admin());

drop policy if exists manga_read_trackers_admin_write on public.manga_read_trackers;
create policy manga_read_trackers_admin_write
  on public.manga_read_trackers
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.manga_read_trackers to authenticated;

-- ============================================
-- Hardened read tracking RPC
-- ============================================
drop function if exists public.track_manga_read(uuid, uuid, numeric);
drop function if exists public.track_manga_read(uuid, uuid, numeric, text);

create or replace function public.track_manga_read(
  p_manga_id uuid,
  p_chapter_id uuid default null,
  p_chapter_number numeric default null,
  p_client_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_should_increment boolean := true;
  v_total_views bigint;
  v_fansub_id uuid;
  v_month_start date;
  v_chapter_ref text;
  v_reader_key text;
  v_client_key text;
  v_last_read_at timestamptz;
  v_target_chapter_id uuid;
  v_target_chapter_number numeric;
begin
  if p_manga_id is null then
    raise exception 'Manga id zorunludur.';
  end if;

  v_user_id := public.current_public_user_id();

  -- Banned/inactive users cannot raise views even with an auth token.
  if auth.uid() is not null and v_user_id is null then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  if p_chapter_id is not null then
    select c.id, c.chapter_number
    into v_target_chapter_id, v_target_chapter_number
    from public.chapters c
    where c.id = p_chapter_id
      and c.manga_id = p_manga_id
      and c.is_approved = true
      and c.is_active = true
      and c.publish_at <= v_now
    limit 1;

    if not found then
      select m.total_views into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
      return coalesce(v_total_views, 0);
    end if;
  elsif p_chapter_number is not null then
    select c.id, c.chapter_number
    into v_target_chapter_id, v_target_chapter_number
    from public.chapters c
    where c.manga_id = p_manga_id
      and c.chapter_number = p_chapter_number
      and c.is_approved = true
      and c.is_active = true
      and c.publish_at <= v_now
    order by c.created_at desc
    limit 1;

    if not found then
      select m.total_views into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
      return coalesce(v_total_views, 0);
    end if;
  end if;

  if v_target_chapter_id is not null then
    v_chapter_ref := 'chapter:' || v_target_chapter_id::text;
  elsif p_chapter_number is not null then
    v_chapter_ref := 'chapter-number:' || p_chapter_number::text;
  else
    v_chapter_ref := 'manga:' || p_manga_id::text;
  end if;

  if v_user_id is not null then
    v_reader_key := 'user:' || v_user_id::text;
  else
    v_client_key := lower(regexp_replace(coalesce(p_client_key, ''), '[^a-z0-9_-]', '', 'g'));
    if length(v_client_key) between 16 and 96 then
      v_reader_key := 'anon:' || v_client_key;
    end if;
  end if;

  -- We do not raise views for anon users with no client key.
  if coalesce(v_reader_key, '') = '' then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  select t.last_read_at
  into v_last_read_at
  from public.manga_read_trackers t
  where t.reader_key = v_reader_key
    and t.manga_id = p_manga_id
    and t.chapter_ref = v_chapter_ref
  for update;

  if found and v_last_read_at >= v_now - interval '5 minutes' then
    v_should_increment := false;
  end if;

  if v_should_increment then
    insert into public.manga_read_trackers (
      reader_key,
      manga_id,
      chapter_ref,
      last_read_at,
      created_at,
      updated_at
    )
    values (
      v_reader_key,
      p_manga_id,
      v_chapter_ref,
      v_now,
      v_now,
      v_now
    )
    on conflict (reader_key, manga_id, chapter_ref)
    do update
    set last_read_at = excluded.last_read_at,
        updated_at = excluded.updated_at;
  end if;

  if v_user_id is not null then
    insert into public.reading_history (
      user_id,
      manga_id,
      chapter_id,
      chapter_number,
      read_at,
      created_at
    )
    values (
      v_user_id,
      p_manga_id,
      v_target_chapter_id,
      coalesce(v_target_chapter_number, p_chapter_number),
      v_now,
      v_now
    )
    on conflict (user_id, manga_id)
    do update
    set chapter_id = excluded.chapter_id,
        chapter_number = excluded.chapter_number,
        read_at = excluded.read_at;
  end if;

  if v_should_increment then
    update public.mangas
    set total_views = total_views + 1
    where id = p_manga_id
      and is_active = true
      and is_approved = true
    returning total_views, fansub_id into v_total_views, v_fansub_id;

    if found then
      v_month_start := date_trunc('month', v_now)::date;

      insert into public.manga_monthly_views (
        month_start,
        manga_id,
        fansub_id,
        views,
        created_at,
        updated_at
      )
      values (
        v_month_start,
        p_manga_id,
        v_fansub_id,
        1,
        v_now,
        v_now
      )
      on conflict (month_start, manga_id)
      do update
      set views = public.manga_monthly_views.views + 1,
          fansub_id = excluded.fansub_id,
          updated_at = excluded.updated_at;
    else
      select m.total_views
      into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
    end if;
  else
    select m.total_views
    into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
  end if;

  return coalesce(v_total_views, 0);
end;
$$;

grant execute on function public.track_manga_read(uuid, uuid, numeric, text) to anon, authenticated;

commit;
