-- Translation Studio V3: team style library. The fansub team saves text styles (font,
-- size, color, outline, shadow, arc...) by name; applies in one click in the editor.
-- The style contract passes the same validator as translation_items.style.

create table public.translation_style_presets (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 40),
  style jsonb not null check (app_private.tl_style_valid(style) and style <> '{}'::jsonb),
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_style_presets_unique unique (fansub_id, name)
);

create index translation_style_presets_fansub_idx on public.translation_style_presets (fansub_id, name);

-- Ekip basina ust sinir: kutuphane sinirsiz buyuyup editoru yavaslatmasin.
create or replace function app_private.tl_style_presets_limit()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if (select pg_catalog.count(*) from public.translation_style_presets where fansub_id = new.fansub_id) >= 100 then
    raise exception 'Ekip stil kutuphanesi dolu (en fazla 100).' using errcode = 'PT422';
  end if;
  return new;
end;
$function$;

create trigger translation_style_presets_limit before insert on public.translation_style_presets
  for each row execute function app_private.tl_style_presets_limit();

create or replace function app_private.tl_style_presets_touch()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.updated_at := now();
  new.fansub_id := old.fansub_id;
  new.created_by := old.created_by;
  return new;
end;
$function$;

create trigger translation_style_presets_touch before update on public.translation_style_presets
  for each row execute function app_private.tl_style_presets_touch();

alter table public.translation_style_presets enable row level security;
revoke all on public.translation_style_presets from anon, authenticated;
grant select, insert, delete on public.translation_style_presets to authenticated;
grant update (name, style) on public.translation_style_presets to authenticated;

create policy translation_style_presets_staff_read on public.translation_style_presets for select to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_style_presets_staff_insert on public.translation_style_presets for insert to authenticated
  with check ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_style_presets_staff_update on public.translation_style_presets for update to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)))
  with check ((select app_private.tl_can_fansub(fansub_id)));
create policy translation_style_presets_staff_delete on public.translation_style_presets for delete to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)));
