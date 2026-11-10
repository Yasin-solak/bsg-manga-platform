-- Translation Studio V3: tying a published chapter to the project.
-- Publish renders on the client and writes to the chapters table with the existing createChapter flow;
-- then the project ties with chapter_id. The link is accepted only if the chapter belongs to the same
-- fansub + series + chapter number (it cannot point to another chapter).
-- A scheduled chapter may be hidden in reader RLS so the check is security definer.

create or replace function app_private.tl_chapter_matches(
  p_chapter_id uuid, p_fansub_id uuid, p_manga_id uuid, p_chapter_number numeric
)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.chapters c
    where c.id = p_chapter_id
      and c.fansub_id = p_fansub_id
      and c.manga_id = p_manga_id
      and c.chapter_number = p_chapter_number
  );
$function$;

revoke all on function app_private.tl_chapter_matches(uuid, uuid, uuid, numeric) from public;

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
  if new.chapter_id is not null
    and (tg_op = 'INSERT' or new.chapter_id is distinct from old.chapter_id)
    and not app_private.tl_is_service()
    and not app_private.tl_chapter_matches(new.chapter_id, new.fansub_id, new.manga_id, new.chapter_number) then
    raise exception 'bolum bu projeye ait degil' using errcode = 'PT403';
  end if;
  return new;
end;
$function$;
