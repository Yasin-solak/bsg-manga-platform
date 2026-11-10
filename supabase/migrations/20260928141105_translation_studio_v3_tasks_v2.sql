-- Translation Studio tasks stage 2: due date, overdue warning, contribution
-- stats and chapter end credit suggestion.

alter table public.translation_page_tasks
  add column due_at timestamptz,
  add column overdue_notified_at timestamptz;

create index translation_page_tasks_overdue_idx on public.translation_page_tasks (due_at)
  where status <> 'tamam' and due_at is not null and overdue_notified_at is null;

create or replace function public.tl_task_write(p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := app_private.current_public_user_id();
  v_project public.translation_projects%rowtype;
  v_task public.translation_page_tasks%rowtype;
  v_stage text;
  v_assignee uuid;
  v_status text;
  v_page_ids uuid[];
  v_count integer := 0;
  v_route text;
  v_page_number integer;
  v_next record;
begin
  if p_action = 'assign' then
    select * into v_project from public.translation_projects where id = (p->>'project_id')::uuid;
    if v_project.id is null then raise exception 'Proje bulunamadı.' using errcode = 'P0002'; end if;
    if not app_private.tl_perm(v_project.fansub_id, 'ceviri.proje') then
      raise exception 'Görev atamak için proje yönetimi izni gerekir.' using errcode = '42501';
    end if;
    v_stage := p->>'stage';
    if v_stage not in ('temizlik', 'ceviri', 'dizgi', 'kontrol') then raise exception 'Geçersiz aşama.' using errcode = 'PT422'; end if;
    v_assignee := nullif(p->>'assignee_id', '')::uuid;
    if v_assignee is not null and not app_private.tl_user_can_stage(v_project.fansub_id, v_assignee, v_stage) then
      raise exception 'Bu üyenin bu aşama için izni yok.' using errcode = 'PT422';
    end if;
    select coalesce(pg_catalog.array_agg(pg.id), '{}'::uuid[]) into v_page_ids
    from public.translation_pages pg
    where pg.project_id = v_project.id
      and pg.id in (select value::uuid from pg_catalog.jsonb_array_elements_text(coalesce(p->'page_ids', '[]'::jsonb)) as value);
    if pg_catalog.cardinality(v_page_ids) = 0 then raise exception 'Sayfa seçilmedi.' using errcode = 'PT422'; end if;

    if v_assignee is null then
      delete from public.translation_page_tasks where project_id = v_project.id and stage = v_stage and page_id = any(v_page_ids);
      get diagnostics v_count = row_count;
      return pg_catalog.jsonb_build_object('cleared', v_count);
    end if;

    insert into public.translation_page_tasks (page_id, project_id, stage, assignee_id, status, note, assigned_by, due_at)
    select pid, v_project.id, v_stage, v_assignee, 'bekliyor', nullif(pg_catalog.btrim(coalesce(p->>'note', '')), ''), v_actor,
      nullif(p->>'due_at', '')::timestamptz
    from pg_catalog.unnest(v_page_ids) as pid
    on conflict (page_id, stage) do update set
      assignee_id = excluded.assignee_id,
      status = case when public.translation_page_tasks.assignee_id is distinct from excluded.assignee_id then 'bekliyor' else public.translation_page_tasks.status end,
      completed_at = case when public.translation_page_tasks.assignee_id is distinct from excluded.assignee_id then null else public.translation_page_tasks.completed_at end,
      note = coalesce(excluded.note, public.translation_page_tasks.note),
      due_at = coalesce(excluded.due_at, public.translation_page_tasks.due_at),
      overdue_notified_at = case when excluded.due_at is not null then null else public.translation_page_tasks.overdue_notified_at end,
      assigned_by = excluded.assigned_by,
      updated_at = now();
    get diagnostics v_count = row_count;

    if v_assignee is distinct from v_actor then
      select pg.page_index + 1 into v_page_number from public.translation_pages pg where pg.id = v_page_ids[1];
      v_route := '/fansub/' || v_project.fansub_id || '/studyo/' || v_project.id || '/duzenle/' || coalesce(v_page_number, 1);
      perform app_private.tl_task_notify(v_assignee,
        'Yeni görev: ' || case v_stage when 'temizlik' then 'Temizlik' when 'ceviri' then 'Çeviri' when 'dizgi' then 'Dizgi' else 'Kontrol' end,
        v_count || ' sayfa sana atandı · Bölüm ' || coalesce(v_project.chapter_number::text, ''),
        v_route, 'tl_task_assigned', 'tl-task:' || v_project.id || ':' || v_stage || ':' || v_assignee || ':' || extract(epoch from now())::bigint);
    end if;
    return pg_catalog.jsonb_build_object('assigned', v_count);

  elsif p_action = 'update' then
    -- Bulk note / due date (project manager). An empty string clears the field.
    select * into v_project from public.translation_projects where id = (p->>'project_id')::uuid;
    if v_project.id is null then raise exception 'Proje bulunamadı.' using errcode = 'P0002'; end if;
    if not app_private.tl_perm(v_project.fansub_id, 'ceviri.proje') then
      raise exception 'Görevi düzenlemek için proje yönetimi izni gerekir.' using errcode = '42501';
    end if;
    update public.translation_page_tasks t set
      note = case when p ? 'note' then nullif(pg_catalog.btrim(coalesce(p->>'note', '')), '') else t.note end,
      due_at = case when p ? 'due_at' then nullif(p->>'due_at', '')::timestamptz else t.due_at end,
      overdue_notified_at = case when p ? 'due_at' then null else t.overdue_notified_at end,
      updated_at = now()
    where t.project_id = v_project.id
      and t.id in (select value::uuid from pg_catalog.jsonb_array_elements_text(coalesce(p->'task_ids', '[]'::jsonb)) as value);
    get diagnostics v_count = row_count;
    return pg_catalog.jsonb_build_object('updated', v_count);

  elsif p_action = 'set_status' then
    select * into v_task from public.translation_page_tasks where id = (p->>'task_id')::uuid;
    if v_task.id is null then raise exception 'Görev bulunamadı.' using errcode = 'P0002'; end if;
    select * into v_project from public.translation_projects where id = v_task.project_id;
    if not (v_task.assignee_id = v_actor or app_private.tl_perm(v_project.fansub_id, 'ceviri.proje')) then
      raise exception 'Bu görevin durumunu yalnız atanan kişi ya da proje yöneticisi değiştirebilir.' using errcode = '42501';
    end if;
    v_status := p->>'status';
    if v_status not in ('bekliyor', 'devam', 'tamam') then raise exception 'Geçersiz durum.' using errcode = 'PT422'; end if;
    update public.translation_page_tasks set status = v_status, updated_at = now(),
      completed_at = case when v_status = 'tamam' then now() else null end
    where id = v_task.id returning * into v_task;

    -- Sonraki asamaya haber: temizlik + ceviri -> dizgi, dizgi -> kontrol.
    if v_status = 'tamam' then
      select pg.page_index + 1 into v_page_number from public.translation_pages pg where pg.id = v_task.page_id;
      v_route := '/fansub/' || v_project.fansub_id || '/studyo/' || v_project.id || '/duzenle/' || coalesce(v_page_number, 1);
      for v_next in
        select t.* from public.translation_page_tasks t
        where t.page_id = v_task.page_id and t.status <> 'tamam' and t.assignee_id is not null
          and ((v_task.stage in ('temizlik', 'ceviri') and t.stage = 'dizgi'
                and not exists (select 1 from public.translation_page_tasks o where o.page_id = v_task.page_id
                  and o.stage in ('temizlik', 'ceviri') and o.status <> 'tamam'))
            or (v_task.stage = 'dizgi' and t.stage = 'kontrol'))
      loop
        perform app_private.tl_task_notify(v_next.assignee_id,
          'Sıra sende: ' || case v_next.stage when 'dizgi' then 'Dizgi' else 'Kontrol' end,
          'Sayfa ' || coalesce(v_page_number, 1) || ' hazır · Bölüm ' || coalesce(v_project.chapter_number::text, ''),
          v_route, 'tl_task_ready', 'tl-ready:' || v_next.id);
      end loop;
    end if;
    return pg_catalog.to_jsonb(v_task);
  end if;

  raise exception 'Bilinmeyen işlem.' using errcode = 'PT422';
end;
$function$;

/** Atanabilir uyeler: stüdyo izni olan uyeler ve yapabildikleri asamalar (ceviri.proje). */

/** Geciken gorevler: atanan kisiye ve atayana birer kez bildirim (pg_cron, 30 dk). */
create or replace function app_private.tl_task_overdue_sweep()
returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_task record;
  v_count integer := 0;
begin
  for v_task in
    select t.*, p.fansub_id, p.chapter_number, pg.page_index + 1 as page_number
    from public.translation_page_tasks t
    join public.translation_projects p on p.id = t.project_id
    join public.translation_pages pg on pg.id = t.page_id
    where t.status <> 'tamam' and t.due_at is not null and t.due_at < now()
      and t.overdue_notified_at is null and t.assignee_id is not null
    order by t.due_at
    limit 500
  loop
    perform app_private.tl_task_notify(v_task.assignee_id, 'Görev gecikti',
      'Sayfa ' || v_task.page_number || ' · Bölüm ' || coalesce(v_task.chapter_number::text, '') || ' teslim tarihi geçti',
      '/fansub/' || v_task.fansub_id || '/studyo/' || v_task.project_id || '/duzenle/' || v_task.page_number,
      'tl_task_overdue', 'tl-overdue:' || v_task.id);
    if v_task.assigned_by is not null and v_task.assigned_by <> v_task.assignee_id then
      perform app_private.tl_task_notify(v_task.assigned_by, 'Atadığın görev gecikti',
        'Sayfa ' || v_task.page_number || ' · Bölüm ' || coalesce(v_task.chapter_number::text, ''),
        '/fansub/' || v_task.fansub_id || '/studyo/' || v_task.project_id || '/gorevler',
        'tl_task_overdue_manager', 'tl-overdue-m:' || v_task.id);
    end if;
    update public.translation_page_tasks set overdue_notified_at = now() where id = v_task.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
revoke all on function app_private.tl_task_overdue_sweep() from public;

select cron.schedule('tl-task-overdue', '*/30 * * * *', 'select app_private.tl_task_overdue_sweep();');

/** Bana atanan acik gorevler (teslim tarihiyle). */
create or replace function public.tl_my_tasks()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'task_id', t.id, 'stage', t.stage, 'status', t.status, 'note', t.note, 'due_at', t.due_at,
    'page_id', t.page_id, 'page_number', pg.page_index + 1,
    'project_id', p.id, 'fansub_id', p.fansub_id, 'chapter_number', p.chapter_number,
    'series_title', coalesce(m.title, d.title), 'updated_at', t.updated_at
  ) order by t.due_at nulls last, t.updated_at desc), '[]'::jsonb)
  from public.translation_page_tasks t
  join public.translation_pages pg on pg.id = t.page_id
  join public.translation_projects p on p.id = t.project_id
  left join public.mangas m on m.id = p.manga_id
  left join public.translation_series_drafts d on d.id = p.series_draft_id
  where t.assignee_id = app_private.current_public_user_id() and t.status <> 'tamam'
    and app_private.tl_can_fansub(p.fansub_id);
