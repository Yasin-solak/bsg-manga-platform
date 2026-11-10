-- Translation Studio: page tasks (job assignment).
-- Stages: cleanup, translation, typesetting, check. Each stage goes only to a member with the related
-- permission; assigning needs "ceviri.proje". The task owner or project manager changes the state
-- . When cleanup + translation finish the typesetter is notified, when typesetting finishes the checker.

create table public.translation_page_tasks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.translation_pages(id) on delete cascade,
  project_id uuid not null references public.translation_projects(id) on delete cascade,
  stage text not null check (stage in ('temizlik', 'ceviri', 'dizgi', 'kontrol')),
  assignee_id uuid references public.users(id) on delete set null,
  status text not null default 'bekliyor' check (status in ('bekliyor', 'devam', 'tamam')),
  note text check (note is null or pg_catalog.length(note) <= 300),
  assigned_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint translation_page_tasks_unique unique (page_id, stage)
);

create index translation_page_tasks_project_idx on public.translation_page_tasks (project_id, stage);
create index translation_page_tasks_assignee_idx on public.translation_page_tasks (assignee_id, status) where assignee_id is not null;

alter table public.translation_page_tasks enable row level security;
revoke all on public.translation_page_tasks from anon, authenticated;
grant select on public.translation_page_tasks to authenticated;
create policy translation_page_tasks_read on public.translation_page_tasks for select to authenticated
  using ((select app_private.tl_can_project(project_id)));

/** Asamayi yapabilmek icin gereken izin(ler). */
create or replace function app_private.tl_stage_permissions(p_stage text)
returns text[] language sql immutable set search_path = '' as $function$
  select case p_stage
    when 'temizlik' then array['ceviri.temizlik']
    when 'ceviri' then array['ceviri.metin']
    when 'dizgi' then array['ceviri.dizgi']
    when 'kontrol' then array['ceviri.metin', 'ceviri.dizgi']
  end::text[];
$function$;

create or replace function app_private.tl_user_can_stage(p_fansub_id uuid, p_user_id uuid, p_stage text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.is_feature_enabled('translation.studio_v3', false)
    and 'ceviri.gor' = any(perms)
    and perms && app_private.tl_stage_permissions(p_stage)
  from (select app_private.fansub_user_permissions(p_fansub_id, p_user_id) as perms) s;
$function$;

create or replace function app_private.tl_task_notify(p_user uuid, p_title text, p_message text, p_route text, p_event text, p_key text)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, message, icon, data)
  values (p_user, 'system', p_title, p_message, 'clipboard',
    pg_catalog.jsonb_build_object('event', p_event, 'event_key', p_key, 'route_hint', p_route));
end;
$function$;

/**
 * Gorev islemleri:
 *   assign     {project_id, page_ids[], stage, assignee_id|null, note?}   (ceviri.proje)
 *   set_status {task_id, status}                                          (sahip ya da ceviri.proje)
 */
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

    insert into public.translation_page_tasks (page_id, project_id, stage, assignee_id, status, note, assigned_by)
    select pid, v_project.id, v_stage, v_assignee, 'bekliyor', nullif(pg_catalog.btrim(coalesce(p->>'note', '')), ''), v_actor
    from pg_catalog.unnest(v_page_ids) as pid
    on conflict (page_id, stage) do update set
      assignee_id = excluded.assignee_id,
      status = case when public.translation_page_tasks.assignee_id is distinct from excluded.assignee_id then 'bekliyor' else public.translation_page_tasks.status end,
      completed_at = case when public.translation_page_tasks.assignee_id is distinct from excluded.assignee_id then null else public.translation_page_tasks.completed_at end,
      note = coalesce(excluded.note, public.translation_page_tasks.note),
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
create or replace function public.tl_assignable_members(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not app_private.tl_perm(p_fansub_id, 'ceviri.proje') then
    raise exception 'Görev atamak için proje yönetimi izni gerekir.' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', m.user_id, 'username', u.username, 'avatar_url', u.avatar_url,
      'stages', (select coalesce(pg_catalog.jsonb_agg(stage), '[]'::jsonb) from pg_catalog.unnest(array['temizlik', 'ceviri', 'dizgi', 'kontrol']) as stage
        where app_private.tl_user_can_stage(p_fansub_id, m.user_id, stage))
    ) order by u.username)
    from public.fansub_members m join public.users u on u.id = m.user_id
    where m.fansub_id = p_fansub_id
      and exists (select 1 from pg_catalog.unnest(array['temizlik', 'ceviri', 'dizgi', 'kontrol']) as stage
        where app_private.tl_user_can_stage(p_fansub_id, m.user_id, stage))
  ), '[]'::jsonb);
end;
$function$;

/** Bana atanan acik gorevler (tum fansublar). */
create or replace function public.tl_my_tasks()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'task_id', t.id, 'stage', t.stage, 'status', t.status, 'note', t.note,
    'page_id', t.page_id, 'page_number', pg.page_index + 1,
    'project_id', p.id, 'fansub_id', p.fansub_id, 'chapter_number', p.chapter_number,
    'series_title', coalesce(m.title, d.title), 'updated_at', t.updated_at
  ) order by t.updated_at desc), '[]'::jsonb)
  from public.translation_page_tasks t
  join public.translation_pages pg on pg.id = t.page_id
  join public.translation_projects p on p.id = t.project_id
  left join public.mangas m on m.id = p.manga_id
  left join public.translation_series_drafts d on d.id = p.series_draft_id
  where t.assignee_id = app_private.current_public_user_id() and t.status <> 'tamam'
    and app_private.tl_can_fansub(p.fansub_id);
$function$;

revoke all on function public.tl_task_write(text, jsonb) from public;
revoke all on function public.tl_assignable_members(uuid) from public;
revoke all on function public.tl_my_tasks() from public;
grant execute on function public.tl_task_write(text, jsonb) to authenticated;
grant execute on function public.tl_assignable_members(uuid) to authenticated;
grant execute on function public.tl_my_tasks() to authenticated;
revoke all on function app_private.tl_task_notify(uuid, text, text, text, text, text) from public;
