begin;

alter table public.fansub_supporter_asset_revisions
  drop constraint if exists fansub_supporter_asset_revisions_asset_id_fkey;

alter table public.fansub_supporter_asset_revisions
  add constraint fansub_supporter_asset_revisions_asset_id_fkey
    foreign key (asset_id) references public.fansub_supporter_assets (id) on delete cascade
    deferrable initially deferred;

create or replace function public.create_initial_fansub_supporter_asset_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision_id uuid;
begin
  if new.current_revision_id is not null and new.legacy_revision_id is not null then
    new.latest_revision_number := greatest(coalesce(new.latest_revision_number, 0), 1);
    return new;
  end if;

  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  insert into public.fansub_supporter_asset_revisions (
    asset_id,
    revision_number,
    shortcode,
    label,
    asset_ref,
    mime_type,
    width,
    height,
    size_bytes,
    presentation,
    created_by,
    created_at
  )
  values (
    new.id,
    1,
    new.shortcode,
    new.label,
    new.asset_ref,
    new.mime_type,
    new.width,
    new.height,
    new.size_bytes,
    coalesce(new.presentation, '{}'::jsonb),
    new.created_by,
    coalesce(new.created_at, now())
  )
  returning id into v_revision_id;

  new.current_revision_id := v_revision_id;
  new.legacy_revision_id := v_revision_id;
  new.latest_revision_number := greatest(coalesce(new.latest_revision_number, 0), 1);

  return new;
end;
$$;

drop trigger if exists trg_fansub_supporter_assets_initial_revision on public.fansub_supporter_assets;

create trigger trg_fansub_supporter_assets_initial_revision
  before insert on public.fansub_supporter_assets
  for each row
  execute function public.create_initial_fansub_supporter_asset_revision();

commit;
