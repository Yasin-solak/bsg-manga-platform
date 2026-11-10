begin;

create or replace function public.can_read_public_user_row(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_visible boolean := false;
begin
  if p_user_id is null then
    return false;
  end if;

  if public.can_manage_moderation_state() or p_user_id = public.current_public_user_id() then
    return true;
  end if;

  if public.is_user_blocked_between(p_user_id, public.current_public_user_id()) then
    return false;
  end if;

  select coalesce(access.profile_visible, false)
  into v_profile_visible
  from public.get_profile_view_access(p_user_id) access
  limit 1;

  return coalesce(v_profile_visible, false);
exception
  when others then
    return false;
end;
$$;

revoke all on function public.can_read_public_user_row(uuid) from public;
grant execute on function public.can_read_public_user_row(uuid) to anon, authenticated;

drop policy if exists users_select_active on public.users;
create policy users_select_active
  on public.users
  for select
  using (
    public.can_manage_moderation_state()
    or id = public.current_public_user_id()
    or (
      coalesce(is_active, true) = true
      and coalesce(is_banned, false) = false
      and public.can_read_public_user_row(id)
    )
  );

revoke select on public.users from anon, authenticated;
grant select (
  id,
  username,
  username_slug,
  avatar_url,
  frame_type,
  background_type,
  active_badge_id,
  active_profile_effect_id,
  is_active,
  is_banned,
  created_at,
  updated_at
) on public.users to anon, authenticated;

drop view if exists public.admin_user_directory;
create view public.admin_user_directory
with (security_barrier = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.role,
  u.is_banned,
  u.ban_reason,
  u.ban_until,
  u.banned_at,
  u.banned_by,
  u.is_active,
  u.created_at,
  u.updated_at
from public.users u
where public.can_manage_moderation_state();

revoke all on public.admin_user_directory from public;
grant select on public.admin_user_directory to authenticated;

comment on view public.admin_user_directory
  is 'Admin kullanici listesi icin users tablosundaki hassas kolonlari public select grantine acmadan sunan admin-only projection.';

create or replace function public.get_upload_auth_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_row
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'role', v_row.role,
    'is_active', v_row.is_active,
    'premium_expires_at', v_row.premium_expires_at
  );
end;
$$;

revoke all on function public.get_upload_auth_context() from public;
grant execute on function public.get_upload_auth_context() to authenticated;

comment on function public.get_upload_auth_context()
  is 'Cloudflare upload worker icin dar auth/profil snapshoti; users tablosundan auth_user_id ve premium kolonlarini dogrudan okutmaz.';

create or replace function public.is_trusted_mutation_stack(p_function_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_context text := '';
begin
  get diagnostics v_context = PG_CONTEXT;
  return position(lower(coalesce(p_function_name, '')) in lower(coalesce(v_context, ''))) > 0;
end;
$$;

revoke all on function public.is_trusted_mutation_stack(text) from public;

create or replace function public.enforce_community_comment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_reaction_write boolean := public.is_trusted_mutation_stack('set_community_comment_reaction');
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.author_id is distinct from v_actor_id then
      raise exception 'Yorum sahibi aktif kullanici olmalidir.';
    end if;

    new.likes_count := 0;
    new.dislikes_count := 0;
    new.is_pinned := false;
    new.is_active := true;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_reaction_write then
    if new.post_id is distinct from old.post_id
      or new.author_id is distinct from old.author_id
      or new.parent_id is distinct from old.parent_id
      or new.body is distinct from old.body
      or new.is_spoiler is distinct from old.is_spoiler
      or new.is_pinned is distinct from old.is_pinned
      or new.is_active is distinct from old.is_active
      or new.created_at is distinct from old.created_at then
      raise exception 'Reaksiyon islemi yalniz yorum sayaclarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.post_id is distinct from old.post_id
    or new.author_id is distinct from old.author_id
    or new.parent_id is distinct from old.parent_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Yorum baglami ve sahipligi degistirilemez.';
  end if;

  if new.likes_count is distinct from old.likes_count
    or new.dislikes_count is distinct from old.dislikes_count then
    raise exception 'Yorum reaksiyon sayaclari yalniz RPC ile degistirilebilir.';
  end if;

  if new.is_pinned is distinct from old.is_pinned then
    raise exception 'Yorum sabitlemeyi yalniz admin degistirebilir.';
  end if;

  if new.is_active is distinct from old.is_active
    and not (old.author_id = v_actor_id and old.is_active = true and new.is_active = false) then
    raise exception 'Yorum moderasyon durumunu yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_community_comment_integrity on public.community_comments;
create trigger trg_enforce_community_comment_integrity
  before insert or update on public.community_comments
  for each row
  execute function public.enforce_community_comment_integrity();

create or replace function public.enforce_manga_comment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_reaction_write boolean := public.is_trusted_mutation_stack('set_manga_comment_reaction');
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from v_actor_id then
      raise exception 'Yorum sahibi aktif kullanici olmalidir.';
    end if;

    new.likes := 0;
    new.dislikes := 0;
    new.is_pinned := false;
    new.is_active := true;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_reaction_write then
    if new.manga_id is distinct from old.manga_id
      or new.chapter_id is distinct from old.chapter_id
      or new.user_id is distinct from old.user_id
      or new.parent_id is distinct from old.parent_id
      or new.content is distinct from old.content
      or new.is_spoiler is distinct from old.is_spoiler
      or new.is_pinned is distinct from old.is_pinned
      or new.is_active is distinct from old.is_active
      or new.created_at is distinct from old.created_at then
      raise exception 'Reaksiyon islemi yalniz yorum sayaclarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.manga_id is distinct from old.manga_id
    or new.chapter_id is distinct from old.chapter_id
    or new.user_id is distinct from old.user_id
    or new.parent_id is distinct from old.parent_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Yorum baglami ve sahipligi degistirilemez.';
  end if;

  if new.likes is distinct from old.likes
    or new.dislikes is distinct from old.dislikes then
    raise exception 'Yorum reaksiyon sayaclari yalniz RPC ile degistirilebilir.';
  end if;

  if new.is_pinned is distinct from old.is_pinned then
    raise exception 'Yorum sabitlemeyi yalniz admin degistirebilir.';
  end if;

  if new.is_active is distinct from old.is_active
    and not (old.user_id = v_actor_id and old.is_active = true and new.is_active = false) then
    raise exception 'Yorum moderasyon durumunu yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists manga_comments_pin_admin_guard on public.manga_comments;
drop trigger if exists trg_enforce_manga_comment_integrity on public.manga_comments;
create trigger trg_enforce_manga_comment_integrity
  before insert or update on public.manga_comments
  for each row
  execute function public.enforce_manga_comment_integrity();

create or replace function public.enforce_user_manga_list_comment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_reaction_write boolean := public.is_trusted_mutation_stack('set_user_manga_list_comment_reaction');
  v_is_list_owner boolean := false;
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.author_id is distinct from v_actor_id then
      raise exception 'Yorum sahibi aktif kullanici olmalidir.';
    end if;

    new.likes_count := 0;
    new.dislikes_count := 0;
    new.is_active := true;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_reaction_write then
    if new.list_id is distinct from old.list_id
      or new.author_id is distinct from old.author_id
      or new.parent_id is distinct from old.parent_id
      or new.body is distinct from old.body
      or new.is_spoiler is distinct from old.is_spoiler
      or new.is_active is distinct from old.is_active
      or new.created_at is distinct from old.created_at then
      raise exception 'Reaksiyon islemi yalniz yorum sayaclarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.list_id is distinct from old.list_id
    or new.author_id is distinct from old.author_id
    or new.parent_id is distinct from old.parent_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Yorum baglami ve sahipligi degistirilemez.';
  end if;

  if new.likes_count is distinct from old.likes_count
    or new.dislikes_count is distinct from old.dislikes_count then
    raise exception 'Yorum reaksiyon sayaclari yalniz RPC ile degistirilebilir.';
  end if;

  v_is_list_owner := public.is_user_manga_list_owner(old.list_id);
  if new.is_active is distinct from old.is_active
    and not (
      (old.author_id = v_actor_id and old.is_active = true and new.is_active = false)
      or v_is_list_owner
    ) then
    raise exception 'Liste yorumu moderasyon durumunu yalniz liste sahibi veya admin degistirebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_manga_list_comment_integrity on public.user_manga_list_comments;
create trigger trg_enforce_user_manga_list_comment_integrity
  before insert or update on public.user_manga_list_comments
  for each row
  execute function public.enforce_user_manga_list_comment_integrity();

create or replace function public.can_write_pending_community_post_child(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_moderation_state()
    or exists (
      select 1
      from public.community_posts cp
      where cp.id = p_post_id
        and cp.author_id = public.current_public_user_id()
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
    );
$$;

create or replace function public.can_write_pending_community_poll_child(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_moderation_state()
    or exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = p_poll_id
        and cp.author_id = public.current_public_user_id()
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
    );
$$;

revoke all on function public.can_write_pending_community_post_child(uuid) from public;
revoke all on function public.can_write_pending_community_poll_child(uuid) from public;
grant execute on function public.can_write_pending_community_post_child(uuid) to authenticated;
grant execute on function public.can_write_pending_community_poll_child(uuid) to authenticated;

create or replace function public.enforce_community_post_asset_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_write_pending_community_post_child(old.post_id) then
      raise exception 'Onaylanmis topluluk gonderisi medyasini yalniz admin degistirebilir.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    raise exception 'Topluluk gonderisi medya baglami degistirilemez.';
  end if;

  if not public.can_write_pending_community_post_child(new.post_id) then
    raise exception 'Onaylanmis topluluk gonderisi medyasini yalniz admin degistirebilir.';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_community_post_asset_child_guard on public.community_post_assets;
create trigger trg_enforce_community_post_asset_child_guard
  before insert or update or delete on public.community_post_assets
  for each row
  execute function public.enforce_community_post_asset_child_guard();

create or replace function public.enforce_community_post_poll_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_sync boolean := public.is_trusted_mutation_stack('sync_community_post_poll_counts');
begin
  if public.can_manage_moderation_state() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_write_pending_community_post_child(old.post_id) then
      raise exception 'Onaylanmis topluluk gonderisi anketini yalniz admin degistirebilir.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.can_write_pending_community_post_child(new.post_id) then
      raise exception 'Onaylanmis topluluk gonderisi anketini yalniz admin degistirebilir.';
    end if;

    new.total_votes_count := 0;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_count_sync then
    if new.post_id is distinct from old.post_id
      or new.closes_at is distinct from old.closes_at
      or new.created_at is distinct from old.created_at then
      raise exception 'Anket sayac senkronu yalniz sayac alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.post_id is distinct from old.post_id then
    raise exception 'Anket gonderi baglami degistirilemez.';
  end if;

  if new.total_votes_count is distinct from old.total_votes_count then
    raise exception 'Anket oy sayaci yalniz RPC ile degistirilebilir.';
  end if;

  if not public.can_write_pending_community_post_child(new.post_id) then
    raise exception 'Onaylanmis topluluk gonderisi anketini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_community_post_poll_child_guard on public.community_post_polls;
create trigger trg_enforce_community_post_poll_child_guard
  before insert or update or delete on public.community_post_polls
  for each row
  execute function public.enforce_community_post_poll_child_guard();

create or replace function public.enforce_community_post_poll_option_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_sync boolean := public.is_trusted_mutation_stack('sync_community_post_poll_counts');
begin
  if public.can_manage_moderation_state() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_write_pending_community_poll_child(old.poll_id) then
      raise exception 'Onaylanmis topluluk gonderisi anket secenegini yalniz admin degistirebilir.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.can_write_pending_community_poll_child(new.poll_id) then
      raise exception 'Onaylanmis topluluk gonderisi anket secenegini yalniz admin degistirebilir.';
    end if;

    new.votes_count := 0;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_count_sync then
    if new.poll_id is distinct from old.poll_id
      or new.position is distinct from old.position
      or new.label is distinct from old.label
      or new.created_at is distinct from old.created_at then
      raise exception 'Anket secenek sayac senkronu yalniz sayac alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.poll_id is distinct from old.poll_id then
    raise exception 'Anket secenegi baglami degistirilemez.';
  end if;

  if new.votes_count is distinct from old.votes_count then
    raise exception 'Anket secenek oy sayaci yalniz RPC ile degistirilebilir.';
  end if;

  if not public.can_write_pending_community_poll_child(new.poll_id) then
    raise exception 'Onaylanmis topluluk gonderisi anket secenegini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_community_post_poll_option_child_guard on public.community_post_poll_options;
create trigger trg_enforce_community_post_poll_option_child_guard
  before insert or update or delete on public.community_post_poll_options
  for each row
  execute function public.enforce_community_post_poll_option_child_guard();

drop policy if exists community_post_assets_insert_self_or_admin on public.community_post_assets;
create policy community_post_assets_insert_self_or_admin
  on public.community_post_assets
  for insert
  to authenticated
  with check (public.can_write_pending_community_post_child(post_id));

drop policy if exists community_post_assets_update_self_or_admin on public.community_post_assets;
create policy community_post_assets_update_self_or_admin
  on public.community_post_assets
  for update
  to authenticated
  using (public.can_write_pending_community_post_child(post_id))
  with check (public.can_write_pending_community_post_child(post_id));

drop policy if exists community_post_assets_delete_self_or_admin on public.community_post_assets;
create policy community_post_assets_delete_self_or_admin
  on public.community_post_assets
  for delete
  to authenticated
  using (public.can_write_pending_community_post_child(post_id));

drop policy if exists community_post_polls_insert_self_or_admin on public.community_post_polls;
create policy community_post_polls_insert_self_or_admin
  on public.community_post_polls
  for insert
  to authenticated
  with check (public.can_write_pending_community_post_child(post_id));

drop policy if exists community_post_polls_update_self_or_admin on public.community_post_polls;
create policy community_post_polls_update_self_or_admin
  on public.community_post_polls
  for update
  to authenticated
  using (public.can_write_pending_community_post_child(post_id))
  with check (public.can_write_pending_community_post_child(post_id));

drop policy if exists community_post_polls_delete_self_or_admin on public.community_post_polls;
create policy community_post_polls_delete_self_or_admin
  on public.community_post_polls
  for delete
  to authenticated
  using (public.can_write_pending_community_post_child(post_id));

drop policy if exists community_post_poll_options_insert_self_or_admin on public.community_post_poll_options;
create policy community_post_poll_options_insert_self_or_admin
  on public.community_post_poll_options
  for insert
  to authenticated
  with check (public.can_write_pending_community_poll_child(poll_id));

drop policy if exists community_post_poll_options_update_self_or_admin on public.community_post_poll_options;
create policy community_post_poll_options_update_self_or_admin
  on public.community_post_poll_options
  for update
  to authenticated
  using (public.can_write_pending_community_poll_child(poll_id))
  with check (public.can_write_pending_community_poll_child(poll_id));

drop policy if exists community_post_poll_options_delete_self_or_admin on public.community_post_poll_options;
create policy community_post_poll_options_delete_self_or_admin
  on public.community_post_poll_options
  for delete
  to authenticated
  using (public.can_write_pending_community_poll_child(poll_id));

drop policy if exists "Community post image upload own posts" on storage.objects;
drop policy if exists "Community post image upload own pending posts" on storage.objects;

create policy "Community post image upload own pending posts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-assets'
  and (storage.foldername(name))[1] = 'community'
  and (storage.foldername(name))[2] = 'posts'
  and coalesce((storage.foldername(name))[4], '') ~ '^slot-0[1-4]$'
  and case
    when coalesce((storage.foldername(name))[3], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_write_pending_community_post_child(((storage.foldername(name))[3])::uuid)
    else false
  end
);

create or replace function public.default_legal_request_priority(p_request_type text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(coalesce(p_request_type, '')) in ('dmca', 'trademark') then 'high'
    else 'normal'
  end;
$$;

revoke all on function public.default_legal_request_priority(text) from public;
grant execute on function public.default_legal_request_priority(text) to anon, authenticated;

create or replace function public.enforce_legal_request_public_workflow_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  new.status := 'new';
  new.priority := public.default_legal_request_priority(new.request_type);
  new.admin_notes := null;
  new.resolution_summary := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists trg_enforce_legal_request_public_workflow_guard on public.legal_requests;
create trigger trg_enforce_legal_request_public_workflow_guard
  before insert on public.legal_requests
  for each row
  execute function public.enforce_legal_request_public_workflow_guard();

drop policy if exists legal_requests_insert_public on public.legal_requests;
create policy legal_requests_insert_public
  on public.legal_requests
  for insert
  to anon, authenticated
  with check (
    public.can_manage_moderation_state()
    or (
      (submitter_user_id is null or submitter_user_id = public.current_public_user_id())
      and attestation_good_faith = true
      and attestation_authority = true
      and attestation_accuracy = true
      and status = 'new'
      and priority = public.default_legal_request_priority(request_type)
      and admin_notes is null
      and resolution_summary is null
      and reviewed_by is null
      and reviewed_at is null
    )
  );

create or replace function public.enforce_report_public_workflow_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  new.status := 'pending';
  new.resolved_at := null;
  new.resolved_by := null;
  new.created_at := now();

  return new;
end;
$$;

drop trigger if exists trg_enforce_report_public_workflow_guard on public.reports;
create trigger trg_enforce_report_public_workflow_guard
  before insert on public.reports
  for each row
  execute function public.enforce_report_public_workflow_guard();

drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self
  on public.reports
  for insert
  to authenticated
  with check (
    public.can_manage_moderation_state()
    or (
      reporter_id = public.current_public_user_id()
      and status = 'pending'
      and resolved_at is null
      and resolved_by is null
    )
  );

commit;
