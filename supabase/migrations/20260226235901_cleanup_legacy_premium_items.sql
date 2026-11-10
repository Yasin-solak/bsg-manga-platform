-- ============================================
-- MangaZone | Legacy premium urun temizligi
-- Date: 2026-02-26
-- ============================================

begin;

do $$
declare
  v_base_id uuid;
  v_total_premium_purchase_count integer := 0;
begin
  -- First find the canonical premium product (namefx-pass). Create it if missing.
  select id
  into v_base_id
  from public.store_items
  where type = 'premium'
    and identifier = 'namefx-pass'
  order by created_at asc
  limit 1;

  if v_base_id is null then
    select id
    into v_base_id
    from public.store_items
    where type = 'premium'
      and lower(identifier) = 'namefx-pass'
    order by created_at asc
    limit 1;
  end if;

  if v_base_id is null then
    insert into public.store_items (
      name,
      description,
      identifier,
      type,
      price,
      currency,
      image_key,
      custom_asset_url,
      is_active
    )
    values (
      'Premium Aylik Uyelik',
      'Bu urun satin alindiginda aktif ayin premium paketi verilir ve metin animasyonlari premium suresi boyunca acilir.',
      'namefx-pass',
      'premium',
      3000,
      'Coin',
      null,
      null,
      true
    )
    returning id into v_base_id;
  else
    update public.store_items
    set is_active = true
    where id = v_base_id;

    -- If an identifier arrives with a case difference make it canonical.
    if not exists (
      select 1
      from public.store_items
      where type = 'premium'
        and identifier = 'namefx-pass'
        and id <> v_base_id
    ) then
      update public.store_items
      set identifier = 'namefx-pass'
      where id = v_base_id
        and identifier <> 'namefx-pass';
    end if;
  end if;

  -- Before deleting gather total premium sales on one product (idempotent).
  select coalesce(sum(purchase_count), 0)
  into v_total_premium_purchase_count
  from public.store_items
  where type = 'premium';

  update public.store_items
  set purchase_count = v_total_premium_purchase_count
  where id = v_base_id;

  -- FK baglarini canonical premium urune cek.
  update public.premium_monthly_packages
  set premium_store_item_id = v_base_id
  where premium_store_item_id <> v_base_id;

  update public.user_premium_subscriptions
  set premium_store_item_id = v_base_id
  where premium_store_item_id <> v_base_id;

  update public.user_premium_grants
  set premium_store_item_id = v_base_id
  where premium_store_item_id <> v_base_id;

  -- Now permanently delete all legacy premium products.
  delete from public.store_items
  where type = 'premium'
    and id <> v_base_id;
end
$$;

commit;

