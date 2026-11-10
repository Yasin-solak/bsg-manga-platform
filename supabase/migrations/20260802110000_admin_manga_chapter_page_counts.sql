-- Page count per chapter (for admin review).
--
-- Why needed: when checking whether a translation meets the criteria the admin must see
-- the answer to "how many pages does this chapter have". A 2-page chapter
-- is almost always a half-finished upload and must be noticed before
-- approval.
--
-- Why an RPC: `chapters.pages` is a jsonb array and PostgREST select cannot compute
-- `jsonb_array_length`. The alternative was carrying all page URLs
-- to the client: hundreds of kilobytes wasted on a 120-chapter series.
-- Here only the numbers return.

create or replace function app_private.get_admin_manga_chapter_page_counts(p_manga_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu bilgi icin admin yetkisi gerekir.';
  end if;

  if p_manga_id is null then
    raise exception using errcode = '22023', message = 'Manga kimligi bos olamaz.';
  end if;

  select coalesce(pg_catalog.jsonb_object_agg(c.id::text, c.sayfa), '{}'::jsonb)
  into v_result
  from (
    select
      ch.id,
      case when ch.pages is null then 0 else pg_catalog.jsonb_array_length(ch.pages) end as sayfa
    from public.chapters as ch
    where ch.manga_id = p_manga_id
  ) as c;

  return v_result;
end;
$function$;

create or replace function public.get_admin_manga_chapter_page_counts(p_manga_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select app_private.get_admin_manga_chapter_page_counts(p_manga_id);
$function$;

revoke all on function app_private.get_admin_manga_chapter_page_counts(uuid) from public;
revoke all on function public.get_admin_manga_chapter_page_counts(uuid) from public;
grant execute on function public.get_admin_manga_chapter_page_counts(uuid) to authenticated;

comment on function public.get_admin_manga_chapter_page_counts(uuid) is
  'Bolum basina sayfa sayisi (admin). Sayfa URL listesini istemciye tasimadan sayiyi verir; PostgREST jsonb_array_length hesaplayamiyor.';
