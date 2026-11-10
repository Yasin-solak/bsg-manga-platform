begin;

create or replace function app_private.is_valid_storefront_asset_ref(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_value is not null
    and btrim(p_value) <> ''
    and char_length(btrim(p_value)) <= 2048
    and btrim(p_value) !~* '^(javascript|vbscript|data):'
    and (
      btrim(p_value) like '/%'
      or btrim(p_value) ~* '^https://'
      or btrim(p_value) ~* '^store-assets://[a-z0-9][a-z0-9/_.-]*$'
      or btrim(p_value) ~* '^[a-z0-9][a-z0-9/_.-]*$'
    );
$$;

create table if not exists public.storefront_home_assets (
  id uuid primary key default gen_random_uuid(),
  asset_ref text not null check (app_private.is_valid_storefront_asset_ref(asset_ref)),
  asset_kind text not null check (asset_kind in ('desktop_banner', 'mobile_banner', 'logo')),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  source_file_name text check (
    source_file_name is null or char_length(btrim(source_file_name)) between 1 and 255
  ),
  is_archived boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_ref, asset_kind)
);

create index if not exists storefront_home_assets_kind_active_idx
  on public.storefront_home_assets (asset_kind, is_archived, updated_at desc);

drop trigger if exists trg_storefront_home_assets_updated_at on public.storefront_home_assets;
create trigger trg_storefront_home_assets_updated_at
  before update on public.storefront_home_assets
  for each row execute function public.set_updated_at();

alter table public.storefront_home_assets enable row level security;
revoke all on table public.storefront_home_assets from anon, authenticated;
grant select, insert, update, delete on table public.storefront_home_assets to service_role;

create or replace function app_private.storefront_home_asset_contract(
  p_row public.storefront_home_assets
)
returns jsonb
language sql
stable
set search_path = public, app_private
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', (p_row).id,
    'assetRef', (p_row).asset_ref,
    'kind', (p_row).asset_kind,
    'label', (p_row).label,
    'sourceFileName', (p_row).source_file_name,
    'isArchived', (p_row).is_archived,
    'createdAt', (p_row).created_at,
    'updatedAt', (p_row).updated_at
  ));
$$;

create or replace function app_private.admin_register_storefront_home_asset_impl(
  p_asset_ref text,
  p_asset_kind text,
  p_label text,
  p_source_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_assets%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if not app_private.is_valid_storefront_asset_ref(p_asset_ref) then
    raise exception 'Storefront gorsel referansi gecersiz.';
  end if;

  if p_asset_kind not in ('desktop_banner', 'mobile_banner', 'logo') then
    raise exception 'Storefront gorsel turu gecersiz.';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'Storefront gorsel etiketi zorunludur.';
  end if;

  insert into public.storefront_home_assets (
    asset_ref, asset_kind, label, source_file_name, created_by, updated_by
  )
  values (
    btrim(p_asset_ref),
    p_asset_kind,
    btrim(p_label),
    nullif(btrim(coalesce(p_source_file_name, '')), ''),
    v_actor_id,
    v_actor_id
  )
  on conflict (asset_ref, asset_kind) do update
    set label = excluded.label,
        source_file_name = excluded.source_file_name,
        is_archived = false,
        updated_by = excluded.updated_by
  returning * into v_row;

  perform public.create_admin_audit_log(
    'storefront_home_asset.register',
    'storefront_home_asset',
    v_row.id::text,
    format('%s storefront gorseli kaydedildi.', v_row.label),
    jsonb_build_object('kind', v_row.asset_kind, 'assetRef', v_row.asset_ref)
  );

  return app_private.storefront_home_asset_contract(v_row);
end;
$$;

create or replace function app_private.admin_archive_storefront_home_asset_impl(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_assets%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  update public.storefront_home_assets a
  set is_archived = true,
      updated_by = v_actor_id
  where a.id = p_asset_id
  returning * into v_row;

  if not found then
    raise exception 'Storefront gorseli bulunamadi.';
  end if;

  perform public.create_admin_audit_log(
    'storefront_home_asset.archive',
    'storefront_home_asset',
    v_row.id::text,
    format('%s storefront gorseli arsivlendi.', v_row.label),
    jsonb_build_object('kind', v_row.asset_kind, 'assetRef', v_row.asset_ref)
  );

  return app_private.storefront_home_asset_contract(v_row);
end;
$$;

create or replace function app_private.admin_get_storefront_homepage_workspace_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_draft public.storefront_homepage_drafts%rowtype;
  v_assets jsonb;
  v_collections jsonb;
  v_campaigns jsonb;
  v_active_snapshot public.storefront_homepage_snapshots%rowtype;
begin
  if public.current_public_user_id() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  v_draft := app_private.ensure_storefront_homepage_draft();

  select coalesce(jsonb_agg(app_private.storefront_home_asset_contract(a) order by a.updated_at desc), '[]'::jsonb)
  into v_assets
  from public.storefront_home_assets a
  where a.is_archived = false;

  select coalesce(jsonb_agg(app_private.storefront_home_collection_contract(c) order by c.updated_at desc), '[]'::jsonb)
  into v_collections
  from public.storefront_home_collections c;

  select coalesce(jsonb_agg(app_private.storefront_home_campaign_contract(c) order by c.updated_at desc), '[]'::jsonb)
  into v_campaigns
  from public.storefront_home_campaigns c;

  select *
  into v_active_snapshot
  from public.storefront_homepage_snapshots s
  where s.is_active = true
  order by s.published_at desc
  limit 1;

  return jsonb_build_object(
    'assets', v_assets,
    'collections', v_collections,
    'campaigns', v_campaigns,
    'draft', app_private.storefront_home_draft_contract(v_draft),
    'activeSnapshot', case
      when v_active_snapshot.id is null then null
      else app_private.storefront_home_snapshot_contract(v_active_snapshot)
    end
  );
end;
$$;

create or replace function public.admin_register_storefront_home_asset(
  p_asset_ref text,
  p_asset_kind text,
  p_label text,
  p_source_file_name text default null
)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_register_storefront_home_asset_impl($1,$2,$3,$4); $$;

create or replace function public.admin_archive_storefront_home_asset(p_asset_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_archive_storefront_home_asset_impl($1); $$;

revoke all on function public.admin_register_storefront_home_asset(text, text, text, text) from public;
revoke all on function public.admin_archive_storefront_home_asset(uuid) from public;
grant execute on function public.admin_register_storefront_home_asset(text, text, text, text) to authenticated;
grant execute on function public.admin_archive_storefront_home_asset(uuid) to authenticated;

revoke all on function app_private.storefront_home_asset_contract(public.storefront_home_assets) from public;
revoke all on function app_private.admin_register_storefront_home_asset_impl(text, text, text, text) from public;
revoke all on function app_private.admin_archive_storefront_home_asset_impl(uuid) from public;
grant execute on function app_private.admin_register_storefront_home_asset_impl(text, text, text, text) to authenticated;
grant execute on function app_private.admin_archive_storefront_home_asset_impl(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
