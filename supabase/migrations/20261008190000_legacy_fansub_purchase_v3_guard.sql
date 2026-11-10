-- Old fansub purchase paths cannot sell Shop v3 cosmetics.
--
-- purchase_fansub_store_item and purchase_fansub_store_item_with_user_wallet are still open to authenticated
-- and sell is_active = true records from store_items at store_items.price to fansub inventory.
-- Shop v3 cosmetics open with is_active = false and price 0 (price in shop_products); if someone
-- activated one by mistake this path could sell it at 0 Coin. Now a cosmetic tied to shop_product_grants
-- (v3 product content) cannot sell through these paths; old fansub shop products are unaffected.
--
-- Live definitions are read, a condition is added only to the product query; with no pattern nothing changes.
do $mig$
declare
  v_name text;
  v_oid oid;
  v_def text;
  v_new text;
begin
  foreach v_name in array array['purchase_fansub_store_item', 'purchase_fansub_store_item_with_user_wallet'] loop
    select p.oid into strict v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = v_name;

    v_def := pg_get_functiondef(v_oid);
    if v_def ~ 'shop_product_grants' then
      continue;
    end if;
    v_new := regexp_replace(
      v_def,
      '(where id = p_item_id\s+and is_active = true)',
      '\1 and not exists (select 1 from public.shop_product_grants g where g.store_item_id = p_item_id)'
    );
    if v_new = v_def then
      raise exception '%: urun sorgusu deseni bulunamadi, degisiklik yapilmadi.', v_name;
    end if;
    execute v_new;
  end loop;
end
$mig$;
