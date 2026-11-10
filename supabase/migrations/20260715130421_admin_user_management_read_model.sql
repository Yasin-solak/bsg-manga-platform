-- Feeds the user management screen, purpose-built, admin-only and with one snapshot time.
-- Email is read only for validation and exact match search; it does not go into the response.

begin;

create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.get_admin_user_management_overview(
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_previous_start timestamptz;
  v_previous_end timestamptz;
  v_total integer;
  v_active_last_30_days integer;
  v_online_now integer;
  v_admins integer;
  v_moderators integer;
  v_verified integer;
  v_low_trust_review integer;
  v_new_current integer;
  v_new_previous integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu ozet icin admin yetkisi gerekir.';
  end if;

  if p_as_of is null then
    raise exception using errcode = '22023', message = 'Ozet referans zamani bos olamaz.';
  end if;

  v_current_start := p_as_of - interval '7 days';
  v_current_end := p_as_of;
  v_previous_start := p_as_of - interval '14 days';
  v_previous_end := p_as_of - interval '7 days';

  with latest_active_session as materialized (
    select
      u.id as user_id,
      e.last_seen_at
    from public.users as u
    join public.auth_session_events as e
      on e.auth_user_id = u.auth_user_id
     and e.session_id = u.active_session_id
     and e.revoked_at is null
    where e.last_seen_at <= p_as_of
  ),
  trust as materialized (
    select *
    from app_private.get_admin_user_trust_v1(p_as_of, null)
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where coalesce(u.is_active, true) = true
        and not (
          coalesce(u.is_banned, false)
          and (u.ban_until is null or u.ban_until > p_as_of)
        )
        and (
          las.last_seen_at >= p_as_of - interval '30 days'
          or exists (
            select 1
            from public.activity_events as activity
            where activity.actor_user_id = u.id
              and activity.actor_type = 'user'
              and activity.is_active = true
              and activity.created_at >= p_as_of - interval '30 days'
              and activity.created_at <= p_as_of
          )
        )
    )::integer,
    pg_catalog.count(*) filter (
      where coalesce(u.is_active, true) = true
        and not (
          coalesce(u.is_banned, false)
          and (u.ban_until is null or u.ban_until > p_as_of)
        )
        and las.last_seen_at >= p_as_of - interval '120 seconds'
    )::integer,
    pg_catalog.count(*) filter (where u.role = 'admin')::integer,
    pg_catalog.count(*) filter (where u.role = 'moderator')::integer,
    pg_catalog.count(*) filter (where au.email_confirmed_at is not null)::integer,
    pg_catalog.count(*) filter (
      where trust.score < 60
        and trust.confidence <> 'low'
        and not (
          coalesce(u.is_banned, false)
          and (u.ban_until is null or u.ban_until > p_as_of)
        )
    )::integer,
    pg_catalog.count(*) filter (
      where u.created_at >= v_current_start and u.created_at < v_current_end
    )::integer,
    pg_catalog.count(*) filter (
      where u.created_at >= v_previous_start and u.created_at < v_previous_end
    )::integer
  into
    v_total,
    v_active_last_30_days,
    v_online_now,
    v_admins,
    v_moderators,
    v_verified,
    v_low_trust_review,
    v_new_current,
    v_new_previous
  from public.users as u
  left join auth.users as au on au.id = u.auth_user_id
  left join latest_active_session as las on las.user_id = u.id
  left join trust on trust.user_id = u.id;

  return pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'total', coalesce(v_total, 0),
    'activeLast30Days', coalesce(v_active_last_30_days, 0),
    'onlineNow', coalesce(v_online_now, 0),
    'admins', coalesce(v_admins, 0),
    'moderators', coalesce(v_moderators, 0),
    'verified', coalesce(v_verified, 0),
    'lowTrustReview', coalesce(v_low_trust_review, 0),
    'newUsersCurrent', coalesce(v_new_current, 0),
    'newUsersPrevious', coalesce(v_new_previous, 0),
    'newUsersDelta', coalesce(v_new_current, 0) - coalesce(v_new_previous, 0),
    'newUsersDeltaPercent', case
      when coalesce(v_new_previous, 0) > 0 then pg_catalog.round(
        ((coalesce(v_new_current, 0) - v_new_previous) * 100.0) / v_new_previous,
        2
      )
      else null
    end
  );
