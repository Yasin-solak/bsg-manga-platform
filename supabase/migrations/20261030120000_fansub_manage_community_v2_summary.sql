-- Fansub studio "Community" tab: instead of the old post feed (v1) summarizes the fansub
-- community v2 server. With no server returns whether one can open.
-- community_v2.actor() errors with community off so it is not used here;
-- the flag state goes to the client in the "enabled" field.
create or replace function public.get_fansub_manage_community_v2(p_fansub_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_public_user_id();
  v_server community_v2.servers%rowtype;
  v_admin_count integer;
  v_is_admin boolean;
begin
  if v_actor is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;
  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;
  if not (public.is_admin() or app_private.fansub_staff_topluluk(p_fansub_id) or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansubun topluluk ozetini gorme yetkiniz yok.' using errcode = '42501';
  end if;

  select * into v_server from community_v2.servers where fansub_id = p_fansub_id;
  select count(*) into v_admin_count from public.fansub_members where fansub_id = p_fansub_id and role = 'admin';
  v_is_admin := exists(select 1 from public.fansub_members where fansub_id = p_fansub_id and user_id = v_actor and role = 'admin');

  if v_server.id is null then
    return jsonb_build_object(
      'enabled', community_v2.enabled(),
      'server', null,
      -- The server owner becomes the fansub's single admin (community_v2.create_server rule).
      'canCreate', v_is_admin and v_admin_count = 1,
      'adminCount', v_admin_count
    );
  end if;

  return jsonb_build_object(
    'enabled', community_v2.enabled(),
    'canCreate', false,
    'adminCount', v_admin_count,
    'server', jsonb_build_object(
      'id', v_server.id,
      'name', coalesce(v_server.name, (select f.name from public.fansubs f where f.id = p_fansub_id)),
      'joinMode', v_server.join_mode,
      'archivedAt', v_server.archived_at,
      'createdAt', v_server.created_at,
      'isMember', exists(select 1 from community_v2.members m where m.server_id = v_server.id and m.user_id = v_actor and m.state = 'active'),
      'isOwner', v_server.owner_id = v_actor
    ),
    'stats', jsonb_build_object(
      'members', (select count(*) from community_v2.members m where m.server_id = v_server.id and m.state = 'active'),
      'newMembers7d', (select count(*) from community_v2.members m where m.server_id = v_server.id and m.state = 'active' and m.joined_at >= now() - interval '7 days'),
      'banned', (select count(*) from community_v2.members m where m.server_id = v_server.id and m.state = 'banned'),
      'messages7d', (
        select count(*) from community_v2.messages msg
        join community_v2.channels ch on ch.id = msg.channel_id
        where ch.server_id = v_server.id and msg.deleted_at is null and msg.created_at >= now() - interval '7 days'
      ),
      'chatters7d', (
        select count(distinct msg.author_id) from community_v2.messages msg
        join community_v2.channels ch on ch.id = msg.channel_id
        where ch.server_id = v_server.id and msg.deleted_at is null and msg.created_at >= now() - interval '7 days'
      ),
      'channels', (select count(*) from community_v2.channels ch where ch.server_id = v_server.id and ch.archived_at is null),
      'roles', (select count(*) from community_v2.roles r where r.server_id = v_server.id and not r.is_default),
      'pendingJoinRequests', (select count(*) from community_v2.join_requests j where j.server_id = v_server.id),
      'openReports', (select count(*) from community_v2.message_reports r where r.server_id = v_server.id and r.status = 'open'),
      'activeInvites', (
        select count(*) from community_v2.invites i
        where i.server_id = v_server.id and i.revoked_at is null
          and (i.expires_at is null or i.expires_at > now())
          and (i.max_uses is null or i.uses < i.max_uses)
      )
    ),
    'channels', coalesce((
      select jsonb_agg(x order by x.archived, x.position, x.name) from (
        select ch.id, ch.name, ch.category, ch.is_private as "isPrivate", ch.position,
          ch.archived_at is not null as archived,
          ma.title as "mangaTitle",
          (select count(*) from community_v2.messages msg
            where msg.channel_id = ch.id and msg.deleted_at is null and msg.created_at >= now() - interval '7 days') as "messages7d",
          (select max(msg.created_at) from community_v2.messages msg
            where msg.channel_id = ch.id and msg.deleted_at is null) as "lastMessageAt"
        from community_v2.channels ch
        left join public.mangas ma on ma.id = ch.manga_id
        where ch.server_id = v_server.id
        order by ch.archived_at is not null, ch.position, ch.name
        limit 40
      ) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'messages', d.messages) order by d.day) from (
        select g.day::date as day,
          (select count(*) from community_v2.messages msg
            join community_v2.channels ch on ch.id = msg.channel_id
            where ch.server_id = v_server.id and msg.deleted_at is null
              and msg.created_at >= g.day and msg.created_at < g.day + interval '1 day') as messages
        from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as g(day)
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_fansub_manage_community_v2(uuid) from public, anon;
grant execute on function public.get_fansub_manage_community_v2(uuid) to authenticated;
