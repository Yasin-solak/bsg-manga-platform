-- Moves the series glossary to FANSUB + MANGA scope.
--
-- Why: the studio will open to fansubs one day. For the "remember terms if this fansub
-- translated this manga before" flow to work the glossary must tie to real records,
-- not a free series NAME.
--
-- Why per fansub: two fansubs can translate the same manga and need not
-- agree on names. Consistency is meaningful among a fansub's OWN chapters;
-- imposing a shared glossary would raise false alarms.
--
-- `series_name` STAYS: the admin path (working from a file, a trial tied to no record)
-- must not break. Scope is either (fansub, manga) or series name.

alter table public.admin_typeset_glossary_terms
  add column if not exists fansub_id uuid references public.fansubs(id) on delete cascade,
  add column if not exists manga_id uuid references public.mangas(id) on delete cascade;

-- Series name is no longer required: meaningless in fansub scope.
alter table public.admin_typeset_glossary_terms
  alter column series_name drop not null;

-- Scope must be one or the other; a term with both empty shows nowhere
-- and silently becomes dead data.
alter table public.admin_typeset_glossary_terms
  drop constraint if exists admin_typeset_glossary_terms_scope_valid;
alter table public.admin_typeset_glossary_terms
  add constraint admin_typeset_glossary_terms_scope_valid check (
    (fansub_id is not null and manga_id is not null)
    or (series_name is not null and btrim(series_name) <> '')
  );

-- SEPARATE uniqueness for fansub scope.
--
-- The existing (series_name, target) index is NOT DROPPED: PostgREST's
-- `on conflict (series_name, target)` only matches a FULL index,
-- not a partial one, and the admin path save would silently break.
-- On fansub rows `series_name` is empty so that index does not
-- constrain them; their uniqueness comes from the index below.
create unique index if not exists admin_typeset_glossary_terms_fansub_unique_idx
  on public.admin_typeset_glossary_terms (fansub_id, manga_id, target)
  where fansub_id is not null;

create index if not exists admin_typeset_glossary_terms_scope_idx
  on public.admin_typeset_glossary_terms (fansub_id, manga_id);

-- RLS: admins on everything, the fansub team ONLY on its own fansub's terms.
-- A shared read permission would open one fansub's internal terminology to another;
-- we do not want that, so the scope condition is in both using and with check.
--
-- RLS helper RULE: `app_private.*`, NOT `public.current_public_user_id()`.
-- The other was revoked in 208 and gives "permission denied" on live.
drop policy if exists admin_typeset_glossary_terms_admin_all on public.admin_typeset_glossary_terms;
create policy admin_typeset_glossary_terms_admin_all on public.admin_typeset_glossary_terms
  for all
  using (app_private.is_admin())
  with check (app_private.is_admin());

drop policy if exists admin_typeset_glossary_terms_fansub_all on public.admin_typeset_glossary_terms;
create policy admin_typeset_glossary_terms_fansub_all on public.admin_typeset_glossary_terms
  for all
  using (fansub_id is not null and app_private.is_fansub_staff(fansub_id))
  with check (fansub_id is not null and app_private.is_fansub_staff(fansub_id));

comment on column public.admin_typeset_glossary_terms.fansub_id is
  'Sozlugun sahibi fansub. Dolu ise kapsam (fansub, manga); bos ise admin yolu (series_name).';
