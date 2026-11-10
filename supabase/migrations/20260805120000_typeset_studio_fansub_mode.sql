-- Translation Studio FANSUB mode (Phase 3: full-screen page + role gate + flag).
--
-- The studio has been an admin-only internal tool so far. Phase 3 opens it to the fansub side
-- with a SINGLE FANSUB PILOT. Three parts are needed:
-- 1) The work record has an OWNER (admin or fansub),
-- 2) the fansub team sees ONLY its own work (RLS),
-- 3) even with the flag on only the pilot fansub can enter.

-- ---------------------------------------------------------------------------
-- 1) Owner of the work record
-- ---------------------------------------------------------------------------
-- `page_hash` was GLOBALLY unique so far: one page = one record. Right while the studio
-- was single-person. When two fansubs open the same raw scan the same content digest
-- comes out and the second fansub has a uniqueness conflict with a row it CANNOT SEE
-- due to RLS: the result is an unexplainable save error, not "no permission".
-- If it could see, it would overwrite the other's translation.
alter table public.admin_typeset_works
  add column if not exists fansub_id uuid references public.fansubs(id) on delete cascade;

-- The owner key is DERIVED, not sent by the client.
--
-- If the client wrote it, it could go inconsistent with `fansub_id` and uniqueness would
-- protect the wrong row. With `coalesce` the value is never empty; if empty
-- the uniqueness index would collapse too (NULLs count as DIFFERENT from each other).
alter table public.admin_typeset_works
  add column if not exists owner_key text
  generated always as (coalesce(fansub_id::text, 'admin')) stored not null;

alter table public.admin_typeset_works
  drop constraint if exists admin_typeset_works_page_hash_key;

-- Uniqueness must be a FULL index: PostgREST's `on conflict (a, b)`
-- does not match a partial (`where ...`) index and returns 42P10. This trap happened
-- twice in the project; tests/contracts/upsert-conflict-index-contract.test.mjs now
-- requires it.
create unique index if not exists admin_typeset_works_owner_page_idx
  on public.admin_typeset_works (owner_key, page_hash);

create index if not exists admin_typeset_works_fansub_idx
  on public.admin_typeset_works (fansub_id);

comment on column public.admin_typeset_works.fansub_id is
  'Calismanin sahibi fansub. Bos ise admin yolu. Ayni sayfa iki fansubta ayri kayittir.';

-- RLS: the fansub team sees ONLY its own fansub's work.
--
-- RLS helper RULE: `app_private.*`, NOT `public.current_public_user_id()`.
-- The other was revoked in 208 and gives "permission denied" on live.
drop policy if exists admin_typeset_works_fansub_all on public.admin_typeset_works;
create policy admin_typeset_works_fansub_all on public.admin_typeset_works
  for all
  using (fansub_id is not null and app_private.is_fansub_staff(fansub_id))
  with check (fansub_id is not null and app_private.is_fansub_staff(fansub_id));

-- ---------------------------------------------------------------------------
-- 2) Pilot allow list
-- ---------------------------------------------------------------------------
-- A flag alone is not enough: the moment it turned on the studio would open to ALL fansubs.
-- The pilot is a deliberate decision (one fansub), so an allow list
-- is needed beside the flag.
--
-- **Why a separate table and not a column on `fansubs`.** A fansub admin can update their own
-- fansub row; with a column they could add themselves to the pilot.
-- RLS works at row level, not column level. A separate table closes this path
-- from the start.
create table if not exists public.typeset_studio_pilot_fansubs (
  fansub_id uuid primary key references public.fansubs(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.typeset_studio_pilot_fansubs is
  'Ceviri Studyosu pilot izin listesi. Bayrak acik olsa bile yalnizca buradaki fansublar girer.';

alter table public.typeset_studio_pilot_fansubs enable row level security;

-- Reads are free: which fansub is in the pilot is not secret and
-- the UI has to ask this before opening the door.
drop policy if exists typeset_studio_pilot_fansubs_read on public.typeset_studio_pilot_fansubs;
create policy typeset_studio_pilot_fansubs_read on public.typeset_studio_pilot_fansubs
  for select
  using (true);

-- Writes are site admin ONLY.
drop policy if exists typeset_studio_pilot_fansubs_admin_write on public.typeset_studio_pilot_fansubs;
create policy typeset_studio_pilot_fansubs_admin_write on public.typeset_studio_pilot_fansubs
  for all
  using (app_private.is_admin())
  with check (app_private.is_admin());

grant select on public.typeset_studio_pilot_fansubs to anon, authenticated;
grant insert, update, delete on public.typeset_studio_pilot_fansubs to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Flag
-- ---------------------------------------------------------------------------
-- `is_public = true` is REQUIRED: get_runtime_feature_flags returns a non-public flag
-- only to admins, so for the fansub team the flag would always look "off".
-- `is_enabled` starts OFF; turned on by hand when the pilot is ready.
insert into public.feature_flags (key, label, description, is_enabled, is_public)
values (
  'typeset.studio',
  'Ceviri Studyosu (fansub)',
  'Fansub tarafindaki tam ekran Ceviri Studyosunu acar. Pilot izin listesiyle BIRLIKTE calisir.',
  false,
  true
)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    is_public = true;
