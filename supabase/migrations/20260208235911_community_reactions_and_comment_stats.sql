-- Community detail improvements:
-- 1) Make post likes and comment reactions durable
-- 2) Keep community_posts.comments_count auto-synced with community_comments

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_post_likes_user_id_idx
  on public.community_post_likes (user_id);

create index if not exists community_post_likes_post_id_created_idx
  on public.community_post_likes (post_id, created_at desc);

create table if not exists public.community_comment_reactions (
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists community_comment_reactions_user_id_idx
  on public.community_comment_reactions (user_id);

create index if not exists community_comment_reactions_comment_id_idx
  on public.community_comment_reactions (comment_id);

drop trigger if exists trg_community_comment_reactions_updated_at on public.community_comment_reactions;
create trigger trg_community_comment_reactions_updated_at
before update on public.community_comment_reactions
for each row execute function public.set_updated_at();

alter table public.community_post_likes enable row level security;
alter table public.community_comment_reactions enable row level security;

drop policy if exists community_post_likes_select_own_or_admin on public.community_post_likes;
create policy community_post_likes_select_own_or_admin
  on public.community_post_likes
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_likes_insert_own on public.community_post_likes;
create policy community_post_likes_insert_own
  on public.community_post_likes
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists community_post_likes_delete_own_or_admin on public.community_post_likes;
create policy community_post_likes_delete_own_or_admin
  on public.community_post_likes
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_comment_reactions_select_own_or_admin on public.community_comment_reactions;
create policy community_comment_reactions_select_own_or_admin
  on public.community_comment_reactions
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_comment_reactions_insert_own on public.community_comment_reactions;
create policy community_comment_reactions_insert_own
  on public.community_comment_reactions
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists community_comment_reactions_update_own_or_admin on public.community_comment_reactions;
create policy community_comment_reactions_update_own_or_admin
  on public.community_comment_reactions
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_comment_reactions_delete_own_or_admin on public.community_comment_reactions;
create policy community_comment_reactions_delete_own_or_admin
  on public.community_comment_reactions
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

create or replace function public.sync_community_post_comments_count(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_id is null then
    return;
  end if;

  update public.community_posts cp
  set
    comments_count = coalesce((
      select count(*)::bigint
      from public.community_comments cc
      where cc.post_id = p_post_id
        and cc.is_active = true
    ), 0),
    updated_at = now()
  where cp.id = p_post_id;
end;
$$;

create or replace function public.trg_sync_community_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_community_post_comments_count(new.post_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.sync_community_post_comments_count(old.post_id);
    return old;
  end if;

  if new.post_id is distinct from old.post_id then
    perform public.sync_community_post_comments_count(old.post_id);
    perform public.sync_community_post_comments_count(new.post_id);
    return new;
  end if;

  if new.is_active is distinct from old.is_active then
    perform public.sync_community_post_comments_count(new.post_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_community_post_comments_count on public.community_comments;
create trigger trg_sync_community_post_comments_count
after insert or delete or update of post_id, is_active on public.community_comments
for each row execute function public.trg_sync_community_post_comments_count();

create or replace function public.is_community_post_liked(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_post_likes cpl
    where cpl.post_id = p_post_id
      and cpl.user_id = public.current_public_user_id()
  );
$$;

create or replace function public.toggle_community_post_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_now_liked boolean := false;
  v_likes_count bigint := 0;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_post_id is null then
    raise exception 'Post bilgisi zorunludur.';
  end if;

  perform 1
  from public.community_posts cp
  where cp.id = p_post_id
    and cp.is_active = true
    and cp.status = 'approved'
  for update;

  if not found then
    raise exception 'Post bulunamadi veya aktif degil.';
  end if;

  if exists (
    select 1
    from public.community_post_likes cpl
    where cpl.post_id = p_post_id
      and cpl.user_id = v_actor_id
  ) then
    delete from public.community_post_likes
    where post_id = p_post_id
      and user_id = v_actor_id;

    update public.community_posts
    set
      likes_count = greatest(coalesce(likes_count, 0) - 1, 0),
      updated_at = now()
    where id = p_post_id
    returning likes_count into v_likes_count;

    v_now_liked := false;
  else
    insert into public.community_post_likes (post_id, user_id)
    values (p_post_id, v_actor_id);

    update public.community_posts
    set
      likes_count = coalesce(likes_count, 0) + 1,
      updated_at = now()
    where id = p_post_id
    returning likes_count into v_likes_count;

    v_now_liked := true;
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'liked', v_now_liked,
    'likes_count', coalesce(v_likes_count, 0)
  );
end;
$$;

create or replace function public.set_community_comment_reaction(
  p_comment_id uuid,
  p_reaction text default 'none'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_existing text;
  v_next text;
  v_delta_like integer := 0;
  v_delta_dislike integer := 0;
  v_likes integer := 0;
  v_dislikes integer := 0;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_comment_id is null then
    raise exception 'Yorum bilgisi zorunludur.';
  end if;

  perform 1
  from public.community_comments cc
  where cc.id = p_comment_id
    and cc.is_active = true
  for update;

  if not found then
    raise exception 'Yorum bulunamadi veya aktif degil.';
  end if;

  v_next := lower(trim(coalesce(p_reaction, 'none')));
  if v_next not in ('like', 'dislike', 'none') then
    raise exception 'Gecersiz reaksiyon tipi.';
  end if;

  select ccr.reaction
  into v_existing
  from public.community_comment_reactions ccr
  where ccr.comment_id = p_comment_id
    and ccr.user_id = v_actor_id
  for update;

  if v_existing is null then
    if v_next = 'like' then
      insert into public.community_comment_reactions (comment_id, user_id, reaction)
      values (p_comment_id, v_actor_id, 'like');
      v_delta_like := 1;
    elsif v_next = 'dislike' then
      insert into public.community_comment_reactions (comment_id, user_id, reaction)
      values (p_comment_id, v_actor_id, 'dislike');
      v_delta_dislike := 1;
    end if;
  else
    if v_next = 'none' then
      delete from public.community_comment_reactions
      where comment_id = p_comment_id
        and user_id = v_actor_id;

      if v_existing = 'like' then
        v_delta_like := -1;
      elsif v_existing = 'dislike' then
        v_delta_dislike := -1;
      end if;
    elsif v_next <> v_existing then
      update public.community_comment_reactions
      set reaction = v_next
      where comment_id = p_comment_id
        and user_id = v_actor_id;

      if v_existing = 'like' then
        v_delta_like := v_delta_like - 1;
      elsif v_existing = 'dislike' then
        v_delta_dislike := v_delta_dislike - 1;
      end if;

      if v_next = 'like' then
        v_delta_like := v_delta_like + 1;
      elsif v_next = 'dislike' then
        v_delta_dislike := v_delta_dislike + 1;
      end if;
    end if;
  end if;

  if v_delta_like <> 0 or v_delta_dislike <> 0 then
    update public.community_comments
    set
      likes_count = greatest(coalesce(likes_count, 0) + v_delta_like, 0),
      dislikes_count = greatest(coalesce(dislikes_count, 0) + v_delta_dislike, 0),
      updated_at = now()
    where id = p_comment_id
    returning likes_count, dislikes_count into v_likes, v_dislikes;
  else
    select coalesce(likes_count, 0), coalesce(dislikes_count, 0)
    into v_likes, v_dislikes
    from public.community_comments
    where id = p_comment_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'comment_id', p_comment_id,
    'reaction', case when v_next = 'none' then null else v_next end,
    'is_liked', v_next = 'like',
    'is_disliked', v_next = 'dislike',
    'likes_count', coalesce(v_likes, 0),
    'dislikes_count', coalesce(v_dislikes, 0)
  );
end;
$$;

revoke all on function public.is_community_post_liked(uuid) from public;
grant execute on function public.is_community_post_liked(uuid) to authenticated;

revoke all on function public.toggle_community_post_like(uuid) from public;
grant execute on function public.toggle_community_post_like(uuid) to authenticated;

revoke all on function public.set_community_comment_reaction(uuid, text) from public;
grant execute on function public.set_community_comment_reaction(uuid, text) to authenticated;

update public.community_posts cp
set comments_count = coalesce((
  select count(*)::bigint
  from public.community_comments cc
  where cc.post_id = cp.id
    and cc.is_active = true
), 0);
