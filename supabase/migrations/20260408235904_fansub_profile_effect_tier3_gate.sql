begin;

create or replace function public.equip_fansub_inventory_item(
  p_fansub_id uuid,
  p_item_id uuid,
  p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fansubs%rowtype;
  v_item public.store_items%rowtype;
begin
  if p_fansub_id is null or p_item_id is null then
    raise exception 'Fansub ve urun kimligi zorunludur.';
  end if;

  if p_type not in ('frame', 'background', 'pattern', 'profile_effect') then
    raise exception 'Desteklenmeyen fansub kozmetik tipi.';
  end if;

  if not public.is_admin() and not public.is_fansub_admin(p_fansub_id) then
    raise exception 'Bu fansub icin yetkiniz yok.';
  end if;

  if p_type = 'profile_effect'
    and not public.fansub_has_boost_capability(p_fansub_id, 'hasFansubProfileEffect')
  then
    raise exception 'Fansub profil efekti icin Seviye 3 takviye gerekir.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Urun bulunamadi.';
  end if;

  if v_item.type <> p_type then
    raise exception 'Kozmetik tipi urun kaydi ile eslesmiyor.';
  end if;

  if not exists (
    select 1
    from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id
      and fi.store_item_id = p_item_id
  ) then
    raise exception 'Fansub envanterinde olmayan urun secilemez.';
  end if;

  update public.fansubs
  set active_frame_id = case when p_type = 'frame' then p_item_id else active_frame_id end,
      active_background_id = case when p_type = 'background' then p_item_id else active_background_id end,
      active_pattern_id = case when p_type = 'pattern' then p_item_id else active_pattern_id end,
      active_profile_effect_id = case when p_type = 'profile_effect' then p_item_id else active_profile_effect_id end
  where id = p_fansub_id
  returning *
  into v_row;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'active_frame_id', v_row.active_frame_id,
    'active_background_id', v_row.active_background_id,
    'active_pattern_id', v_row.active_pattern_id,
    'active_profile_effect_id', v_row.active_profile_effect_id
  );
end;
$$;

grant execute on function public.equip_fansub_inventory_item(uuid, uuid, text) to authenticated;

commit;
