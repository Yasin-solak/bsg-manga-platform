-- A glossary term could not be saved: "Terim kaydedilemedi."
--
-- Reason: scope uniqueness was set with PARTIAL indexes, but
-- PostgREST's `on conflict (a, b)` only matches a FULL unique index.
-- A partial index does not match and Postgres returns 42P10:
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification"
--
-- This trap was EXPLICITLY noted in `20260804120000` and the `series_name`
-- index left full; the next migration repeated the same bug.
-- So now a contract requires a FULL index for each `onConflict`
-- in services.
--
-- Moving to a full index is safe: NULL values count as DIFFERENT from each other, so
-- out-of-scope rows (with the related column empty) are not constrained. That is all a partial
-- index provided anyway.

drop index if exists public.admin_typeset_glossary_terms_manga_unique_idx;
create unique index if not exists admin_typeset_glossary_terms_manga_unique_idx
  on public.admin_typeset_glossary_terms (manga_scope_id, target);

drop index if exists public.admin_typeset_glossary_terms_fansub_unique_idx;
create unique index if not exists admin_typeset_glossary_terms_fansub_unique_idx
  on public.admin_typeset_glossary_terms (fansub_id, manga_id, target);
