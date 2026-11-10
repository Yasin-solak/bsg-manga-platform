-- Admin info card: a summary opening on hover over a fansub, user or series name
-- (one call). In admin lists the name mostly stood as plain text;
-- finding whose/which team's request it was meant going to another page.
--
-- The key can be an id (uuid) or a name/address: published revision rows hold
-- only the fansub name. For users the auth identity is also accepted (support requests
-- carry the auth identity). Site admin only; numbers come from live tables.

begin;

create or replace function public.admin_entity_card(p_kind text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_id uuid;
  v_result jsonb;
begin
  if not app_private.can_manage_moderation_state() then
    raise exception 'Yalnız site yöneticisi.' using errcode = '42501';
  end if;
  if coalesce(p_kind, '') not in ('fansub', 'user', 'manga') or v_key = '' or length(v_key) > 200 then
    raise exception 'Kart isteği geçersiz.' using errcode = '22023';
  end if;
  if v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_key::uuid;
  end if;

  if p_kind = 'fansub' then
    select jsonb_build_object(
      'kind', 'fansub',
      'id', f.id,
      'name', f.name,
      'slug', f.slug,
      'avatar_url', f.avatar_url,
      'description', left(f.description, 280),
      'is_active', f.is_active,
      'is_verified', coalesce(f.is_verified, false),
      'created_at', f.created_at,
      'member_count', (select count(*) from public.fansub_members fm where fm.fansub_id = f.id),
      'follower_count', (select count(*) from public.fansub_follows ff where ff.fansub_id = f.id),
      'manga_count', (select count(*) from public.mangas m where m.fansub_id = f.id and m.is_approved and m.is_active),
      'chapter_count', (select count(*) from public.chapters c where c.fansub_id = f.id and c.is_approved and c.is_active),
      'last_chapter_at', (select max(c.created_at) from public.chapters c where c.fansub_id = f.id and c.is_approved),
      'admins', coalesce((
        select jsonb_agg(u.username order by fm.created_at)
        from public.fansub_members fm join public.users u on u.id = fm.user_id
        where fm.fansub_id = f.id and fm.role in ('owner', 'admin')
      ), '[]'::jsonb)
    ) into v_result
    from public.fansubs f
    where (v_id is not null and f.id = v_id)
      or (v_id is null and (lower(f.slug) = lower(v_key) or lower(f.name) = lower(v_key)))
    order by f.is_active desc, f.created_at
    limit 1;
  elsif p_kind = 'user' then
    select jsonb_build_object(
      'kind', 'user',
      'id', u.id,
      'username', u.username,
      'display_name', u.display_name,
      'avatar_url', u.avatar_url,
      'role', u.role,
      'created_at', u.created_at,
      'last_login_at', u.active_session_claimed_at,
      'is_banned', coalesce(u.is_banned, false),
      'ban_until', u.ban_until,
      'is_premium', coalesce(u.premium_expires_at > now(), false),
      'fansubs', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'slug', f.slug, 'role', fm.role) order by fm.created_at)
        from public.fansub_members fm join public.fansubs f on f.id = fm.fansub_id
        where fm.user_id = u.id
      ), '[]'::jsonb),
      'comment_count', (select count(*) from public.manga_comments mc where mc.user_id = u.id and mc.is_active),
      'reports_received', (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = u.id),
      'reports_pending', (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = u.id and r.status = 'pending'),
      'reports_filed', (select count(*) from public.reports r where r.reporter_id = u.id)
    ) into v_result
    from public.users u
    where (v_id is not null and (u.id = v_id or u.auth_user_id = v_id))
      or (v_id is null and lower(u.username) = lower(ltrim(v_key, '@')))
    limit 1;
  else
    select jsonb_build_object(
      'kind', 'manga',
      'id', m.id,
      'title', m.title,
      'slug', m.slug,
      'cover_image_url', m.cover_image_url,
      'status', m.status,
      'series_type', m.series_type,
      'is_mature', m.is_mature,
      'is_approved', m.is_approved,
      'is_active', m.is_active,
      'created_at', m.created_at,
      'genres', to_jsonb(m.genres),
      'total_views', m.total_views,
      'fansub_name', (select f.name from public.fansubs f where f.id = m.fansub_id),
      'chapter_count', (select count(*) from public.chapters c where c.manga_id = m.id and c.is_approved and c.is_active),
      'last_chapter_at', (select max(c.created_at) from public.chapters c where c.manga_id = m.id and c.is_approved),
      'follower_count', (select count(*) from public.manga_follows mf where mf.manga_id = m.id)
    ) into v_result
    from public.mangas m
    where (v_id is not null and m.id = v_id)
      or (v_id is null and (lower(m.slug) = lower(v_key) or lower(m.title) = lower(v_key)))
    order by m.is_approved desc, m.created_at
    limit 1;
  end if;

  -- Null if not found: the client shows "record not found".
  return v_result;
end;
$function$;

revoke all on function public.admin_entity_card(text, text) from public, anon;
grant execute on function public.admin_entity_card(text, text) to authenticated;

commit;
