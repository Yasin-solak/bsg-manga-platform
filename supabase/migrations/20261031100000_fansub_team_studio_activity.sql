-- Fansub studio "Team members": translation studio integration.
-- * get_fansub_team_studio_overview: per member assigned roles, translation studio
-- permissions (ceviri.*), open / overdue / finished in the last 30 days page tasks.
-- * get_fansub_member_activity: one member's contributions on this team (tasks,
-- opened projects, saved page versions, management actions, membership
-- history). Read only; permission: site admin or panel.uyelik.
create or replace function public.get_fansub_team_studio_overview(p_fansub_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if app_private.current_public_user_id() is null then
    raise exception 'Kullanıcı oturumu bulunamadı.' using errcode = '42501';
  end if;
  if not (app_private.is_admin() or app_private.fansub_staff_uyelik(p_fansub_id)) then
    raise exception 'Ekip ayrıntılarını görme yetkin yok.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', m.user_id,
      'roles', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color) order by r.position)
        from public.fansub_member_roles mr
        join public.fansub_roles r on r.id = mr.role_id
        where mr.fansub_id = p_fansub_id and mr.user_id = m.user_id and not r.is_default
      ), '[]'::jsonb),
      'studioPermissions', coalesce((
        select jsonb_agg(p order by p)
        from unnest(app_private.fansub_user_permissions(p_fansub_id, m.user_id)) p
        where p like 'ceviri.%'
      ), '[]'::jsonb),
      'openTasks', (
        select count(*) from public.translation_page_tasks t
        join public.translation_projects pr on pr.id = t.project_id
        where pr.fansub_id = p_fansub_id and t.assignee_id = m.user_id and t.status <> 'tamam'
      ),
      'overdueTasks', (
        select count(*) from public.translation_page_tasks t
        join public.translation_projects pr on pr.id = t.project_id
        where pr.fansub_id = p_fansub_id and t.assignee_id = m.user_id and t.status <> 'tamam'
          and t.due_at is not null and t.due_at < now()
      ),
      'doneTasks30d', (
        select count(*) from public.translation_page_tasks t
        join public.translation_projects pr on pr.id = t.project_id
        where pr.fansub_id = p_fansub_id and t.assignee_id = m.user_id and t.status = 'tamam'
          and coalesce(t.completed_at, t.updated_at) >= now() - interval '30 days'
      ),
      'lastActiveAt', greatest(
        (select max(t.updated_at) from public.translation_page_tasks t
          join public.translation_projects pr on pr.id = t.project_id
          where pr.fansub_id = p_fansub_id and t.assignee_id = m.user_id),
        (select max(v.created_at) from public.translation_page_versions v
          join public.translation_projects pr on pr.id = v.project_id
          where pr.fansub_id = p_fansub_id and v.created_by = m.user_id),
        (select max(a.created_at) from public.fansub_audit_logs a
          where a.fansub_id = p_fansub_id and a.actor_user_id = m.user_id)
      )
    ))
    from public.fansub_members m
    where m.fansub_id = p_fansub_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.get_fansub_member_activity(p_fansub_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if app_private.current_public_user_id() is null then
    raise exception 'Kullanıcı oturumu bulunamadı.' using errcode = '42501';
  end if;
  if not (app_private.is_admin() or app_private.fansub_staff_uyelik(p_fansub_id)) then
    raise exception 'Ekip ayrıntılarını görme yetkin yok.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'taskTotals', coalesce((
      select jsonb_object_agg(x.stage, jsonb_build_object('open', x.open, 'done', x.done))
      from (
        select t.stage, count(*) filter (where t.status <> 'tamam') as open, count(*) filter (where t.status = 'tamam') as done
        from public.translation_page_tasks t
        join public.translation_projects pr on pr.id = t.project_id
        where pr.fansub_id = p_fansub_id and t.assignee_id = p_user_id
        group by t.stage
      ) x
    ), '{}'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(x order by x."isOpen" desc, x."updatedAt" desc) from (
        select t.id, t.stage, t.status, t.due_at as "dueAt", t.updated_at as "updatedAt", t.completed_at as "completedAt",
          t.status <> 'tamam' as "isOpen",
          pg.page_index + 1 as "pageNumber",
          pr.id as "projectId", pr.chapter_number as "chapterNumber",
          coalesce(ma.title, sd.title, 'Seri') as "seriesTitle"
        from public.translation_page_tasks t
        join public.translation_projects pr on pr.id = t.project_id
        left join public.translation_pages pg on pg.id = t.page_id
        left join public.mangas ma on ma.id = pr.manga_id
        left join public.translation_series_drafts sd on sd.id = pr.series_draft_id
        where pr.fansub_id = p_fansub_id and t.assignee_id = p_user_id
        order by t.status <> 'tamam' desc, t.updated_at desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'projectsCreated', (
      select count(*) from public.translation_projects pr
      where pr.fansub_id = p_fansub_id and pr.created_by = p_user_id
    ),
    'pageVersions', (
      select count(*) from public.translation_page_versions v
      join public.translation_projects pr on pr.id = v.project_id
      where pr.fansub_id = p_fansub_id and v.created_by = p_user_id
    ),
    'pageVersions30d', (
      select count(*) from public.translation_page_versions v
      join public.translation_projects pr on pr.id = v.project_id
      where pr.fansub_id = p_fansub_id and v.created_by = p_user_id and v.created_at >= now() - interval '30 days'
    ),
    'recentActions', coalesce((
      select jsonb_agg(x order by x."createdAt" desc) from (
        select a.id, a.action, a.summary, a.created_at as "createdAt"
        from public.fansub_audit_logs a
        where a.fansub_id = p_fansub_id and a.actor_user_id = p_user_id
        order by a.created_at desc
        limit 12
      ) x
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(x order by x."joinedAt" desc) from (
        select h.role, h.team_tag as "teamTag", h.joined_at as "joinedAt", h.left_at as "leftAt", h.left_reason as "leftReason"
        from public.fansub_member_history h
        where h.fansub_id = p_fansub_id and h.user_id = p_user_id
        order by h.joined_at desc
        limit 10
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_fansub_team_studio_overview(uuid) from public, anon;
revoke all on function public.get_fansub_member_activity(uuid, uuid) from public, anon;
grant execute on function public.get_fansub_team_studio_overview(uuid) to authenticated;
grant execute on function public.get_fansub_member_activity(uuid, uuid) to authenticated;
