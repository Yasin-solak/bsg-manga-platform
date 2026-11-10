-- Ties typesetting work and the glossary to the MANGA.
--
-- The studio has been file based so far: it did not know which manga it belonged to.
-- The target flow is "pick the manga, its terms arrive", so both
-- the work and the glossary must tie to a real record.
--
-- Columns CAN STAY EMPTY: a trial tied to no record (open file,
-- typeset, download) must keep working. Linking is not a requirement but an
-- enrichment.

alter table public.admin_typeset_works
  add column if not exists manga_id uuid references public.mangas(id) on delete set null,
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null,
  /** Bolum icindeki sira; sayfa adina guvenilemez. */
  add column if not exists page_index integer;

comment on column public.admin_typeset_works.manga_id is
  'Calismanin ait oldugu manga. Bos ise kayda bagli olmayan deneme.';

create index if not exists admin_typeset_works_manga_idx
  on public.admin_typeset_works (manga_id, chapter_id, page_index);

-- Glossary scope now has THREE kinds:
-- (fansub, manga) -> the fansub's own terminology
-- (manga)         -> admin work, not tied to a fansub
-- (series_name)   -> a trial tied to no record
--
-- An admin belongs to no fansub so cannot pick a manga and use fansub scope;
-- the previous constraint blocked exactly this.
alter table public.admin_typeset_glossary_terms
  add column if not exists manga_scope_id uuid references public.mangas(id) on delete cascade;

alter table public.admin_typeset_glossary_terms
  drop constraint if exists admin_typeset_glossary_terms_scope_valid;
alter table public.admin_typeset_glossary_terms
  add constraint admin_typeset_glossary_terms_scope_valid check (
    (fansub_id is not null and manga_id is not null)
    or manga_scope_id is not null
    or (series_name is not null and btrim(series_name) <> '')
  );

-- A term must be unique in admin scope too; two canonical spellings make the check
-- contradict itself.
create unique index if not exists admin_typeset_glossary_terms_manga_unique_idx
  on public.admin_typeset_glossary_terms (manga_scope_id, target)
  where fansub_id is null and manga_scope_id is not null;

-- Admin scope RLS is already covered by the `is_admin()` policy; the fansub
-- policy carries a `fansub_id is not null` condition so it does not open admin rows
-- to another fansub.
comment on column public.admin_typeset_glossary_terms.manga_scope_id is
  'Fansuba bagli olmayan (admin) sozluk kapsami. fansub_id ile ayni anda kullanilmaz.';
