-- Shop v3: premium early access duration is managed from Shop Control.
-- The "Premium runtime" panel in the old shop admin is gone; public_unlock_delay_hours
-- (how many hours before everyone a premium reader sees a new chapter) is read platform wide
-- (get_active_premium_offer, can_current_user_access_chapter), so the setting must not be lost.
-- Premium price and duration are now on shop_products (kind = premium).

create or replace function public.shop_admin_premium_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  return (
    select jsonb_build_object(
      'unlockDelayHours', c.public_unlock_delay_hours,
      'updatedAt', c.updated_at
    )
    from public.premium_runtime_config c
    where c.id
  );
end;
$$;

create or replace function public.shop_admin_save_premium_settings(p_unlock_delay_hours integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  if p_unlock_delay_hours is null or p_unlock_delay_hours not between 0 and 168 then
    raise exception 'Erken erisim suresi 0-168 saat olmali.';
  end if;
  update public.premium_runtime_config set
    public_unlock_delay_hours = p_unlock_delay_hours,
    updated_by = public.current_public_user_id(),
    updated_at = now()
  where id;
  if not found then
    raise exception 'Premium ayar kaydi bulunamadi.';
  end if;
end;
$$;

revoke all on function public.shop_admin_premium_settings() from public;
revoke all on function public.shop_admin_save_premium_settings(integer) from public;
grant execute on function public.shop_admin_premium_settings() to authenticated;
grant execute on function public.shop_admin_save_premium_settings(integer) to authenticated;
