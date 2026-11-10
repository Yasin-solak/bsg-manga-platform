begin;

create or replace function public.get_my_account_runtime_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_row
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'frame_type', v_row.frame_type,
    'active_badge_id', v_row.active_badge_id,
    'active_profile_effect_id', v_row.active_profile_effect_id
  );
end;
$$;

create or replace function public.get_my_account_economy_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_row
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'stones', v_row.stones,
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'premium_expires_at', v_row.premium_expires_at
  );
end;
$$;

grant execute on function public.get_my_account_runtime_snapshot() to authenticated;
grant execute on function public.get_my_account_economy_snapshot() to authenticated;

comment on function public.get_my_account_runtime_snapshot()
  is 'Auth bootstrap icin gereken dar runtime snapshot. Ekonomi ve envanter alanlari ayri self economy snapshot uzerinden okunur.';

comment on function public.get_my_account_economy_snapshot()
  is 'Aktif kullanicinin stones, owned_items ve premium runtime durumunu sadece ihtiyac duyan ekranlar icin dondurur.';

commit;