$function$;

/** Bolum katkilari: kim hangi asamada kac sayfa bitirdi + kredi metni onerisi. */
create or replace function public.tl_project_contributions(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_rows jsonb;
  v_credits text;
begin
  if not app_private.tl_can_project(p_project_id) then
    raise exception 'Bu projeyi görme iznin yok.' using errcode = '42501';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', s.assignee_id, 'username', u.username, 'stage', s.stage, 'done', s.done, 'total', s.total
    ) order by s.stage, s.done desc), '[]'::jsonb)
    into v_rows
  from (
    select assignee_id, stage, pg_catalog.count(*) filter (where status = 'tamam') as done, pg_catalog.count(*) as total
    from public.translation_page_tasks where project_id = p_project_id and assignee_id is not null
    group by assignee_id, stage
  ) s join public.users u on u.id = s.assignee_id;
  select pg_catalog.string_agg(label || ': ' || names, ' · ' order by ord)
    into v_credits
  from (
    select st.ord, st.label, pg_catalog.string_agg(u.username, ', ' order by c.done desc, u.username) as names
    from (values (1, 'ceviri', 'Çeviri'), (2, 'temizlik', 'Temizlik'), (3, 'dizgi', 'Dizgi'), (4, 'kontrol', 'Kontrol')) as st(ord, stage, label)
    join lateral (
      select assignee_id, pg_catalog.count(*) as done from public.translation_page_tasks
      where project_id = p_project_id and stage = st.stage and status = 'tamam' and assignee_id is not null
      group by assignee_id
    ) c on true
    join public.users u on u.id = c.assignee_id
    group by st.ord, st.label
  ) x;
  return pg_catalog.jsonb_build_object('rows', v_rows, 'credits', coalesce(v_credits, ''));
end;
$function$;
revoke all on function public.tl_project_contributions(uuid) from public;
grant execute on function public.tl_project_contributions(uuid) to authenticated;
