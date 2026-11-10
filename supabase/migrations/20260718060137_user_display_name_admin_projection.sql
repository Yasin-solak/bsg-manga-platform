-- The admin user list carries the display name in the same query; the filter works
-- over display_name together with the canonical username.

begin;

drop view if exists public.admin_user_directory;
drop function if exists public.get_admin_user_directory_rows();
drop function if exists app_private.get_admin_user_directory_rows();

create function app_private.get_admin_user_directory_rows()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  is_banned boolean,
  ban_reason text,
  ban_until timestamptz,
  banned_at timestamptz,
  banned_by uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not app_private.can_manage_moderation_state() then
    return;
  end if;

  return query
  select
    u.id,
    u.username,
    coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username),
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
  from public.users as u;
end;
$function$;

revoke all on function app_private.get_admin_user_directory_rows()
  from public, anon, authenticated;
grant execute on function app_private.get_admin_user_directory_rows()
  to authenticated, service_role;

create function public.get_admin_user_directory_rows()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  is_banned boolean,
  ban_reason text,
  ban_until timestamptz,
  banned_at timestamptz,
  banned_by uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from app_private.get_admin_user_directory_rows();
$function$;

revoke all on function public.get_admin_user_directory_rows()
  from public, anon, authenticated;
grant execute on function public.get_admin_user_directory_rows()
  to authenticated, service_role;

create view public.admin_user_directory
with (security_invoker = true, security_barrier = true)
as
select *
from public.get_admin_user_directory_rows();

revoke all on public.admin_user_directory from public;
grant select on public.admin_user_directory to authenticated;

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
  v_limit integer := coalesce(p_limit, 10);
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
  if v_limit < 1 or v_limit > 10 then
    raise exception using errcode = '22023', message = 'Sayfa limiti 1 ile 10 arasinda olmalidir.';
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
      coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username) as display_name,
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
        or u.display_name ilike '%' || v_search_escaped || '%' escape E'\\'
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
          'displayName', i.display_name,
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
  p_limit integer default 10,
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

comment on function public.list_admin_user_management_page(
  integer, text, text, text, text, text, text, timestamptz, uuid
) is 'En fazla 10 kayit donduren; gorunen ad, canonical handle, guven ve presence zenginlestirmeli admin projectioni.';

notify pgrst, 'reload schema';
commit;
