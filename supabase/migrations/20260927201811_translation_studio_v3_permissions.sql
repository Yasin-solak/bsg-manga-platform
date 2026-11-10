-- Translation Studio: full authorization with fansub permissions (DB side).
-- ceviri.gor      read (all studio tables)
-- ceviri.proje    series draft, project, page (upload / sort / scan)
-- ceviri.metin    translation texts (write / approve) and source text fixes
-- ceviri.dizgi    area add / delete / move / resize, text style
-- ceviri.temizlik cleanup layer (brush, repair, stamp, selection) and area cleanup type
-- ceviri.kaynak   team fonts, style library, glossary
-- ceviri.yayinla  project publish record and chapter creation (chapters + page images)
-- The site admin always passes; for a fansub the translation.studio_v3 flag must be on.

create or replace function app_private.tl_perm(p_fansub_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.is_admin()
    or (app_private.is_feature_enabled('translation.studio_v3', false)
      and app_private.fansub_can(p_fansub_id, p_permission));
$function$;

-- The read gate is now the "View studio" permission (formerly admin + moderator).
create or replace function app_private.tl_can_fansub(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.tl_perm(p_fansub_id, 'ceviri.gor');
$function$;

create or replace function app_private.tl_project_fansub(p_project_id uuid)
returns uuid language sql stable security definer set search_path = '' as $function$
  select fansub_id from public.translation_projects where id = p_project_id;
$function$;

create or replace function app_private.tl_page_fansub(p_page_id uuid)
returns uuid language sql stable security definer set search_path = '' as $function$
  select p.fansub_id from public.translation_pages pg
  join public.translation_projects p on p.id = pg.project_id where pg.id = p_page_id;
$function$;

create or replace function app_private.tl_item_fansub(p_item_id uuid)
returns uuid language sql stable security definer set search_path = '' as $function$
  select p.fansub_id from public.translation_items i
  join public.translation_pages pg on pg.id = i.page_id
  join public.translation_projects p on p.id = pg.project_id where i.id = p_item_id;
$function$;

revoke all on function app_private.tl_perm(uuid, text) from public;
grant execute on function app_private.tl_perm(uuid, text) to authenticated;
grant execute on function app_private.tl_project_fansub(uuid), app_private.tl_page_fansub(uuid), app_private.tl_item_fansub(uuid) to authenticated;

-- Workers (with the user JWT) ask for a specific permission.
create or replace function public.tl_has_permission(p_fansub_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.tl_perm(p_fansub_id, p_permission);
$function$;
revoke all on function public.tl_has_permission(uuid, text) from public;
grant execute on function public.tl_has_permission(uuid, text) to authenticated;

-- Font yukleme (font.js) ekip kaynaklari izni ister.
create or replace function public.tl_can_manage_fansub(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.tl_perm(p_fansub_id, 'ceviri.kaynak');
$function$;

-- ---------------------------------------------------------------------------
-- Politikalar: okuma "gor", yazma ilgili izin
-- ---------------------------------------------------------------------------

drop policy if exists translation_series_drafts_staff on public.translation_series_drafts;
create policy translation_series_drafts_read on public.translation_series_drafts for select to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_series_drafts_insert on public.translation_series_drafts for insert to authenticated
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.proje'))
    and (status = 'pending' or (select app_private.is_admin())));
create policy translation_series_drafts_update on public.translation_series_drafts for update to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.proje')))
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.proje'))
    and (status = 'pending' or (select app_private.is_admin())));

drop policy if exists translation_projects_staff on public.translation_projects;
create policy translation_projects_read on public.translation_projects for select to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_projects_insert on public.translation_projects for insert to authenticated
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.proje')));
-- The publish step sets the project "published/scheduled" and ties the chapter.
create policy translation_projects_update on public.translation_projects for update to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.proje')) or (select app_private.tl_perm(fansub_id, 'ceviri.yayinla')))
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.proje')) or (select app_private.tl_perm(fansub_id, 'ceviri.yayinla')));
create policy translation_projects_delete on public.translation_projects for delete to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.proje')));

drop policy if exists translation_pages_staff on public.translation_pages;
create policy translation_pages_read on public.translation_pages for select to authenticated
  using ((select app_private.tl_can_project(project_id)));
create policy translation_pages_insert on public.translation_pages for insert to authenticated
  with check ((select app_private.tl_perm(app_private.tl_project_fansub(project_id), 'ceviri.proje')));
create policy translation_pages_update on public.translation_pages for update to authenticated
  using ((select app_private.tl_perm(app_private.tl_project_fansub(project_id), 'ceviri.proje')))
  with check ((select app_private.tl_perm(app_private.tl_project_fansub(project_id), 'ceviri.proje')));
create policy translation_pages_delete on public.translation_pages for delete to authenticated
  using ((select app_private.tl_perm(app_private.tl_project_fansub(project_id), 'ceviri.proje')));

drop policy if exists translation_items_staff on public.translation_items;
create policy translation_items_read on public.translation_items for select to authenticated
  using ((select app_private.tl_can_page(page_id)));
create policy translation_items_insert on public.translation_items for insert to authenticated
  with check ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.dizgi')));
-- Which columns an update touches is checked in tl_item_permission_guard.
create policy translation_items_update on public.translation_items for update to authenticated
  using ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.dizgi'))
    or (select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.metin'))
    or (select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.temizlik')))
  with check ((select app_private.tl_can_page(page_id)));
create policy translation_items_delete on public.translation_items for delete to authenticated
  using ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.dizgi')));

drop policy if exists translation_item_texts_staff on public.translation_item_texts;
create policy translation_item_texts_read on public.translation_item_texts for select to authenticated
  using ((select app_private.tl_can_item(item_id)));
create policy translation_item_texts_write on public.translation_item_texts for insert to authenticated
  with check ((select app_private.tl_perm(app_private.tl_item_fansub(item_id), 'ceviri.metin')));
create policy translation_item_texts_update on public.translation_item_texts for update to authenticated
  using ((select app_private.tl_perm(app_private.tl_item_fansub(item_id), 'ceviri.metin')))
  with check ((select app_private.tl_perm(app_private.tl_item_fansub(item_id), 'ceviri.metin')));
create policy translation_item_texts_delete on public.translation_item_texts for delete to authenticated
  using ((select app_private.tl_perm(app_private.tl_item_fansub(item_id), 'ceviri.metin')));

drop policy if exists translation_page_cleanup_staff on public.translation_page_cleanup;
create policy translation_page_cleanup_read on public.translation_page_cleanup for select to authenticated
  using ((select app_private.tl_can_page(page_id)));
create policy translation_page_cleanup_insert on public.translation_page_cleanup for insert to authenticated
  with check ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.temizlik')));
create policy translation_page_cleanup_update on public.translation_page_cleanup for update to authenticated
  using ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.temizlik')))
  with check ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.temizlik')));
create policy translation_page_cleanup_delete on public.translation_page_cleanup for delete to authenticated
  using ((select app_private.tl_perm(app_private.tl_page_fansub(page_id), 'ceviri.temizlik')));

drop policy if exists translation_glossary_staff on public.translation_glossary;
create policy translation_glossary_read on public.translation_glossary for select to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_glossary_insert on public.translation_glossary for insert to authenticated
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));
create policy translation_glossary_update on public.translation_glossary for update to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')))
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));
create policy translation_glossary_delete on public.translation_glossary for delete to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));

