-- Translation studio work record.
--
-- Problem: the studio ran entirely in the browser and work was lost on page
-- refresh. A chapter typesetting can take hours; losing it is not
-- acceptable.
--
-- **The page image is NOT UPLOADED.** The record is keyed by the file CONTENT DIGEST
-- (SHA-256): reopening the same file brings the work back.
-- So no storage cost and no copyrighted page is kept on the server.
-- Keying by file name would be fragile (rename,
-- same name in a different folder).
--
-- Admin only: this is an internal tool, not opening to anyone.

create table if not exists public.admin_typeset_works (
  id uuid primary key default gen_random_uuid(),
  /** Sayfa dosyasinin icerik ozeti; ayni sayfa = ayni kayit. */
  page_hash text not null unique,
  page_name text not null default '',
  font_family text not null default '',
  /** Balonlar: [{ id, polygon: [{x,y}], text }] */
  bubbles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_typeset_works is
  'Ceviri studyosu calisma kaydi (yalniz admin). Sayfa goruntusu saklanmaz; icerik ozetine gore eslesir.';

alter table public.admin_typeset_works enable row level security;

-- RLS helper RULE: `app_private.*`, NOT `public.current_public_user_id()`.
-- The other was revoked in 208 and gives "permission denied" on live.
drop policy if exists admin_typeset_works_admin_all on public.admin_typeset_works;
create policy admin_typeset_works_admin_all on public.admin_typeset_works
  for all
  using (app_private.is_admin())
  with check (app_private.is_admin());

grant select, insert, update, delete on public.admin_typeset_works to authenticated;

drop trigger if exists trg_admin_typeset_works_updated_at on public.admin_typeset_works;
create trigger trg_admin_typeset_works_updated_at
  before update on public.admin_typeset_works
  for each row execute function public.set_updated_at();

create index if not exists admin_typeset_works_updated_idx
  on public.admin_typeset_works (updated_at desc);
