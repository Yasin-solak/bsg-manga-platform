-- The series catalog is shared; the fansub relation comes only from published chapters.
alter table community_v2.channels add column manga_id uuid references public.mangas(id) on delete restrict;
create unique index channels_server_manga_key on community_v2.channels(server_id,manga_id) where manga_id is not null;
create index channels_manga_idx on community_v2.channels(manga_id) where manga_id is not null;
create index chapters_community_series_idx on public.chapters(fansub_id,manga_id,publish_at)
  where is_active and is_approved;

create function community_v2.series_audience(m uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select m is null or exists(select 1 from public.mangas manga where manga.id=m
    and (not manga.is_mature or exists(select 1 from public.users usr where usr.id=u
      and usr.birth_date<=current_date-interval '18 years')));
$$;
create function community_v2.series_status(s uuid,m uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when m is null then null
    when not exists(select 1 from public.mangas where id=m and is_active and is_approved) then 'series_unavailable'
    when not exists(select 1 from public.chapters c join community_v2.servers v on v.fansub_id=c.fansub_id
      where v.id=s and c.manga_id=m and c.is_active and c.is_approved and coalesce(c.publish_at,c.created_at)<=now()) then 'fansub_unlinked'
    else null end;
$$;
-- The selected chapter/series lock closes the unpublish race between check and send.
create function community_v2.lock_series(s uuid,m uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if m is null then return; end if;
  perform 1 from public.mangas where id=m and is_active and is_approved for share;
  if not found then raise exception 'Seri yayında değil; kanal salt okunur.' using errcode='42501'; end if;
  perform 1 from public.chapters c join community_v2.servers v on v.fansub_id=c.fansub_id
    where v.id=s and c.manga_id=m and c.is_active and c.is_approved and coalesce(c.publish_at,c.created_at)<=now()
    order by c.id limit 1 for share of c;
  if not found then raise exception 'Fansubun bu seride yayımlanmış bölümü yok; kanal salt okunur.' using errcode='42501'; end if;
end $$;

create or replace function community_v2.can_view(c uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select community_v2.is_member(ch.server_id,u) and community_v2.series_audience(ch.manga_id,u)
    and (community_v2.is_owner(ch.server_id,u) or
    case when ch.is_private then exists(select 1 from community_v2.channel_roles cr
      join community_v2.roles r on r.id=cr.role_id and r.server_id=cr.server_id
      where cr.channel_id=c and (r.is_default or exists(select 1 from community_v2.member_roles mr
        where mr.server_id=cr.server_id and mr.user_id=u and mr.role_id=cr.role_id)))
    else community_v2.has_permission(ch.server_id,u,'channel.view') end)
    from community_v2.channels ch where ch.id=c),false);
$$;

-- Non-members can discover only open general rooms readable by the Everyone role after joining.
create function community_v2.can_discover_channel(c uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select f.is_active and ch.archived_at is null
    and community_v2.series_status(ch.server_id,ch.manga_id) is null and community_v2.series_audience(ch.manga_id,u)
    and (case when community_v2.is_member(ch.server_id,u) then community_v2.can_read(c,u)
      else not ch.is_private
        and not exists(select 1 from community_v2.members where server_id=ch.server_id and user_id=u and state='banned')
        and exists(select 1 from community_v2.roles where server_id=ch.server_id and is_default
          and permissions @> array['channel.view','messages.read']) end)
    from community_v2.channels ch join community_v2.servers s on s.id=ch.server_id
    join public.fansubs f on f.id=s.fansub_id where ch.id=c),false);
$$;

create function community_v2.series_channels(m uuid,offn integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid;
begin
  if auth.uid() is not null then u:=community_v2.actor(); end if;
  if not exists(select 1 from public.mangas where id=m and is_active and is_approved)
    or not community_v2.series_audience(m,u) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select c.id as channel_id,c.server_id,c.name as channel_name,c.is_private,
      f.name as fansub_name,f.avatar_url,community_v2.is_member(c.server_id,u) as is_member
    from community_v2.channels c join community_v2.servers s on s.id=c.server_id
    join public.fansubs f on f.id=s.fansub_id
    where c.manga_id=m and community_v2.can_discover_channel(c.id,u)
    order by f.name,c.server_id limit 21 offset greatest(0,least(coalesce(offn,0),100000)))x),'[]'::jsonb);
end $$;
create function public.community_v2_series_channels(p_manga_id uuid,p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$ select community_v2.series_channels(p_manga_id,p_offset); $$;

create function community_v2.series_candidates(s uuid,search text,offn integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=community_v2.actor();
begin
  if not community_v2.has_permission(s,u,'channels.create') and not community_v2.has_permission(s,u,'channels.manage') then
    raise exception 'Seri bağlama iznin yok.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select m.id,m.title,m.slug,exists(select 1 from community_v2.channels where server_id=s and manga_id=m.id) as already_linked
    from public.mangas m where m.is_active and m.is_approved and community_v2.series_audience(m.id,u)
    and m.title ilike '%'||left(coalesce(search,''),80)||'%' and community_v2.series_status(s,m.id) is null
    order by m.title,m.id limit 21 offset greatest(0,least(coalesce(offn,0),100000)))x),'[]'::jsonb);
end $$;
create function community_v2.channel_entry(c uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=community_v2.actor();
begin
  if not community_v2.can_discover_channel(c,u) and not community_v2.can_read(c,u) then
    raise exception 'Bu kanal kullanılamıyor veya erişimin yok.' using errcode='42501';
  end if;
  return (select jsonb_build_object('server_id',s.id,'channel_id',c,'channel_name',ch.name,
    'fansub_name',f.name,'avatar_url',f.avatar_url,'is_member',community_v2.is_member(s.id,u),'is_private',ch.is_private)
    from community_v2.channels ch join community_v2.servers s on s.id=ch.server_id
    join public.fansubs f on f.id=s.fansub_id where ch.id=c);
end $$;
revoke all on function community_v2.series_audience(uuid,uuid),community_v2.series_status(uuid,uuid),
  community_v2.lock_series(uuid,uuid),community_v2.can_view(uuid,uuid),community_v2.can_discover_channel(uuid,uuid),
  community_v2.series_candidates(uuid,text,integer),community_v2.channel_entry(uuid),
  community_v2.series_channels(uuid,integer),public.community_v2_series_channels(uuid,integer) from public,anon,authenticated;
grant usage on schema community_v2 to anon;
grant execute on function community_v2.series_channels(uuid,integer),public.community_v2_series_channels(uuid,integer) to anon,authenticated;
