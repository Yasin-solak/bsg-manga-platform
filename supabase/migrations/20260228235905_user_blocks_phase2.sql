-- ============================================
-- MangaZone | Phase 2 user blocking system
-- Date: 2026-02-28
-- ============================================

begin;

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_id_idx
  on public.user_blocks (blocker_id, created_at desc);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id, created_at desc);

drop trigger if exists trg_user_blocks_updated_at on public.user_blocks;
create trigger trg_user_blocks_updated_at
before update on public.user_blocks
for each row execute function public.set_updated_at();

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own_or_admin on public.user_blocks;
create policy user_blocks_select_own_or_admin
  on public.user_blocks
  for select
  using (blocker_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  with check (
    blocker_id = public.current_public_user_id()
    and blocker_id <> blocked_id
  );

drop policy if exists user_blocks_delete_own_or_admin on public.user_blocks;
create policy user_blocks_delete_own_or_admin
  on public.user_blocks
  for delete
  using (blocker_id = public.current_public_user_id() or public.is_admin());

create or replace function public.is_user_blocked_between(p_left_user_id uuid, p_right_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    case
      when p_left_user_id is null or p_right_user_id is null then false
      else exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = p_left_user_id and ub.blocked_id = p_right_user_id)
           or (ub.blocker_id = p_right_user_id and ub.blocked_id = p_left_user_id)
      )
    end
$$;

create or replace function public.block_user(p_blocked_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row_count bigint := 0;
begin
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_blocked_id is null then
    raise exception 'Engellenecek kullanici bilgisi eksik.';
  end if;

  if v_actor_id = p_blocked_id then
    raise exception 'Kendinizi engelleyemezsiniz.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_blocked_id
      and u.is_active = true
  ) then
    raise exception 'Engellenecek kullanici bulunamadi.';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_actor_id, p_blocked_id)
  on conflict (blocker_id, blocked_id) do update
  set updated_at = now();

  get diagnostics v_row_count = row_count;

  delete from public.user_follows
  where (follower_id = v_actor_id and following_id = p_blocked_id)
     or (follower_id = p_blocked_id and following_id = v_actor_id);

  return jsonb_build_object(
    'success', true,
    'action', 'block',
    'blocker_id', v_actor_id,
    'blocked_id', p_blocked_id,
    'created_or_refreshed', v_row_count > 0
  );
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_blocked_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row_count bigint := 0;
begin
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_blocked_id is null then
    raise exception 'Engeli kaldirilacak kullanici bilgisi eksik.';
  end if;

  delete from public.user_blocks
  where blocker_id = v_actor_id
    and blocked_id = p_blocked_id;

  get diagnostics v_row_count = row_count;

  return jsonb_build_object(
    'success', true,
    'action', 'unblock',
    'blocker_id', v_actor_id,
    'blocked_id', p_blocked_id,
    'deleted', v_row_count > 0
  );
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

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

  if public.is_user_blocked_between(v_follower_id, p_following_id) then
    raise exception 'Bu kullanici ile takip iliskisi kurulamiyor. Engelleme durumu aktif.';
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

drop policy if exists community_posts_select_rule on public.community_posts;
create policy community_posts_select_rule
  on public.community_posts
  for select
  using (
    public.is_admin()
    or author_id = public.current_public_user_id()
    or (
      status = 'approved'
      and is_active = true
      and not public.is_user_blocked_between(author_id, public.current_public_user_id())
    )
  );

drop policy if exists community_comments_select_rule on public.community_comments;
create policy community_comments_select_rule
  on public.community_comments
  for select
  using (
    public.is_admin()
    or author_id = public.current_public_user_id()
    or (
      is_active = true
      and not public.is_user_blocked_between(author_id, public.current_public_user_id())
    )
  );

drop policy if exists manga_comments_select_rule on public.manga_comments;
create policy manga_comments_select_rule
  on public.manga_comments
  for select
  using (
    public.is_admin()
    or user_id = public.current_public_user_id()
    or (
      is_active = true
      and not public.is_user_blocked_between(user_id, public.current_public_user_id())
    )
  );

commit;
