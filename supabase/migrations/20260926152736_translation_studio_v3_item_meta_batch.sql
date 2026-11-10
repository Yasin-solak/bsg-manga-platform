-- Translation Studio V3: translate.js wrote reading order and font suggestion with a separate
-- update per item (~36 requests on an 18-item page). When Cloudflare Functions per-request
-- subrequest limit (Free: 50) hit, the page stage and job record silently failed to write
-- (in a real test page 9 stayed on 'read', the job on 'running'). Bulk write in one call.
create or replace function public.tl_apply_item_meta(p_page_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'gecersiz oge satirlari' using errcode = 'PT422';
  end if;
  update public.translation_items i
     set reading_order = case when r.value ? 'reading_order' then (r.value->>'reading_order')::integer else i.reading_order end,
         font_suggestion = case when r.value ? 'font_suggestion' then r.value->'font_suggestion' else i.font_suggestion end
    from jsonb_array_elements(p_rows) as r(value)
   where i.id = (r.value->>'id')::uuid
     and i.page_id = p_page_id
     and ((r.value ? 'reading_order' and i.reading_order is distinct from (r.value->>'reading_order')::integer)
       or (r.value ? 'font_suggestion' and i.font_suggestion is distinct from r.value->'font_suggestion'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.tl_apply_item_meta(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.tl_apply_item_meta(uuid, jsonb) to service_role;
