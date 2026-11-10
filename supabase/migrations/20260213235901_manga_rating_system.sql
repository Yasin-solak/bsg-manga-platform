-- ============================================
-- Manga Rating System
-- Date: 2026-02-13
-- ============================================

create table if not exists public.manga_ratings (
  manga_id uuid not null references public.mangas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (manga_id, user_id)
);

create index if not exists manga_ratings_user_id_idx on public.manga_ratings (user_id);
create index if not exists manga_ratings_manga_id_idx on public.manga_ratings (manga_id);

drop trigger if exists trg_manga_ratings_updated_at on public.manga_ratings;
create trigger trg_manga_ratings_updated_at
  before update on public.manga_ratings
  for each row
  execute function public.set_updated_at();

alter table public.manga_ratings enable row level security;

drop policy if exists manga_ratings_select_own_or_admin on public.manga_ratings;
create policy manga_ratings_select_own_or_admin
  on public.manga_ratings
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_ratings_insert_own_or_admin on public.manga_ratings;
create policy manga_ratings_insert_own_or_admin
  on public.manga_ratings
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_ratings_update_own_or_admin on public.manga_ratings;
create policy manga_ratings_update_own_or_admin
  on public.manga_ratings
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_ratings_delete_own_or_admin on public.manga_ratings;
create policy manga_ratings_delete_own_or_admin
  on public.manga_ratings
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

create or replace function public.submit_manga_rating(
  p_manga_id uuid,
  p_rating integer
)
returns table (
  average_rating numeric,
  total_ratings integer,
  user_rating integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_average_rating numeric(3,2);
  v_total_ratings integer;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Puan 1 ile 5 arasinda olmalidir.';
  end if;

  if not exists (
    select 1
    from public.mangas m
    where m.id = p_manga_id
      and m.is_active = true
      and m.is_approved = true
  ) then
    raise exception 'Manga bulunamadi veya aktif degil.';
  end if;

  insert into public.manga_ratings (manga_id, user_id, rating)
  values (p_manga_id, v_user_id, p_rating)
  on conflict (manga_id, user_id)
  do update set
    rating = excluded.rating,
    updated_at = now();

  select
    round(avg(mr.rating)::numeric, 2),
    count(*)::integer
  into v_average_rating, v_total_ratings
  from public.manga_ratings mr
  where mr.manga_id = p_manga_id;

  update public.mangas
  set
    rating = v_average_rating,
    total_ratings = v_total_ratings
  where id = p_manga_id;

  return query
  select
    v_average_rating::numeric,
    v_total_ratings,
    p_rating;
end;
$$;

create or replace function public.get_user_manga_rating(
  p_manga_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rating integer;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    return null;
  end if;

  select mr.rating
  into v_rating
  from public.manga_ratings mr
  where mr.manga_id = p_manga_id
    and mr.user_id = v_user_id;

  return v_rating;
end;
$$;

grant execute on function public.submit_manga_rating(uuid, integer) to authenticated;
grant execute on function public.get_user_manga_rating(uuid) to authenticated;
