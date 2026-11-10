-- Translation Studio V3 fix (found with an RLS test in a real user context).
-- 1) The project trigger runs in the user role; without EXECUTE on tl_chapter_matches
-- every project insert fell with 42501.
-- 2) SQL AND does not guarantee short circuit; the chapter check runs in a nested IF only when the link
-- changes.

grant execute on function app_private.tl_chapter_matches(uuid, uuid, uuid, numeric) to authenticated;

create or replace function app_private.tl_project_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' then
    if new.fansub_id <> old.fansub_id then
      raise exception 'fansub degistirilemez' using errcode = 'PT409';
    end if;
    if new.source_language <> old.source_language
      and exists (select 1 from public.translation_pages where project_id = old.id and scan_stage <> 'none') then
      raise exception 'tarama basladiktan sonra ham dil degismez' using errcode = 'PT409';
    end if;
  end if;
  -- SQL AND does not guarantee short circuit; the chapter check runs only when the link changes.
  if new.chapter_id is not null and (tg_op = 'INSERT' or new.chapter_id is distinct from old.chapter_id) then
    if not app_private.tl_is_service()
      and not app_private.tl_chapter_matches(new.chapter_id, new.fansub_id, new.manga_id, new.chapter_number) then
      raise exception 'bolum bu projeye ait degil' using errcode = 'PT403';
    end if;
  end if;
  return new;
end;
$function$;
