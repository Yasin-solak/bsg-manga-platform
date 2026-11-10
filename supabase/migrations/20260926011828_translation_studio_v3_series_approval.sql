-- Translation Studio V3: admin approval of a series draft opened by a fansub.
-- Approval in one transaction: the series is created (or tied to an existing one), the draft
-- goes approved and projects tied to the draft move to the series; publish then opens.

create or replace function public.tl_approve_series_draft(p_draft_id uuid, p_manga_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_draft public.translation_series_drafts%rowtype;
  v_manga uuid := p_manga_id;
  v_slug text;
begin
  if not app_private.is_admin() then
    raise exception 'yalniz site admini onaylayabilir' using errcode = 'PT403';
  end if;
  select * into v_draft from public.translation_series_drafts where id = p_draft_id for update;
  if not found then raise exception 'taslak bulunamadi' using errcode = 'PT404'; end if;
  if v_draft.status <> 'pending' then raise exception 'taslak zaten sonuclandi' using errcode = 'PT409'; end if;

  if v_manga is null then
    v_slug := pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.translate(v_draft.title, U&'\00E7\011F\0131\00F6\015F\00FC\00C7\011E\0130\00D6\015E\00DC\00E2\00EE\00FB', 'cgiosucgiosuaiu')),
      '[^a-z0-9]+', '-', 'g');
    v_slug := pg_catalog.left(pg_catalog.btrim(v_slug, '-'), 72);
    v_slug := coalesce(nullif(v_slug, ''), 'seri') || '-' || pg_catalog.substr(pg_catalog.md5(p_draft_id::text), 1, 5);
    insert into public.mangas (fansub_id, title, slug, cover_image_url, genres, original_lang, series_type, is_approved, is_active, is_new)
    values (
      v_draft.fansub_id, v_draft.title, v_slug, v_draft.cover_object_key, v_draft.genres, v_draft.source_language,
      case v_draft.source_language when 'ko' then 'manhwa' when 'zh' then 'manhua' else 'manga' end,
      true, true, true
    )
    returning id into v_manga;
  elsif not exists (select 1 from public.mangas where id = v_manga) then
    raise exception 'seri bulunamadi' using errcode = 'PT404';
  end if;

  update public.translation_series_drafts set status = 'approved', manga_id = v_manga where id = p_draft_id;
  -- If the same chapter number exists in the series a uniqueness violation returns as a clear error.
  update public.translation_projects set manga_id = v_manga, series_draft_id = null where series_draft_id = p_draft_id;
  return v_manga;
end;
$function$;

create or replace function public.tl_reject_series_draft(p_draft_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if not app_private.is_admin() then
    raise exception 'yalniz site admini reddedebilir' using errcode = 'PT403';
  end if;
  update public.translation_series_drafts set status = 'rejected' where id = p_draft_id and status = 'pending';
  if not found then raise exception 'bekleyen taslak bulunamadi' using errcode = 'PT404'; end if;
end;
$function$;

revoke all on function public.tl_approve_series_draft(uuid, uuid) from public;
revoke all on function public.tl_reject_series_draft(uuid) from public;
grant execute on function public.tl_approve_series_draft(uuid, uuid) to authenticated;
grant execute on function public.tl_reject_series_draft(uuid) to authenticated;
