-- Translation Studio V3: writes drag-and-drop page order atomically in the publish step.
-- (project_id, page_index) uniqueness is deferrable so it shifts in one transaction;
-- reader clean base mapping stays the same as the published order.

create or replace function public.tl_reorder_pages(p_project_id uuid, p_page_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_count integer;
begin
  if not app_private.tl_can_project(p_project_id) then
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

revoke all on function public.tl_reorder_pages(uuid, uuid[]) from public;
grant execute on function public.tl_reorder_pages(uuid, uuid[]) to authenticated;
