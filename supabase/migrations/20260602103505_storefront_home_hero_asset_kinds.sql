begin;

alter table public.storefront_home_assets
  drop constraint if exists storefront_home_assets_asset_kind_check;

alter table public.storefront_home_assets
  add constraint storefront_home_assets_asset_kind_check
  check (
    asset_kind in (
      'desktop_banner',
      'mobile_banner',
      'logo',
      'hero_background',
      'hero_decorative'
    )
  );

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

  if p_asset_kind not in (
    'desktop_banner',
    'mobile_banner',
    'logo',
    'hero_background',
    'hero_decorative'
  ) then
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

revoke all on function app_private.admin_register_storefront_home_asset_impl(text, text, text, text) from public;
grant execute on function app_private.admin_register_storefront_home_asset_impl(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