drop policy if exists translation_fonts_staff_delete on public.translation_fonts;
create policy translation_fonts_staff_delete on public.translation_fonts for delete to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));

drop policy if exists translation_style_presets_staff_insert on public.translation_style_presets;
drop policy if exists translation_style_presets_staff_update on public.translation_style_presets;
drop policy if exists translation_style_presets_staff_delete on public.translation_style_presets;
create policy translation_style_presets_staff_insert on public.translation_style_presets for insert to authenticated
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));
create policy translation_style_presets_staff_update on public.translation_style_presets for update to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')))
  with check ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));
create policy translation_style_presets_staff_delete on public.translation_style_presets for delete to authenticated
  using ((select app_private.tl_perm(fansub_id, 'ceviri.kaynak')));

-- ---------------------------------------------------------------------------
-- Item update: per-column permission (service role exempt)
-- ---------------------------------------------------------------------------

create or replace function app_private.tl_item_permission_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_fansub uuid;
begin
  if app_private.tl_is_service() then return new; end if;
  v_fansub := app_private.tl_page_fansub(new.page_id);
  if (new.bbox_x, new.bbox_y, new.bbox_w, new.bbox_h, new.type, new.shape, new.rotation, new.reading_order)
      is distinct from (old.bbox_x, old.bbox_y, old.bbox_w, old.bbox_h, old.type, old.shape, old.rotation, old.reading_order)
    or new.polygon is distinct from old.polygon
    or new.style is distinct from old.style
    or new.font_suggestion is distinct from old.font_suggestion then
    if not app_private.tl_perm(v_fansub, 'ceviri.dizgi') then
      raise exception 'Alan ve yazı stilini değiştirmek için dizgi izni gerekir.' using errcode = '42501';
    end if;
  end if;
  if new.source_text is distinct from old.source_text
    and not (app_private.tl_perm(v_fansub, 'ceviri.metin') or app_private.tl_perm(v_fansub, 'ceviri.dizgi')) then
    raise exception 'Kaynak metni düzeltmek için çeviri metni izni gerekir.' using errcode = '42501';
  end if;
  if new.cleanup is distinct from old.cleanup
    and not (app_private.tl_perm(v_fansub, 'ceviri.temizlik') or app_private.tl_perm(v_fansub, 'ceviri.dizgi')) then
    raise exception 'Temizleme türünü değiştirmek için temizlik izni gerekir.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists translation_items_permission_guard on public.translation_items;
