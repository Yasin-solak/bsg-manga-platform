-- ============================================
-- MangaZone | Manga/Fansub Follow RPC
-- Date: 2026-02-07
-- ============================================

create or replace function public.follow_manga(p_manga_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row_count bigint := 0;
  v_created boolean := false;
begin
  v_user_id := public.current_public_user_id();

  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_manga_id is null then
    raise exception 'Takip edilecek manga bilgisi eksik.';
  end if;

  if not exists (
    select 1
    from public.mangas m
    where m.id = p_manga_id
      and m.is_active = true
      and m.is_approved = true
  ) then
    raise exception 'Takip edilecek manga bulunamadi.';
  end if;

  insert into public.manga_follows (user_id, manga_id)
  values (v_user_id, p_manga_id)
  on conflict (user_id, manga_id) do nothing;

  get diagnostics v_row_count = row_count;
  v_created := v_row_count > 0;

  return jsonb_build_object(
    'success', true,
    'action', 'follow',
    'target', 'manga',
    'user_id', v_user_id,
    'manga_id', p_manga_id,
    'created', v_created,
    'already_following', not v_created
  );
end;
$$;

revoke all on function public.follow_manga(uuid) from public;
grant execute on function public.follow_manga(uuid) to authenticated;

create or replace function public.unfollow_manga(p_manga_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row_count bigint := 0;
  v_deleted boolean := false;
begin
  v_user_id := public.current_public_user_id();

  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_manga_id is null then
    raise exception 'Takipten cikilacak manga bilgisi eksik.';
  end if;

  delete from public.manga_follows
  where user_id = v_user_id
    and manga_id = p_manga_id;

  get diagnostics v_row_count = row_count;
  v_deleted := v_row_count > 0;

  return jsonb_build_object(
    'success', true,
    'action', 'unfollow',
    'target', 'manga',
    'user_id', v_user_id,
    'manga_id', p_manga_id,
    'deleted', v_deleted,
    'was_following', v_deleted
  );
end;
$$;

revoke all on function public.unfollow_manga(uuid) from public;
grant execute on function public.unfollow_manga(uuid) to authenticated;

create or replace function public.follow_fansub(p_fansub_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row_count bigint := 0;
  v_created boolean := false;
begin
  v_user_id := public.current_public_user_id();

  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null then
    raise exception 'Takip edilecek fansub bilgisi eksik.';
  end if;

  if not exists (
    select 1
    from public.fansubs f
    where f.id = p_fansub_id
      and f.is_active = true
  ) then
    raise exception 'Takip edilecek fansub bulunamadi.';
  end if;

  insert into public.fansub_follows (user_id, fansub_id)
  values (v_user_id, p_fansub_id)
  on conflict (user_id, fansub_id) do nothing;

  get diagnostics v_row_count = row_count;
  v_created := v_row_count > 0;

  if v_created then
    update public.fansubs
    set follower_count = coalesce(follower_count, 0) + 1
    where id = p_fansub_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'action', 'follow',
    'target', 'fansub',
    'user_id', v_user_id,
    'fansub_id', p_fansub_id,
    'created', v_created,
    'already_following', not v_created
  );
end;
$$;

revoke all on function public.follow_fansub(uuid) from public;
grant execute on function public.follow_fansub(uuid) to authenticated;

create or replace function public.unfollow_fansub(p_fansub_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row_count bigint := 0;
  v_deleted boolean := false;
begin
  v_user_id := public.current_public_user_id();

  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null then
    raise exception 'Takipten cikilacak fansub bilgisi eksik.';
  end if;

  delete from public.fansub_follows
  where user_id = v_user_id
    and fansub_id = p_fansub_id;

  get diagnostics v_row_count = row_count;
  v_deleted := v_row_count > 0;

  if v_deleted then
    update public.fansubs
    set follower_count = greatest(coalesce(follower_count, 0) - 1, 0)
    where id = p_fansub_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'action', 'unfollow',
    'target', 'fansub',
    'user_id', v_user_id,
    'fansub_id', p_fansub_id,
    'deleted', v_deleted,
    'was_following', v_deleted
  );
end;
$$;

revoke all on function public.unfollow_fansub(uuid) from public;
grant execute on function public.unfollow_fansub(uuid) to authenticated;
