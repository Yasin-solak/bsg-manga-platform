-- Profile effects bought in Shop v3 could not save to a profile ("Profil efekti bulunamadi").
-- update_my_profile_customization looked for store_items.is_active = true when picking an effect; Shop v3
-- deliberately opens cosmetic records with is_active = false (sale state in shop_products). The only condition
-- needed for equip is ownership (the function validates it separately with owned_items).
--
-- Setting records is_active = true is NOT the fix: old purchase_fansub_store_item /
-- purchase_store_package paths sell is_active records at store_items.price (0 in v3).
--
-- The live definition may have drifted from the repo; so the function live definition is read, only the is_active
-- line in the effect query is dropped and it is rebuilt. With no pattern nothing changes.
do $mig$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_my_profile_customization';

  v_def := pg_get_functiondef(v_oid);
  v_new := regexp_replace(
    v_def,
    '(where id = p_active_profile_effect_id\s+and type = ''profile_effect'')\s+and is_active = true',
    '\1'
  );
  if v_new = v_def then
    raise exception 'update_my_profile_customization: efekt is_active deseni bulunamadi, degisiklik yapilmadi.';
  end if;
  execute v_new;
end
$mig$;
