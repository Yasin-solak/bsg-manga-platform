-- Translation Studio: page version history.
-- A version is built on the server as the page DB state (items + texts + cleanup strokes);
-- the client restores with the editor snapshot mechanism
-- (reversible). The last 30 versions per page are kept. When a task goes "done"
-- a version is taken automatically.

create table public.translation_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.translation_pages(id) on delete cascade,
  project_id uuid not null references public.translation_projects(id) on delete cascade,
  kind text not null default 'manual' check (kind in ('manual', 'auto')),
  label text not null check (pg_catalog.length(pg_catalog.btrim(label)) between 1 and 80),
  items jsonb not null,
  strokes jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint translation_page_versions_size check (pg_catalog.pg_column_size(items) + pg_catalog.pg_column_size(strokes) < 4000000)
);

create index translation_page_versions_page_idx on public.translation_page_versions (page_id, created_at desc);

alter table public.translation_page_versions enable row level security;
revoke all on public.translation_page_versions from anon, authenticated;
-- Read/write via RPC only.

/** Sayfanin DB halinden surum olusturur (izin kontrolu cagirana ait). */
create or replace function app_private.tl_page_version_capture(p_page_id uuid, p_kind text, p_label text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_project uuid;
  v_items jsonb;
  v_strokes jsonb;
  v_id uuid;
begin
  select project_id into v_project from public.translation_pages where id = p_page_id;
  if v_project is null then raise exception 'Sayfa bulunamadı.' using errcode = 'P0002'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) - 'created_at' - 'updated_at' - 'detection_key'
      || pg_catalog.jsonb_build_object('translation_item_texts', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('language', t.language, 'text', t.text, 'status', t.status, 'origin', t.origin, 'version', t.version))
        from public.translation_item_texts t where t.item_id = i.id), '[]'::jsonb))
      order by i.reading_order, i.id), '[]'::jsonb)
    into v_items
  from public.translation_items i where i.page_id = p_page_id;
  select coalesce(c.strokes, '[]'::jsonb) into v_strokes from public.translation_page_cleanup c where c.page_id = p_page_id;
  insert into public.translation_page_versions (page_id, project_id, kind, label, items, strokes, item_count, created_by)
  values (p_page_id, v_project, p_kind, pg_catalog.left(pg_catalog.btrim(p_label), 80), v_items, coalesce(v_strokes, '[]'::jsonb),
    pg_catalog.jsonb_array_length(v_items), p_actor)
  returning id into v_id;
  -- Last 30 versions per page.
  delete from public.translation_page_versions where id in (
    select id from public.translation_page_versions where page_id = p_page_id order by created_at desc offset 30
  );
  return v_id;
end;
$function$;
revoke all on function app_private.tl_page_version_capture(uuid, text, text, uuid) from public;

create or replace function public.tl_page_version_save(p_page_id uuid, p_label text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_fansub uuid := app_private.tl_page_fansub(p_page_id);
begin
  if not (app_private.tl_perm(v_fansub, 'ceviri.metin') or app_private.tl_perm(v_fansub, 'ceviri.dizgi')
    or app_private.tl_perm(v_fansub, 'ceviri.temizlik') or app_private.tl_perm(v_fansub, 'ceviri.proje')) then
    raise exception 'Sürüm kaydetmek için düzenleme izni gerekir.' using errcode = '42501';
  end if;
  return app_private.tl_page_version_capture(p_page_id, 'manual', coalesce(nullif(pg_catalog.btrim(p_label), ''), 'Elle kaydedildi'), app_private.current_public_user_id());
end;
$function$;

create or replace function public.tl_page_versions(p_page_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not app_private.tl_can_page(p_page_id) then
    raise exception 'Bu sayfayı görme iznin yok.' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', v.id, 'kind', v.kind, 'label', v.label, 'item_count', v.item_count,
      'created_at', v.created_at, 'created_by', u.username
    ) order by v.created_at desc)
    from public.translation_page_versions v left join public.users u on u.id = v.created_by
    where v.page_id = p_page_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.tl_page_version_get(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_row public.translation_page_versions%rowtype;
begin
  select * into v_row from public.translation_page_versions where id = p_version_id;
  if v_row.id is null or not app_private.tl_can_page(v_row.page_id) then
    raise exception 'Sürüm bulunamadı.' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', v_row.id, 'page_id', v_row.page_id, 'label', v_row.label, 'items', v_row.items, 'strokes', v_row.strokes);
end;
$function$;

create or replace function public.tl_page_version_delete(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_row public.translation_page_versions%rowtype;
begin
  select * into v_row from public.translation_page_versions where id = p_version_id;
  if v_row.id is null then raise exception 'Sürüm bulunamadı.' using errcode = 'P0002'; end if;
  if not app_private.tl_perm(app_private.tl_project_fansub(v_row.project_id), 'ceviri.proje') then
    raise exception 'Sürüm silmek için proje yönetimi izni gerekir.' using errcode = '42501';
  end if;
  delete from public.translation_page_versions where id = v_row.id;
end;
$function$;

revoke all on function public.tl_page_version_save(uuid, text) from public;
revoke all on function public.tl_page_versions(uuid) from public;
revoke all on function public.tl_page_version_get(uuid) from public;
revoke all on function public.tl_page_version_delete(uuid) from public;
grant execute on function public.tl_page_version_save(uuid, text) to authenticated;
grant execute on function public.tl_page_versions(uuid) to authenticated;
grant execute on function public.tl_page_version_get(uuid) to authenticated;
grant execute on function public.tl_page_version_delete(uuid) to authenticated;

-- Automatic version when a task goes "done" (with the stage name).
create or replace function app_private.tl_task_done_version()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.status = 'tamam' and old.status is distinct from 'tamam' then
    perform app_private.tl_page_version_capture(new.page_id, 'auto',
      case new.stage when 'temizlik' then 'Temizlik tamamlandı' when 'ceviri' then 'Çeviri tamamlandı'
        when 'dizgi' then 'Dizgi tamamlandı' else 'Kontrol tamamlandı' end,
      new.assignee_id);
  end if;
  return new;
end;
$function$;

create trigger translation_page_tasks_done_version after update of status on public.translation_page_tasks
  for each row execute function app_private.tl_task_done_version();
