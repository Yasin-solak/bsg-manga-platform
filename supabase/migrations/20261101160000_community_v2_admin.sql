-- Admin > Community (new system: server / channel / message).
--
-- So far the site admin's only permission over community was operations
-- settings (operations_api). Reports were visible only to authorized server members
-- ; a site admin could not look at a server they were not in.
-- This function is for site admins only:
-- overview / servers / server / members / reports  -> read
-- decide_report / delete_message / moderate / archive -> site intervention
-- Interventions yield the same result as the server own rules (message delete =
-- message_write, member actions = manage_api 'moderate', archive = room_api) and
-- write to the action history with a site_admin mark. Member actions do not apply to the
-- server owner (archive the server if needed). No notification is sent; same behavior as
-- in-server actions.

create or replace function community_v2.admin_api(p_action text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  u uuid := public.current_public_user_id();
  s uuid := nullif(p->>'server_id', '')::uuid;
  target uuid := nullif(p->>'user_id', '')::uuid;
  v community_v2.servers;
  msg community_v2.messages;
  report community_v2.message_reports;
  q text := app_private.comment_moderation_fold(btrim(coalesce(p->>'search', '')));
  off integer := greatest(0, least(coalesce(nullif(p->>'offset', '')::integer, 0), 100000));
  notev text := btrim(coalesce(p->>'note', ''));
  modev text;
  sortv text;
  result jsonb;
begin
  if u is null or not public.is_admin() then
    raise exception 'Site yöneticisi izni gerekli.' using errcode = '42501';
  end if;
  if char_length(q) > 80 or char_length(notev) > 1000 then
    raise exception 'Metin çok uzun.' using errcode = '22023';
  end if;

  if p_action = 'overview' then
    return jsonb_build_object(
      'enabled', community_v2.enabled(),
      'servers', (select count(*) from community_v2.servers),
      'fansub_servers', (select count(*) from community_v2.servers where fansub_id is not null),
      'rooms', (select count(*) from community_v2.servers where fansub_id is null),
      'archived', (select count(*) from community_v2.servers where archived_at is not null),
      'members_active', (select count(distinct user_id) from community_v2.members where state = 'active'),
      'messages_7d', (select count(*) from community_v2.messages where created_at > now() - interval '7 days' and deleted_at is null),
      'reports_open', (select count(*) from community_v2.message_reports where status = 'open'),
      'queued', (select count(*) from community_v2.delivery_queue)
    );

  elsif p_action = 'servers' then
    modev := coalesce(nullif(p->>'kind', ''), 'all');
    sortv := coalesce(nullif(p->>'sort', ''), 'activity');
    if modev not in ('all', 'fansub', 'room', 'archived') or sortv not in ('activity', 'members', 'newest', 'reports') then
      raise exception 'Geçersiz filtre.' using errcode = '22023';
    end if;
    with base as (
      -- Name / avatar can be empty on a fansub server: the fansub itself shows.
      select sv.id, coalesce(nullif(btrim(sv.name), ''), f.name, 'Adsız sunucu') as name, coalesce(sv.avatar_url, f.avatar_url) as avatar_url,
        sv.join_mode, sv.archived_at, sv.created_at, sv.fansub_id, sv.owner_id,
        f.name as fansub_name, f.slug as fansub_slug, o.username as owner_username, o.avatar_url as owner_avatar,
        (select count(*) from community_v2.members m where m.server_id = sv.id and m.state = 'active') as members_active,
        (select count(*) from community_v2.members m where m.server_id = sv.id and m.state = 'banned') as members_banned,
        (select count(*) from community_v2.channels c where c.server_id = sv.id) as channels,
        (select count(*) from community_v2.messages ms join community_v2.channels c on c.id = ms.channel_id
          where c.server_id = sv.id and ms.created_at > now() - interval '7 days' and ms.deleted_at is null) as messages_7d,
        (select max(ms.created_at) from community_v2.messages ms join community_v2.channels c on c.id = ms.channel_id
          where c.server_id = sv.id) as last_message_at,
        (select count(*) from community_v2.message_reports r where r.server_id = sv.id and r.status = 'open') as reports_open
      from community_v2.servers as sv
      left join public.fansubs as f on f.id = sv.fansub_id
      left join public.users as o on o.id = sv.owner_id
    ),
    filtered as (
      select b.* from base as b
      where (q = '' or app_private.comment_moderation_fold(b.name) like '%' || q || '%'
          or app_private.comment_moderation_fold(coalesce(b.fansub_name, '')) like '%' || q || '%'
          or app_private.comment_moderation_fold(coalesce(b.owner_username, '')) like '%' || q || '%')
        and (modev = 'all'
          or (modev = 'fansub' and b.fansub_id is not null)
          or (modev = 'room' and b.fansub_id is null)
          or (modev = 'archived' and b.archived_at is not null))
    ),
    page as (
      select f.* from filtered as f
      order by
        case when sortv = 'members' then f.members_active end desc nulls last,
        case when sortv = 'reports' then f.reports_open end desc nulls last,
        case when sortv = 'newest' then f.created_at end desc nulls last,
        f.last_message_at desc nulls last, f.created_at desc, f.id
      limit 20 offset off
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', pg.id, 'name', pg.name, 'avatar_url', pg.avatar_url, 'join_mode', pg.join_mode,
          'kind', case when pg.fansub_id is null then 'room' else 'fansub' end,
          'archived_at', pg.archived_at, 'created_at', pg.created_at,
          'fansub', case when pg.fansub_id is null then null else jsonb_build_object('id', pg.fansub_id, 'name', pg.fansub_name, 'slug', pg.fansub_slug) end,
          'owner', jsonb_build_object('id', pg.owner_id, 'username', pg.owner_username, 'avatar_url', pg.owner_avatar),
          'members_active', pg.members_active, 'members_banned', pg.members_banned, 'channels', pg.channels,
          'messages_7d', pg.messages_7d, 'last_message_at', pg.last_message_at, 'reports_open', pg.reports_open
        )) from page as pg), '[]'::jsonb)
    ) into result;
    return result;

  elsif p_action = 'server' then
    select * into v from community_v2.servers where id = s;
    if not found then raise exception 'Sunucu bulunamadı.' using errcode = '22023'; end if;
    return jsonb_build_object(
      'id', v.id,
      'name', coalesce(nullif(btrim(v.name), ''), (select f.name from public.fansubs as f where f.id = v.fansub_id), 'Adsız sunucu'),
      'description', v.description, 'rules', v.rules,
      'avatar_url', coalesce(v.avatar_url, (select f.avatar_url from public.fansubs as f where f.id = v.fansub_id)),
      'banner_url', v.banner_url, 'join_mode', v.join_mode,
      'archived_at', v.archived_at, 'created_at', v.created_at, 'version', v.version,
      'kind', case when v.fansub_id is null then 'room' else 'fansub' end,
      'fansub', (select jsonb_build_object('id', f.id, 'name', f.name, 'slug', f.slug, 'is_active', f.is_active) from public.fansubs as f where f.id = v.fansub_id),
      'owner', (select jsonb_build_object('id', o.id, 'username', o.username, 'avatar_url', o.avatar_url) from public.users as o where o.id = v.owner_id),
      'members', (select jsonb_build_object(
          'active', count(*) filter (where m.state = 'active'),
          'timeout', count(*) filter (where m.state = 'active' and m.timeout_until > now()),
          'banned', count(*) filter (where m.state = 'banned'),
          'left', count(*) filter (where m.state not in ('active', 'banned'))
        ) from community_v2.members as m where m.server_id = v.id),
      'messages_total', (select count(*) from community_v2.messages ms join community_v2.channels c on c.id = ms.channel_id where c.server_id = v.id and ms.deleted_at is null),
      'messages_7d', (select count(*) from community_v2.messages ms join community_v2.channels c on c.id = ms.channel_id where c.server_id = v.id and ms.deleted_at is null and ms.created_at > now() - interval '7 days'),
      'storage_bytes', (select coalesce(sum(a.byte_size), 0) from community_v2.attachments a join community_v2.channels c on c.id = a.channel_id where c.server_id = v.id),
      'invites_active', (select count(*) from community_v2.invites i where i.server_id = v.id and i.revoked_at is null and (i.expires_at is null or i.expires_at > now())),
      'join_requests', (select count(*) from community_v2.join_requests jr where jr.server_id = v.id),
      'reports_open', (select count(*) from community_v2.message_reports r where r.server_id = v.id and r.status = 'open'),
      'channels', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'category', c.category, 'topic', c.topic, 'is_private', c.is_private,
          'archived_at', c.archived_at, 'slowmode_seconds', c.slowmode_seconds,
          'series', (select jsonb_build_object('id', mg.id, 'title', mg.title, 'slug', mg.slug) from public.mangas as mg where mg.id = c.manga_id),
          'messages', (select count(*) from community_v2.messages ms where ms.channel_id = c.id and ms.deleted_at is null),
          'last_message_at', (select max(ms.created_at) from community_v2.messages ms where ms.channel_id = c.id)
        ) order by c.category, c.position, c.name) from community_v2.channels as c where c.server_id = v.id), '[]'::jsonb),
      'roles', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'name', r.name, 'color', r.color, 'position', r.position, 'is_default', r.is_default,
          'permissions', cardinality(r.permissions),
          'members', case when r.is_default then (select count(*) from community_v2.members m where m.server_id = v.id and m.state = 'active')
            else (select count(*) from community_v2.member_roles mr where mr.role_id = r.id) end
        ) order by r.position desc, r.name) from community_v2.roles as r where r.server_id = v.id), '[]'::jsonb),
      'audit', coalesce((select jsonb_agg(x order by x.created_at desc) from (
          select a.id, a.action, a.created_at, a.details, au.username as actor_username, (a.details->>'site_admin')::boolean as site_admin
          from community_v2.audit as a left join public.users as au on au.id = a.actor_id
          where a.server_id = v.id order by a.created_at desc limit 20
        ) as x), '[]'::jsonb)
    );

  elsif p_action = 'members' then
    modev := coalesce(nullif(p->>'state', ''), 'active');
    if modev not in ('active', 'timeout', 'banned', 'left', 'all') then raise exception 'Geçersiz filtre.' using errcode = '22023'; end if;
    perform 1 from community_v2.servers where id = s;
    if not found then raise exception 'Sunucu bulunamadı.' using errcode = '22023'; end if;
    with filtered as (
      select m.*, us.username, us.display_name, us.avatar_url, (sv.owner_id = m.user_id) as is_owner
      from community_v2.members as m
      join public.users as us on us.id = m.user_id
      join community_v2.servers as sv on sv.id = m.server_id
      where m.server_id = s
        and (modev = 'all'
          or (modev = 'active' and m.state = 'active')
          or (modev = 'timeout' and m.state = 'active' and m.timeout_until > now())
          or (modev = 'banned' and m.state = 'banned')
          or (modev = 'left' and m.state not in ('active', 'banned')))
        and (q = '' or app_private.comment_moderation_fold(us.username) like '%' || q || '%'
          or app_private.comment_moderation_fold(coalesce(us.display_name, '')) like '%' || q || '%'
          or app_private.comment_moderation_fold(coalesce(m.nickname, '')) like '%' || q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'user_id', fm.user_id, 'username', fm.username, 'display_name', fm.display_name, 'avatar_url', fm.avatar_url,
          'nickname', fm.nickname, 'state', fm.state, 'joined_at', fm.joined_at, 'timeout_until', fm.timeout_until,
          'last_message_at', fm.last_message_at, 'is_owner', fm.is_owner,
          'roles', coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'color', r.color) order by r.position desc)
            from community_v2.member_roles mr join community_v2.roles r on r.id = mr.role_id
            where mr.server_id = fm.server_id and mr.user_id = fm.user_id), '[]'::jsonb)
        ) order by fm.is_owner desc, fm.last_message_at desc nulls last, fm.joined_at desc)
        from (select * from filtered order by is_owner desc, last_message_at desc nulls last, joined_at desc limit 25 offset off) as fm), '[]'::jsonb)
    ) into result;
    return result;

  elsif p_action = 'reports' then
    modev := coalesce(nullif(p->>'status', ''), 'open');
    if modev not in ('open', 'resolved', 'dismissed') then raise exception 'Geçersiz filtre.' using errcode = '22023'; end if;
    with scoped as (
      select r.* from community_v2.message_reports as r where s is null or r.server_id = s
    ),
    filtered as (select sc.* from scoped as sc where sc.status = modev)
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'counts', (select jsonb_build_object(
          'open', count(*) filter (where sc.status = 'open'),
          'resolved', count(*) filter (where sc.status = 'resolved'),
          'dismissed', count(*) filter (where sc.status = 'dismissed')) from scoped as sc),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', fr.id, 'reason', fr.reason, 'note', fr.note, 'status', fr.status, 'version', fr.version,
          'created_at', fr.created_at, 'reviewed_at', fr.reviewed_at, 'resolution_note', fr.resolution_note,
          'reviewer_username', (select ru.username from public.users ru where ru.id = fr.reviewed_by),
          'server', (select jsonb_build_object('id', sv.id, 'name', coalesce(nullif(btrim(sv.name), ''), f.name, 'Adsız sunucu'), 'avatar_url', coalesce(sv.avatar_url, f.avatar_url))
            from community_v2.servers sv left join public.fansubs f on f.id = sv.fansub_id where sv.id = fr.server_id),
          'channel', (select jsonb_build_object('id', c.id, 'name', c.name) from community_v2.channels c where c.id = fr.channel_id),
          'reporter', (select jsonb_build_object('id', ru.id, 'username', ru.username, 'avatar_url', ru.avatar_url) from public.users ru where ru.id = fr.reporter_id),
          'message', (select jsonb_build_object(
              'id', m.id, 'body', m.body, 'created_at', m.created_at, 'edited_at', m.edited_at, 'deleted_at', m.deleted_at,
              'attachments', cardinality(m.attachment_ids),
              'author', (select jsonb_build_object('id', au.id, 'username', au.username, 'display_name', au.display_name, 'avatar_url', au.avatar_url) from public.users au where au.id = m.author_id),
              'author_state', (select jsonb_build_object('state', mb.state, 'timeout_until', mb.timeout_until, 'is_owner', sv2.owner_id = m.author_id)
                from community_v2.members mb join community_v2.servers sv2 on sv2.id = mb.server_id
                where mb.server_id = fr.server_id and mb.user_id = m.author_id),
              'reports_on_message', (select count(*) from community_v2.message_reports r2 where r2.message_id = m.id)
            ) from community_v2.messages m where m.id = fr.message_id)
        ) order by fr.created_at desc)
        from (select * from filtered order by created_at desc limit 20 offset off) as fr), '[]'::jsonb)
    ) into result;
    return result;

  elsif p_action = 'decide_report' then
    -- Bos karar sessizce gecmesin (null 'not in' kontrolunu atlar).
    modev := coalesce(p->>'status', '');
    select * into report from community_v2.message_reports where id = nullif(p->>'report_id', '')::uuid for update;
    if not found then raise exception 'Şikâyet bulunamadı.' using errcode = '22023'; end if;
    if modev not in ('resolved', 'dismissed') then raise exception 'Geçerli bir karar seç.' using errcode = '22023'; end if;
    if report.status <> 'open' or (p->>'version')::integer is distinct from report.version then
      raise exception 'Bu şikâyet başka bir işlemle değişti. Listeyi yenile.';
    end if;
    update community_v2.message_reports
      set status = modev, reviewed_by = u, reviewed_at = clock_timestamp(), resolution_note = notev, version = version + 1
      where id = report.id;
    insert into community_v2.audit(server_id, actor_id, action, target_id, details)
      values (report.server_id, u, 'report.' || modev, report.id, jsonb_build_object('site_admin', true));
    perform community_v2.emit(report.server_id);
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete_message' then
    select * into msg from community_v2.messages where id = nullif(p->>'message_id', '')::uuid for update;
    if not found then raise exception 'Mesaj bulunamadı.' using errcode = '22023'; end if;
    select c.server_id into s from community_v2.channels as c where c.id = msg.channel_id;
    if msg.deleted_at is null then
      update community_v2.messages
        set body = '', mentions = '[]', pinned_at = null, pinned_by = null, deleted_at = now(), version = version + 1
        where id = msg.id;
      delete from community_v2.reactions where message_id = msg.id;
      insert into community_v2.audit(server_id, actor_id, action, target_id, details)
        values (s, u, 'delete_message', msg.id, jsonb_build_object('site_admin', true, 'label', (select username from public.users where id = msg.author_id)));
      perform community_v2.emit(s, msg.channel_id);
    end if;
    return jsonb_build_object('ok', true);

  elsif p_action = 'moderate' then
    modev := coalesce(p->>'operation', '');
    if modev not in ('timeout', 'kick', 'ban', 'unban') then raise exception 'Geçersiz üye işlemi.' using errcode = '22023'; end if;
    select * into v from community_v2.servers where id = s for update;
    if not found then raise exception 'Sunucu bulunamadı.' using errcode = '22023'; end if;
    if target is null then raise exception 'Üye seçilmedi.' using errcode = '22023'; end if;
    if v.owner_id = target then
      raise exception 'Sunucu sahibine üye işlemi uygulanamaz; gerekirse sunucuyu arşivle.' using errcode = '42501';
    end if;
    if not exists (select 1 from community_v2.members where server_id = s and user_id = target) then
      raise exception 'Bu kişi sunucunun üyesi değil.' using errcode = '22023';
    end if;
    if modev = 'kick' and not exists (select 1 from community_v2.members where server_id = s and user_id = target and state = 'active') then
      raise exception 'Yalnız aktif bir üye sunucudan çıkarılabilir.';
    end if;
    if modev = 'unban' and not exists (select 1 from community_v2.members where server_id = s and user_id = target and state = 'banned') then
      raise exception 'Üye yasaklı değil.';
    end if;
    if modev = 'timeout' then
      if nullif(p->>'minutes', '') is null or (p->>'minutes')::integer not between 0 and 10080 then
        raise exception 'Kısıtlama süresi 0–10080 dakika olmalı.' using errcode = '22023';
      end if;
      update community_v2.members
        set timeout_until = case when (p->>'minutes')::integer = 0 then null else now() + make_interval(mins => (p->>'minutes')::integer) end
        where server_id = s and user_id = target;
    else
      update community_v2.members
        set protected_rank = case when modev = 'ban' then community_v2.rank_of(s, target) else null end,
          state = case when modev = 'ban' then 'banned' else 'left' end
        where server_id = s and user_id = target;
      delete from community_v2.member_roles where server_id = s and user_id = target;
    end if;
    insert into community_v2.audit(server_id, actor_id, action, target_id, details)
      values (s, u, 'member.' || modev, target, jsonb_build_object(
        'site_admin', true, 'label', (select username from public.users where id = target), 'minutes', p->'minutes'));
    perform community_v2.emit(s);
    return jsonb_build_object('ok', true);

  elsif p_action = 'archive' then
    select * into v from community_v2.servers where id = s for update;
    if not found then raise exception 'Sunucu bulunamadı.' using errcode = '22023'; end if;
    if jsonb_typeof(p->'archived') is distinct from 'boolean' then
      raise exception 'Arşiv kararı gerekli.' using errcode = '22023';
    end if;
    if v.version is distinct from (p->>'version')::integer then
      raise exception 'Sunucu başka bir işlemle değişti. Yenileyip tekrar dene.';
    end if;
    update community_v2.servers
      set archived_at = case when (p->>'archived')::boolean then now() else null end, version = version + 1
      where id = s;
    insert into community_v2.audit(server_id, actor_id, action, target_id, details)
      values (s, u, 'room.archive', s, jsonb_build_object('site_admin', true, 'archived', (p->>'archived')::boolean));
    perform community_v2.emit(s);
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'Bilinmeyen yönetici işlemi.' using errcode = '22023';
end;
$$;

create or replace function public.community_v2_admin(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language sql
set search_path to ''
as $$ select community_v2.admin_api(p_action, p_payload); $$;

revoke all on function community_v2.admin_api(text, jsonb) from public, anon;
grant execute on function community_v2.admin_api(text, jsonb) to authenticated;
revoke all on function public.community_v2_admin(text, jsonb) from public, anon;
grant execute on function public.community_v2_admin(text, jsonb) to authenticated, service_role;
