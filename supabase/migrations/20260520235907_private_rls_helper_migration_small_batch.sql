-- Moves a small RLS helper group that need not appear as RPC in the public schema
-- to the unexposed app_private schema and closes public direct execute grants.

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.is_user_blocked_between(p_left_user_id uuid, p_right_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
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
$function$;

create or replace function app_private.is_user_manga_list_owner(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.user_manga_lists uml
    where uml.id = p_list_id
      and uml.owner_id = public.current_public_user_id()
  );
$function$;

create or replace function app_private.user_has_any_fansub_membership(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.user_id = p_user_id
      and f.is_active = true
  );
$function$;

create or replace function app_private.can_create_fansub_request_daily(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select not exists (
    select 1
    from public.fansub_requests fr
    where fr.requester_user_id = p_user_id
      and fr.created_at >= now() - interval '1 minute'
      and fr.is_active = true
  );
$function$;

create or replace function app_private.can_current_user_access_chapter(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when p_publish_at is null then true
      when public.current_user_has_active_premium() then true
      else public.is_chapter_publicly_unlocked(p_publish_at)
    end
$function$;

create or replace function app_private.fansub_has_boost_capability(p_fansub_id uuid, p_capability_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce((
    select (s.capabilities ->> nullif(trim(coalesce(p_capability_key, '')), ''))::boolean
    from public.fansub_boost_snapshots s
    where s.fansub_id = p_fansub_id
  ), false);
$function$;

create or replace function app_private.can_read_public_user_row(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_profile_visible boolean := false;
begin
  if p_user_id is null then
    return false;
  end if;

  if public.can_manage_moderation_state() or p_user_id = public.current_public_user_id() then
    return true;
  end if;

  if app_private.is_user_blocked_between(p_user_id, public.current_public_user_id()) then
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
$function$;

grant execute on function app_private.is_user_blocked_between(uuid, uuid) to anon, authenticated, service_role;
grant execute on function app_private.is_user_manga_list_owner(uuid) to anon, authenticated, service_role;
grant execute on function app_private.user_has_any_fansub_membership(uuid) to anon, authenticated, service_role;
grant execute on function app_private.can_create_fansub_request_daily(uuid) to anon, authenticated, service_role;
grant execute on function app_private.can_current_user_access_chapter(timestamptz) to anon, authenticated, service_role;
grant execute on function app_private.fansub_has_boost_capability(uuid, text) to anon, authenticated, service_role;
grant execute on function app_private.can_read_public_user_row(uuid) to anon, authenticated, service_role;

alter policy "chapters_select_public"
on public.chapters
using (
  (
    (is_active = true)
    and (is_approved = true)
    and app_private.can_current_user_access_chapter(publish_at)
  )
  or (select is_admin())
  or ((fansub_id is not null) and is_fansub_admin(fansub_id))
);

alter policy "community_comments_select_rule"
on public.community_comments
using (
  (select is_admin())
  or (author_id = (select current_public_user_id()))
  or (
    (is_active = true)
    and not app_private.is_user_blocked_between(author_id, (select current_public_user_id()))
  )
);

alter policy "community_posts_select_rule"
on public.community_posts
using (
  (select is_admin())
  or (author_id = (select current_public_user_id()))
  or (
    (status = 'approved'::text)
    and (is_active = true)
    and not app_private.is_user_blocked_between(author_id, (select current_public_user_id()))
  )
);

alter policy "fansub_join_requests_insert_owner"
on public.fansub_join_requests
with check (
  (requester_user_id = (select current_public_user_id()))
  and (status = 'pending'::text)
  and (reviewed_by is null)
  and (reviewed_at is null)
  and not app_private.user_has_any_fansub_membership(requester_user_id)
);

alter policy "fansub_pinned_notices_select_public"
on public.fansub_pinned_notices
using (
  (
    (is_active = true)
    and app_private.fansub_has_boost_capability(fansub_id, 'canManagePinnedNotice'::text)
  )
  or (select is_admin())
  or is_fansub_staff(fansub_id)
);

alter policy "fansub_requests_insert_owner"
on public.fansub_requests
with check (
  (requester_user_id = (select current_public_user_id()))
  and (status = 'pending'::text)
  and (reviewed_by is null)
  and (reviewed_at is null)
  and (created_fansub_id is null)
  and not app_private.user_has_any_fansub_membership(requester_user_id)
  and app_private.can_create_fansub_request_daily(requester_user_id)
);

alter policy "manga_comments_select_rule"
on public.manga_comments
using (
  (select is_admin())
  or (user_id = (select current_public_user_id()))
  or (
    (is_active = true)
    and not app_private.is_user_blocked_between(user_id, (select current_public_user_id()))
  )
);

alter policy "user_manga_list_comments_delete_rule"
on public.user_manga_list_comments
using (
  (author_id = (select current_public_user_id()))
  or (select is_admin())
  or app_private.is_user_manga_list_owner(list_id)
);

alter policy "user_manga_list_comments_update_rule"
on public.user_manga_list_comments
using (
  (author_id = (select current_public_user_id()))
  or (select is_admin())
  or app_private.is_user_manga_list_owner(list_id)
)
with check (
  (author_id = (select current_public_user_id()))
  or (select is_admin())
  or app_private.is_user_manga_list_owner(list_id)
);

alter policy "user_manga_lists_select_rule"
on public.user_manga_lists
using (
  (select is_admin())
  or (owner_id = (select current_public_user_id()))
  or (
    (is_public = true)
    and not app_private.is_user_blocked_between(owner_id, (select current_public_user_id()))
  )
);

alter policy "users_select_active"
on public.users
using (
  (select can_manage_moderation_state())
  or (id = (select current_public_user_id()))
  or (
    (coalesce(is_active, true) = true)
    and (coalesce(is_banned, false) = false)
    and app_private.can_read_public_user_row(id)
  )
);

revoke execute on function public.is_user_blocked_between(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.is_user_manga_list_owner(uuid) from anon, authenticated, public;
revoke execute on function public.user_has_any_fansub_membership(uuid) from anon, authenticated, public;
revoke execute on function public.can_create_fansub_request_daily(uuid) from anon, authenticated, public;
revoke execute on function public.can_current_user_access_chapter(timestamptz) from anon, authenticated, public;
revoke execute on function public.fansub_has_boost_capability(uuid, text) from anon, authenticated, public;
revoke execute on function public.can_read_public_user_row(uuid) from anon, authenticated, public;

grant execute on function public.is_user_blocked_between(uuid, uuid) to service_role;
grant execute on function public.is_user_manga_list_owner(uuid) to service_role;
grant execute on function public.user_has_any_fansub_membership(uuid) to service_role;
grant execute on function public.can_create_fansub_request_daily(uuid) to service_role;
grant execute on function public.can_current_user_access_chapter(timestamptz) to service_role;
grant execute on function public.fansub_has_boost_capability(uuid, text) to service_role;
grant execute on function public.can_read_public_user_row(uuid) to service_role;
