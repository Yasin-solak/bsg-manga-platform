-- Admin > Announcements v2: real publish state views, counts and search.
--
-- announcement_admin_list filtered only by raw state (draft / published / archive):
-- ended and scheduled publishes mixed under "Yayinda / planli"
-- (on live data 10 of 12 publishes had ended), no state counts and
-- no title search. The new function computes state:
-- live (published), scheduled, ended, draft, archived,
-- deleted (trash); "all" is everything except trash.
-- Search is Turkish letter-insensitive (app_private.comment_moderation_fold shared folding).
-- The old function stays in place for rollback.

create or replace function announcement_internal.admin_overview(
  p_state text default 'all',
  p_query text default '',
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_state text := coalesce(nullif(btrim(p_state), ''), 'all');
  v_query text := app_private.comment_moderation_fold(btrim(coalesce(p_query, '')));
  v_result jsonb;
begin
  perform announcement_internal.require_admin();
  if v_state not in ('all', 'live', 'scheduled', 'ended', 'draft', 'archived', 'deleted') then
    raise exception 'Geçersiz görünüm.' using errcode = '22023';
  end if;
  if length(v_query) > 80 then
    raise exception 'Arama metni çok uzun.' using errcode = '22023';
  end if;

  with classified as (
    select e.id, e.title, e.updated_at,
      case
        when e.deleted_at is not null then 'deleted'
        when e.status = 'draft' then 'draft'
        when e.status = 'archived' then 'archived'
        when e.ends_at is not null and e.ends_at <= now() then 'ended'
        when e.starts_at > now() then 'scheduled'
        else 'live'
      end as state
    from announcement_internal.entries as e
  ),
  searched as (
    select c.* from classified as c
    where v_query = '' or app_private.comment_moderation_fold(c.title) like '%' || v_query || '%'
  ),
  matched as (
    select s.* from searched as s
    where (v_state = 'all' and s.state <> 'deleted') or s.state = v_state
  ),
  page as (
    select m.id from matched as m
    order by m.updated_at desc, m.id
    offset greatest(0, least(coalesce(p_offset, 0), 10000)) limit 20
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'counts', (
      select jsonb_build_object(
        'live', count(*) filter (where s.state = 'live'),
        'scheduled', count(*) filter (where s.state = 'scheduled'),
        'ended', count(*) filter (where s.state = 'ended'),
        'draft', count(*) filter (where s.state = 'draft'),
        'archived', count(*) filter (where s.state = 'archived'),
        'deleted', count(*) filter (where s.state = 'deleted')
      ) from searched as s
    ),
    'items', coalesce((
      select jsonb_agg(announcement_internal.admin_row(a) order by a.updated_at desc, a.id)
      from page as p
      join announcement_internal.entries as a on a.id = p.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.announcement_admin_overview(
  p_state text default 'all',
  p_query text default '',
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path to ''
as $$ select announcement_internal.admin_overview(p_state, p_query, p_offset) $$;

revoke all on function announcement_internal.admin_overview(text, text, integer) from public, anon;
grant execute on function announcement_internal.admin_overview(text, text, integer) to authenticated;
revoke all on function public.announcement_admin_overview(text, text, integer) from public, anon;
grant execute on function public.announcement_admin_overview(text, text, integer) to authenticated, service_role;
