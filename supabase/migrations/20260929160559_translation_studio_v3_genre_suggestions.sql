-- Series draft genre picker: genres used in site series (with use counts) and
-- a length rule on free genres (each genre 1-40 characters).

create or replace function app_private.genres_valid(p_genres text[])
returns boolean language sql immutable set search_path = '' as $function$
  select coalesce(bool_and(length(btrim(g)) between 1 and 40), true) from unnest(p_genres) g;
$function$;

alter table public.translation_series_drafts drop constraint if exists translation_series_drafts_genre_length_check;
alter table public.translation_series_drafts add constraint translation_series_drafts_genre_length_check
  check (app_private.genres_valid(genres));

create or replace function public.tl_genre_suggestions()
returns table (genre text, uses integer) language sql stable security definer set search_path = '' as $function$
  select g, count(*)::integer
  from public.mangas m, unnest(m.genres) g
  where length(btrim(g)) between 1 and 40
  group by g
  order by count(*) desc, g
  limit 300;
$function$;
revoke all on function public.tl_genre_suggestions() from public;
grant execute on function public.tl_genre_suggestions() to authenticated;
