begin;

create or replace function public.can_manage_moderation_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'service_role' or public.is_admin();
$$;

create or replace function public.enforce_community_post_moderation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.author_id is distinct from new.author_id then
      raise exception 'Topluluk gonderisi sahibi degistirilemez.';
    end if;

    if old.related_fansub_id is distinct from new.related_fansub_id then
      raise exception 'Topluluk gonderisi fansub baglami degistirilemez.';
    end if;

    if old.status <> 'pending' then
      raise exception 'Incelemesi tamamlanan topluluk gonderisini yalniz admin guncelleyebilir.';
    end if;
  end if;

  if coalesce(new.status, 'pending') <> 'pending' then
    raise exception 'Topluluk gonderisi onay durumunu yalniz admin degistirebilir.';
  end if;

  if new.approved_at is not null
    or new.approved_by is not null
    or new.rejected_at is not null
    or new.rejected_by is not null
    or new.reject_reason is not null then
    raise exception 'Topluluk gonderisi moderasyon alanlarini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_community_post_moderation_guard on public.community_posts;
create trigger trg_enforce_community_post_moderation_guard
  before insert or update on public.community_posts
  for each row
  execute function public.enforce_community_post_moderation_guard();

drop policy if exists community_posts_insert_self on public.community_posts;
create policy community_posts_insert_self
  on public.community_posts
  for insert
  to authenticated
  with check (
    public.can_manage_moderation_state()
    or (
      author_id = public.current_public_user_id()
      and related_fansub_id is null
      and status = 'pending'
      and approved_at is null
      and approved_by is null
      and rejected_at is null
      and rejected_by is null
      and reject_reason is null
      and lower(coalesce(btrim(category), '')) <> 'duyuru'
    )
  );

drop policy if exists community_posts_insert_fansub_staff on public.community_posts;
create policy community_posts_insert_fansub_staff
  on public.community_posts
  for insert
  to authenticated
  with check (
    public.can_manage_moderation_state()
    or (
      author_id = public.current_public_user_id()
      and related_fansub_id is not null
      and public.is_fansub_staff(related_fansub_id)
      and status = 'pending'
      and approved_at is null
      and approved_by is null
      and rejected_at is null
      and rejected_by is null
      and reject_reason is null
      and lower(coalesce(btrim(category), '')) <> 'duyuru'
    )
  );

drop policy if exists community_posts_update_self_or_admin on public.community_posts;
create policy community_posts_update_self_or_admin
  on public.community_posts
  for update
  to authenticated
  using (
    public.can_manage_moderation_state()
    or (
      author_id = public.current_public_user_id()
      and status = 'pending'
    )
  )
  with check (
    public.can_manage_moderation_state()
    or (
      author_id = public.current_public_user_id()
      and status = 'pending'
      and approved_at is null
      and approved_by is null
      and rejected_at is null
      and rejected_by is null
      and reject_reason is null
      and lower(coalesce(btrim(category), '')) <> 'duyuru'
    )
  );

create or replace function public.enforce_manga_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'INSERT' and coalesce(new.is_approved, false) = true then
    raise exception 'Manga onay durumunu yalniz admin true yapabilir.';
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_approved, false) = true then
      raise exception 'Onayli mangayi yalniz admin guncelleyebilir.';
    end if;

    if old.is_approved is distinct from new.is_approved then
      raise exception 'Manga onay durumunu yalniz admin degistirebilir.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_manga_approval_guard on public.mangas;
create trigger trg_enforce_manga_approval_guard
  before insert or update on public.mangas
  for each row
  execute function public.enforce_manga_approval_guard();

drop policy if exists mangas_insert_admin_or_fansub_admin on public.mangas;
create policy mangas_insert_admin_or_fansub_admin
  on public.mangas
  for insert
  to authenticated
  with check (
    public.can_manage_moderation_state()
    or (
      fansub_id is not null
      and public.is_fansub_admin(fansub_id)
      and coalesce(is_approved, false) = false
    )
  );

drop policy if exists mangas_update_admin_or_fansub_admin on public.mangas;
create policy mangas_update_admin_or_fansub_admin
  on public.mangas
  for update
  to authenticated
  using (
    public.can_manage_moderation_state()
    or (
      fansub_id is not null
      and public.is_fansub_admin(fansub_id)
      and coalesce(is_approved, false) = false
    )
  )
  with check (
    public.can_manage_moderation_state()
    or (
      fansub_id is not null
      and public.is_fansub_admin(fansub_id)
      and coalesce(is_approved, false) = false
    )
  );

create or replace function public.enforce_chapter_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'INSERT' and coalesce(new.is_approved, false) = true then
    raise exception 'Bolum onay durumunu yalniz admin true yapabilir.';
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_approved, false) = true then
      raise exception 'Onayli bolumu yalniz admin guncelleyebilir.';
    end if;

    if old.is_approved is distinct from new.is_approved then
      raise exception 'Bolum onay durumunu yalniz admin degistirebilir.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_chapter_approval_guard on public.chapters;
create trigger trg_enforce_chapter_approval_guard
  before insert or update on public.chapters
  for each row
  execute function public.enforce_chapter_approval_guard();

drop policy if exists chapters_insert_admin_or_fansub_admin on public.chapters;
create policy chapters_insert_admin_or_fansub_admin
  on public.chapters
  for insert
  to authenticated
  with check (
    public.can_manage_moderation_state()
    or (
      fansub_id is not null
      and public.is_fansub_admin(fansub_id)
      and coalesce(is_approved, false) = false
    )
  );

drop policy if exists chapters_update_admin_or_fansub_admin on public.chapters;
create policy chapters_update_admin_or_fansub_admin
  on public.chapters
  for update
  to authenticated
  using (
    public.can_manage_moderation_state()
    or (
      fansub_id is not null
      and public.is_fansub_admin(fansub_id)
      and coalesce(is_approved, false) = false
    )
  )
  with check (
    public.can_manage_moderation_state()
    or (
      fansub_id is not null
      and public.is_fansub_admin(fansub_id)
      and coalesce(is_approved, false) = false
    )
  );

create or replace view public.public_user_directory
with (security_invoker = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  u.background_type,
  public.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag
from (
  select
    id,
    username,
    avatar_url,
    frame_type,
    background_type
  from public.users
  where coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
) u
cross join lateral public.get_profile_view_access(u.id) access
where public.is_admin()
  or coalesce(access.profile_visible, false) = true;

grant select on public.public_user_directory to anon, authenticated;

comment on view public.public_user_directory
  is 'Public kullanici kimlik projection view. Profil gizliligi gorunmezse avatar, kozmetik ve fansub kimlik etiketi dondurmez.';

commit;