end;
$function$;

create or replace function public.get_admin_user_management_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_user_management_overview(
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.list_admin_user_management_page(
  p_limit integer,
  p_search text,
  p_view text,
  p_role text,
  p_verification text,
  p_trust_band text,
  p_fansub text,
  p_cursor_created_at timestamptz,
  p_cursor_user_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := coalesce(p_limit, 40);
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  v_search_escaped text;
  v_search_uuid uuid;
  v_view text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_view, 'all')));
  v_role text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, 'all')));
  v_verification text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_verification, 'all')));
  v_trust_band text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_trust_band, 'all')));
  v_fansub text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_fansub, 'all')));
  v_fansub_id uuid;
  v_new_start timestamptz;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu liste icin admin yetkisi gerekir.';
  end if;

  if p_as_of is null then
    raise exception using errcode = '22023', message = 'Liste referans zamani bos olamaz.';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception using errcode = '22023', message = 'Sayfa limiti 1 ile 100 arasinda olmalidir.';
  end if;
  if v_search is not null and pg_catalog.char_length(v_search) > 160 then
    raise exception using errcode = '22023', message = 'Arama metni en fazla 160 karakter olabilir.';
  end if;
  if v_view not in ('all', 'admin', 'moderator', 'user', 'new') then
    raise exception using errcode = '22023', message = 'Gecersiz kullanici gorunumu.';
  end if;
  if v_role not in ('all', 'admin', 'moderator', 'user') then
    raise exception using errcode = '22023', message = 'Gecersiz rol filtresi.';
  end if;
  if v_verification not in ('all', 'verified', 'unverified') then
    raise exception using errcode = '22023', message = 'Gecersiz dogrulama filtresi.';
  end if;
  if v_trust_band not in ('all', 'trusted', 'standard', 'review', 'low') then
    raise exception using errcode = '22023', message = 'Gecersiz guven filtresi.';
  end if;
  if (p_cursor_created_at is null) is distinct from (p_cursor_user_id is null) then
    raise exception using errcode = '22023', message = 'Cursor zamani ve kullanici kimligi birlikte verilmelidir.';
  end if;

  if v_fansub not in ('all', 'member', 'none') then
    begin
      v_fansub_id := v_fansub::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Gecersiz fansub filtresi.';
    end;
  end if;

  if v_search is not null then
    v_search_escaped := pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(v_search, E'\\', E'\\\\'),
        '%', E'\\%'
      ),
      '_', E'\\_'
    );
    begin
      v_search_uuid := v_search::uuid;
    exception when invalid_text_representation then
      v_search_uuid := null;
    end;
  end if;

  v_new_start := p_as_of - interval '7 days';

  with trust as materialized (
    select *
    from app_private.get_admin_user_trust_v1(p_as_of, null)
  ),
  candidates as materialized (
    select
      u.id,
      u.auth_user_id,
      u.active_session_id,
      u.username,
      u.avatar_url,
      u.role,
      u.level,
      (au.email_confirmed_at is not null) as is_verified,
      (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > p_as_of)
      ) as is_banned,
      u.ban_reason,
      u.ban_until,
      u.banned_at,
      u.banned_by,
      coalesce(u.is_active, true) as is_active,
      u.created_at,
      u.updated_at,
      trust.score,
      trust.band,
      trust.confidence,
      trust.reason_codes,
      trust.components,
      trust.algorithm_version,
      trust.calculated_at
    from public.users as u
    left join auth.users as au on au.id = u.auth_user_id
    join trust on trust.user_id = u.id
    where (
      v_view = 'all'
      or (v_view = 'new' and u.created_at >= v_new_start and u.created_at < p_as_of)
      or (v_view in ('admin', 'moderator', 'user') and u.role = v_view)
    )
      and (v_role = 'all' or u.role = v_role)
      and (
        v_verification = 'all'
        or (v_verification = 'verified' and au.email_confirmed_at is not null)
        or (v_verification = 'unverified' and au.email_confirmed_at is null)
      )
      and (v_trust_band = 'all' or trust.band = v_trust_band)
      and (
        v_fansub = 'all'
        or (
          v_fansub = 'member'
          and exists (select 1 from public.fansub_members as fm where fm.user_id = u.id)
        )
        or (
          v_fansub = 'none'
          and not exists (select 1 from public.fansub_members as fm where fm.user_id = u.id)
        )
        or (
          v_fansub_id is not null
          and exists (
            select 1
            from public.fansub_members as fm
            where fm.user_id = u.id and fm.fansub_id = v_fansub_id
          )
        )
      )
      and (
        v_search is null
        or u.username ilike '%' || v_search_escaped || '%' escape E'\\'
        or (v_search_uuid is not null and u.id = v_search_uuid)
        or (
          position('@' in v_search) > 0
          and pg_catalog.lower(coalesce(au.email, '')) = pg_catalog.lower(v_search)
        )
      )
  ),
  page_rows as materialized (
    select c.*
    from candidates as c
    where p_cursor_created_at is null
       or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_user_id)
    order by c.created_at desc, c.id desc
    limit v_limit + 1
  ),
  trimmed_rows as materialized (
    select p.*
    from page_rows as p
    order by p.created_at desc, p.id desc
    limit v_limit
  ),
  item_rows as materialized (
    select
      t.*,
      presence.last_seen_at as presence_last_seen_at,
      greatest(presence.last_seen_at, activity.last_activity_at) as last_activity_at,
      coalesce(fs.fansub_count, 0) as fansub_count,
      fs.primary_fansub
    from trimmed_rows as t
    left join lateral (
      select e.last_seen_at
      from public.auth_session_events as e
      where e.auth_user_id = t.auth_user_id
        and e.session_id = t.active_session_id
        and e.revoked_at is null
        and e.last_seen_at <= p_as_of
      order by e.last_seen_at desc, e.id desc
      limit 1
    ) as presence on true
    left join lateral (
      select e.created_at as last_activity_at
      from public.activity_events as e
      where e.actor_user_id = t.id
        and e.actor_type = 'user'
        and e.is_active = true
        and e.created_at <= p_as_of
      order by e.created_at desc, e.event_key desc
      limit 1
    ) as activity on true
    left join lateral (
      select
        pg_catalog.count(*)::integer as fansub_count,
        (
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', fm.fansub_id,
              'name', f.name,
              'slug', f.slug,
              'role', fm.role
            ) order by f.is_active desc, fm.created_at desc, fm.fansub_id
          ) -> 0
        ) as primary_fansub
      from public.fansub_members as fm
      join public.fansubs as f on f.id = fm.fansub_id
      where fm.user_id = t.id
    ) as fs on true
  )
  select pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'total', (select pg_catalog.count(*)::integer from candidates),
    'hasNext', (select pg_catalog.count(*) > v_limit from page_rows),
    'nextCursor', case
      when (select pg_catalog.count(*) > v_limit from page_rows) then (
        select pg_catalog.jsonb_build_object(
          'createdAt', i.created_at,
          'userId', i.id
        )
        from item_rows as i
        order by i.created_at asc, i.id asc
        limit 1
      )
      else null
    end,
    'items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'username', i.username,
          'avatarUrl', i.avatar_url,
          'role', i.role,
          'level', i.level,
          'isVerified', i.is_verified,
          'isBanned', i.is_banned,
          'banReason', i.ban_reason,
          'banUntil', i.ban_until,
          'bannedAt', i.banned_at,
          'bannedBy', i.banned_by,
          'isActive', i.is_active,
          'createdAt', i.created_at,
          'updatedAt', i.updated_at,
          'lastActivityAt', i.last_activity_at,
          'presenceStatus', case
            when i.is_banned or not i.is_active then 'blocked'
            when i.presence_last_seen_at is null then 'unknown'
            when i.presence_last_seen_at >= p_as_of - interval '120 seconds' then 'online'
            when i.presence_last_seen_at >= p_as_of - interval '5 minutes' then 'idle'
            else 'offline'
          end,
          'trust', pg_catalog.jsonb_build_object(
            'score', i.score,
            'band', i.band,
            'confidence', i.confidence,
            'reasonCodes', i.reason_codes,
            'components', i.components,
            'algorithmVersion', i.algorithm_version,
            'calculatedAt', i.calculated_at
          ),
          'fansubCount', i.fansub_count,
          'primaryFansub', i.primary_fansub
        ) order by i.created_at desc, i.id desc
      )
      from item_rows as i
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.list_admin_user_management_page(
  p_limit integer default 40,
  p_search text default null,
  p_view text default 'all',
  p_role text default 'all',
  p_verification text default 'all',
  p_trust_band text default 'all',
  p_fansub text default 'all',
  p_cursor_created_at timestamptz default null,
  p_cursor_user_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.list_admin_user_management_page(
    p_limit,
    p_search,
    p_view,
    p_role,
    p_verification,
    p_trust_band,
    p_fansub,
    p_cursor_created_at,
    p_cursor_user_id,
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.get_admin_user_management_preview(
  p_user_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := app_private.current_public_user_id();
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu onizleme icin admin yetkisi gerekir.';
  end if;
  if p_user_id is null or p_as_of is null then
    raise exception using errcode = '22023', message = 'Kullanici ve referans zamani zorunludur.';
  end if;

  with target as materialized (
    select
      u.id,
      u.auth_user_id,
      u.active_session_id,
      u.username,
      u.avatar_url,
      u.role,
      u.level,
      (au.email_confirmed_at is not null) as is_verified,
      (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > p_as_of)
      ) as is_banned,
      u.ban_reason,
      u.ban_until,
      u.banned_at,
      u.banned_by,
      coalesce(u.is_active, true) as is_active,
      u.created_at,
      u.updated_at
    from public.users as u
    left join auth.users as au on au.id = u.auth_user_id
    where u.id = p_user_id
  ),
  trust as materialized (
    select * from app_private.get_admin_user_trust_v1(p_as_of, p_user_id)
  ),
  snapshot as materialized (
    select
      t.*,
      presence.last_seen_at as presence_last_seen_at,
      greatest(presence.last_seen_at, activity.last_activity_at) as last_activity_at,
      trust.score,
      trust.band,
      trust.confidence,
      trust.reason_codes,
      trust.components,
      trust.algorithm_version,
      trust.calculated_at,
      case
        when t.role = 'admin' and t.is_active and not t.is_banned then not exists (
          select 1
          from public.users as other
          where other.id <> t.id
            and other.role = 'admin'
            and coalesce(other.is_active, true) = true
            and not (
              coalesce(other.is_banned, false)
              and (other.ban_until is null or other.ban_until > p_as_of)
            )
        )
        else false
      end as is_last_available_admin
    from target as t
    join trust on trust.user_id = t.id
    left join lateral (
      select e.last_seen_at
      from public.auth_session_events as e
      where e.auth_user_id = t.auth_user_id
        and e.session_id = t.active_session_id
        and e.revoked_at is null
        and e.last_seen_at <= p_as_of
      order by e.last_seen_at desc, e.id desc
      limit 1
    ) as presence on true
    left join lateral (
      select e.created_at as last_activity_at
      from public.activity_events as e
      where e.actor_user_id = t.id
        and e.actor_type = 'user'
        and e.is_active = true
        and e.created_at <= p_as_of
      order by e.created_at desc, e.event_key desc
      limit 1
    ) as activity on true
  )
  select pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'profile', pg_catalog.jsonb_build_object(
      'id', s.id,
      'username', s.username,
      'avatarUrl', s.avatar_url,
      'role', s.role,
      'level', s.level,
      'isVerified', s.is_verified,
      'isBanned', s.is_banned,
      'banReason', s.ban_reason,
      'banUntil', s.ban_until,
      'bannedAt', s.banned_at,
      'bannedBy', s.banned_by,
      'isActive', s.is_active,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ),
    'lastActivityAt', s.last_activity_at,
    'presenceStatus', case
      when s.is_banned or not s.is_active then 'blocked'
      when s.presence_last_seen_at is null then 'unknown'
      when s.presence_last_seen_at >= p_as_of - interval '120 seconds' then 'online'
      when s.presence_last_seen_at >= p_as_of - interval '5 minutes' then 'idle'
      else 'offline'
    end,
    'trust', pg_catalog.jsonb_build_object(
      'score', s.score,
      'band', s.band,
      'confidence', s.confidence,
      'reasonCodes', s.reason_codes,
      'components', s.components,
      'algorithmVersion', s.algorithm_version,
      'calculatedAt', s.calculated_at
    ),
    'fansubMemberships', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', fm.fansub_id,
          'name', f.name,
          'slug', f.slug,
          'avatarUrl', f.avatar_url,
          'role', fm.role,
          'isActive', f.is_active,
          'joinedAt', fm.created_at
        ) order by f.is_active desc, fm.created_at desc
      )
      from public.fansub_members as fm
      join public.fansubs as f on f.id = fm.fansub_id
      where fm.user_id = s.id
    ), '[]'::jsonb),
    'capabilities', pg_catalog.jsonb_build_object(
      'canBan', s.id is distinct from v_actor_id
        and not s.is_banned
        and not s.is_last_available_admin,
      'canUnban', s.is_banned,
      'canChangeRole', s.id is distinct from v_actor_id,
      'banBlockedReason', case
        when s.id = v_actor_id then 'self'
        when s.is_banned then 'already_banned'
        when s.is_last_available_admin then 'last_admin'
        else null
      end
    )
  ) into v_result
  from snapshot as s;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'Kullanici bulunamadi.';
  end if;
  return v_result;
