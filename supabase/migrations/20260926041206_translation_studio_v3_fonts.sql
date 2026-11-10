-- Translation Studio V3: fansub-specific fonts ("Font yukle").
-- The font file is in private R2 (fonts/<fansub>/<sha>.<ext>); only the service writes
-- its row and key. The style key is stored as `custom:<font-id>`. Fonts are also used on published
-- pages so /api/ceviri/font also serves readers.

create table public.translation_fonts (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 64),
  object_key text not null check (object_key ~ '^fonts/[0-9a-f-]{36}/[0-9a-f]{64}\.(ttf|otf|woff2)$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('font/ttf', 'font/otf', 'font/woff2')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint translation_fonts_unique unique (fansub_id, sha256)
);

create index translation_fonts_fansub_idx on public.translation_fonts (fansub_id, created_at desc);

alter table public.translation_fonts enable row level security;
revoke all on public.translation_fonts from anon, authenticated;
grant select, delete on public.translation_fonts to authenticated;

create policy translation_fonts_staff_read on public.translation_fonts for select to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_fonts_staff_delete on public.translation_fonts for delete to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));

-- For the Worker to ask the uploader permission with the reader own JWT.
create or replace function public.tl_can_manage_fansub(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.tl_can_fansub(p_fansub_id);
$function$;

revoke all on function public.tl_can_manage_fansub(uuid) from public;
grant execute on function public.tl_can_manage_fansub(uuid) to authenticated;