create trigger translation_items_permission_guard before update on public.translation_items
  for each row execute function app_private.tl_item_permission_guard();

-- Page order: project management or the publish step.
create or replace function public.tl_reorder_pages(p_project_id uuid, p_page_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_count integer;
  v_fansub uuid := app_private.tl_project_fansub(p_project_id);
begin
  if not (app_private.tl_perm(v_fansub, 'ceviri.proje') or app_private.tl_perm(v_fansub, 'ceviri.yayinla')) then
    raise exception 'yetki yok' using errcode = 'PT403';
  end if;
  select pg_catalog.count(*) into v_count from public.translation_pages where project_id = p_project_id;
  if pg_catalog.cardinality(p_page_ids) <> v_count
    or (select pg_catalog.count(distinct id) from public.translation_pages
        where project_id = p_project_id and id = any (p_page_ids)) <> v_count then
    raise exception 'sayfa listesi projeyle eslesmiyor' using errcode = '22023';
  end if;
  set constraints public.translation_pages_order_unique deferred;
  update public.translation_pages page
  set page_index = ordered.position - 1
  from pg_catalog.unnest(p_page_ids) with ordinality as ordered(id, position)
  where page.id = ordered.id and page.project_id = p_project_id and page.page_index <> ordered.position - 1;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Publish: a member with the "Publish" permission can open an unapproved (awaiting moderation) chapter.
-- ---------------------------------------------------------------------------

drop policy if exists chapters_insert_admin_or_fansub_admin on public.chapters;
create policy chapters_insert_admin_or_fansub_admin on public.chapters for insert to authenticated
  with check (
    app_private.can_manage_moderation_state()
    or ((fansub_id is not null)
      and (app_private.is_fansub_admin(fansub_id) or app_private.fansub_can(fansub_id, 'ceviri.yayinla'))
      and (coalesce(is_approved, false) = false))
  );
