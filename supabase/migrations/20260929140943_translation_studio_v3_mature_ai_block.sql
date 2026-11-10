-- Translation Studio: AI off on a +18 (adult) series.
-- If the series is marked adult (existing manga is_mature or is_mature selected on a new series draft)
-- no page/text of that project goes to the AI service;
-- workers reject with tl_project_ai_allowed. Reader translation requests follow the same rule.

alter table public.translation_series_drafts add column if not exists is_mature boolean not null default false;

-- Draft approval: the adult mark moves to the manga (if tied to an existing series it can only rise).
do $approve$
declare
  v_def text := pg_get_functiondef('public.tl_approve_series_draft(uuid, uuid)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'insert into public.mangas (fansub_id, title, slug, cover_image_url, genres, original_lang, series_type, is_approved, is_active, is_new)',
    'insert into public.mangas (fansub_id, title, slug, cover_image_url, genres, original_lang, series_type, is_approved, is_active, is_new, is_mature)');
  v_new := regexp_replace(v_new, 'true, true, true\s*\)\s*returning id into v_manga;',
    'true, true, true, v_draft.is_mature) returning id into v_manga;');
  v_new := replace(v_new,
    'update public.translation_series_drafts set status = ''approved'', manga_id = v_manga where id = p_draft_id;',
    'if v_draft.is_mature then update public.mangas set is_mature = true where id = v_manga; end if;
  update public.translation_series_drafts set status = ''approved'', manga_id = v_manga where id = p_draft_id;');
  if position('v_draft.is_mature) returning id into v_manga' in v_new) = 0
    or position('if v_draft.is_mature then update public.mangas' in v_new) = 0
    or position('is_new, is_mature)' in v_new) = 0 then
    raise exception 'tl_approve_series_draft beklenen bicimde degil';
  end if;
  execute v_new;
end
$approve$;

/** Projenin serisi yetiskin mi (manga ya da taslak). */
create or replace function app_private.tl_project_is_mature(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select coalesce(
    (select m.is_mature from public.translation_projects p join public.mangas m on m.id = p.manga_id where p.id = p_project_id),
    (select d.is_mature from public.translation_projects p join public.translation_series_drafts d on d.id = p.series_draft_id where p.id = p_project_id),
    false);
$function$;
revoke all on function app_private.tl_project_is_mature(uuid) from public;

/** Worker ve arayuz: bu projede yapay zeka kullanilabilir mi. */
create or replace function public.tl_project_ai_allowed(p_project_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $function$
begin
  if not app_private.tl_can_project(p_project_id) then
    raise exception 'Bu projeyi görme iznin yok.' using errcode = '42501';
  end if;
  return not app_private.tl_project_is_mature(p_project_id);
end;
$function$;
revoke all on function public.tl_project_ai_allowed(uuid) from public;
grant execute on function public.tl_project_ai_allowed(uuid) to authenticated;

/** Okuyucu ceviri istegi: bolumun serisi yetiskinse yapay zeka kullanilmaz. */
create or replace function public.tl_chapter_ai_allowed(p_chapter_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select not coalesce((select m.is_mature from public.chapters c join public.mangas m on m.id = c.manga_id where c.id = p_chapter_id), false);
$function$;
revoke all on function public.tl_chapter_ai_allowed(uuid) from public;
grant execute on function public.tl_chapter_ai_allowed(uuid) to anon, authenticated;
