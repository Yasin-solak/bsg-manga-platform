-- Private account + follow request (Instagram model).
-- Profile visibility now has two values: public | private (private account). A private account
-- profile is seen only by APPROVED followers; one wanting to follow sends a request, the account owner
-- approves or deletes. Old "followers" records move to private account (existing followers count as approved
-- ). Per-section visibilities (stats, activity, linked accounts) stay public | followers |
-- private. Private profiles are now findable: the profile page shows a lock screen instead of 404
-- (identity only: name, avatar, frame).

-- 1) Account visibility ------------------------------------------------------
-- Data move: the guard trigger on the user table closes in the migration (no calling user) only
-- for this single update.
alter table public.users disable trigger trg_users_prevent_non_admin_sensitive_updates;
update public.users set profile_visibility = 'private' where profile_visibility = 'followers';
alter table public.users enable trigger trg_users_prevent_non_admin_sensitive_updates;
alter table public.users drop constraint if exists users_profile_visibility_check;
alter table public.users add constraint users_profile_visibility_check check (profile_visibility in ('public', 'private'));

-- Old clients can send "followers": mapped to private account.
create or replace function app_private.normalize_account_visibility(p_value text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_value = 'public' then
    return 'public';
  end if;
  if p_value in ('private', 'followers') then
    return 'private';
  end if;
  raise exception 'Gecersiz hesap gorunurlugu: %', p_value;
end;
$$;

-- 2) Takip istekleri --------------------------------------------------------
create table if not exists public.user_follow_requests (
  requester_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index if not exists user_follow_requests_target_idx on public.user_follow_requests (target_id, created_at desc);
alter table public.user_follow_requests enable row level security;
revoke all on public.user_follow_requests from anon, authenticated;

-- A private account cannot be followed unapproved (including a direct table insert). The approval path passes with a flag.
create or replace function app_private.enforce_private_account_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.follow_request_approval', true) = 'true' or app_private.is_admin() then
    return new;
  end if;
  if exists (select 1 from public.users u where u.id = new.following_id and u.profile_visibility = 'private') then
    raise exception 'FOLLOW_REQUEST_REQUIRED' using hint = 'Bu hesap gizli; takip istegi gonderin.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_private_account_follow on public.user_follows;
create trigger trg_enforce_private_account_follow before insert on public.user_follows
  for each row execute function app_private.enforce_private_account_follow();

-- An approved request: the follow record is added with a flag, the request and pending notification are deleted.
create or replace function app_private.approve_follow_request(p_requester uuid, p_target uuid, p_notify boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target public.users%rowtype;
begin
  delete from public.user_follow_requests where requester_id = p_requester and target_id = p_target;
  perform set_config('app.follow_request_approval', 'true', true);
  insert into public.user_follows (follower_id, following_id) values (p_requester, p_target)
  on conflict (follower_id, following_id) do nothing;
  perform set_config('app.follow_request_approval', '', true);
  delete from public.notifications n
  where n.user_id = p_target and n.data ->> 'event' = 'follow_request' and n.data ->> 'requester_id' = p_requester::text;
  if p_notify then
    select * into v_target from public.users where id = p_target;
    perform public.push_notification(
      p_requester,
      'follow',
      'Takip istegin kabul edildi',
      format('%s artik seni takipcisi olarak goruyor.', coalesce(nullif(btrim(v_target.display_name), ''), v_target.username)),
      jsonb_build_object(
        'event', 'follow_request_accepted',
        'actor_username', v_target.username,
        'actor_avatar', v_target.avatar_url,
        'route_hint', '/profil/' || v_target.username,
        'event_key', format('follow-accepted:%s:%s:%s', p_requester, p_target, extract(epoch from now())::bigint)
      ),
      null::text
    );
  end if;
end;
$$;

-- Follow: direct on a public account, a request on a private account.
create or replace function app_private.follow_user(p_following_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_follower_id uuid;
  v_row_count bigint := 0;
  v_created boolean := false;
  v_target public.users%rowtype;
  v_requester public.users%rowtype;
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

  select * into v_target from public.users u where u.id = p_following_id and u.is_active = true;
  if not found then
    raise exception 'Takip edilecek kullanici bulunamadi.';
  end if;

  if exists (select 1 from public.user_follows f where f.follower_id = v_follower_id and f.following_id = p_following_id) then
    return jsonb_build_object('success', true, 'action', 'follow', 'status', 'following',
      'follower_id', v_follower_id, 'following_id', p_following_id, 'created', false, 'already_following', true);
  end if;

  if v_target.profile_visibility = 'private' then
    insert into public.user_follow_requests (requester_id, target_id) values (v_follower_id, p_following_id)
    on conflict (requester_id, target_id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count > 0 then
      select * into v_requester from public.users where id = v_follower_id;
      perform public.push_notification(
        p_following_id,
        'follow',
        'Yeni takip istegi',
        format('%s seni takip etmek istiyor.', coalesce(nullif(btrim(v_requester.display_name), ''), v_requester.username)),
        jsonb_build_object(
          'event', 'follow_request',
          'requester_id', v_follower_id,
          'actor_username', v_requester.username,
          'actor_avatar', v_requester.avatar_url,
          'route_hint', '/profil/' || v_target.username || '?takip-istekleri=1',
          'event_key', format('follow-request:%s:%s:%s', v_follower_id, p_following_id, extract(epoch from now())::bigint)
        ),
        null::text
      );
    end if;
    return jsonb_build_object('success', true, 'action', 'request', 'status', 'requested',
      'follower_id', v_follower_id, 'following_id', p_following_id, 'created', v_row_count > 0, 'already_following', false);
  end if;

  insert into public.user_follows (follower_id, following_id)
  values (v_follower_id, p_following_id)
  on conflict (follower_id, following_id) do nothing;
  get diagnostics v_row_count = row_count;
  v_created := v_row_count > 0;

  return jsonb_build_object('success', true, 'action', 'follow', 'status', 'following',
    'follower_id', v_follower_id, 'following_id', p_following_id, 'created', v_created, 'already_following', not v_created);
end;
$$;

create or replace function public.cancel_follow_request(p_target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
begin
  if v_viewer is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;
  delete from public.user_follow_requests where requester_id = v_viewer and target_id = p_target_user_id;
  delete from public.notifications n
  where n.user_id = p_target_user_id and n.data ->> 'event' = 'follow_request' and n.data ->> 'requester_id' = v_viewer::text;
end;
$$;

create or replace function public.respond_follow_request(p_requester_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
begin
  if v_viewer is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;
  if not exists (select 1 from public.user_follow_requests r where r.requester_id = p_requester_id and r.target_id = v_viewer) then
    raise exception 'Takip istegi bulunamadi.';
  end if;
  if coalesce(p_accept, false) then
    perform app_private.approve_follow_request(p_requester_id, v_viewer, true);
  else
    delete from public.user_follow_requests where requester_id = p_requester_id and target_id = v_viewer;
    delete from public.notifications n
    where n.user_id = v_viewer and n.data ->> 'event' = 'follow_request' and n.data ->> 'requester_id' = p_requester_id::text;
  end if;
  return jsonb_build_object(
    'accepted', coalesce(p_accept, false),
    'pending', (select count(*) from public.user_follow_requests r where r.target_id = v_viewer)
  );
end;
$$;

create or replace function public.list_my_follow_requests(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
begin
  if v_viewer is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'requesterId', u.id,
      'username', u.username,
      'displayName', coalesce(nullif(btrim(u.display_name), ''), u.username),
      'avatarUrl', u.avatar_url,
      'frameType', u.frame_type,
      'createdAt', r.created_at
    ) order by r.created_at desc)
    from (
      select * from public.user_follow_requests r
      where r.target_id = v_viewer
      order by r.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) r
    join public.users u on u.id = r.requester_id and coalesce(u.is_active, true) and not coalesce(u.is_banned, false)
  ), '[]'::jsonb);
end;
$$;

-- Profile relation: for the lock screen and follow button (gives no content beyond identity).
create or replace function public.get_profile_relationship(p_target_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
  v_target public.users%rowtype;
begin
  select * into v_target from public.users u
  where u.id = p_target_user_id and coalesce(u.is_active, true) and not coalesce(u.is_banned, false);
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'isPrivate', v_target.profile_visibility = 'private',
    'isOwner', v_viewer is not null and v_viewer = v_target.id,
    'viewerIsFollower', v_viewer is not null and exists (select 1 from public.user_follows f where f.follower_id = v_viewer and f.following_id = v_target.id),
    'requestPending', v_viewer is not null and exists (select 1 from public.user_follow_requests r where r.requester_id = v_viewer and r.target_id = v_target.id),
    'incomingRequests', case when v_viewer = v_target.id then (select count(*) from public.user_follow_requests r where r.target_id = v_target.id) else 0 end,
    'followersCount', (select count(*) from public.user_follows f where f.following_id = v_target.id),
    'followingCount', (select count(*) from public.user_follows f where f.follower_id = v_target.id),
    'theme', case
      when v_target.premium_expires_at > now()
        and app_private.premium_perk_enabled('hover_theme')
        and app_private.is_valid_hover_theme(v_target.owned_items -> 'active_hover_theme')
        then v_target.owned_items -> 'active_hover_theme'
    end
  );
end;
$$;

-- 3) Gizlilik ayari: gizliden aciga gecince bekleyen istekler kendiliginden onaylanir.
create or replace function app_private.update_my_profile_privacy_settings(p_profile_visibility text, p_stats_visibility text, p_social_links_visibility text, p_activity_visibility text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_payload jsonb;
  v_request record;
begin
  if v_user_id is null then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  update public.users
  set profile_visibility = app_private.normalize_account_visibility(p_profile_visibility),
      stats_visibility = public.normalize_profile_visibility(p_stats_visibility),
      social_links_visibility = public.normalize_profile_visibility(p_social_links_visibility),
      activity_visibility = public.normalize_profile_visibility(p_activity_visibility),
      updated_at = now()
  where id = v_user_id
  returning jsonb_build_object(
    'profile_visibility', profile_visibility,
    'stats_visibility', stats_visibility,
    'social_links_visibility', social_links_visibility,
    'activity_visibility', activity_visibility
  )
  into v_payload;

  if v_payload is null then
    raise exception 'Gizlilik ayarlari guncellenemedi.';
  end if;

  if v_payload ->> 'profile_visibility' = 'public' then
    for v_request in select r.requester_id from public.user_follow_requests r where r.target_id = v_user_id loop
      perform app_private.approve_follow_request(v_request.requester_id, v_user_id, true);
    end loop;
  end if;

  return v_payload;
end;
$$;

-- 4) Visibility access: a private account is open only to approved followers.
create or replace function app_private.get_profile_view_access(p_target_user_id uuid)
returns table(is_owner boolean, viewer_is_follower boolean, profile_visible boolean, stats_visible boolean, social_links_visible boolean, activity_visible boolean, profile_visibility text, stats_visibility text, social_links_visibility text, activity_visibility text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_viewer_id uuid := public.current_public_user_id();
  v_profile_visibility text;
  v_stats_visibility text;
  v_social_links_visibility text;
  v_activity_visibility text;
  v_is_owner boolean := false;
  v_viewer_is_follower boolean := false;
  v_profile_open boolean;
begin
  select
    coalesce(u.profile_visibility, 'public'),
    coalesce(u.stats_visibility, 'public'),
    coalesce(u.social_links_visibility, 'public'),
    coalesce(u.activity_visibility, 'public')
  into v_profile_visibility, v_stats_visibility, v_social_links_visibility, v_activity_visibility
  from public.users u
  where u.id = p_target_user_id
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
  limit 1;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_viewer_id is not null then
    v_is_owner := v_viewer_id = p_target_user_id;

    if public.is_user_blocked_between(v_viewer_id, p_target_user_id) then
      return query select v_is_owner, false, false, false, false, false,
        v_profile_visibility, v_stats_visibility, v_social_links_visibility, v_activity_visibility;
      return;
    end if;

    if not v_is_owner then
      select exists(select 1 from public.user_follows uf where uf.follower_id = v_viewer_id and uf.following_id = p_target_user_id)
      into v_viewer_is_follower;
    end if;
  end if;

  -- Private account: profile and all sections only for approved followers (and the owner).
  v_profile_open := v_is_owner or v_profile_visibility = 'public' or v_viewer_is_follower;

  return query
  select
    v_is_owner,
    v_viewer_is_follower,
    v_profile_open,
    v_profile_open and (v_is_owner or v_stats_visibility = 'public' or (v_stats_visibility = 'followers' and v_viewer_is_follower)),
    v_profile_open and (v_is_owner or v_social_links_visibility = 'public' or (v_social_links_visibility = 'followers' and v_viewer_is_follower)),
    v_profile_open and (v_is_owner or v_activity_visibility = 'public' or (v_activity_visibility = 'followers' and v_viewer_is_follower)),
    v_profile_visibility,
    v_stats_visibility,
    v_social_links_visibility,
    v_activity_visibility;
end;
$$;

-- 5) Directory: private accounts are findable too (identity only); background is hidden unless the profile is open.
-- The block check for the view (security_invoker) uses a helper open to visitor roles.
create or replace function app_private.is_blocked_with_viewer(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    public.current_public_user_id() is not null
      and public.is_user_blocked_between(public.current_public_user_id(), p_user_id),
    false
  )
$$;

create or replace view public.public_user_directory with (security_invoker = true) as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  case
    when app_private.can_manage_moderation_state() or coalesce(access.profile_visible, false)
      then app_private.visible_profile_background_for_user(u.id, u.background_type)
  end as background_type,
  app_private.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag,
  coalesce(nullif(btrim(u.display_name), ''), u.username) as display_name
from public.users u
cross join lateral app_private.get_profile_view_access(u.id) access(is_owner, viewer_is_follower, profile_visible, stats_visible, social_links_visible, activity_visible, profile_visibility, stats_visibility, social_links_visibility, activity_visibility)
where coalesce(u.is_active, true) = true
  and coalesce(u.is_banned, false) = false
  and (app_private.can_manage_moderation_state() or not app_private.is_blocked_with_viewer(u.id));

revoke all on function app_private.normalize_account_visibility(text) from public;
revoke all on function app_private.is_blocked_with_viewer(uuid) from public;
grant execute on function app_private.is_blocked_with_viewer(uuid) to anon, authenticated;
revoke all on function app_private.enforce_private_account_follow() from public;
revoke all on function app_private.approve_follow_request(uuid, uuid, boolean) from public;
revoke all on function public.cancel_follow_request(uuid) from public;
revoke all on function public.respond_follow_request(uuid, boolean) from public;
revoke all on function public.list_my_follow_requests(integer) from public;
revoke all on function public.get_profile_relationship(uuid) from public;
grant execute on function public.cancel_follow_request(uuid) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
grant execute on function public.list_my_follow_requests(integer) to authenticated;
grant execute on function public.get_profile_relationship(uuid) to anon, authenticated;
