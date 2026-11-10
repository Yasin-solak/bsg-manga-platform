-- ============================================
-- BSG Manga | Reader comments rules and reactions
-- Date: 2026-02-20
-- ============================================

begin;

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'reader.comments',
  'Okuyucu Yorumlari',
  'Manga ve bolum yorum yazma akislarini ac/kapat.',
  true,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_public = excluded.is_public;

alter table public.manga_comments
  add column if not exists dislikes integer not null default 0;

create table if not exists public.manga_comment_reactions (
  comment_id uuid not null references public.manga_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists manga_comment_reactions_user_id_idx
  on public.manga_comment_reactions (user_id);

create index if not exists manga_comment_reactions_comment_id_idx
  on public.manga_comment_reactions (comment_id);

drop trigger if exists trg_manga_comment_reactions_updated_at on public.manga_comment_reactions;
create trigger trg_manga_comment_reactions_updated_at
before update on public.manga_comment_reactions
for each row execute function public.set_updated_at();

alter table public.manga_comment_reactions enable row level security;

drop policy if exists manga_comment_reactions_select_own_or_admin on public.manga_comment_reactions;
create policy manga_comment_reactions_select_own_or_admin
  on public.manga_comment_reactions
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_comment_reactions_insert_own on public.manga_comment_reactions;
create policy manga_comment_reactions_insert_own
  on public.manga_comment_reactions
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists manga_comment_reactions_update_own_or_admin on public.manga_comment_reactions;
create policy manga_comment_reactions_update_own_or_admin
  on public.manga_comment_reactions
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_comment_reactions_delete_own_or_admin on public.manga_comment_reactions;
create policy manga_comment_reactions_delete_own_or_admin
  on public.manga_comment_reactions
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

create or replace function public.enforce_reader_comments_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_feature_enabled('reader.comments', true) then
    raise exception 'Manga ve bolum yorum gonderimi su anda gecici olarak kapali.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_reader_comments_feature_flag on public.manga_comments;
create trigger trg_enforce_reader_comments_feature_flag
  before insert on public.manga_comments
  for each row
  execute function public.enforce_reader_comments_feature_flag();

create or replace function public.set_manga_comment_reaction(
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
  from public.manga_comments mc
  where mc.id = p_comment_id
    and mc.is_active = true
  for update;

  if not found then
    raise exception 'Yorum bulunamadi veya aktif degil.';
  end if;

  v_next := lower(trim(coalesce(p_reaction, 'none')));
  if v_next not in ('like', 'dislike', 'none') then
    raise exception 'Gecersiz reaksiyon tipi.';
  end if;

  select mcr.reaction
  into v_existing
  from public.manga_comment_reactions mcr
  where mcr.comment_id = p_comment_id
    and mcr.user_id = v_actor_id
  for update;

  if v_existing is null then
    if v_next = 'like' then
      insert into public.manga_comment_reactions (comment_id, user_id, reaction)
      values (p_comment_id, v_actor_id, 'like');
      v_delta_like := 1;
    elsif v_next = 'dislike' then
      insert into public.manga_comment_reactions (comment_id, user_id, reaction)
      values (p_comment_id, v_actor_id, 'dislike');
      v_delta_dislike := 1;
    end if;
  else
    if v_next = 'none' then
      delete from public.manga_comment_reactions
      where comment_id = p_comment_id
        and user_id = v_actor_id;

      if v_existing = 'like' then
        v_delta_like := -1;
      elsif v_existing = 'dislike' then
        v_delta_dislike := -1;
      end if;
    elsif v_next <> v_existing then
      update public.manga_comment_reactions
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
    update public.manga_comments
    set
      likes = greatest(coalesce(likes, 0) + v_delta_like, 0),
      dislikes = greatest(coalesce(dislikes, 0) + v_delta_dislike, 0),
      updated_at = now()
    where id = p_comment_id
    returning likes, dislikes into v_likes, v_dislikes;
  else
    select coalesce(likes, 0), coalesce(dislikes, 0)
    into v_likes, v_dislikes
    from public.manga_comments
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

revoke all on function public.set_manga_comment_reaction(uuid, text) from public;
grant execute on function public.set_manga_comment_reaction(uuid, text) to authenticated;

commit;
