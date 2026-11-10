begin;

alter table public.store_cosmetic_packages enable row level security;
alter table public.store_item_gifts enable row level security;
alter table public.store_package_events enable row level security;

drop policy if exists store_cosmetic_packages_select_public on public.store_cosmetic_packages;
create policy store_cosmetic_packages_select_public
  on public.store_cosmetic_packages
  for select
  to anon, authenticated
  using (is_active = true or (select public.is_admin()));

drop policy if exists store_item_gifts_select_admin on public.store_item_gifts;
create policy store_item_gifts_select_admin
  on public.store_item_gifts
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists store_package_events_select_admin on public.store_package_events;
create policy store_package_events_select_admin
  on public.store_package_events
  for select
  to authenticated
  using ((select public.is_admin()));

grant select on table public.store_cosmetic_packages to anon, authenticated;
revoke all on table public.store_item_gifts from anon, authenticated;
revoke all on table public.store_package_events from anon, authenticated;

create or replace function public.admin_upsert_store_cosmetic_package(
  p_previous_package_key text default null,
  p_package_key text default '',
  p_name text default '',
  p_description text default '',
  p_price integer default 0,
  p_original_price integer default null,
  p_currency text default 'Coin',
  p_frame_store_item_id uuid default null,
  p_profile_effect_store_item_id uuid default null,
  p_is_active boolean default true
)
returns table (
  package_key text,
  name text,
  description text,
  price integer,
  original_price integer,
  currency text,
  frame_store_item_id uuid,
  profile_effect_store_item_id uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_previous public.store_cosmetic_packages%rowtype;
  v_row public.store_cosmetic_packages%rowtype;
  v_frame public.store_items%rowtype;
  v_effect public.store_items%rowtype;
  v_previous_package_key text := nullif(trim(coalesce(p_previous_package_key, '')), '');
  v_package_key text := nullif(trim(coalesce(p_package_key, '')), '');
  v_name text := trim(coalesce(p_name, ''));
  v_description text := coalesce(trim(p_description), '');
  v_currency text := case
    when upper(trim(coalesce(p_currency, 'Coin'))) = 'TL' then 'TL'
    else 'Coin'
  end;
  v_is_insert boolean := v_previous_package_key is null;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_package_key is null then
    raise exception 'Paket key zorunludur.';
  end if;

  if v_name = '' then
    raise exception 'Paket adi zorunludur.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Paket fiyati negatif olamaz.';
  end if;

  if p_original_price is not null and p_original_price < 0 then
    raise exception 'Paket orijinal fiyati negatif olamaz.';
  end if;

  if p_frame_store_item_id is null then
    raise exception 'Paket icin cerceve secilmelidir.';
  end if;

  if p_profile_effect_store_item_id is null then
    raise exception 'Paket icin profil efekti secilmelidir.';
  end if;

  select *
  into v_frame
  from public.store_items si
  where si.id = p_frame_store_item_id
    and si.type = 'frame'
    and si.is_active = true
  for update;

  if not found then
    raise exception 'Secilen cerceve bulunamadi veya aktif degil.';
  end if;

  select *
  into v_effect
  from public.store_items si
  where si.id = p_profile_effect_store_item_id
    and si.type = 'profile_effect'
    and si.is_active = true
  for update;

  if not found then
    raise exception 'Secilen profil efekti bulunamadi veya aktif degil.';
  end if;

  if v_is_insert then
    insert into public.store_cosmetic_packages (
      package_key,
      name,
      description,
      price,
      original_price,
      currency,
      frame_store_item_id,
      profile_effect_store_item_id,
      is_active
    )
    values (
      v_package_key,
      v_name,
      v_description,
      p_price,
      p_original_price,
      v_currency,
      p_frame_store_item_id,
      p_profile_effect_store_item_id,
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    select *
    into v_previous
    from public.store_cosmetic_packages scp
    where scp.package_key = v_previous_package_key
    for update;

    if not found then
      raise exception 'Paket bulunamadi.';
    end if;

    if v_package_key <> v_previous.package_key and exists (
      select 1
      from public.store_package_events spe
      where spe.package_key = v_previous.package_key
    ) then
      raise exception 'Satin alma gecmisi olan paketin key alani degistirilemez.';
    end if;

    update public.store_cosmetic_packages scp
    set
      package_key = v_package_key,
      name = v_name,
      description = v_description,
      price = p_price,
      original_price = p_original_price,
      currency = v_currency,
      frame_store_item_id = p_frame_store_item_id,
      profile_effect_store_item_id = p_profile_effect_store_item_id,
      is_active = coalesce(p_is_active, true)
    where scp.package_key = v_previous.package_key
    returning * into v_row;
  end if;

  perform public.create_admin_audit_log(
    case when v_is_insert then 'store_package.create' else 'store_package.update' end,
    'store_package',
    v_row.package_key,
    case
      when v_is_insert then format('%s magazaya paket olarak eklendi.', v_row.name)
      else format('%s magazada guncellendi.', v_row.name)
    end,
    jsonb_build_object(
      'packageKey', v_row.package_key,
      'price', v_row.price,
      'originalPrice', v_row.original_price,
      'currency', v_row.currency,
      'frameStoreItemId', v_row.frame_store_item_id,
      'profileEffectStoreItemId', v_row.profile_effect_store_item_id,
      'isActive', v_row.is_active,
      'previous', case
        when v_is_insert then null
        else jsonb_build_object(
          'packageKey', v_previous.package_key,
          'name', v_previous.name,
          'price', v_previous.price,
          'originalPrice', v_previous.original_price,
          'currency', v_previous.currency,
          'frameStoreItemId', v_previous.frame_store_item_id,
          'profileEffectStoreItemId', v_previous.profile_effect_store_item_id,
          'isActive', v_previous.is_active
        )
      end
    )
  );

  return query
  select
    v_row.package_key,
    v_row.name,
    v_row.description,
    v_row.price,
    v_row.original_price,
    v_row.currency,
    v_row.frame_store_item_id,
    v_row.profile_effect_store_item_id,
    v_row.is_active,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

revoke all on function public.admin_upsert_store_cosmetic_package(text, text, text, text, integer, integer, text, uuid, uuid, boolean) from public;
grant execute on function public.admin_upsert_store_cosmetic_package(text, text, text, text, integer, integer, text, uuid, uuid, boolean) to authenticated;

create or replace function public.admin_set_store_cosmetic_package_active_state(
  p_package_key text,
  p_is_active boolean
)
returns table (
  package_key text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_previous public.store_cosmetic_packages%rowtype;
  v_row public.store_cosmetic_packages%rowtype;
  v_package_key text := nullif(trim(coalesce(p_package_key, '')), '');
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_package_key is null then
    raise exception 'Paket secimi zorunludur.';
  end if;

  select *
  into v_previous
  from public.store_cosmetic_packages scp
  where scp.package_key = v_package_key
  for update;

  if not found then
    raise exception 'Paket bulunamadi.';
  end if;

  update public.store_cosmetic_packages scp
  set is_active = coalesce(p_is_active, false)
  where scp.package_key = v_package_key
  returning * into v_row;

  perform public.create_admin_audit_log(
    'store_package.active_state.update',
    'store_package',
    v_row.package_key,
    format('%s paketinin durumu %s yapildi.', v_row.name, case when v_row.is_active then 'aktif' else 'pasif' end),
    jsonb_build_object(
      'previousIsActive', v_previous.is_active,
      'nextIsActive', v_row.is_active
    )
  );

  return query
  select
    v_row.package_key,
    v_row.is_active,
    v_row.updated_at;
end;
$$;

revoke all on function public.admin_set_store_cosmetic_package_active_state(text, boolean) from public;
grant execute on function public.admin_set_store_cosmetic_package_active_state(text, boolean) to authenticated;

create or replace function public.admin_delete_store_cosmetic_package(
  p_package_key text
)
returns table (
  package_key text,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.store_cosmetic_packages%rowtype;
  v_event_count bigint := 0;
  v_package_key text := nullif(trim(coalesce(p_package_key, '')), '');
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_package_key is null then
    raise exception 'Paket secimi zorunludur.';
  end if;

  select *
  into v_row
  from public.store_cosmetic_packages scp
  where scp.package_key = v_package_key
  for update;

  if not found then
    raise exception 'Paket bulunamadi.';
  end if;

  select count(*)
  into v_event_count
  from public.store_package_events spe
  where spe.package_key = v_package_key;

  if coalesce(v_event_count, 0) > 0 then
    raise exception 'Bu paket icin satin alma veya hediye gecmisi var. Kalici silme yerine paketi pasif yapin.';
  end if;

  delete from public.store_cosmetic_packages scp
  where scp.package_key = v_package_key;

  perform public.create_admin_audit_log(
    'store_package.delete',
    'store_package',
    v_row.package_key,
    format('%s magazadan silindi.', v_row.name),
    jsonb_build_object(
      'packageKey', v_row.package_key,
      'price', v_row.price,
      'originalPrice', v_row.original_price,
      'currency', v_row.currency
    )
  );

  return query
  select
    v_row.package_key,
    v_row.name;
end;
$$;

revoke all on function public.admin_delete_store_cosmetic_package(text) from public;
grant execute on function public.admin_delete_store_cosmetic_package(text) to authenticated;

commit;
