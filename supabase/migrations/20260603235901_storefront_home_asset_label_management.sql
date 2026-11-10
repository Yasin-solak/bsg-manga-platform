begin;

create or replace function app_private.admin_update_storefront_home_asset_label_impl(
  p_asset_id uuid,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_assets%rowtype;
  v_label text := btrim(coalesce(p_label, ''));
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if char_length(v_label) not between 1 and 120 then
    raise exception 'Storefront gorsel etiketi 1-120 karakter arasinda olmali.';
  end if;

  update public.storefront_home_assets a
  set label = v_label,
      updated_by = v_actor_id
  where a.id = p_asset_id
  returning * into v_row;

  if not found then
    raise exception 'Storefront gorseli bulunamadi.';
  end if;

  perform public.create_admin_audit_log(
    'storefront_home_asset.label_update',
    'storefront_home_asset',
    v_row.id::text,
    format('%s storefront gorseli yeniden adlandirildi.', v_row.label),
    jsonb_build_object('kind', v_row.asset_kind, 'assetRef', v_row.asset_ref)
  );

  return app_private.storefront_home_asset_contract(v_row);
end;
$$;

create or replace function public.admin_update_storefront_home_asset_label(
  p_asset_id uuid,
  p_label text
)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_update_storefront_home_asset_label_impl($1, $2); $$;

revoke all on function public.admin_update_storefront_home_asset_label(uuid, text) from public;
grant execute on function public.admin_update_storefront_home_asset_label(uuid, text) to authenticated;

revoke all on function app_private.admin_update_storefront_home_asset_label_impl(uuid, text) from public;
grant execute on function app_private.admin_update_storefront_home_asset_label_impl(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
