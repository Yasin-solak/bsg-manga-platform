-- ============================================
-- MangaZone | User Follow RPC Hotfix
-- Date: 2026-02-07
-- ============================================
-- Reason:
-- - follow/unfollow functions in migration 009 updated the `public.users.follower_count`
-- column.
-- - `public.users` has no such column.
-- Fix:
-- - Functions were rewritten with create-or-replace.
-- - Follower count is computed at runtime from the `user_follows` table.

create or replace function public.follow_user(p_following_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_id uuid;
  v_row_count bigint := 0;
  v_created boolean := false;
begin
  v_follower_id := public.current_public_user_id();

  if v_follower_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_following_id is null then
    raise exception 'Takip edilecek kullanici bilgisi eksik.';
  end if;

  if v_follower_id = p_following_id then
    raise exception 'Kendi hesabinizi takip edemezsiniz.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_following_id
      and u.is_active = true
  ) then
    raise exception 'Takip edilecek kullanici bulunamadi.';
  end if;

  insert into public.user_follows (follower_id, following_id)
  values (v_follower_id, p_following_id)
  on conflict (follower_id, following_id) do nothing;

  get diagnostics v_row_count = row_count;
  v_created := v_row_count > 0;

  return jsonb_build_object(
    'success', true,
    'action', 'follow',
    'follower_id', v_follower_id,
    'following_id', p_following_id,
    'created', v_created,
    'already_following', not v_created
  );
end;
$$;

revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;

create or replace function public.unfollow_user(p_following_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_id uuid;
  v_row_count bigint := 0;
  v_deleted boolean := false;
begin
  v_follower_id := public.current_public_user_id();

  if v_follower_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_following_id is null then
    raise exception 'Takipten cikilacak kullanici bilgisi eksik.';
  end if;

  if v_follower_id = p_following_id then
    raise exception 'Kendi hesabinizi takipten cikarma islemi gecersiz.';
  end if;

  delete from public.user_follows
  where follower_id = v_follower_id
    and following_id = p_following_id;

  get diagnostics v_row_count = row_count;
  v_deleted := v_row_count > 0;

  return jsonb_build_object(
    'success', true,
    'action', 'unfollow',
    'follower_id', v_follower_id,
    'following_id', p_following_id,
    'deleted', v_deleted,
    'was_following', v_deleted
  );
end;
$$;

revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;
