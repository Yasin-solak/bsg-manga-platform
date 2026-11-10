-- Series glossary: consistency of names and terms across chapters.
--
-- Problem: the same proper name is written "Kurosaki" in one chapter and with a dotless i
-- in another. Readers notice, translators do not; weeks pass between two chapters
-- and both look right. For the check to work the canonical spelling must sit
-- INDEPENDENT of the chapter.
--
-- Scope is given by series name: one admin translates several series and a
-- term of one series must not raise a false alarm on another.
--
-- Admin only: this is an internal tool, not opening to anyone.

create table if not exists public.admin_typeset_glossary_terms (
  id uuid primary key default gen_random_uuid(),
  /** Sozlugun kapsami; serbest metin (seri listesi ayri tablo istemeyecek kadar kucuk). */
  series_name text not null,
  /** Orijinal (Ingilizce) yazim; yalnizca insan icin, eslesmede kullanilmaz. */
  source text not null default '',
  /** Turkce kanonik yazim. Denetim buna gore yapilir. */
  target text not null,
  kind text not null default 'diger',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_typeset_glossary_terms_target_not_blank check (btrim(target) <> ''),
  constraint admin_typeset_glossary_terms_kind_valid
    check (kind in ('karakter', 'yer', 'teknik', 'diger'))
);

comment on table public.admin_typeset_glossary_terms is
  'Ceviri studyosu seri sozlugu (yalniz admin). Kanonik Turkce yazimlar; tutarlilik denetimi buna gore yapilir.';

-- The same term must not be entered twice in a series; otherwise which is canonical
-- becomes unclear and the check contradicts itself.
create unique index if not exists admin_typeset_glossary_terms_unique_idx
  on public.admin_typeset_glossary_terms (series_name, target);

create index if not exists admin_typeset_glossary_terms_series_idx
  on public.admin_typeset_glossary_terms (series_name);

alter table public.admin_typeset_glossary_terms enable row level security;

-- RLS helper RULE: `app_private.*`, NOT `public.current_public_user_id()`.
-- The other was revoked in 208 and gives "permission denied" on live.
drop policy if exists admin_typeset_glossary_terms_admin_all on public.admin_typeset_glossary_terms;
create policy admin_typeset_glossary_terms_admin_all on public.admin_typeset_glossary_terms
  for all
  using (app_private.is_admin())
  with check (app_private.is_admin());

grant select, insert, update, delete on public.admin_typeset_glossary_terms to authenticated;

drop trigger if exists trg_admin_typeset_glossary_terms_updated_at on public.admin_typeset_glossary_terms;
create trigger trg_admin_typeset_glossary_terms_updated_at
  before update on public.admin_typeset_glossary_terms
  for each row execute function public.set_updated_at();
