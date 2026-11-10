-- ============================================
-- BSG Manga | Feature flag fail-closed smoke test
-- Date: 2026-02-28
-- ============================================
-- Bu dosya SQL Editor'de migrationlar uygulandiktan sonra calistirilir.
-- Amac:
-- - kritik runtime flag kaydi silinirse true fallback ile acik kalmamasini dogrulamak
-- - runtime olmayan anahtarlarda mevcut default davranisin korunup korunmadigini gormek

begin;

do $$
declare
  v_runtime_before boolean;
  v_runtime_after boolean;
  v_non_runtime_default boolean;
begin
  select public.is_feature_enabled('economy.store_purchase', true)
  into v_runtime_before;

  if v_runtime_before is distinct from true then
    raise exception '[FAIL] economy.store_purchase aktif kayit varken true donmedi';
  end if;

  delete from public.feature_flags
  where key = 'economy.store_purchase';

  select public.is_feature_enabled('economy.store_purchase', true)
  into v_runtime_after;

  if v_runtime_after is distinct from false then
    raise exception '[FAIL] economy.store_purchase kaydi silinince fail-closed davranmadi';
  end if;

  select public.is_feature_enabled('debug.non_runtime_demo', true)
  into v_non_runtime_default;

  if v_non_runtime_default is distinct from true then
    raise exception '[FAIL] runtime olmayan anahtar default=true davranisini korumadi';
  end if;

  raise notice '[PASS] strict runtime flag kaydi yoksa kapali kaliyor';
  raise notice '[PASS] runtime olmayan anahtarlar default davranisini koruyor';
end;
$$;

rollback;