end;
$function$;

create or replace function public.get_admin_user_management_preview(
  p_user_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_user_management_preview(
    p_user_id,
    pg_catalog.statement_timestamp()
  );
$function$;

revoke all on function app_private.get_admin_user_management_overview(timestamptz)
  from public, anon, authenticated;
grant execute on function app_private.get_admin_user_management_overview(timestamptz)
  to authenticated, service_role;
revoke all on function public.get_admin_user_management_overview()
  from public, anon, authenticated;
grant execute on function public.get_admin_user_management_overview()
  to authenticated, service_role;

revoke all on function app_private.list_admin_user_management_page(
  integer, text, text, text, text, text, text, timestamptz, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.list_admin_user_management_page(
  integer, text, text, text, text, text, text, timestamptz, uuid, timestamptz
) to authenticated, service_role;
revoke all on function public.list_admin_user_management_page(
  integer, text, text, text, text, text, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.list_admin_user_management_page(
  integer, text, text, text, text, text, text, timestamptz, uuid
) to authenticated, service_role;

revoke all on function app_private.get_admin_user_management_preview(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function app_private.get_admin_user_management_preview(uuid, timestamptz)
  to authenticated, service_role;
revoke all on function public.get_admin_user_management_preview(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_management_preview(uuid)
  to authenticated, service_role;

comment on function public.list_admin_user_management_page(
  integer, text, text, text, text, text, text, timestamptz, uuid
) is 'Kullanici yonetimi icin keyset sayfali, guven ve presence zenginlestirmeli admin projectioni.';

notify pgrst, 'reload schema';
commit;
