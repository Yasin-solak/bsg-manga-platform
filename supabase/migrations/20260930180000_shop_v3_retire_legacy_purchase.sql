-- Shop v3: the old reader purchase / gift path retires.
-- Old RPCs sold over store_items.price; v3 price (discount, deal of the day, stock,
-- season window) is computed in shop_purchase. If the old path stayed open it would be a second
-- purchase door skipping v3 rules. The client now uses only shop_purchase.
-- Functions are not deleted (for past order / ledger records and a possible rollback), only
-- anon / authenticated access closes.

do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'purchase_store_item',
        'purchase_store_package',
        'purchase_store_package_for_fansub',
        'gift_store_item',
        'gift_store_package',
        'gift_premium'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
  end loop;
end;
$$;
